"""
OrchestreeAI Continuous Learning API (PRD v2.2 Bagian 8.11).

Transport, authentication and PDP live here. Persistence is owned by the
continuous-learning domain repository.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.authz.pdp import authorize, SubjectContext, ResourceContext
from app.domains.continuous_learning.repository import get_continuous_learning_repository
from app.core.security import AuthenticatedTenantContext, get_trusted_request_context

router = APIRouter(
    prefix="/api/v1/learning",
    tags=["Continuous Learning"],
)


class FeedbackIn(BaseModel):
    outcome_id: str
    human_feedback_score: float = Field(..., ge=0.0, le=1.0)
    feedback_notes: Optional[str] = None


def _authorize_learning(
    context: AuthenticatedTenantContext,
    action: str,
) -> None:
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    decision = authorize(
        subject=subject,
        action=action,
        resource=ResourceContext(
            resource_type="learning",
            owner_tenant_id=context.tenant_id,
        ),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")


@router.get("/outcomes")
async def get_decision_outcomes(
    limit: int = Query(50, ge=1, le=100),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_learning(context, "learning.outcome.view")
    return get_continuous_learning_repository().list_outcomes(context.tenant_id, limit)


@router.get("/confidence")
async def get_skill_confidences(
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_learning(context, "learning.confidence.view")
    return get_continuous_learning_repository().list_confidences(context.tenant_id)


@router.get("/lessons")
async def get_lessons_learned(
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_learning(context, "learning.lesson.view")
    return get_continuous_learning_repository().list_lessons(context.tenant_id)


@router.get("/growth")
async def get_growth_logs(
    limit: int = Query(50, ge=1, le=100),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_learning(context, "learning.confidence.view")
    return get_continuous_learning_repository().list_growth(context.tenant_id, limit)


@router.post("/feedback")
async def submit_human_feedback(
    payload: FeedbackIn,
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_learning(context, "learning.feedback.submit")
    updated = get_continuous_learning_repository().submit_human_feedback(
        tenant_id=context.tenant_id,
        outcome_id=payload.outcome_id,
        human_feedback_score=payload.human_feedback_score,
        feedback_notes=payload.feedback_notes,
        actor_id=context.user_id,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Outcome pembelajaran tidak ditemukan pada tenant.")
    return {"success": True, "message": "Feedback manusia berhasil dicatat ke jejak evaluasi objektif."}
