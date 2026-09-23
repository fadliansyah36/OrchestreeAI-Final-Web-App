"""
Attribute-Based Access Control (ABAC) untuk Agen AI & Persona — PRD v2.2 Bagian 3.3.
Menegakkan kontrol izin granular terhadap sumber data eksternal, tabel, dan dokumen.
Default fail-closed: DENIED_NO_POLICY bila tidak ada baris policy eksplisit (bukan default ALLOW).
Setiap penolakan DENIED_NO_POLICY dicatat ke audit_logs (PRD v2.2 Bagian 3.3 & 16.1).
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.authz.abac")

# Hirarki Klasifikasi Data: 1 (Public) -> 4 (Restricted)
DATA_CLASSIFICATION_HIERARCHY: Dict[str, int] = {
    "public": 1,
    "internal": 2,
    "confidential": 3,
    "restricted": 4,
}


class ABACSubject(BaseModel):
    tenant_id: str
    agent_id: Optional[str] = None
    agent_persona_type: Optional[str] = None
    actor_type: str = "ai_agent"
    roles: List[str] = Field(default_factory=lambda: ["AI_AGENT"])
    department_id: Optional[str] = None


class ABACResource(BaseModel):
    resource_type: str  # e.g., "database_table", "external_api", "customer_pii", "financial_records", "knowledge_doc"
    resource_identifier: str  # e.g., "sales_contacts", "stripe_invoices", "*"
    data_classification: str = "internal"  # "public", "internal", "confidential", "restricted"
    owner_tenant_id: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)


class ABACDecision(BaseModel):
    is_authorized: bool
    decision: str  # "ALLOW" | "DENIED_NO_POLICY" | "DENIED_POLICY_EXPLICIT" | "DENY_DATA_CLASSIFICATION" | "DENY_CONDITION_UNMET" | "DENY_CROSS_TENANT"
    reason: str
    policy_id: Optional[str] = None
    matched_policy: Optional[Dict[str, Any]] = None
    data_classification: str = "internal"
    audit_metadata: Dict[str, Any] = Field(default_factory=dict)


def log_abac_decision_to_audit(
    subject: ABACSubject,
    action: str,
    resource: ABACResource,
    decision: ABACDecision,
    request_id: Optional[str] = None,
    engine: Optional[sa.engine.Engine] = None,
) -> None:
    """Mencatat keputusan ABAC secara nyata ke tabel audit_logs."""
    try:
        eng = engine or get_database_engine()
        with eng.connect() as conn:
            with conn.begin():
                tenant_id_val = None
                try:
                    tenant_id_val = str(uuid.UUID(str(subject.tenant_id)))
                except Exception:
                    tenant_id_val = None

                actor_id_val = None
                if subject.agent_id:
                    try:
                        actor_id_val = str(uuid.UUID(str(subject.agent_id)))
                    except Exception:
                        actor_id_val = None

                # Set session tenant_id untuk kepatuhan RLS
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                if tenant_id_val:
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                        {"val": tenant_id_val}
                    )

                audit_payload = {
                    "abac_decision": decision.decision,
                    "is_authorized": decision.is_authorized,
                    "reason": decision.reason,
                    "policy_id": decision.policy_id,
                    "agent_persona_type": subject.agent_persona_type,
                    "resource_type": resource.resource_type,
                    "resource_identifier": resource.resource_identifier,
                    "data_classification": resource.data_classification,
                    "action": action,
                    "matched_policy": decision.matched_policy,
                }

                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            tenant_id,
                            actor_type,
                            actor_id,
                            action,
                            resource_type,
                            resource_id,
                            payload_after,
                            request_id
                        ) VALUES (
                            :tenant_id,
                            :actor_type,
                            :actor_id,
                            :action,
                            :resource_type,
                            :resource_id,
                            :payload_after,
                            :request_id
                        );
                    """),
                    {
                        "tenant_id": tenant_id_val,
                        "actor_type": subject.actor_type,
                        "actor_id": actor_id_val,
                        "action": f"abac:{action}",
                        "resource_type": resource.resource_type,
                        "resource_id": None,
                        "payload_after": json.dumps(audit_payload),
                        "request_id": request_id,
                    }
                )
    except Exception as e:
        logger.warning(f"Gagal mencatat audit log ABAC: {e}")


