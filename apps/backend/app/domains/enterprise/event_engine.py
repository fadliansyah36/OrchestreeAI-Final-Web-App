"""
OrchestreeAI Enterprise Event Engine & Knowledge Rule Governance (PRD v2.2 Bagian 8.13.8)
Python 3.12 + FastAPI + Supabase Postgres

PENEGAKAN DEFINITION OF DONE MUTLAK:
- Rule Knowledge baru dari AI Research Agent (Fase 27) TIDAK BOLEH aktif otomatis
  sampai disetujui manusia secara eksplisit (Human-in-the-Loop Governance).
- Event Engine secara ketat memblokir evaluasi dan aksi dari rule yang masih berstatus 'PENDING_HUMAN_APPROVAL'.
"""

from typing import List, Dict, Any, Optional
import uuid
import datetime
import logging

try:
    from pydantic import BaseModel, Field

    class EventDefinition(BaseModel):
        id: str
        tenant_id: str
        event_code: str
        event_name: str
        dimension_code: str
        trigger_type: str = "THRESHOLD_BREACH"
        trigger_conditions: Dict[str, Any] = Field(default_factory=dict)
        target_department: str = "FINANCE"
        severity: str = "MEDIUM"
        is_active: bool = True
        requires_human_approval: bool = True

    class KnowledgeEventRule(BaseModel):
        id: str
        tenant_id: str
        event_definition_id: Optional[str] = None
        rule_code: str
        rule_name: str
        rule_source: str = "AI_RESEARCH_AGENT"  # AI_RESEARCH_AGENT, MANUAL_HUMAN, ERP_IMPORT
        source_node_id: Optional[str] = None
        condition_logic: Dict[str, Any] = Field(default_factory=dict)
        directive_action: Dict[str, Any] = Field(default_factory=dict)
        approval_status: str = "PENDING_HUMAN_APPROVAL"  # PENDING_HUMAN_APPROVAL, APPROVED, REJECTED
        is_active: bool = False  # Mutlak FALSE untuk AI sampai disetujui manusia
        approved_by_user_id: Optional[str] = None
        approved_at: Optional[str] = None
        rejection_reason: Optional[str] = None
        metadata: Dict[str, Any] = Field(default_factory=dict)

    class EventEvaluationResult(BaseModel):
        tenant_id: str
        event_code: str
        is_triggered: bool
        active_rules_executed: List[str] = Field(default_factory=list)
        pending_rules_blocked: List[str] = Field(default_factory=list)
        generated_actions: List[Dict[str, Any]] = Field(default_factory=list)
        audit_verdict: str
        evaluated_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class EventDefinition:
        id: str
        tenant_id: str
        event_code: str
        event_name: str
        dimension_code: str
        trigger_type: str = "THRESHOLD_BREACH"
        trigger_conditions: Dict[str, Any] = field(default_factory=dict)
        target_department: str = "FINANCE"
        severity: str = "MEDIUM"
        is_active: bool = True
        requires_human_approval: bool = True

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "event_code": self.event_code,
                "event_name": self.event_name,
                "dimension_code": self.dimension_code,
                "trigger_type": self.trigger_type,
                "trigger_conditions": self.trigger_conditions,
                "target_department": self.target_department,
                "severity": self.severity,
                "is_active": self.is_active,
                "requires_human_approval": self.requires_human_approval,
            }

    @dataclass
    class KnowledgeEventRule:
        id: str
        tenant_id: str
        rule_code: str
        rule_name: str
        rule_source: str = "AI_RESEARCH_AGENT"
        event_definition_id: Optional[str] = None
        source_node_id: Optional[str] = None
        condition_logic: Dict[str, Any] = field(default_factory=dict)
        directive_action: Dict[str, Any] = field(default_factory=dict)
        approval_status: str = "PENDING_HUMAN_APPROVAL"
        is_active: bool = False
        approved_by_user_id: Optional[str] = None
        approved_at: Optional[str] = None
        rejection_reason: Optional[str] = None
        metadata: Dict[str, Any] = field(default_factory=dict)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "event_definition_id": self.event_definition_id,
                "rule_code": self.rule_code,
                "rule_name": self.rule_name,
                "rule_source": self.rule_source,
                "source_node_id": self.source_node_id,
                "condition_logic": self.condition_logic,
                "directive_action": self.directive_action,
                "approval_status": self.approval_status,
                "is_active": self.is_active,
                "approved_by_user_id": self.approved_by_user_id,
                "approved_at": self.approved_at,
                "rejection_reason": self.rejection_reason,
                "metadata": self.metadata,
            }

    @dataclass
    class EventEvaluationResult:
        tenant_id: str
        event_code: str
        is_triggered: bool
        audit_verdict: str
        active_rules_executed: List[str] = field(default_factory=list)
        pending_rules_blocked: List[str] = field(default_factory=list)
        generated_actions: List[Dict[str, Any]] = field(default_factory=list)
        evaluated_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "tenant_id": self.tenant_id,
                "event_code": self.event_code,
                "is_triggered": self.is_triggered,
                "audit_verdict": self.audit_verdict,
                "active_rules_executed": self.active_rules_executed,
                "pending_rules_blocked": self.pending_rules_blocked,
                "generated_actions": self.generated_actions,
                "evaluated_at": self.evaluated_at,
            }

