"""
F.01-AGENTCAT: Super Admin Managed AI Agent Blueprint Catalog (PRD v2.2 Bagian 11.3)

Komponen Inti:
1. Agent Blueprint Catalog:
   - Katalog terpusat blueprint template agen AI untuk Super Admin.
   - Manajemen kapabilitas, definisi tool, instruksi sistem, dan konfigurasi guardrail.
2. Automated Policy Scanner:
   - Pemindaian kepatuhan keamanan paket blueprint:
     * Proteksi terhadap prompt injection & jailbreak.
     * Pencegahan kebocoran kredensial (API keys, token rahasia).
     * Larangan eksekusi kode berbahaya (arbitrary shell / ungrounded execution).
     * Validasi integritas skema definisi tool & parameter.
3. Staged Rollout Controller:
   - Kontrol pelepasan bertahap 3 tingkat:
     INTERNAL -> BETA_TENANT -> GENERAL_AVAILABILITY
   - Enforce mutlak: Paket skill baru WAJIB lolos pemindai kebijakan ('PASSED')
     sebelum diizinkan melangkah ke tahap rollout berikutnya.
"""

import re
import json
import uuid
import logging
from enum import Enum
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass, field

try:
    import sqlalchemy as sa
    from app.core.database import get_database_engine
except ImportError:
    sa = None
    get_database_engine = None

logger = logging.getLogger("orchestree.skills.f01_agentcat")


class RolloutStage(str, Enum):
    INTERNAL = "INTERNAL"
    BETA_TENANT = "BETA_TENANT"
    GENERAL_AVAILABILITY = "GENERAL_AVAILABILITY"


class PolicyScanStatus(str, Enum):
    PENDING = "PENDING"
    PASSED = "PASSED"
    FAILED = "FAILED"


class PolicyScanRequiredError(Exception):
    """Dilemparkan bila staged rollout dicoba dilanjutkan sebelum paket blueprint lolos pemindai kebijakan."""
    pass


class InvalidBlueprintPackageError(Exception):
    """Dilemparkan bila struktur paket blueprint tidak memenuhi spesifikasi valid."""
    pass


@dataclass
class PolicyViolation:
    rule_id: str
    severity: str
    message: str
    location: str = "general"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "message": self.message,
            "location": self.location,
        }


@dataclass
class PolicyScanReport:
    status: PolicyScanStatus
    safety_score: float
    rules_evaluated: int
    violations_found: List[PolicyViolation] = field(default_factory=list)
    summary: str = ""
    scanned_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "safety_score": self.safety_score,
            "rules_evaluated": self.rules_evaluated,
            "violations_found": [v.to_dict() for v in self.violations_found],
            "summary": self.summary,
            "scanned_at": self.scanned_at,
        }


