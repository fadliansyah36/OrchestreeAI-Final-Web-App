"""Continuous Learning persistence/query boundary.

All SQL for learning read models and human feedback lives here. API routers
remain transport/auth/PDP-only.
"""
import json
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import sqlalchemy as sa

from app.core.database import get_engine


class ContinuousLearningRepository:
    def __init__(self) -> None:
        self._engine = get_engine()

    @contextmanager
    def _tenant_connection(self, tenant_id: str):
        with self._engine.begin() as conn:
            conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": tenant_id})
            yield conn

    def list_outcomes(self, tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with self._tenant_connection(tenant_id) as conn:
            rows = conn.execute(sa.text("""
                SELECT id, tenant_id, workflow_execution_id, node_key, decision_type,
                       objective_outcome, objective_success, confidence_score,
                       verification_source, evaluation_metrics, human_feedback_score, created_at
                FROM agent_decision_outcomes
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT :limit
            """), {"tenant_id": tenant_id, "limit": limit}).fetchall()
            return [dict(row._mapping) for row in rows]

    def list_confidences(self, tenant_id: str) -> List[Dict[str, Any]]:
        with self._tenant_connection(tenant_id) as conn:
            rows = conn.execute(sa.text("""
                SELECT id, tenant_id, skill_name, skill_key, confidence_score,
                       current_confidence, total_invocations, successful_invocations,
                       failed_invocations, last_updated_at, last_calculated_at
                FROM agent_skill_confidence
                WHERE tenant_id = :tenant_id
                ORDER BY confidence_score DESC
            """), {"tenant_id": tenant_id}).fetchall()
            return [dict(row._mapping) for row in rows]

    def list_lessons(self, tenant_id: str) -> List[Dict[str, Any]]:
        with self._tenant_connection(tenant_id) as conn:
            rows = conn.execute(sa.text("""
                SELECT id, tenant_id, skill_name, skill_key, context_pattern,
                       lesson_summary, lesson_type, sample_size, min_sample_threshold,
                       is_validated, success_rate, confidence_score, updated_at
                FROM agent_lesson_learned
                WHERE tenant_id = :tenant_id
                ORDER BY is_validated DESC, success_rate DESC
            """), {"tenant_id": tenant_id}).fetchall()
            return [dict(row._mapping) for row in rows]

    def list_growth(self, tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with self._tenant_connection(tenant_id) as conn:
            rows = conn.execute(sa.text("""
                SELECT id, tenant_id, skill_name, previous_confidence, new_confidence,
                       trigger_event, reason, delta, delta_confidence, outcome_id, created_at
                FROM agent_skill_growth_log
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT :limit
            """), {"tenant_id": tenant_id, "limit": limit}).fetchall()
            return [dict(row._mapping) for row in rows]

    def submit_human_feedback(
        self,
        tenant_id: str,
        outcome_id: str,
        human_feedback_score: float,
        feedback_notes: Optional[str],
        actor_id: Optional[str],
    ) -> bool:
        feedback = json.dumps({"notes": feedback_notes, "reviewer": actor_id})
        with self._tenant_connection(tenant_id) as conn:
            result = conn.execute(sa.text("""
                UPDATE agent_decision_outcomes
                SET human_feedback_score = :score,
                    evaluation_metrics = jsonb_set(
                        coalesce(evaluation_metrics, '{}'::jsonb),
                        '{human_feedback}',
                        CAST(:feedback AS jsonb)
                    )
                WHERE id = :outcome_id AND tenant_id = :tenant_id
            """), {
                "score": human_feedback_score,
                "feedback": feedback,
                "outcome_id": outcome_id,
                "tenant_id": tenant_id,
            })
            return result.rowcount == 1


_repository: Optional[ContinuousLearningRepository] = None


def get_continuous_learning_repository() -> ContinuousLearningRepository:
    global _repository
    if _repository is None:
        _repository = ContinuousLearningRepository()
    return _repository