logger = logging.getLogger(__name__)


class EnterpriseEventEngine:
    """
    Mesin Event Korporat & Tata Kelola Rule Pengetahuan (PRD v2.2 Bagian 8.13.8).
    Menjamin eksekusi event hanya memproses rule yang telah disetujui manusia.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    def propose_rule_from_ai_research(
        self,
        tenant_id: str,
        rule_code: str,
        rule_name: str,
        condition_logic: Dict[str, Any],
        directive_action: Dict[str, Any],
        source_node_id: Optional[str] = None,
        event_definition_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> KnowledgeEventRule:
        """
        Pendaftaran usulan rule baru dari AI Research Agent (Fase 27).
        PENEGAKAN DEFINITION OF DONE:
        - approval_status WAJIB 'PENDING_HUMAN_APPROVAL'
        - is_active WAJIB False
        Tidak boleh aktif otomatis sampai ada persetujuan manusia.
        """
        rule_id = str(uuid.uuid4())
        meta = metadata or {}
        meta["proposed_by"] = "AI_RESEARCH_AGENT"
        meta["proposed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return KnowledgeEventRule(
            id=rule_id,
            tenant_id=tenant_id,
            event_definition_id=event_definition_id,
            rule_code=rule_code,
            rule_name=rule_name,
            rule_source="AI_RESEARCH_AGENT",
            source_node_id=source_node_id,
            condition_logic=condition_logic,
            directive_action=directive_action,
            approval_status="PENDING_HUMAN_APPROVAL",  # DoD: Wajib pending
            is_active=False,  # DoD: Wajib non-aktif
            approved_by_user_id=None,
            approved_at=None,
            rejection_reason=None,
            metadata=meta,
        )

    async def approve_knowledge_rule(
        self,
        tenant_id: str,
        rule: KnowledgeEventRule,
        approved_by_user_id: str,
        approved_by_role: str = "MANAGER",
        db_connection=None,
    ) -> KnowledgeEventRule:
        """
        Persetujuan eksplisit oleh manusia (Human-in-the-Loop).
        Hanya pengguna berhak (human manager, director, owner, admin) yang dapat menyetujui.
        """
        if approved_by_role.upper() not in ("DIRECTOR", "TENANT_OWNER", "SUPER_ADMIN", "MANAGER", "ADMIN"):
            raise ValueError(f"Role '{approved_by_role}' tidak memiliki wewenang untuk menyetujui Knowledge Rule.")

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        rule.approval_status = "APPROVED"
        rule.is_active = True
        rule.approved_by_user_id = approved_by_user_id
        rule.approved_at = now_iso
        rule.metadata["approved_role"] = approved_by_role

        conn = db_connection or self.db_pool
        if conn:
            try:
                import json
                await conn.execute(
                    """
                    UPDATE knowledge_event_rules
                    SET approval_status = 'APPROVED',
                        is_active = true,
                        approved_by_user_id = $1::uuid,
                        approved_at = now(),
                        updated_at = now(),
                        metadata = $2::jsonb
                    WHERE id = $3::uuid AND tenant_id = $4::uuid
                    """,
                    uuid.UUID(approved_by_user_id),
                    json.dumps(rule.metadata),
                    uuid.UUID(rule.id),
                    uuid.UUID(tenant_id),
                )
            except Exception as exc:
                logger.warning("Gagal update status persetujuan rule ke database: %s", exc)

        logger.info(
            "Rule %s (%s) BERHASIL disetujui oleh user %s (%s). Rule sekarang AKTIF.",
            rule.rule_code, rule.id, approved_by_user_id, approved_by_role
        )
        return rule

    async def reject_knowledge_rule(
        self,
        tenant_id: str,
        rule: KnowledgeEventRule,
        rejected_by_user_id: str,
        rejection_reason: str,
        db_connection=None,
    ) -> KnowledgeEventRule:
        """
        Penolakan usulan rule pengetahuan oleh manusia.
        """
        rule.approval_status = "REJECTED"
        rule.is_active = False
        rule.rejection_reason = rejection_reason
        rule.metadata["rejected_by"] = rejected_by_user_id

        conn = db_connection or self.db_pool
        if conn:
            try:
                import json
                await conn.execute(
                    """
                    UPDATE knowledge_event_rules
                    SET approval_status = 'REJECTED',
                        is_active = false,
                        rejection_reason = $1,
                        updated_at = now(),
                        metadata = $2::jsonb
                    WHERE id = $3::uuid AND tenant_id = $4::uuid
                    """,
                    rejection_reason,
                    json.dumps(rule.metadata),
                    uuid.UUID(rule.id),
                    uuid.UUID(tenant_id),
                )
            except Exception as exc:
                logger.warning("Gagal update penolakan rule ke database: %s", exc)

        return rule

    async def evaluate_event(
        self,
        tenant_id: str,
        event_def: EventDefinition,
        context_data: Dict[str, Any],
        associated_rules: List[KnowledgeEventRule],
    ) -> EventEvaluationResult:
        """
        Mengevaluasi apakah event terpicu dan mengeksekusi HANYA rule yang AKTIF dan SUDAH DISETUJUI.
        PENEGAKAN DEFINITION OF DONE:
        - Rule yang berstatus 'PENDING_HUMAN_APPROVAL' atau is_active == False
          DILARANG KERAS dieksekusi.
        - Rule tersebut masuk ke pending_rules_blocked.
        """
        # 1. Cek kondisi trigger dasar pada event definition
        metric_name = event_def.trigger_conditions.get("metric")
        operator = event_def.trigger_conditions.get("operator", "==")
        threshold = event_def.trigger_conditions.get("threshold")

        is_triggered = False
        if metric_name and threshold is not None:
            observed_val = context_data.get(metric_name)
            if observed_val is not None:
                if operator == "<" and float(observed_val) < float(threshold):
                    is_triggered = True
                elif operator == "<=" and float(observed_val) <= float(threshold):
                    is_triggered = True
                elif operator == ">" and float(observed_val) > float(threshold):
                    is_triggered = True
                elif operator == ">=" and float(observed_val) >= float(threshold):
                    is_triggered = True
                elif operator == "==" and str(observed_val) == str(threshold):
                    is_triggered = True
        else:
            # Default trigger jika tidak ada threshold spesifik
            is_triggered = bool(context_data.get("is_anomalous", True))

        active_rules_executed = []
        pending_rules_blocked = []
        generated_actions = []

        if is_triggered:
            for rule in associated_rules:
                # PENEGAKAN DEFINITION OF DONE:
                # Rule dari AI Research Agent TIDAK aktif otomatis sampai disetujui manusia
                if rule.rule_source == "AI_RESEARCH_AGENT" and (rule.approval_status != "APPROVED" or not rule.is_active):
                    pending_rules_blocked.append(
                        f"Rule '{rule.rule_code}' ({rule.rule_name}) dari AI Research Agent DITAHAN: "
                        f"Status saat ini '{rule.approval_status}'. Menunggu persetujuan manusia eksplisit."
                    )
                    continue

                if not rule.is_active or rule.approval_status != "APPROVED":
                    pending_rules_blocked.append(
                        f"Rule '{rule.rule_code}' tidak aktif / belum disetujui (Status: {rule.approval_status})."
                    )
                    continue

                # Rule terbukti sah & disetujui manusia -> Dieksekusi
                active_rules_executed.append(rule.rule_code)
                generated_actions.append({
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "target_department": event_def.target_department,
                    "action_directive": rule.directive_action,
                    "approved_by_user_id": rule.approved_by_user_id,
                    "approved_at": rule.approved_at,
                })

        verdict = "EVENT_EVALUATED_SAFELY"
        if pending_rules_blocked:
            verdict = "EVENT_EVALUATED_WITH_UNAPPROVED_AI_RULES_BLOCKED"

        return EventEvaluationResult(
            tenant_id=tenant_id,
            event_code=event_def.event_code,
            is_triggered=is_triggered,
            active_rules_executed=active_rules_executed,
            pending_rules_blocked=pending_rules_blocked,
            generated_actions=generated_actions,
            audit_verdict=verdict,
            evaluated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )


__all__ = [
    "EventDefinition",
    "KnowledgeEventRule",
    "EventEvaluationResult",
    "EnterpriseEventEngine",
]