def check_ai_data_permission(
    subject: ABACSubject,
    action: str,
    resource: ABACResource,
    context: Optional[Dict[str, Any]] = None,
    engine: Optional[sa.engine.Engine] = None,
    log_audit: bool = True,
) -> ABACDecision:
    """
    Evaluasi Kebijakan Izin Data Agen AI (ABAC) — PRD v2.2 Bagian 3.3.
    Aturan Mutlak:
    1. Tenant Isolation: Resource milik tenant lain langsung ditolak (DENY_CROSS_TENANT).
    2. Zero-Trust Default: Jika tidak ditemukan baris kebijakan (policy) yang cocok di
       tabel ai_data_permission_policies, sistem WAJIB menghasilkan DENIED_NO_POLICY.
    3. Evaluasi Kebijakan (Priority High to Low):
       - Pencocokan agent_id atau agent_persona_type atau wildcard global (keduanya null).
       - Pencocokan resource_type dan resource_identifier (mendukung wildcard '*').
       - Pencocokan action (mendukung wildcard '*').
       - Validasi klasifikasi data (policy classification level >= resource classification level).
       - Validasi kondisi JSONB (conditions, e.g. department_id, allowed_actions).
    4. Keputusan tercatat di audit_logs.
    """
    context = context or {}

    # 1. Batas Isolasi Tenant
    if resource.owner_tenant_id and subject.tenant_id != resource.owner_tenant_id:
        decision = ABACDecision(
            is_authorized=False,
            decision="DENY_CROSS_TENANT",
            reason=(
                f"Pelanggaran batas tenant data: agen tenant '{subject.tenant_id}' "
                f"mencoba mengakses resource milik tenant '{resource.owner_tenant_id}'."
            ),
            data_classification=resource.data_classification,
            audit_metadata={"rule": "tenant_boundary_violation"},
        )
        if log_audit:
            log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), engine)
        return decision

    # 2. Query Kebijakan dari Supabase Database
    try:
        eng = engine or get_database_engine()
        with eng.connect() as conn:
            tenant_uuid = str(uuid.UUID(str(subject.tenant_id)))

            # Tetapkan role dan parameter transaksi RLS
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_uuid}
            )

            agent_uuid_val = None
            if subject.agent_id:
                try:
                    agent_uuid_val = str(uuid.UUID(str(subject.agent_id)))
                except Exception:
                    agent_uuid_val = None

            query = sa.text("""
                SELECT
                    id, tenant_id, agent_id, agent_persona_type, resource_type,
                    resource_identifier, action, data_classification, conditions, effect, priority
                FROM ai_data_permission_policies
                WHERE tenant_id = :tenant_id
                  AND (resource_type = :resource_type OR resource_type = '*' OR resource_type = 'enterprise_system' OR :resource_type = 'enterprise_system')
                  AND (resource_identifier = :resource_identifier OR resource_identifier = '*')
                  AND (action = :action OR action = '*')
                  AND (
                      (agent_id IS NOT NULL AND agent_id = :agent_id)
                      OR (agent_persona_type IS NOT NULL AND agent_persona_type = :persona_type)
                      OR (agent_id IS NULL AND agent_persona_type IS NULL)
                  )
                ORDER BY priority DESC, created_at DESC;
            """)

            result = conn.execute(query, {
                "tenant_id": tenant_uuid,
                "resource_type": resource.resource_type,
                "resource_identifier": resource.resource_identifier,
                "action": action,
                "agent_id": agent_uuid_val,
                "persona_type": subject.agent_persona_type,
            })
            policies = result.fetchall()

            # --- SIFAT MUTLAK: DEFAULT DENIED_NO_POLICY ---
            if not policies:
                agent_ident = subject.agent_id or subject.agent_persona_type or "AI_AGENT"
                decision = ABACDecision(
                    is_authorized=False,
                    decision="DENIED_NO_POLICY",
                    reason=(
                        f"Akses data ditolak: Tidak ada baris kebijakan izin data eksplisit (ABAC Policy) "
                        f"untuk persona/agen '{agent_ident}' pada resource '{resource.resource_type}:{resource.resource_identifier}'. "
                        f"Default Zero-Trust: DENIED_NO_POLICY."
                    ),
                    data_classification=resource.data_classification,
                    audit_metadata={"rule": "zero_trust_default_denied_no_policy"},
                )
                if log_audit:
                    log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), eng)
                return decision

            # Evaluasi kebijakan berdasarkan prioritas tertinggi
            resource_level = DATA_CLASSIFICATION_HIERARCHY.get(resource.data_classification.lower(), 2)

            for pol in policies:
                (
                    pol_id, pol_tenant, pol_agent_id, pol_persona, pol_res_type,
                    pol_res_ident, pol_act, pol_class, pol_cond, pol_effect, pol_prio
                ) = pol

                policy_dict = {
                    "id": str(pol_id),
                    "agent_id": str(pol_agent_id) if pol_agent_id else None,
                    "agent_persona_type": pol_persona,
                    "resource_type": pol_res_type,
                    "resource_identifier": pol_res_ident,
                    "action": pol_act,
                    "data_classification": pol_class,
                    "conditions": pol_cond if isinstance(pol_cond, dict) else json.loads(pol_cond or "{}"),
                    "effect": pol_effect,
                    "priority": pol_prio,
                }

                # Periksa klasifikasi data
                policy_level = DATA_CLASSIFICATION_HIERARCHY.get(pol_class.lower(), 2)
                if resource_level > policy_level:
                    logger.info(
                        f"ABAC Policy {pol_id} memiliki klasifikasi '{pol_class}' "
                        f"yang lebih rendah dari resource '{resource.data_classification}'."
                    )
                    continue

                # Evaluasi kondisi tambahan (JSONB conditions)
                conditions = policy_dict["conditions"]
                conditions_met = True
                unmet_condition_reason = ""

                # Kondisi: pembatasan departemen
                if "allowed_departments" in conditions and subject.department_id:
                    allowed_depts = conditions["allowed_departments"]
                    if isinstance(allowed_depts, list) and subject.department_id not in allowed_depts:
                        conditions_met = False
                        unmet_condition_reason = f"Departemen agen '{subject.department_id}' tidak termasuk dalam allowed_departments."

                # Kondisi: batas jam operasional
                if "operating_hours" in conditions:
                    current_hour = datetime.now(timezone.utc).hour + 7  # WIB
                    start_hr = conditions["operating_hours"].get("start", 0)
                    end_hr = conditions["operating_hours"].get("end", 24)
                    if not (start_hr <= current_hour <= end_hr):
                        conditions_met = False
                        unmet_condition_reason = f"Akses di luar jam operasional yang diizinkan ({start_hr}:00 - {end_hr}:00 WIB)."

                if not conditions_met:
                    continue

                # Keputusan berdasarkan effect kebijakan
                if pol_effect == "DENY":
                    decision = ABACDecision(
                        is_authorized=False,
                        decision="DENIED_POLICY_EXPLICIT",
                        reason=f"Akses data ditolak secara eksplisit oleh kebijakan ABAC ID {pol_id}.",
                        policy_id=str(pol_id),
                        matched_policy=policy_dict,
                        data_classification=resource.data_classification,
                        audit_metadata={"rule": "explicit_policy_deny", "priority": pol_prio},
                    )
                    if log_audit:
                        log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), eng)
                    return decision

                if pol_effect == "ALLOW":
                    decision = ABACDecision(
                        is_authorized=True,
                        decision="ALLOW",
                        reason=f"Akses data disetujui berdasarkan kebijakan ABAC ID {pol_id}.",
                        policy_id=str(pol_id),
                        matched_policy=policy_dict,
                        data_classification=resource.data_classification,
                        audit_metadata={"rule": "explicit_policy_allow", "priority": pol_prio},
                    )
                    if log_audit:
                        log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), eng)
                    return decision

            # Jika seluruh kandidat policy tidak memenuhi kondisi atau klasifikasi
            decision = ABACDecision(
                is_authorized=False,
                decision="DENIED_NO_POLICY",
                reason=(
                    f"Akses data ditolak: Tidak ada kebijakan yang memenuhi syarat klasifikasi data "
                    f"atau kondisi operasional untuk resource '{resource.resource_type}:{resource.resource_identifier}'."
                ),
                data_classification=resource.data_classification,
                audit_metadata={"rule": "no_matching_qualified_policy"},
            )
            if log_audit:
                log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), eng)
            return decision

    except Exception as e:
        logger.error(f"Error evaluating ABAC policy: {e}")
        # Default fail-closed pada kesalahan sistem
        decision = ABACDecision(
            is_authorized=False,
            decision="DENIED_NO_POLICY",
            reason=f"Kesalahan sistem saat evaluasi ABAC (Fail-closed): {str(e)}",
            data_classification=resource.data_classification,
            audit_metadata={"rule": "system_error_fail_closed"},
        )
        if log_audit:
            log_abac_decision_to_audit(subject, action, resource, decision, context.get("request_id"), engine)
        return decision
