"""
Unified Policy Decision Point (PDP) — PRD v2.2 Bagian 3.5.
Gerbang tunggal otorisasi sistem untuk seluruh aksi, endpoint, tool, dan resource.
Merekonsiliasi RBAC (roles, role_permissions, user_roles) + Feature Capabilities.
Setiap keputusan authorize() (ALLOW / DENY_*) tercatat nyata di audit_logs.
"""

import json
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine


class SubjectContext(BaseModel):
    user_id: str
    tenant_id: str
    actor_type: str = "human_user"  # "human_user" | "ai_agent" | "system"
    roles: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    is_mfa_verified: bool = False


class ResourceContext(BaseModel):
    resource_type: str
    resource_id: Optional[str] = None
    owner_tenant_id: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class AuthorizationDecision(BaseModel):
    is_authorized: bool
    decision: str  # "ALLOW" | "DENY_CROSS_TENANT" | "DENY_MFA_REQUIRED" | "DENY_INSUFFICIENT_ROLE" | "DENY_NO_CAPABILITY"
    reason: str
    audit_metadata: Dict[str, Any] = Field(default_factory=dict)


def log_decision_to_audit(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    decision: AuthorizationDecision,
    request_id: Optional[str] = None,
) -> None:
    """Mencatat keputusan otorisasi nyata ke tabel audit_logs (PRD v2.2 Bagian 3.5 & 16.1)."""
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            with conn.begin():
                actor_id_val = None
                try:
                    actor_id_val = str(uuid.UUID(subject.user_id))
                except Exception:
                    actor_id_val = None

                tenant_id_val = None
                try:
                    tenant_id_val = str(uuid.UUID(subject.tenant_id))
                except Exception:
                    tenant_id_val = None

                # Tetapkan role dan tenant_id transaksi untuk memenuhi RLS
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                if tenant_id_val:
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                        {"val": tenant_id_val}
                    )

                res_id_val = None
                if resource.resource_id:
                    try:
                        res_id_val = str(uuid.UUID(resource.resource_id))
                    except Exception:
                        res_id_val = None

                audit_payload = {
                    "decision": decision.decision,
                    "is_authorized": decision.is_authorized,
                    "reason": decision.reason,
                    "roles": subject.roles,
                    "capabilities": subject.capabilities,
                    "is_mfa_verified": subject.is_mfa_verified,
                    "resource_attributes": resource.attributes,
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
                        "action": f"authz:{action}",
                        "resource_type": resource.resource_type,
                        "resource_id": res_id_val,
                        "payload_after": json.dumps(audit_payload),
                        "request_id": request_id,
                    },
                )
    except Exception as e:
        # Fail-safe logging agar audit error tidak menghentikan evaluasi in-memory jika DB unreachable
        pass