class PolicyScanner:
    """Pemindai kepatuhan kebijakan keamanan dan integritas blueprint agen AI."""

    # Pola serangan injeksi prompt & pelarian guardrail
    PROMPT_INJECTION_PATTERNS = [
        r"(?i)\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions\b",
        r"(?i)\babaikan\s+(?:seluruh|semua)?\s*(?:instruksi|perintah)\s+(?:sebelumnya|awal)\b",
        r"(?i)\boverride\s+(?:system\s+prompt|guardrails?|safety\s+filters?)\b",
        r"(?i)\btimpa\s+(?:instruksi\s+sistem|filter\s+keamanan)\b",
        r"(?i)\bdisregard\s+(?:safety|ethics|rules|system)\b",
        r"(?i)\bbypass\s+(?:authorization|authentication|pdp|abac)\b",
        r"(?i)\byou\s+are\s+now\s+(?:DAN|jailbreak|unrestricted)\b",
        r"(?i)\bpretend\s+to\s+have\s+no\s+rules\b",
    ]

    # Pola kebocoran kredensial atau rahasia sensitif
    CREDENTIAL_PATTERNS = [
        r"(?i)\bsk-[a-zA-Z0-9]{20,}\b",
        r"(?i)\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['\"][a-zA-Z0-9_\-\.]{12,}['\"]\b",
        r"(?i)\bbearer\s+[a-zA-Z0-9_\-\.]{24,}\b",
        r"(?i)-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----",
        r"(?i)\bghp_[a-zA-Z0-9]{30,}\b",
    ]

    # Pola eksekusi kode berbahaya atau arbitrer
    DANGEROUS_EXECUTION_PATTERNS = [
        r"(?i)\beval\s*\(",
        r"(?i)\bexec\s*\(",
        r"(?i)\bos\.system\s*\(",
        r"(?i)\bsubprocess\.(?:call|run|Popen|check_output)\s*\(",
        r"(?i)\b__import__\s*\(",
        r"(?i)\bshutil\.rmtree\s*\(",
        r"(?i)\brm\s+-rf\b",
    ]

    @classmethod
    def scan(cls, package_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Menjalankan audit pemindaian kebijakan terhadap seluruh atribut paket blueprint.
        Mengembalikan PolicyScanReport dengan status PASSED atau FAILED.
        """
        violations: List[Dict[str, Any]] = []
        rules_checked = [
            "SEC_RULE_PROMPT_INJECTION_DEFENSE",
            "SEC_RULE_CREDENTIAL_LEAK_DEFENSE",
            "SEC_RULE_DANGEROUS_EXECUTION_DEFENSE",
            "SEC_RULE_TOOL_SCHEMA_INTEGRITY",
            "SEC_RULE_MANDATORY_METADATA",
        ]

        # 1. Periksa kelengkapan metadata wajib
        required_fields = ["package_id", "name", "version", "description", "category", "system_prompt_template"]
        missing_fields = [f for f in required_fields if not package_data.get(f)]
        if missing_fields:
            violations.append({
                "rule_id": "SEC_RULE_MANDATORY_METADATA",
                "severity": "CRITICAL",
                "message": f"Atribut wajib tidak lengkap: {', '.join(missing_fields)}",
                "location": "metadata",
            })

        # Gabungkan teks untuk pemindaian semantik
        text_corpus = f"{package_data.get('system_prompt_template', '')}\n{package_data.get('description', '')}"
        
        # Sertakan juga string dalam tool_definitions bila ada
        tools = package_data.get("tool_definitions", [])
        if isinstance(tools, list):
            for t in tools:
                if isinstance(t, dict):
                    text_corpus += f"\n{t.get('name', '')} {t.get('description', '')} {json.dumps(t.get('parameters', {}))}"

        # 2. Pemindaian Injeksi Prompt
        for pat in cls.PROMPT_INJECTION_PATTERNS:
            matches = re.findall(pat, text_corpus)
            if matches:
                violations.append({
                    "rule_id": "SEC_RULE_PROMPT_INJECTION_DEFENSE",
                    "severity": "CRITICAL",
                    "message": f"Terdeteksi pola indikasi injeksi prompt atau pelarian guardrail: '{matches[0]}'",
                    "location": "system_prompt_template",
                })
                break

        # 3. Pemindaian Kebocoran Kredensial
        for pat in cls.CREDENTIAL_PATTERNS:
            matches = re.findall(pat, text_corpus)
            if matches:
                violations.append({
                    "rule_id": "SEC_RULE_CREDENTIAL_LEAK_DEFENSE",
                    "severity": "CRITICAL",
                    "message": "Terdeteksi token kredensial atau private key hardcode di dalam paket.",
                    "location": "content_body",
                })
                break

        # 4. Pemindaian Eksekusi Kode Berbahaya
        for pat in cls.DANGEROUS_EXECUTION_PATTERNS:
            matches = re.findall(pat, text_corpus)
            if matches:
                violations.append({
                    "rule_id": "SEC_RULE_DANGEROUS_EXECUTION_DEFENSE",
                    "severity": "CRITICAL",
                    "message": f"Terdeteksi pemanggilan eksekusi sistem tidak aman: '{matches[0]}'",
                    "location": "tool_definitions",
                })
                break

        # 5. Integritas Skema Tool
        if isinstance(tools, list):
            for idx, tool in enumerate(tools):
                if not isinstance(tool, dict) or "name" not in tool or "description" not in tool:
                    violations.append({
                        "rule_id": "SEC_RULE_TOOL_SCHEMA_INTEGRITY",
                        "severity": "HIGH",
                        "message": f"Definisi tool indeks {idx} tidak memiliki nama atau deskripsi valid.",
                        "location": f"tool_definitions[{idx}]",
                    })

        # Penentuan status
        critical_count = sum(1 for v in violations if v["severity"] in ("CRITICAL", "HIGH"))
        status = PolicyScanStatus.PASSED if critical_count == 0 else PolicyScanStatus.FAILED
        safety_score = 1.0 if critical_count == 0 else max(0.0, round(1.0 - (critical_count * 0.35), 2))

        report = {
            "status": status.value,
            "safety_score": safety_score,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
            "rules_evaluated": len(rules_checked),
            "violations_found": violations,
            "summary": "Paket blueprint memenuhi standar kepatuhan kebijakan keamanan." if status == PolicyScanStatus.PASSED else f"Ditemukan {len(violations)} pelanggaran kebijakan keamanan yang wajib diperbaiki.",
        }
        return report

    @classmethod
    def scan_package(cls, package_data: Dict[str, Any]) -> PolicyScanReport:
        """Menjalankan scan dan mengembalikan PolicyScanReport typed object."""
        dict_report = cls.scan(package_data)
        violations = [
            PolicyViolation(
                rule_id=v["rule_id"],
                severity=v["severity"],
                message=v["message"],
                location=v.get("location", "general"),
            )
            for v in dict_report["violations_found"]
        ]
        return PolicyScanReport(
            status=PolicyScanStatus(dict_report["status"]),
            safety_score=dict_report["safety_score"],
            rules_evaluated=dict_report["rules_evaluated"],
            violations_found=violations,
            summary=dict_report["summary"],
            scanned_at=dict_report["scanned_at"],
        )


class SkillIngestPipeline:
    """Pipeline ingesti paket skill agen AI dengan validasi ketat dan auto-scan."""

    @classmethod
    async def ingest(cls, package_data: Dict[str, Any], operator: str = "Super Admin") -> Dict[str, Any]:
        """
        Menerima dan memproses paket blueprint skill:
        1. Validasi sintaks dan format package_id
        2. Eksekusi PolicyScanner
        3. Penyimpanan persisten ke tabel agent_skill_blueprints dengan status awal INTERNAL
        """
        package_id = package_data.get("package_id", "").strip()
        if not package_id or not re.match(r"^[a-z0-9-]+$", package_id):
            raise InvalidBlueprintPackageError(
                "package_id wajib menggunakan format lowercase kebab-case (contoh: sales-lead-qualifier-v1)"
            )

        name = package_data.get("name", "").strip()
        if not name:
            raise InvalidBlueprintPackageError("Nama blueprint agen wajib diisi.")

        version = package_data.get("version", "1.0.0").strip()
        description = package_data.get("description", "").strip()
        category = package_data.get("category", "operations").strip()
        system_prompt_template = package_data.get("system_prompt_template", "").strip()
        required_capabilities = package_data.get("required_capabilities", [])
        tool_definitions = package_data.get("tool_definitions", [])
        default_config = package_data.get("default_config", {})

        # Jalankan audit pemindaian kebijakan
        scan_report = PolicyScanner.scan(package_data)
        scan_status = scan_report["status"]

        engine = get_database_engine()
        query = sa.text("""
            INSERT INTO agent_skill_blueprints (
                package_id,
                name,
                version,
                description,
                category,
                system_prompt_template,
                required_capabilities,
                tool_definitions,
                default_config,
                rollout_stage,
                allowed_tenant_ids,
                policy_scan_status,
                policy_scan_report,
                is_active,
                created_by
            ) VALUES (
                :package_id,
                :name,
                :version,
                :description,
                :category,
                :system_prompt_template,
                :required_capabilities::jsonb,
                :tool_definitions::jsonb,
                :default_config::jsonb,
                :rollout_stage,
                :allowed_tenant_ids::jsonb,
                :policy_scan_status,
                :policy_scan_report::jsonb,
                true,
                :created_by
            )
            ON CONFLICT (package_id) DO UPDATE SET
                name = EXCLUDED.name,
                version = EXCLUDED.version,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                system_prompt_template = EXCLUDED.system_prompt_template,
                required_capabilities = EXCLUDED.required_capabilities,
                tool_definitions = EXCLUDED.tool_definitions,
                default_config = EXCLUDED.default_config,
                policy_scan_status = EXCLUDED.policy_scan_status,
                policy_scan_report = EXCLUDED.policy_scan_report,
                updated_at = now()
            RETURNING id, package_id, name, version, category, rollout_stage, policy_scan_status, policy_scan_report, created_at;
        """)

        with engine.connect() as conn:
            row = conn.execute(
                query,
                {
                    "package_id": package_id,
                    "name": name,
                    "version": version,
                    "description": description,
                    "category": category,
                    "system_prompt_template": system_prompt_template,
                    "required_capabilities": json.dumps(required_capabilities),
                    "tool_definitions": json.dumps(tool_definitions),
                    "default_config": json.dumps(default_config),
                    "rollout_stage": RolloutStage.INTERNAL.value,
                    "allowed_tenant_ids": json.dumps([]),
                    "policy_scan_status": scan_status,
                    "policy_scan_report": json.dumps(scan_report),
                    "created_by": operator,
                },
            ).mappings().first()
            conn.commit()

            return dict(row) if row else {}


class StagedRolloutController:
    """Pengendali pelepasan bertahap (Staged Rollout) untuk Blueprint Template Agen."""

    @classmethod
    def validate_transition(
        cls,
        current_stage: RolloutStage,
        target_stage: RolloutStage,
        policy_status: PolicyScanStatus,
        allowed_tenant_ids: Optional[List[str]] = None,
    ) -> bool:
        """
        Memvalidasi kepatuhan kebijakan sebelum transisi rollout diizinkan.
        Paket skill baru WAJIB lolos pemindai kebijakan ('PASSED') sebelum staged rollout
        diizinkan berlanjut ke BETA_TENANT atau GENERAL_AVAILABILITY.
        """
        status_val = policy_status.value if hasattr(policy_status, "value") else str(policy_status)
        stage_val = target_stage.value if hasattr(target_stage, "value") else str(target_stage)

        if stage_val in (RolloutStage.BETA_TENANT.value, RolloutStage.GENERAL_AVAILABILITY.value):
            if status_val != PolicyScanStatus.PASSED.value:
                raise PolicyScanRequiredError(
                    f"Paket skill baru WAJIB lolos pemindai kebijakan ('PASSED') sebelum staged rollout diizinkan berlanjut ke {stage_val}."
                )

        if stage_val == RolloutStage.BETA_TENANT.value and not allowed_tenant_ids:
            raise ValueError("Tahap BETA_TENANT memerlukan minimal 1 tenant yang diizinkan (allowed_tenant_ids).")

        return True

    @classmethod
    async def transition_stage(
        cls,
        identifier: str,
        target_stage: RolloutStage,
        allowed_tenant_ids: Optional[List[str]] = None,
        operator: str = "Super Admin",
    ) -> Dict[str, Any]:
        """
        Mengubah tahap rollout blueprint.
        
        ATURAN DEFINITION OF DONE:
        Paket skill baru WAJIB berstatus 'PASSED' pada policy_scan_status
        sebelum staged rollout diizinkan berlanjut ke BETA_TENANT atau GENERAL_AVAILABILITY.
        """
        engine = get_database_engine()

        # Ambil blueprint saat ini
        check_query = sa.text("""
            SELECT id, package_id, name, rollout_stage, policy_scan_status, policy_scan_report, allowed_tenant_ids
            FROM agent_skill_blueprints
            WHERE id::text = :identifier OR package_id = :identifier;
        """)

        with engine.connect() as conn:
            bp = conn.execute(check_query, {"identifier": identifier}).mappings().first()
            if not bp:
                raise InvalidBlueprintPackageError(f"Blueprint dengan identitas '{identifier}' tidak ditemukan.")

            current_status = bp["policy_scan_status"]
            current_stage = RolloutStage(bp["rollout_stage"])
            package_name = bp["name"]
            pkg_id = bp["package_id"]

            # Validasi kepatuhan kebijakan mutlak
            cls.validate_transition(
                current_stage=current_stage,
                target_stage=target_stage,
                policy_status=PolicyScanStatus(current_status),
                allowed_tenant_ids=allowed_tenant_ids,
            )

            # Validasi daftar tenant jika masuk ke tahap BETA_TENANT
            tenant_list = allowed_tenant_ids or []
            if target_stage == RolloutStage.BETA_TENANT and not tenant_list:
                raise ValueError("Tahap BETA_TENANT memerlukan minimal 1 tenant yang diizinkan (allowed_tenant_ids).")

            update_query = sa.text("""
                UPDATE agent_skill_blueprints
                SET rollout_stage = :target_stage,
                    allowed_tenant_ids = :allowed_tenant_ids::jsonb,
                    updated_at = now()
                WHERE id = :id
                RETURNING id, package_id, name, version, category, rollout_stage, allowed_tenant_ids, policy_scan_status, updated_at;
            """)

            updated = conn.execute(
                update_query,
                {
                    "id": bp["id"],
                    "target_stage": target_stage.value,
                    "allowed_tenant_ids": json.dumps(tenant_list),
                },
            ).mappings().first()
            conn.commit()

            logger.info(
                f"Blueprint '{pkg_id}' berhasil ditransisikan ke {target_stage.value} oleh {operator}."
            )
            return dict(updated) if updated else {}


class AgentBlueprintCatalog:
    """Antarmuka katalog blueprint skill agen untuk Super Admin dan Tenant terisolasi."""

    def __init__(self):
        self.scanner = PolicyScanner()
        self.ingest_pipeline = SkillIngestPipeline()
        self.rollout_controller = StagedRolloutController()

    async def ingest_package(self, package_data: Dict[str, Any], operator: str = "Super Admin") -> Dict[str, Any]:
        """Menjalankan pipeline ingesti paket blueprint baru."""
        return await self.ingest_pipeline.ingest(package_data, operator=operator)

    async def transition_rollout(
        self,
        identifier: str,
        target_stage: RolloutStage,
        allowed_tenant_ids: Optional[List[str]] = None,
        operator: str = "Super Admin",
    ) -> Dict[str, Any]:
        """Mentransisikan tahap rollout blueprint."""
        return await self.rollout_controller.transition_stage(
            identifier=identifier,
            target_stage=target_stage,
            allowed_tenant_ids=allowed_tenant_ids,
            operator=operator,
        )

    async def list_blueprints(
        self,
        stage: Optional[str] = None,
        category: Optional[str] = None,
        policy_status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Daftar lengkap seluruh blueprint untuk pengelolaan Super Admin."""
        engine = get_database_engine()
        filters = ["is_active = true"]
        params: Dict[str, Any] = {}

        if stage:
            filters.append("rollout_stage = :stage")
            params["stage"] = stage
        if category:
            filters.append("category = :category")
            params["category"] = category
        if policy_status:
            filters.append("policy_scan_status = :policy_status")
            params["policy_status"] = policy_status

        where_clause = " AND ".join(filters)
        query = sa.text(f"""
            SELECT 
                id,
                package_id,
                name,
                version,
                description,
                category,
                system_prompt_template,
                required_capabilities,
                tool_definitions,
                default_config,
                rollout_stage,
                allowed_tenant_ids,
                policy_scan_status,
                policy_scan_report,
                created_by,
                created_at,
                updated_at
            FROM agent_skill_blueprints
            WHERE {where_clause}
            ORDER BY created_at DESC;
        """)

        with engine.connect() as conn:
            rows = conn.execute(query, params).mappings().all()
            return [dict(r) for r in rows]

    async def list_available_for_tenant(
        self,
        tenant_id: str,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Daftar blueprint yang tersedia untuk tenant spesifik:
        - Tahap GENERAL_AVAILABILITY (tersedia untuk semua tenant).
        - Tahap BETA_TENANT yang mencantumkan tenant_id di allowed_tenant_ids.
        """
        engine = get_database_engine()
        filters = [
            "is_active = true",
            """(
                rollout_stage = 'GENERAL_AVAILABILITY'
                OR (rollout_stage = 'BETA_TENANT' AND allowed_tenant_ids ? :tenant_id)
            )"""
        ]
        params: Dict[str, Any] = {"tenant_id": tenant_id}

        if category:
            filters.append("category = :category")
            params["category"] = category

        where_clause = " AND ".join(filters)
        query = sa.text(f"""
            SELECT 
                id,
                package_id,
                name,
                version,
                description,
                category,
                required_capabilities,
                tool_definitions,
                rollout_stage,
                created_at
            FROM agent_skill_blueprints
            WHERE {where_clause}
            ORDER BY name ASC;
        """)

        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            rows = conn.execute(query, params).mappings().all()
            return [dict(r) for r in rows]

    async def get_blueprint(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Mengambil detail satu blueprint berdasarkan ID atau package_id."""
        engine = get_database_engine()
        query = sa.text("""
            SELECT 
                id,
                package_id,
                name,
                version,
                description,
                category,
                system_prompt_template,
                required_capabilities,
                tool_definitions,
                default_config,
                rollout_stage,
                allowed_tenant_ids,
                policy_scan_status,
                policy_scan_report,
                created_by,
                created_at,
                updated_at
            FROM agent_skill_blueprints
            WHERE id::text = :identifier OR package_id = :identifier;
        """)

        with engine.connect() as conn:
            row = conn.execute(query, {"identifier": identifier}).mappings().first()
            return dict(row) if row else None


_agentcat_instance: Optional[AgentBlueprintCatalog] = None


def get_agentcat_catalog() -> AgentBlueprintCatalog:
    """Mengambil atau menginisialisasi singleton AgentBlueprintCatalog."""
    global _agentcat_instance
    if _agentcat_instance is None:
        _agentcat_instance = AgentBlueprintCatalog()
    return _agentcat_instance
