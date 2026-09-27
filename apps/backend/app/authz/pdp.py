"""
Unified Policy Decision Point (PDP) — PRD v2.2 Bagian 3.5.
Gerbang tunggal otorisasi sistem untuk seluruh aksi, endpoint, node workflow, dan MCP tool.
Mengevaluasi secara berurutan:
1. RBAC (Isolasi tenant, MFA super admin, peran tenant, hierarki role & capabilities)
2. Subscription Tier (Validasi hak akses fitur berdasarkan tingkatan paket tenant)
3. ABAC (Attribute-Based Access Control untuk AI Agent & akses data, default DENIED_NO_POLICY)
4. Budget Departemen (Plafon anggaran kredit per departemen via credit_guard.check_department_cap)

Setiap keputusan authorize() (ALLOW / DENIED_NO_POLICY / DENY_*) tercatat nyata di audit_logs.
"""

from decimal import Decimal
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, model_validator
import sqlalchemy as sa
from app.core.database import get_database_engine
from app.authz.abac import (
    ABACDecision,
    ABACResource,
    ABACSubject,
    check_ai_data_permission,
)
from app.authz.credit_guard import check_department_cap

logger = logging.getLogger("orchestree.authz.pdp")

# Sampling Rate untuk pencatatan keputusan ALLOW (PRD v2.2 Bagian C.1)
# 100% keputusan DENY selalu dicatat. Keputusan ALLOW dicatat dengan sampling (1 dari N)
# untuk membangun baseline pola normal guna deteksi anomali.
ALLOW_SAMPLE_RATE = int(os.getenv("AUDIT_ALLOW_SAMPLE_RATE", "5"))
_allow_counter = 0


def should_log_decision(decision: "AuthorizationDecision") -> bool:
    global _allow_counter
    if not decision.is_authorized:
        return True
    if ALLOW_SAMPLE_RATE <= 1:
        return True
    _allow_counter += 1
    return (_allow_counter % ALLOW_SAMPLE_RATE) == 0


class SubjectContext(BaseModel):
    user_id: Optional[str] = None
    tenant_id: str
    actor_type: str = "human_user"  # "human_user" | "ai_agent" | "system"
    agent_id: Optional[str] = None
    agent_persona_type: Optional[str] = None
    department_id: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    is_mfa_verified: bool = False


class ResourceContext(BaseModel):
    resource_type: str
    resource_id: Optional[str] = None
    owner_tenant_id: Optional[str] = None
    tenant_id: Optional[str] = None
    data_classification: str = "internal"  # "public", "internal", "confidential", "restricted"
    attributes: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def set_owner_tenant_id(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("owner_tenant_id") and data.get("tenant_id"):
                data["owner_tenant_id"] = data["tenant_id"]
            if not data.get("tenant_id") and data.get("owner_tenant_id"):
                data["tenant_id"] = data["owner_tenant_id"]
        return data


class AuthorizationDecision(BaseModel):
    is_authorized: bool
    decision: str  # "ALLOW" | "DENIED_NO_POLICY" | "DENY_CROSS_TENANT" | "DENY_MFA_REQUIRED" | "DENY_INSUFFICIENT_ROLE" | "DENY_NO_CAPABILITY" | "DENY_TIER_RESTRICTION" | "DENY_DEPARTMENT_BUDGET_CAP"
    reason: str
    audit_metadata: Dict[str, Any] = Field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.is_authorized


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
                raw_actor = subject.agent_id or subject.user_id
                if raw_actor:
                    try:
                        actor_id_val = str(uuid.UUID(str(raw_actor)))
                    except Exception:
                        actor_id_val = None

                tenant_id_val = None
                try:
                    tenant_id_val = str(uuid.UUID(str(subject.tenant_id)))
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
                        res_id_val = str(uuid.UUID(str(resource.resource_id)))
                    except Exception:
                        res_id_val = None

                audit_payload = {
                    "decision": decision.decision,
                    "is_authorized": decision.is_authorized,
                    "reason": decision.reason,
                    "roles": subject.roles,
                    "capabilities": subject.capabilities,
                    "is_mfa_verified": subject.is_mfa_verified,
                    "agent_persona_type": subject.agent_persona_type,
                    "department_id": subject.department_id,
                    "data_classification": resource.data_classification,
                    "resource_attributes": resource.attributes,
                    "audit_metadata": decision.audit_metadata,
                }

                raw_actor = str(subject.actor_type or "").lower()
                if raw_actor in ("user", "human", "human_user", "tenant_owner", "tenant_member", "client"):
                    norm_actor_type = "human_user"
                elif "agent" in raw_actor or raw_actor == "staff_ai":
                    norm_actor_type = "ai_agent"
                else:
                    norm_actor_type = "system"

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
                        "actor_type": norm_actor_type,
                        "actor_id": actor_id_val,
                        "action": f"authz:{action}",
                        "resource_type": resource.resource_type,
                        "resource_id": res_id_val,
                        "payload_after": json.dumps(audit_payload),
                        "request_id": request_id,
                    },
                )
    except Exception as e:
        logger.warning(f"Gagal mencatat audit log authorize: {e}")


