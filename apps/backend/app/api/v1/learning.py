"""
OrchestreeAI Continuous Learning & Agent Confidence Feedback Endpoints (PRD v2.2 Bagian 8.11)
Endpoints:
- GET /api/v1/learning/outcomes
- GET /api/v1/learning/confidence
- GET /api/v1/learning/lessons
- GET /api/v1/learning/growth
- POST /api/v1/learning/feedback
"""

import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine
from app.authz.pdp import authorize, SubjectContext, ResourceContext

router = APIRouter(prefix="/api/v1/learning", tags=["Continuous Learning"])


class FeedbackIn(BaseModel):
    tenant_id: str
    outcome_id: str
    human_feedback_score: float = Field(..., ge=0.0, le=1.0)
    feedback_notes: Optional[str] = None
    actor_id: Optional[str] = None


@router.get("/outcomes")
async def get_decision_outcomes(
    tenant_id: str = Query(..., description="ID Tenant"),
    limit: int = Query(50, ge=1, le=100),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("learning.outcome.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    if not target_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "TENANT_ADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        tenant_id=target_tenant,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
    )
    decision = authorize(
        subject=subject,
        action="learning.outcome.view",
        resource=ResourceContext(resource_type="learning_outcome", owner_tenant_id=target_tenant),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": target_tenant})
        res = conn.execute(
            sa.text("""
                SELECT id, tenant_id, workflow_execution_id, node_key, decision_type,
                       objective_outcome, objective_success, confidence_score,
                       verification_source, evaluation_metrics, human_feedback_score, created_at
                FROM agent_decision_outcomes
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT :limit;
            """),
            {"tenant_id": target_tenant, "limit": limit},
        )
        rows = [dict(r._mapping) for r in res.fetchall()]
        return rows


@router.get("/confidence")
async def get_skill_confidences(
    tenant_id: str = Query(..., description="ID Tenant"),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("learning.confidence.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    if not target_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": target_tenant})
        res = conn.execute(
            sa.text("""
                SELECT id, tenant_id, skill_name, skill_key, confidence_score,
                       current_confidence, total_invocations, successful_invocations,
                       failed_invocations, last_updated_at, last_calculated_at
                FROM agent_skill_confidence
                WHERE tenant_id = :tenant_id
                ORDER BY confidence_score DESC;
            """),
            {"tenant_id": target_tenant},
        )
        return [dict(r._mapping) for r in res.fetchall()]


@router.get("/lessons")
async def get_lessons_learned(
    tenant_id: str = Query(..., description="ID Tenant"),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("learning.lesson.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    if not target_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": target_tenant})
        res = conn.execute(
            sa.text("""
                SELECT id, tenant_id, skill_name, skill_key, context_pattern,
                       lesson_summary, lesson_type, sample_size, min_sample_threshold,
                       is_validated, success_rate, confidence_score, updated_at
                FROM agent_lesson_learned
                WHERE tenant_id = :tenant_id
                ORDER BY is_validated DESC, success_rate DESC;
            """),
            {"tenant_id": target_tenant},
        )
        return [dict(r._mapping) for r in res.fetchall()]


@router.get("/growth")
async def get_growth_logs(
    tenant_id: str = Query(..., description="ID Tenant"),
    limit: int = Query(50, ge=1, le=100),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("learning.confidence.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    target_tenant = tenant_id or x_tenant_id
    if not target_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": target_tenant})
        res = conn.execute(
            sa.text("""
                SELECT id, tenant_id, skill_name, previous_confidence, new_confidence,
                       trigger_event, reason, delta, delta_confidence, outcome_id, created_at
                FROM agent_skill_growth_log
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT :limit;
            """),
            {"tenant_id": target_tenant, "limit": limit},
        )
        return [dict(r._mapping) for r in res.fetchall()]


@router.post("/feedback")
async def submit_human_feedback(
    payload: FeedbackIn,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("learning.feedback.submit", alias="X-User-Capabilities"),
):
    target_tenant = payload.tenant_id or x_tenant_id
    if not target_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": target_tenant})
        conn.execute(
            sa.text("""
                UPDATE agent_decision_outcomes
                SET human_feedback_score = :score,
                    evaluation_metrics = jsonb_set(
                        coalesce(evaluation_metrics, '{}'::jsonb),
                        '{human_feedback}',
                        :feedback::jsonb
                    )
                WHERE id = :outcome_id AND tenant_id = :tenant_id;
            """),
            {
                "score": payload.human_feedback_score,
                "feedback": json.dumps({
                    "notes": payload.feedback_notes,
                    "reviewer": payload.actor_id or x_user_id,
                }),
                "outcome_id": payload.outcome_id,
                "tenant_id": target_tenant,
            },
        )
    return {"success": True, "message": "Feedback manusia berhasil dicatat ke jejak evaluasi objektif."}
