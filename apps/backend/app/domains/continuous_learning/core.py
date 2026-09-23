"""
OrchestreeAI Continuous Learning Domain Core (PRD v2.2 Bagian 8.11)
Engine Pembelajaran Berkelanjutan untuk Autonomous AI Workforce:
1. Verifikasi outcome objektif (bukan asumsi LLM) pasca eksekusi node workflow.
2. Pelacakan skor kepercayaan (agent_skill_confidence) dengan time-decay berbasis half-life.
3. Pencatatan ledger pertumbuhan kepercayaan (agent_skill_growth_log).
4. Sintesis pembelajaran (agent_lesson_learned) dengan ambang batas sampel minimum (min_sample_threshold).
5. Penegakan isolasi tenant dan RLS.
"""

import math
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine

logger = logging.getLogger("orchestree.continuous_learning")

# Parameter Algoritma Pembelajaran
BASELINE_CONFIDENCE = 0.8500
MIN_CONFIDENCE = 0.1000
MAX_CONFIDENCE = 1.0000
DEFAULT_HALF_LIFE_DAYS = 14
MIN_SAMPLE_THRESHOLD = 3
CONFIDENCE_BOOST_SUCCESS = 0.0250
CONFIDENCE_PENALTY_FAILURE = 0.0800


class ObjectiveOutcomeResult(BaseModel):
    is_success: bool
    confidence_score: float
    verification_source: str
    decision_type: str
    skill_key: str
    evaluation_metrics: Dict[str, Any] = Field(default_factory=dict)
    reason: str