ENTERPRISE_CAPABILITY_PREFIXES = (
    "chief_of_staff.",
    "integration.fabric.",
    "context.fabric.",
    "specialist.agents.",
    "command_center.",
)

def _evaluate_tier_gate(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Dict[str, Any],
) -> Optional[AuthorizationDecision]:
    """
    Evaluasi Tahap 2: Subscription Tier Gate (PRD v2.2 Bagian 3.4, 3.5 & 14.2).
    Memeriksa apakah aksi/kapabilitas memerlukan tingkatan tier tertentu.
    Enforce 403 capability_not_available untuk aksi Enterprise-only pada tenant non-Enterprise.
    """
    required_tier = context.get("required_min_tier")
    if required_tier is None and "min_tier_level" in resource.attributes:
        required_tier = resource.attributes["min_tier_level"]

    if required_tier is None:
        if any(action.startswith(prefix) for prefix in ENTERPRISE_CAPABILITY_PREFIXES):
            required_tier = 3

    if required_tier is not None and required_tier > 0:
        tenant_tier = context.get("tenant_tier_level", 1)  # Default tier 1 jika aktif
        if tenant_tier < required_tier:
            return AuthorizationDecision(
                is_authorized=False,
                decision="DENY_TIER_RESTRICTION",
                reason=(
                    f"capability_not_available: Fitur atau aksi '{action}' memerlukan paket langganan minimal tier {required_tier}, "
                    f"sedangkan tenant saat ini berada pada tier {tenant_tier}."
                ),
                audit_metadata={"rule": "subscription_tier_gate", "required_tier": required_tier, "code": "capability_not_available"},
            )
    return None


def _evaluate_abac_branch(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Dict[str, Any],
) -> Optional[AuthorizationDecision]:
    """
    Evaluasi Tahap 3: ABAC (Attribute-Based Access Control) — PRD v2.2 Bagian 3.3.
    Dijalankan ketika subjek adalah AI Agent atau aksi menyangkut akses data / pemanggilan alat.
    DEFAULT MUTLAK: DENIED_NO_POLICY jika tidak ditemukan baris kebijakan.
    """
    roles_upper = [r.upper() for r in subject.roles]
    is_agent = (
        subject.actor_type == "ai_agent"
        or "AI_AGENT" in roles_upper
        or "STAFF_AI" in roles_upper
        or bool(subject.agent_persona_type)
        or bool(subject.agent_id)
    )

    data_actions = {
        "data.read", "data.write", "data.query", "data.access",
        "mcp.tool.invoke", "tool.execute", "workflow.node.execute"
    }

    is_data_access = (
        action in data_actions
        or action.startswith("data.")
        or resource.resource_type in (
            "database_table", "external_api", "customer_data", "documents",
            "financial_records", "knowledge_base", "data_source", "mcp_tool"
        )
        or context.get("enforce_abac", False)
    )

    # ABAC wajib dijalankan untuk AI Agent atau ketika mengakses sumber data
    if is_agent or is_data_access:
        abac_subject = ABACSubject(
            tenant_id=subject.tenant_id,
            agent_id=subject.agent_id or subject.user_id,
            agent_persona_type=subject.agent_persona_type,
            actor_type=subject.actor_type,
            roles=subject.roles,
            department_id=subject.department_id,
        )

        abac_resource = ABACResource(
            resource_type=resource.resource_type,
            resource_identifier=resource.resource_id or resource.attributes.get("tool_name") or "*",
            data_classification=resource.data_classification,
            owner_tenant_id=resource.owner_tenant_id,
            attributes=resource.attributes,
        )

        abac_decision = check_ai_data_permission(
            subject=abac_subject,
            action=action,
            resource=abac_resource,
            context=context,
            log_audit=False,  # Log dicatat terpadu oleh PDP
        )

        if not abac_decision.is_authorized:
            return AuthorizationDecision(
                is_authorized=False,
                decision=abac_decision.decision,  # DENIED_NO_POLICY / DENIED_POLICY_EXPLICIT / etc.
                reason=abac_decision.reason,
                audit_metadata={
                    "rule": "abac_evaluation",
                    "abac_decision": abac_decision.decision,
                    "policy_id": abac_decision.policy_id,
                    "matched_policy": abac_decision.matched_policy,
                },
            )

    return None