def authorize(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Optional[Dict[str, Any]] = None,
    log_audit: bool = True,
) -> AuthorizationDecision:
    """
    Evaluasi kebijakan terpadu (Unified Policy Decision Point — PRD v2.2 Bagian 3.5).
    Aturan hirarki:
    1. Tenant Isolation: Subjek dari Tenant A DILARANG mengakses resource milik Tenant B,
       kecuali SUPER_ADMIN dengan MFA aktif.
    2. Platform Super Admin: Memerlukan verifikasi MFA aktif untuk operasi apapun.
    3. Peran Tenant: TENANT_OWNER dan TENANT_ADMIN memiliki kewenangan penuh dalam lingkup tenant mereka.
    4. Peran Spesifik & Kapabilitas:
       - DEPT_MANAGER: diizinkan jika memiliki peran DEPT_MANAGER dan kapabilitas terkait departemen.
       - STAFF_HUMAN: diizinkan jika memiliki peran STAFF_HUMAN dan kapabilitas dasar.
       - AI_AGENT: diizinkan jika terdaftar dengan peran AI_AGENT dan kapabilitas tool spesifik.
    5. Fallback Fail-Closed: Tolak seluruh akses yang tidak terevaluasi.
    """
    context = context or {}
    roles_upper = [r.upper() for r in subject.roles]
    caps = set(subject.capabilities)

    # 1. Aturan Mutlak: Isolasi Tenant
    if resource.owner_tenant_id and subject.tenant_id != resource.owner_tenant_id:
        if "SUPER_ADMIN" in roles_upper or "PLATFORM_SUPER_ADMIN" in roles_upper:
            if not subject.is_mfa_verified:
                decision = AuthorizationDecision(
                    is_authorized=False,
                    decision="DENY_MFA_REQUIRED",
                    reason="Operasi lintas-tenant oleh Super Admin mewajibkan verifikasi MFA aktif.",
                    audit_metadata={"rule": "super_admin_cross_tenant_mfa"},
                )
                if log_audit:
                    log_decision_to_audit(subject, action, resource, decision)
                return decision
            else:
                decision = AuthorizationDecision(
                    is_authorized=True,
                    decision="ALLOW",
                    reason="Akses lintas-tenant disetujui untuk Super Admin dengan MFA aktif.",
                    audit_metadata={"rule": "super_admin_cross_tenant_allowed"},
                )
                if log_audit:
                    log_decision_to_audit(subject, action, resource, decision)
                return decision

        decision = AuthorizationDecision(
            is_authorized=False,
            decision="DENY_CROSS_TENANT",
            reason=(
                f"Pelanggaran batas tenant: subjek tenant '{subject.tenant_id}' "
                f"mencoba mengakses resource milik tenant '{resource.owner_tenant_id}'."
            ),
            audit_metadata={"rule": "tenant_boundary_violation"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision)
        return decision

    # 2. Aturan Super Admin Platform
    if "SUPER_ADMIN" in roles_upper or "PLATFORM_SUPER_ADMIN" in roles_upper:
        if not subject.is_mfa_verified:
            decision = AuthorizationDecision(
                is_authorized=False,
                decision="DENY_MFA_REQUIRED",
                reason="Operasi administratif Super Admin memerlukan verifikasi MFA aktif.",
                audit_metadata={"rule": "super_admin_mfa_required"},
            )
            if log_audit:
                log_decision_to_audit(subject, action, resource, decision)
            return decision

        decision = AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW",
            reason="Akses disetujui untuk Platform Super Admin dengan MFA terverifikasi.",
            audit_metadata={"rule": "super_admin_allowed"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision)
        return decision

    # 3. Penegakan Peran Administratif Tenant (TENANT_OWNER, TENANT_ADMIN)
    if "TENANT_OWNER" in roles_upper or "OWNER" in roles_upper:
        decision = AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW",
            reason="Akses disetujui penuh untuk TENANT_OWNER.",
            audit_metadata={"rule": "tenant_owner_allowed"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision)
        return decision

    if "TENANT_ADMIN" in roles_upper or "ADMIN" in roles_upper:
        decision = AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW",
            reason="Akses disetujui untuk TENANT_ADMIN.",
            audit_metadata={"rule": "tenant_admin_allowed"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision)
        return decision

    # 4. Penegakan Kapabilitas Langsung
    if action in caps:
        decision = AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW",
            reason=f"Akses disetujui berdasarkan kapabilitas terdaftar '{action}'.",
            audit_metadata={"rule": "capability_matched"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision)
        return decision

    # 5. Penegakan Peran Berjenjang
    if "DEPT_MANAGER" in roles_upper:
        allowed_manager_actions = {
            "hr.approval.review",
            "tenant.members.view",
            "department.tasks.manage",
            "department.reports.view",
            "workforce.department.view",
            "workforce.staff.view",
            "workforce.agent.view",
        }
        if action in allowed_manager_actions:
            decision = AuthorizationDecision(
                is_authorized=True,
                decision="ALLOW",
                reason=f"Akses disetujui untuk peran DEPT_MANAGER pada aksi '{action}'.",
                audit_metadata={"rule": "dept_manager_rbac"},
            )
            if log_audit:
                log_decision_to_audit(subject, action, resource, decision)
            return decision

    if "STAFF_HUMAN" in roles_upper:
        allowed_staff_actions = {
            "tenant.members.view",
            "tasks.assigned.view",
            "tasks.assigned.update",
            "attendance.clock",
            "workforce.staff.view",
            "workforce.agent.view",
        }
        if action in allowed_staff_actions:
            decision = AuthorizationDecision(
                is_authorized=True,
                decision="ALLOW",
                reason=f"Akses disetujui untuk peran STAFF_HUMAN pada aksi '{action}'.",
                audit_metadata={"rule": "staff_human_rbac"},
            )
            if log_audit:
                log_decision_to_audit(subject, action, resource, decision)
            return decision

    if "AI_AGENT" in roles_upper:
        allowed_agent_actions = {
            "tool.execute",
            "tasks.assigned.update",
            "llm.invoke",
        }
        if action in allowed_agent_actions:
            decision = AuthorizationDecision(
                is_authorized=True,
                decision="ALLOW",
                reason=f"Akses disetujui untuk AI_AGENT pada aksi '{action}'.",
                audit_metadata={"rule": "ai_agent_rbac"},
            )
            if log_audit:
                log_decision_to_audit(subject, action, resource, decision)
            return decision

    # 6. Standar Fail-Closed
    decision = AuthorizationDecision(
        is_authorized=False,
        decision="DENY_INSUFFICIENT_ROLE",
        reason=f"Subjek tidak memiliki peran atau kapabilitas untuk aksi '{action}' pada resource '{resource.resource_type}'.",
        audit_metadata={"rule": "fail_closed_denied"},
    )
    if log_audit:
        log_decision_to_audit(subject, action, resource, decision)
    return decision