class ContinuousLearningEngine:
    """
    Engine Pembelajaran Berkelanjutan.
    Dipanggil secara permanen oleh OrchestrationEngine pada setiap penyelesaian node.
    """

    def __init__(self):
        self.engine = get_engine()

    def verify_objective_outcome(
        self,
        node_key: str,
        node_type: str,
        context_input: Dict[str, Any],
        node_output: Dict[str, Any],
        error_detail: Optional[str] = None,
        latency_ms: float = 0.0,
    ) -> ObjectiveOutcomeResult:
        """
        Verifikasi outcome objektif berdasarkan fakta eksekusi runtime,
        BUKAN dari evaluasi subyektif teks yang dihasilkan LLM sendiri.
        """
        metrics = {
            "latency_ms": round(latency_ms, 2),
            "output_size": len(json.dumps(node_output)) if node_output else 0,
        }

        # 1. Jika runtime mencatat error eksplisit
        if error_detail:
            skill_key = self._resolve_skill_key(node_type, node_output)
            return ObjectiveOutcomeResult(
                is_success=False,
                confidence_score=0.2000,
                verification_source="runtime_exception_check",
                decision_type=f"{node_type}_EXECUTION",
                skill_key=skill_key,
                evaluation_metrics={**metrics, "error": error_detail},
                reason=f"Runtime exception terdeteksi: {error_detail}",
            )

        # 2. Verifikasi objektif spesifik per tipe node
        if node_type == "TOOL_CALL":
            tool_name = node_output.get("tool", "unknown_tool")
            tool_status = node_output.get("status", "unknown")
            tool_result = node_output.get("result", {})
            skill_key = f"tool.{tool_name}"

            # Cek status hasil eksekusi tool nyata
            if tool_status == "success" and tool_result is not None:
                # Periksa apakah ada indikasi data valid (misal id hasil pembuatan task)
                has_entity_id = any(k in tool_result for k in ["task_id", "id", "status", "created_at"])
                return ObjectiveOutcomeResult(
                    is_success=True,
                    confidence_score=0.9800 if has_entity_id else 0.9000,
                    verification_source="tool_contract_validation",
                    decision_type="TOOL_EXECUTION",
                    skill_key=skill_key,
                    evaluation_metrics={**metrics, "tool": tool_name, "status": tool_status},
                    reason="Tool F.01-MCP dieksekusi dengan status sukses dan payload kontraktual valid",
                )
            else:
                return ObjectiveOutcomeResult(
                    is_success=False,
                    confidence_score=0.3000,
                    verification_source="tool_contract_validation",
                    decision_type="TOOL_EXECUTION",
                    skill_key=skill_key,
                    evaluation_metrics={**metrics, "tool": tool_name, "status": tool_status},
                    reason=f"Tool F.01-MCP menghasilkan status non-sukses: {tool_status}",
                )

        elif node_type == "CLASSIFY":
            skill_key = "intent.classification"
            has_category = bool(node_output.get("category"))
            has_urgency = bool(node_output.get("urgency"))
            is_valid = has_category and has_urgency

            return ObjectiveOutcomeResult(
                is_success=is_valid,
                confidence_score=0.9500 if is_valid else 0.4000,
                verification_source="schema_structure_check",
                decision_type="INTENT_CLASSIFICATION",
                skill_key=skill_key,
                evaluation_metrics={**metrics, "category": node_output.get("category")},
                reason="Struktur klasifikasi intent lengkap dan valid" if is_valid else "Kategori klasifikasi intent tidak lengkap",
            )

        elif node_type == "PLAN":
            skill_key = "workflow.planning"
            has_plan = bool(node_output.get("plan") or node_output.get("steps") or node_output.get("target_tool"))
            return ObjectiveOutcomeResult(
                is_success=has_plan,
                confidence_score=0.9200 if has_plan else 0.3500,
                verification_source="plan_dag_validation",
                decision_type="DAG_PLANNING",
                skill_key=skill_key,
                evaluation_metrics=metrics,
                reason="Rencana aksi DAG berhasil disusun" if has_plan else "Rencana aksi kosong",
            )

        elif node_type == "DELIVER":
            skill_key = "workflow.delivery"
            has_msg = bool(node_output.get("message") or node_output.get("summary") or node_output.get("content"))
            return ObjectiveOutcomeResult(
                is_success=has_msg,
                confidence_score=0.9600 if has_msg else 0.5000,
                verification_source="delivery_payload_validation",
                decision_type="WORKFLOW_DELIVERY",
                skill_key=skill_key,
                evaluation_metrics=metrics,
                reason="Payload pengiriman selesai dan siap didistribusikan" if has_msg else "Payload pengiriman kosong",
            )

        else:
            skill_key = f"node.{node_type.lower()}"
            is_valid = bool(node_output)
            return ObjectiveOutcomeResult(
                is_success=is_valid,
                confidence_score=0.9000 if is_valid else 0.4000,
                verification_source="generic_output_validation",
                decision_type=f"{node_type}_EXECUTION",
                skill_key=skill_key,
                evaluation_metrics=metrics,
                reason="Eksekusi node selesai tanpa galat" if is_valid else "Output node kosong",
            )

    async def record_and_learn_node(
        self,
        tenant_id: str,
        workflow_execution_id: str,
        node_run_id: str,
        node_key: str,
        node_type: str,
        context_input: Dict[str, Any],
        node_output: Dict[str, Any],
        error_detail: Optional[str] = None,
        latency_ms: float = 0.0,
        agent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Hook utama pembelajaran berkelanjutan:
        1. Evaluasi outcome objektif.
        2. Simpan jejak ke agent_decision_outcomes.
        3. Perbarui skor skill confidence dengan time-decay.
        4. Rekam buku besar agent_skill_growth_log.
        5. Sintesis dan validasi lesson learned jika sampel mencukupi.
        """
        # 1. Evaluasi objektif
        eval_result = self.verify_objective_outcome(
            node_key=node_key,
            node_type=node_type,
            context_input=context_input,
            node_output=node_output,
            error_detail=error_detail,
            latency_ms=latency_ms,
        )

        outcome_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        with self.engine.begin() as conn:
            # Set session tenant_id untuk RLS
            conn.execute(sa.text("SET LOCAL app.tenant_id = :tenant_id"), {"tenant_id": tenant_id})

            # 2. Catat ke agent_decision_outcomes
            conn.execute(
                sa.text("""
                    INSERT INTO agent_decision_outcomes (
                        id, tenant_id, agent_id, workflow_execution_id, workflow_node_run_id,
                        node_run_id, node_key, decision_type, input_state, action_taken,
                        context_input, decision_output, objective_outcome, objective_success,
                        confidence_score, evaluation_metrics, verified_by_system,
                        verification_source, metrics, created_at
                    ) VALUES (
                        :id, :tenant_id, :agent_id, :wf_exec_id, :node_run_id,
                        :node_run_id, :node_key, :decision_type, :input_state, :action_taken,
                        :context_input, :decision_output, :objective_outcome, :objective_success,
                        :confidence_score, :eval_metrics, :verified_by_system,
                        :verification_source, :metrics, :created_at
                    )
                """),
                {
                    "id": outcome_id,
                    "tenant_id": tenant_id,
                    "agent_id": agent_id,
                    "wf_exec_id": workflow_execution_id,
                    "node_run_id": node_run_id,
                    "node_key": node_key,
                    "decision_type": eval_result.decision_type,
                    "input_state": json.dumps(context_input),
                    "action_taken": json.dumps(node_output),
                    "context_input": json.dumps(context_input),
                    "decision_output": json.dumps(node_output),
                    "objective_outcome": "SUCCESS" if eval_result.is_success else "FAILED",
                    "objective_success": eval_result.is_success,
                    "confidence_score": eval_result.confidence_score,
                    "eval_metrics": json.dumps(eval_result.evaluation_metrics),
                    "verified_by_system": True,
                    "verification_source": eval_result.verification_source,
                    "metrics": json.dumps(eval_result.evaluation_metrics),
                    "created_at": now,
                }
            )

            # 3. Ambil atau inisialisasi confidence score saat ini
            skill_key = eval_result.skill_key
            row = conn.execute(
                sa.text("""
                    SELECT confidence_score, total_invocations, successful_invocations,
                           last_updated_at, decay_rate_per_day
                    FROM agent_skill_confidence
                    WHERE tenant_id = :tenant_id 
                      AND (agent_id = :agent_id OR (agent_id IS NULL AND :agent_id IS NULL))
                      AND (skill_name = :skill_key OR skill_key = :skill_key)
                    FOR UPDATE
                """),
                {"tenant_id": tenant_id, "agent_id": agent_id, "skill_key": skill_key}
            ).fetchone()

            if row:
                current_conf = float(row[0] if row[0] is not None else BASELINE_CONFIDENCE)
                total_inv = int(row[1] or 0)
                succ_inv = int(row[2] or 0)
                last_updated = row[3] or now
                decay_rate = float(row[4] or 0.05)

                # Peluruhan waktu (Time-Decay)
                elapsed_days = (now - last_updated).total_seconds() / 86400.0
                if elapsed_days > 1.0:
                    # Rumus peluruhan half-life
                    decay_factor = math.pow(0.5, elapsed_days / DEFAULT_HALF_LIFE_DAYS)
                    decayed_conf = BASELINE_CONFIDENCE + (current_conf - BASELINE_CONFIDENCE) * decay_factor
                    decay_delta = decayed_conf - current_conf
                    if abs(decay_delta) > 0.0001:
                        conn.execute(
                            sa.text("""
                                INSERT INTO agent_skill_growth_log (
                                    id, tenant_id, agent_id, skill_name, skill_key,
                                    previous_confidence, new_confidence, trigger_event,
                                    reason, delta, delta_confidence, created_at
                                ) VALUES (
                                    :id, :tenant_id, :agent_id, :skill_name, :skill_key,
                                    :prev_conf, :new_conf, 'TIME_DECAY',
                                    'Peluruhan kepercayaan otomatis akibat jeda waktu inaktif',
                                    :delta, :delta, :created_at
                                )
                            """),
                            {
                                "id": str(uuid.uuid4()),
                                "tenant_id": tenant_id,
                                "agent_id": agent_id,
                                "skill_name": skill_key,
                                "skill_key": skill_key,
                                "prev_conf": current_conf,
                                "new_conf": decayed_conf,
                                "delta": decay_delta,
                                "created_at": now,
                            }
                        )
                        current_conf = decayed_conf
            else:
                current_conf = BASELINE_CONFIDENCE
                total_inv = 0
                succ_inv = 0

            # 4. Terapkan delta hasil eksekusi node saat ini
            prev_conf = current_conf
            if eval_result.is_success:
                delta = CONFIDENCE_BOOST_SUCCESS
                new_conf = min(MAX_CONFIDENCE, current_conf + delta)
                trigger_event = "OBJECTIVE_SUCCESS"
                succ_inv += 1
            else:
                delta = -CONFIDENCE_PENALTY_FAILURE
                new_conf = max(MIN_CONFIDENCE, current_conf + delta)
                trigger_event = "OBJECTIVE_FAILURE"

            total_inv += 1

            # Simpan / update agent_skill_confidence
            conn.execute(
                sa.text("""
                    INSERT INTO agent_skill_confidence (
                        id, tenant_id, agent_id, skill_name, skill_key,
                        confidence_score, current_confidence, total_invocations,
                        successful_invocations, failed_invocations, last_updated_at,
                        last_calculated_at, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :agent_id, :skill_name, :skill_key,
                        :conf, :conf, :total_inv, :succ_inv, :failed_inv, :now, :now, :now, :now
                    )
                    ON CONFLICT (tenant_id, agent_id, skill_name) DO UPDATE SET
                        confidence_score = EXCLUDED.confidence_score,
                        current_confidence = EXCLUDED.current_confidence,
                        total_invocations = EXCLUDED.total_invocations,
                        successful_invocations = EXCLUDED.successful_invocations,
                        failed_invocations = EXCLUDED.failed_invocations,
                        last_updated_at = EXCLUDED.last_updated_at,
                        last_calculated_at = EXCLUDED.last_calculated_at,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "tenant_id": tenant_id,
                    "agent_id": agent_id,
                    "skill_name": skill_key,
                    "skill_key": skill_key,
                    "conf": new_conf,
                    "total_inv": total_inv,
                    "succ_inv": succ_inv,
                    "failed_inv": total_inv - succ_inv,
                    "now": now,
                }
            )

            # Catat pertumbuhan ke agent_skill_growth_log
            conn.execute(
                sa.text("""
                    INSERT INTO agent_skill_growth_log (
                        id, tenant_id, agent_id, skill_name, skill_key,
                        previous_confidence, new_confidence, trigger_event,
                        reason, delta, delta_confidence, outcome_id, created_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :agent_id, :skill_name, :skill_key,
                        :prev_conf, :new_conf, :trigger_event,
                        :reason, :delta, :delta, :outcome_id, :created_at
                    )
                """),
                {
                    "tenant_id": tenant_id,
                    "agent_id": agent_id,
                    "skill_name": skill_key,
                    "skill_key": skill_key,
                    "prev_conf": prev_conf,
                    "new_conf": new_conf,
                    "trigger_event": trigger_event,
                    "reason": eval_result.reason,
                    "delta": delta,
                    "outcome_id": outcome_id,
                    "created_at": now,
                }
            )

            # 5. Sintesis & Validasi Lesson Learned
            # Hitung ukuran kumpulan data agregat untuk skill_key ini
            sample_count = conn.execute(
                sa.text("""
                    SELECT count(*), 
                           count(*) FILTER (WHERE objective_success = true OR objective_outcome = 'SUCCESS')
                    FROM agent_decision_outcomes
                    WHERE tenant_id = :tenant_id 
                      AND (decision_type LIKE :skill_pattern OR action_taken::text LIKE :skill_name_pattern)
                """),
                {
                    "tenant_id": tenant_id,
                    "skill_pattern": f"%{skill_key}%",
                    "skill_name_pattern": f"%{skill_key}%",
                }
            ).fetchone()

            total_samples = int(sample_count[0] or 1)
            succ_samples = int(sample_count[1] or (1 if eval_result.is_success else 0))
            success_rate = round(succ_samples / max(1, total_samples), 4)

            # Validasi jika memenuhi ambang batas minimum sampel
            is_validated = total_samples >= MIN_SAMPLE_THRESHOLD

            if is_validated:
                if success_rate >= 0.75:
                    lesson_summary = (
                        f"Pola eksekusi optimal untuk skill '{skill_key}' tervalidasi dengan "
                        f"tingkat keberhasilan objektif {success_rate * 100:.1f}% dari {total_samples} sampel."
                    )
                    lesson_type = "BEST_PRACTICE"
                else:
                    lesson_summary = (
                        f"Perhatian degradasi pada skill '{skill_key}': tingkat keberhasilan "
                        f"{success_rate * 100:.1f}% di bawah ambang 75% dari {total_samples} sampel. "
                        f"Dianjurkan penyesuaian parameter orkestrasi atau verifikasi konfigurasi alat."
                    )
                    lesson_type = "PITFALL_AVOIDANCE"
            else:
                lesson_summary = (
                    f"Pengamatan awal skill '{skill_key}' ({total_samples}/{MIN_SAMPLE_THRESHOLD} sampel minimum). "
                    f"Tingkat keberhasilan sementara: {success_rate * 100:.1f}%."
                )
                lesson_type = "OBSERVATION"

            conn.execute(
                sa.text("""
                    INSERT INTO agent_lesson_learned (
                        id, tenant_id, agent_id, skill_name, skill_key, context_pattern,
                        lesson_summary, lesson_type, sample_size, min_sample_threshold,
                        is_validated, success_rate, confidence_score, last_applied_at,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :agent_id, :skill_name, :skill_key,
                        :context_pattern, :lesson_summary, :lesson_type, :sample_size,
                        :min_sample_threshold, :is_validated, :success_rate, :conf,
                        :now, :now, :now
                    )
                    ON CONFLICT (tenant_id, skill_name, context_pattern) DO UPDATE SET
                        lesson_summary = EXCLUDED.lesson_summary,
                        lesson_type = EXCLUDED.lesson_type,
                        sample_size = EXCLUDED.sample_size,
                        is_validated = EXCLUDED.is_validated,
                        success_rate = EXCLUDED.success_rate,
                        confidence_score = EXCLUDED.confidence_score,
                        last_applied_at = EXCLUDED.last_applied_at,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "tenant_id": tenant_id,
                    "agent_id": agent_id,
                    "skill_name": skill_key,
                    "skill_key": skill_key,
                    "context_pattern": "*",
                    "lesson_summary": lesson_summary,
                    "lesson_type": lesson_type,
                    "sample_size": total_samples,
                    "min_sample_threshold": MIN_SAMPLE_THRESHOLD,
                    "is_validated": is_validated,
                    "success_rate": success_rate,
                    "conf": new_conf,
                    "now": now,
                }
            )

        logger.info(
            f"[ContinuousLearning] Node '{node_key}' selesai. Outcome: "
            f"{'SUCCESS' if eval_result.is_success else 'FAILED'}, Conf: {new_conf:.4f}, Validated: {is_validated}"
        )

        return {
            "outcome_id": outcome_id,
            "objective_success": eval_result.is_success,
            "confidence_score": new_conf,
            "skill_key": skill_key,
            "is_validated": is_validated,
            "total_samples": total_samples,
            "success_rate": success_rate,
            "verification_source": eval_result.verification_source,
        }

    def _resolve_skill_key(self, node_type: str, node_output: Dict[str, Any]) -> str:
        if node_type == "TOOL_CALL":
            return f"tool.{node_output.get('tool', 'generic')}"
        elif node_type == "CLASSIFY":
            return "intent.classification"
        elif node_type == "PLAN":
            return "workflow.planning"
        elif node_type == "DELIVER":
            return "workflow.delivery"
        return f"node.{node_type.lower()}"


_learning_engine: Optional[ContinuousLearningEngine] = None


def get_continuous_learning_engine() -> ContinuousLearningEngine:
    global _learning_engine
    if _learning_engine is None:
        _learning_engine = ContinuousLearningEngine()
    return _learning_engine