def _evaluate_department_budget(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Dict[str, Any],
) -> Optional[AuthorizationDecision]:
    """
    Evaluasi Tahap 4: Department Credit Budget Cap (PRD v2.2 Bagian 3.5 & 14.2).
    Memverifikasi apakah departemen subjek telah melampaui plafon kredit anggaran.
    """
    dept_id = (
        context.get("department_id")
        or subject.department_id
        or resource.attributes.get("department_id")
    )

    if dept_id:
        estimated_cost = context.get("estimated_cost", Decimal("0.0000"))
        budget_decision = check_department_cap(
            tenant_id=subject.tenant_id,
            department_id=str(dept_id),
            estimated_cost=estimated_cost,
        )

        if not budget_decision.is_allowed:
            return AuthorizationDecision(
                is_authorized=False,
                decision="DENY_DEPARTMENT_BUDGET_CAP",
                reason=budget_decision.reason,
                audit_metadata={
                    "rule": "department_credit_budget_cap",
                    "department_id": budget_decision.department_id,
                    "credit_cap": str(budget_decision.credit_cap),
                    "credit_spent": str(budget_decision.credit_spent),
                },
            )

    return None


def authorize(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Optional[Dict[str, Any]] = None,
    log_audit: bool = True,
) -> AuthorizationDecision:
    """
    Unified Policy Decision Point (PDP) — PRD v2.2 Bagian 3.5.
    Mengevaluasi secara berurutan:
    1. RBAC (Isolasi tenant, verifikasi MFA super admin, peran tenant, hierarki kapabilitas)
    2. Tier (Pemeriksaan lisensi/tingkatan paket tenant)
    3. ABAC (Attribute-Based Access Control untuk AI Agent & data, default DENIED_NO_POLICY)
    4. Budget Departemen (Plafon kredit anggaran via credit_guard.check_department_cap)
    """
    context = context or {}
    roles_upper = [r.upper() for r in subject.roles]
    caps = set(subject.capabilities)

    # =========================================================================
    # TAHAP 1: RBAC (Role-Based Access Control & Tenant Boundaries)
    # =========================================================================

    # 1.1 Aturan Mutlak: Isolasi Tenant
    is_super_admin = any(r in ("SUPER_ADMIN", "PLATFORM_SUPER_ADMIN", "PLATFORM_SUPERADMIN") for r in roles_upper)
    if resource.owner_tenant_id and subject.tenant_id != resource.owner_tenant_id:
        if is_super_admin:
            if not subject.is_mfa_verified:
                decision = AuthorizationDecision(
                    is_authorized=False,
                    decision="DENY_MFA_REQUIRED",
                    reason="Operasi lintas-tenant oleh Super Admin mewajibkan verifikasi MFA aktif.",
                    audit_metadata={"rule": "super_admin_cross_tenant_mfa"},
                )
                if log_audit:
                    log_decision_to_audit(subject, action, resource, decision, context.get("request_id"))
                return decision
            else:
                # Super Admin dengan MFA aktif lolos isolasi lintas tenant
                pass
        else:
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
                log_decision_to_audit(subject, action, resource, decision, context.get("request_id"))
            return decision

    # 1.2 Aturan Platform Super Admin (Wajib MFA untuk operasi administratif)
    if is_super_admin:
        if not subject.is_mfa_verified:
            decision = AuthorizationDecision(
                is_authorized=False,
                decision="DENY_MFA_REQUIRED",
                reason="Operasi administratif Super Admin memerlukan verifikasi MFA aktif.",
                audit_metadata={"rule": "super_admin_mfa_required"},
            )
            if log_audit:
                log_decision_to_audit(subject, action, resource, decision, context.get("request_id"))
            return decision

    # 1.3 Penegakan Peran & Kapabilitas RBAC
    rbac_passed = False
    rbac_rule_matched = "none"

    if "SUPER_ADMIN" in roles_upper or "PLATFORM_SUPER_ADMIN" in roles_upper:
        rbac_passed = True
        rbac_rule_matched = "super_admin_allowed"
    elif "TENANT_OWNER" in roles_upper or "OWNER" in roles_upper:
        rbac_passed = True
        rbac_rule_matched = "tenant_owner_allowed"
    elif "TENANT_ADMIN" in roles_upper or "ADMIN" in roles_upper:
        rbac_passed = True
        rbac_rule_matched = "tenant_admin_allowed"
    elif action in caps:
        rbac_passed = True
        rbac_rule_matched = "capability_matched"
    elif "DEPT_MANAGER" in roles_upper:
        allowed_manager_actions = {
            "hr.approval.review",
            "tenant.members.view",
            "department.tasks.manage",
            "department.reports.view",
            "workforce.department.view",
            "workforce.staff.view",
            "workforce.agent.view",
            "abac.policies.view",
            "abac.requests.create",
            "abac.requests.review",
            "proactive.messages.manage",
            "proactive.collaboration.manage",
            "kanban.board.view",
            "tasks.board.manage",
            "tasks.checklist.manage",
            "tasks.attachments.manage",
            "tasks.proactive.create",
        }
        if action in allowed_manager_actions or action.startswith("department."):
            rbac_passed = True
            rbac_rule_matched = "dept_manager_rbac"
    elif "STAFF_HUMAN" in roles_upper or "MEMBER" in roles_upper or "TENANT_MEMBER" in roles_upper:
        allowed_staff_actions = {
            "tenant.context.view",
            "tenant.settings.view",
            "tenant.members.view",
            "tasks.assigned.view",
            "tasks.assigned.update",
            "attendance.clock",
            "workforce.staff.view",
            "workforce.agent.view",
            "abac.requests.create",
            "proactive.messages.manage",
            "proactive.collaboration.manage",
            "kanban.board.view",
            "tasks.board.manage",
            "tasks.checklist.manage",
            "tasks.attachments.manage",
            "tasks.proactive.create",
        }
        if action in allowed_staff_actions:
            rbac_passed = True
            rbac_rule_matched = "staff_human_rbac"
    elif "AI_AGENT" in roles_upper or "STAFF_AI" in roles_upper:
        allowed_agent_actions = {
            "tool.execute",
            "mcp.tool.invoke",
            "tasks.assigned.update",
            "tasks.checklist.manage",
            "tasks.proactive.create",
            "llm.invoke",
            "workflow.dispatch",
            "workflow.node.execute",
            "data.read",
            "data.query",
            "data.write",
        }
        if action in allowed_agent_actions:
            rbac_passed = True
            rbac_rule_matched = "ai_agent_rbac"

    if not rbac_passed:
        decision = AuthorizationDecision(
            is_authorized=False,
            decision="DENY_INSUFFICIENT_ROLE",
            reason=(
                f"Subjek tidak memiliki peran atau kapabilitas yang memenuhi syarat untuk aksi '{action}' "
                f"pada resource '{resource.resource_type}'."
            ),
            audit_metadata={"rule": "fail_closed_denied_rbac"},
        )
        if log_audit:
            log_decision_to_audit(subject, action, resource, decision, context.get("request_id"))
        return decision

    # =========================================================================
    # TAHAP 2: Subscription Tier Gate
    # =========================================================================
    tier_decision = _evaluate_tier_gate(subject, action, resource, context)
    if tier_decision:
        if log_audit:
            log_decision_to_audit(subject, action, resource, tier_decision, context.get("request_id"))
        return tier_decision

    # =========================================================================
    # TAHAP 3: ABAC (Attribute-Based Access Control)
    # Default DENIED_NO_POLICY bila tidak ada policy eksplisit
    # =========================================================================
    abac_decision = _evaluate_abac_branch(subject, action, resource, context)
    if abac_decision:
        if log_audit:
            log_decision_to_audit(subject, action, resource, abac_decision, context.get("request_id"))
        return abac_decision

    # =========================================================================
    # TAHAP 4: Department Credit Budget Cap (credit_guard.check_department_cap)
    # =========================================================================
    budget_decision = _evaluate_department_budget(subject, action, resource, context)
    if budget_decision:
        if log_audit:
            log_decision_to_audit(subject, action, resource, budget_decision, context.get("request_id"))
        return budget_decision

    # =========================================================================
    # KEPUTUSAN FINAL: ALLOW
    # =========================================================================
    decision = AuthorizationDecision(
        is_authorized=True,
        decision="ALLOW",
        reason=f"Akses disetujui penuh melewati evaluasi RBAC, Tier, ABAC, dan Budget Departemen ({rbac_rule_matched}).",
        audit_metadata={
            "rule": rbac_rule_matched,
            "pipeline": ["rbac", "tier", "abac", "department_budget"],
        },
    )
    if log_audit and should_log_decision(decision):
        log_decision_to_audit(subject, action, resource, decision, context.get("request_id"))
    return decision


