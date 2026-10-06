"""
OrchestreeAI Continuous Learning API (PRD v2.2 Bagian 8.11).

Transport, authentication and PDP live here. Persistence is owned by the
continuous-learning domain repository.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query, Depends
from pydantic import BaseModel, Field

from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability
from app.domains.continuous_learning.repository import get_continuous_learning_repository

router = APIRouter(
    prefix="/api/v1/learning",
    tags=["Continuous Learning"],
    dependencies=[Depends(require_capability("learning.reflections.manage"))],
)


class FeedbackIn(BaseModel):
    tenant_id: str
    outcome_id: str
    human_feedback_score: float = Field(..., ge=0.0, le=1.0)
    feedback_notes: Optional[str] = None
    actor_id: Optional[str] = None


def _authorize_learning(
    tenant_id: str,
    action: str,
    x_user_roles: Optional[str],
    x_user_capabilities: Optional[str],
    x_mfa_verified: Optional[str],
) -> None:
    roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=(x_mfa_verified or "false").lower() in ("true", "1"),
    )
    decision = authorize(
        subject=subject,
        action=action,
        resource=ResourceContext(
            resource_type="learning",
            owner_tenant_id=tenant_id,
        ),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")


@router.get("/outcomes")
async def get_decision_outcomes(
    tenant_id: str = Query(..., description="ID Tenant"),
    limit: int = Query(50, ge=1, le=100),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    _authorize_learning(target_tenant, "learning.outcome.view", x_user_roles, x_user_capabilities, x_mfa_verified)
    return get_continuous_learning_repository().list_outcomes(target_tenant, limit)


@router.get("/confidence")
async def get_skill_confidences(
    tenant_id: str = Query(..., description="ID Tenant"),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    _authorize_learning(target_tenant, "learning.confidence.view", x_user_roles, x_user_capabilities, x_mfa_verified)
    return get_continuous_learning_repository().list_confidences(target_tenant)


@router.get("/lessons")
async def get_lessons_learned(
    tenant_id: str = Query(..., description="ID Tenant"),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    _authorize_learning(target_tenant, "learning.lesson.view", x_user_roles, x_user_capabilities, x_mfa_verified)
    return get_continuous_learning_repository().list_lessons(target_tenant)


@router.get("/growth")
async def get_growth_logs(
    tenant_id: str = Query(..., description="ID Tenant"),
    limit: int = Query(50, ge=1, le=100),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    _authorize_learning(target_tenant, "learning.confidence.view", x_user_roles, x_user_capabilities, x_mfa_verified)
    return get_continuous_learning_repository().list_growth(target_tenant, limit)


@router.post("/feedback")
async def submit_human_feedback(
    payload: FeedbackIn,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    target_tenant = payload.tenant_id or x_tenant_id
    _authorize_learning(target_tenant, "learning.feedback.submit", x_user_roles, x_user_capabilities, x_mfa_verified)
    updated = get_continuous_learning_repository().submit_human_feedback(
        tenant_id=target_tenant,
        outcome_id=payload.outcome_id,
        human_feedback_score=payload.human_feedback_score,
        feedback_notes=payload.feedback_notes,
        actor_id=payload.actor_id or x_user_id,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Outcome pembelajaran tidak ditemukan pada tenant.")
    return {"success": True, "message": "Feedback manusia berhasil dicatat ke jejak evaluasi objektif."}