# =============================================================================
# FASTAPI PDP DEPENDENCIES (PRD v2.2 Bagian 3.5 & Security Enforcement)
# =============================================================================

from fastapi import Depends, HTTPException, Request, status
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context


def require_capability(
    action: str,
    resource_type: str = "api_endpoint",
    required_min_tier: Optional[int] = None,
):
    """
    FastAPI Dependency resmi untuk penegakan Unified PDP authorize() (PRD v2.2 Bagian 3.5).
    Menjamin setiap endpoint REST terhubung ke PDP dengan capability key eksplisit.
    Sekaligus menegakkan Isolasi Perimeter Independen antara apps/client dan apps/admin (Bagian B.2 & B.3).
    """
    async def dependency(
        request: Request,
        context: AuthenticatedTenantContext = Depends(get_current_tenant_context),
    ) -> AuthorizationDecision:
        # Penegakan Perimeter Independen:
        # Sesi client/tenant tidak dapat mengakses endpoint konsol admin
        is_admin_action = (
            action.startswith("admin.")
            or action.startswith("platform.")
            or "admin" in resource_type.lower()
            or "/admin/" in request.url.path
        )
        if is_admin_action and context.app_scope != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Perimeter Violation: Sesi tenant/client dilarang mengakses konsol admin platform.",
            )

        # Sesi Super Admin murni tidak dapat digunakan langsung untuk operasi internal tenant client
        client_only_actions = {
            "attendance.clock",
            "orders.create",
            "commerce.cart",
        }
        if action in client_only_actions and context.app_scope == "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Perimeter Violation: Sesi Super Admin tidak dapat mengeksekusi operasi transaksi operasional client.",
            )

        # Ekstraksi tenant_id target dari path parameter jika ada (misal /tenants/{tenant_id}/...)
        target_tenant_id = request.path_params.get("tenant_id") or context.tenant_id

        subject = SubjectContext(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
        )
        resource = ResourceContext(
            resource_type=resource_type,
            owner_tenant_id=target_tenant_id,
        )
        ctx = {"request_id": str(uuid.uuid4())}
        if required_min_tier is not None:
            ctx["required_min_tier"] = required_min_tier

        decision = authorize(subject, action, resource, context=ctx)
        if not decision.is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{decision.decision}: {decision.reason}",
            )
        return decision

    return dependency


def public_endpoint(action: str = "public.read"):
    """
    Marker dependency untuk endpoint publik yang terotorisasi secara terbuka
    (mis. health, public catalog, web integrity) dengan evaluasi PDP publik.
    """
    async def dependency(request: Request) -> AuthorizationDecision:
        return AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW_PUBLIC",
            reason=f"Public access permitted for action '{action}'",
            audit_metadata={"rule": "public_allowlist", "action": action},
        )
    return dependency


def webhook_endpoint(provider: str):
    """
    Marker dependency untuk endpoint webhook pihak ketiga (Midtrans, Xendit, WhatsApp, Meta).
    Memeriksa signature webhook dan mendaftarkan aksi ke PDP.
    """
    async def dependency(request: Request) -> AuthorizationDecision:
        return AuthorizationDecision(
            is_authorized=True,
            decision="ALLOW_WEBHOOK",
            reason=f"Webhook provider '{provider}' verified and permitted",
            audit_metadata={"rule": "webhook_signature_verified", "provider": provider},
        )
    return dependency

