"""
Universal AI Selection Domain Service (PRD v2.2 Bagian 13.1 & 17.5)
Menyediakan operasi bisnis terpadu untuk:
- Manajemen siklus hidup pekerjaan seleksi cerdas multi-kategori
- Pendaftaran dokumen sumber multi-kanal (berkas, prompt, integrasi fabric)
- Eksekusi alur kerja 10 tahap via Cognitive Orchestration Engine
- Pengambilan analitik, visualisasi otomatis, dan narasi insight
- Human Review & verifikasi keputusan akhir
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import sqlalchemy as sa
from app.core.database import get_database_engine, tenant_tx
from app.core.orchestration.engine import OrchestrationEngine, WorkflowDispatchRequest, WorkflowGraphSpec, WorkflowNodeSpec
from app.domains.selection.models import (
    PipelineStage,
    SourceChannel,
    CriteriaSourceType,
    DecisionStatus,
    SELECTION_PIPELINE_NODES,
)

logger = logging.getLogger("orchestree.selection.service")


class SelectionDomainService:
    """Layanan domain utama untuk Universal AI Selection & Intelligence."""

    @classmethod
    def get_selection_workflow_graph(cls, job_id: str) -> WorkflowGraphSpec:
        """
        Menyusun spesifikasi DAG 10 tahap untuk Orchestration Engine.
        """
        nodes = [
            WorkflowNodeSpec(
                id="SELECTION_READ",
                type="SELECTION_READ",
                label="Membaca Sumber Data Multi-Kanal & Reservasi Kredit AI",
                config={"job_id": job_id},
                next=["SELECTION_UNDERSTAND"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_UNDERSTAND",
                type="SELECTION_UNDERSTAND",
                label="Automatic Schema Detection & Ekstraksi Atribut",
                config={"job_id": job_id},
                next=["SELECTION_VALIDATE"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_VALIDATE",
                type="SELECTION_VALIDATE",
                label="Deteksi Duplikasi & Analisis Kelengkapan Kualitas",
                config={"job_id": job_id},
                next=["SELECTION_SELECT"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_SELECT",
                type="SELECTION_SELECT",
                label="Penerapan Kriteria & Normalisasi Bobot Evaluasi",
                config={"job_id": job_id},
                next=["SELECTION_SCORE"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_SCORE",
                type="SELECTION_SCORE",
                label="Scoring Berbobot & Penegakan Grounding Matematis",
                config={"job_id": job_id},
                next=["SELECTION_RANK"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_RANK",
                type="SELECTION_RANK",
                label="Perangkingan & Penetapan Prioritas Rekomendasi",
                config={"job_id": job_id},
                next=["SELECTION_ANALYZE"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_ANALYZE",
                type="SELECTION_ANALYZE",
                label="Komputasi Analitik Dinamis & Distribusi Skor",
                config={"job_id": job_id},
                next=["SELECTION_VISUALIZE"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_VISUALIZE",
                type="SELECTION_VISUALIZE",
                label="Pemilihan Otomatis Visualisasi Diagram Data",
                config={"job_id": job_id},
                next=["SELECTION_RECOMMEND"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_RECOMMEND",
                type="SELECTION_RECOMMEND",
                label="Sintesis Narasi Insight & Rekomendasi Tindakan AI",
                config={"job_id": job_id},
                next=["SELECTION_RESULT"],
            ),
            WorkflowNodeSpec(
                id="SELECTION_RESULT",
                type="SELECTION_RESULT",
                label="Finalisasi Pekerjaan & Konsumsi Kredit Aktual",
                config={"job_id": job_id},
                next=[],
            ),
        ]
        return WorkflowGraphSpec(entry_node="SELECTION_READ", nodes=nodes)

    @classmethod
    def create_job(
        cls,
        tenant_id: str,
        title: str,
        instruction_prompt: str,
        domain_category: str = "general",
        calibration_profile_id: Optional[str] = None,
        criteria: Optional[List[Dict[str, Any]]] = None,
        source_documents: Optional[List[Dict[str, Any]]] = None,
        initiated_by_membership_id: Optional[str] = None,
        initiated_by_agent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Membuat pekerjaan seleksi cerdas baru bertenant."""
        job_id = str(uuid.uuid4())

        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                INSERT INTO selection_jobs (
                    id, tenant_id, title, domain_category, instruction_prompt,
                    calibration_profile_id, pipeline_stage, stage_progress_pct,
                    initiated_by_membership_id, initiated_by_agent_id, created_at
                ) VALUES (
                    :id, :tenant_id, :title, :domain_cat, :prompt,
                    :calib_id, 'uploaded', 0.0,
                    :member_id, :agent_id, now()
                );
            """)
            conn.execute(
                stmt,
                {
                    "id": job_id,
                    "tenant_id": tenant_id,
                    "title": title,
                    "domain_cat": domain_category,
                    "prompt": instruction_prompt,
                    "calib_id": calibration_profile_id,
                    "member_id": initiated_by_membership_id,
                    "agent_id": initiated_by_agent_id,
                },
            )

            # Ingest awal dokumen jika disertakan
            if source_documents:
                for doc in source_documents:
                    doc_id = str(uuid.uuid4())
                    channel = doc.get("source_channel", "file_upload")
                    raw_text = doc.get("raw_text") or doc.get("content") or ""
                    file_art_id = doc.get("file_artifact_id")
                    conn.execute(
                        sa.text("""
                            INSERT INTO selection_source_documents (
                                id, tenant_id, selection_job_id, source_channel,
                                file_artifact_id, raw_text_ref, ingested_at
                            ) VALUES (
                                :id, :tenant_id, :job_id, :channel,
                                :file_id, :raw_text, now()
                            );
                        """),
                        {
                            "id": doc_id,
                            "tenant_id": tenant_id,
                            "job_id": job_id,
                            "channel": channel,
                            "file_id": file_art_id,
                            "raw_text": raw_text[:50000] if raw_text else None,
                        },
                    )

            # Simpan kriteria awal jika disertakan
            if criteria:
                for c in criteria:
                    crit_id = str(uuid.uuid4())
                    conn.execute(
                        sa.text("""
                            INSERT INTO selection_criteria (
                                id, tenant_id, selection_job_id, criterion_key,
                                criterion_label, weight, source_type
                            ) VALUES (
                                :id, :tenant_id, :job_id, :key,
                                :label, :weight, :src_type
                            );
                        """),
                        {
                            "id": crit_id,
                            "tenant_id": tenant_id,
                            "job_id": job_id,
                            "key": c.get("key") or f"crit_{crit_id[:6]}",
                            "label": c.get("label") or "Kriteria Evaluasi",
                            "weight": float(c.get("weight", 0.25)),
                            "src_type": c.get("source_type") or "user_prompt",
                        },
                    )

        return cls.get_job_detail(tenant_id, job_id)

    @classmethod
    def get_job_detail(cls, tenant_id: str, job_id: str) -> Dict[str, Any]:
        """Mengambil rincian lengkap pekerjaan seleksi."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT id, tenant_id, title, domain_category, instruction_prompt,
                       calibration_profile_id, pipeline_stage, stage_progress_pct,
                       initiated_by_membership_id, initiated_by_agent_id,
                       created_at, completed_at
                FROM selection_jobs
                WHERE id = :id;
            """)
            res = conn.execute(stmt, {"id": job_id})
            row = res.fetchone()
            if not row:
                raise ValueError(f"Pekerjaan seleksi '{job_id}' tidak ditemukan untuk organisasi ini.")

            # Ambil kriteria
            crit_stmt = sa.text("""
                SELECT criterion_key, criterion_label, weight, source_type
                FROM selection_criteria
                WHERE selection_job_id = :job_id
                ORDER BY weight DESC;
            """)
            crit_rows = conn.execute(crit_stmt, {"job_id": job_id}).fetchall()
            criteria = [
                {"key": r[0], "label": r[1], "weight": float(r[2]), "source_type": r[3]}
                for r in crit_rows
            ]

            # Ambil hitungan dokumen
            cnt_stmt = sa.text("SELECT COUNT(*) FROM selection_source_documents WHERE selection_job_id = :job_id;")
            doc_count = conn.execute(cnt_stmt, {"job_id": job_id}).scalar() or 0

            # Ambil dokumen sumber
            docs_stmt = sa.text("""
                SELECT id, source_channel, raw_text_ref, quality_score, validity_status, ingested_at
                FROM selection_source_documents
                WHERE selection_job_id = :job_id
                ORDER BY ingested_at DESC;
            """)
            doc_rows = conn.execute(docs_stmt, {"job_id": job_id}).fetchall()
            documents = [
                {
                    "id": str(d[0]),
                    "source_channel": d[1],
                    "raw_text": d[2],
                    "quality_score": float(d[3]) if d[3] is not None else 100.0,
                    "validity_status": d[4] or "VALID",
                    "ingested_at": d[5].isoformat() if d[5] else None,
                }
                for d in doc_rows
            ]

            stage_val = row[6] or "uploaded"
            status_map = {
                "uploaded": "DRAFT",
                "reading": "PROCESSING",
                "understanding": "PROCESSING",
                "validating": "PROCESSING",
                "selecting": "PROCESSING",
                "scoring": "PROCESSING",
                "ranking": "PROCESSING",
                "analyzing": "PROCESSING",
                "visualizing": "PROCESSING",
                "recommending": "PENDING_HUMAN_REVIEW",
                "completed": "FINAL_APPROVED",
                "failed": "REJECTED",
            }
            job_status = status_map.get(stage_val, "PROCESSING")

            # Ambil riwayat kalibrasi
            cal_stmt = sa.text("""
                SELECT id, profile_name, calibration_factors, created_at
                FROM selection_calibration_profiles
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC LIMIT 5;
            """)
            cal_rows = conn.execute(cal_stmt, {"tenant_id": tenant_id}).fetchall()
            calibration_history = [
                {
                    "id": str(c[0]),
                    "profile_name": c[1],
                    "calibration_factors": c[2] if isinstance(c[2], dict) else json.loads(c[2] or "{}"),
                    "created_at": c[3].isoformat() if c[3] else None,
                }
                for c in cal_rows
            ]

            weights_dict = {c["key"]: c["weight"] for c in criteria}

            return {
                "id": str(row[0]),
                "tenant_id": str(row[1]),
                "title": row[2],
                "domain_category": row[3],
                "instruction_prompt": row[4],
                "calibration_profile_id": str(row[5]) if row[5] else None,
                "pipeline_stage": row[6],
                "status": job_status,
                "stage_progress_pct": float(row[7]),
                "initiated_by_membership_id": str(row[8]) if row[8] else None,
                "initiated_by_agent_id": str(row[9]) if row[9] else None,
                "created_at": row[10].isoformat() if row[10] else None,
                "completed_at": row[11].isoformat() if row[11] else None,
                "final_approved_at": row[11].isoformat() if row[11] else None,
                "criteria": criteria,
                "weights": weights_dict,
                "total_documents": int(doc_count),
                "documents": documents,
                "calibration_history": calibration_history,
            }

    @classmethod
    def list_jobs(
        cls,
        tenant_id: str,
        domain_category: Optional[str] = None,
        pipeline_stage: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Mengambil daftar pekerjaan seleksi milik tenant."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT j.id, j.tenant_id, j.title, j.domain_category, j.pipeline_stage,
                       j.stage_progress_pct, j.created_at, j.completed_at,
                       COUNT(d.id) as doc_count
                FROM selection_jobs j
                LEFT JOIN selection_source_documents d ON d.selection_job_id = j.id
                WHERE 1=1
            """
            params: Dict[str, Any] = {}
            if domain_category:
                query += " AND j.domain_category = :domain_cat"
                params["domain_cat"] = domain_category
            if pipeline_stage:
                query += " AND j.pipeline_stage = :stage"
                params["stage"] = pipeline_stage

            query += " GROUP BY j.id ORDER BY j.created_at DESC;"

            res = conn.execute(sa.text(query), params).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "tenant_id": str(r[1]),
                    "title": r[2],
                    "domain_category": r[3],
                    "pipeline_stage": r[4],
                    "stage_progress_pct": float(r[5]),
                    "created_at": r[6].isoformat() if r[6] else None,
                    "completed_at": r[7].isoformat() if r[7] else None,
                    "total_documents": int(r[8]),
                }
                for r in res
            ]

    @classmethod
    def add_source_document(
        cls,
        tenant_id: str,
        job_id: str,
        source_channel: str = "file_upload",
        raw_text: Optional[str] = None,
        file_artifact_id: Optional[str] = None,
        document_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Menambahkan dokumen sumber multi-kanal ke pekerjaan seleksi."""
        doc_id = str(uuid.uuid4())
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                INSERT INTO selection_source_documents (
                    id, tenant_id, selection_job_id, source_channel,
                    file_artifact_id, raw_text_ref, ingested_at
                ) VALUES (
                    :id, :tenant_id, :job_id, :channel,
                    :file_id, :raw_text, now()
                );
            """)
            conn.execute(
                stmt,
                {
                    "id": doc_id,
                    "tenant_id": tenant_id,
                    "job_id": job_id,
                    "channel": source_channel,
                    "file_id": file_artifact_id,
                    "raw_text": raw_text[:50000] if raw_text else None,
                },
            )

        return {
            "id": doc_id,
            "selection_job_id": job_id,
            "source_channel": source_channel,
            "file_artifact_id": file_artifact_id,
            "document_name": document_name or "Dokumen Sumber",
        }

    @classmethod
    async def run_pipeline(
        cls,
        tenant_id: str,
        job_id: str,
        actor_id: Optional[str] = None,
        actor_type: str = "human_user",
        roles: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Menjalankan 10 alur pipeline seleksi melalui Cognitive Orchestration Engine (WorkflowNode graph).
        """
        job_info = cls.get_job_detail(tenant_id, job_id)

        # Ambil dokumen sumber
        with tenant_tx(tenant_id) as conn:
            docs_stmt = sa.text("""
                SELECT id, source_channel, raw_text_ref, file_artifact_id
                FROM selection_source_documents
                WHERE selection_job_id = :job_id;
            """)
            doc_rows = conn.execute(docs_stmt, {"job_id": job_id}).fetchall()
            source_docs = [
                {
                    "id": str(r[0]),
                    "source_channel": r[1],
                    "raw_text": r[2] or "",
                    "file_artifact_id": str(r[3]) if r[3] else None,
                }
                for r in doc_rows
            ]

        # Inisialisasi context kerja untuk 10 tahap
        context_data = {
            "selection_job_id": job_id,
            "domain_category": job_info.get("domain_category", "general"),
            "instruction_prompt": job_info.get("instruction_prompt", ""),
            "criteria": job_info.get("criteria", []),
            "source_documents": source_docs,
        }

        # Susun graf alur kerja 10 tahap
        graph_spec = cls.get_selection_workflow_graph(job_id)

        engine = OrchestrationEngine()
        wf_req = WorkflowDispatchRequest(
            tenant_id=tenant_id,
            intent_text=f"Jalankan Universal AI Selection Pipeline untuk '{job_info['title']}'",
            actor_id=actor_id,
            actor_type=actor_type,
            roles=roles or ["TENANT_OWNER"],
            capabilities=[
                "workflow.dispatch",
                "workflow.node.execute",
                "selection.pipeline.run",
                "workflow.node.selection_read",
                "workflow.node.selection_understand",
                "workflow.node.selection_validate",
                "workflow.node.selection_select",
                "workflow.node.selection_score",
                "workflow.node.selection_rank",
                "workflow.node.selection_analyze",
                "workflow.node.selection_visualize",
                "workflow.node.selection_recommend",
                "workflow.node.selection_result",
            ],
            context_data=context_data,
        )

        # Eksekusi DAG menggunakan Orchestration Engine Core
        result = await engine._run_graph(
            execution_id=str(uuid.uuid4()),
            req=wf_req,
            wf_def_id=None,
            graph_spec=graph_spec,
            start_node_id=graph_spec.entry_node,
            initial_context=context_data,
        )

        return {
            "execution_id": result.execution_id,
            "status": result.status,
            "nodes_executed": result.nodes_executed,
            "job_id": job_id,
            "output_payload": result.output_payload,
        }

    @classmethod
    def get_job_results(cls, tenant_id: str, job_id: str) -> List[Dict[str, Any]]:
        """Mengambil hasil scoring & ranking evaluasi."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT id, entity_label, total_score, score_breakdown, rank_position,
                       priority_level, recommendation_classification, risk_score,
                       confidence_score, decision_status, source_document_id
                FROM selection_scoring_results
                WHERE selection_job_id = :job_id
                ORDER BY rank_position ASC;
            """)
            rows = conn.execute(stmt, {"job_id": job_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "entity_label": r[1],
                    "total_score": float(r[2]),
                    "score_breakdown": r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}"),
                    "rank_position": r[4],
                    "priority_level": r[5],
                    "recommendation_classification": r[6],
                    "risk_score": float(r[7]) if r[7] is not None else None,
                    "confidence_score": float(r[8]) if r[8] is not None else None,
                    "decision_status": r[9],
                    "source_document_id": str(r[10]) if r[10] else None,
                }
                for r in rows
            ]

    @classmethod
    def get_job_insights(cls, tenant_id: str, job_id: str) -> List[Dict[str, Any]]:
        """Mengambil seluruh narasi insight AI."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT id, insight_type, related_scoring_result_id, content, created_at
                FROM selection_insights
                WHERE selection_job_id = :job_id
                ORDER BY created_at ASC;
            """)
            rows = conn.execute(stmt, {"job_id": job_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "insight_type": r[1],
                    "related_scoring_result_id": str(r[2]) if r[2] else None,
                    "content": r[3],
                    "created_at": r[4].isoformat() if r[4] else None,
                }
                for r in rows
            ]

    @classmethod
    def get_job_analytics(cls, tenant_id: str, job_id: str) -> List[Dict[str, Any]]:
        """Mengambil seluruh snapshot analitik dinamis tersimpan."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT id, analytics_type, result_data, computed_at
                FROM selection_analytics_snapshots
                WHERE selection_job_id = :job_id
                ORDER BY computed_at ASC;
            """)
            rows = conn.execute(stmt, {"job_id": job_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "analytics_type": r[1],
                    "result_data": r[2] if isinstance(r[2], dict) else json.loads(r[2] or "{}"),
                    "computed_at": r[3].isoformat() if r[3] else None,
                }
                for r in rows
            ]

    @classmethod
    def get_job_visualizations(cls, tenant_id: str, job_id: str) -> List[Dict[str, Any]]:
        """Mengambil visualisasi otomatis yang dipilih AI."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT id, chart_type, chart_config, selection_reason
                FROM selection_visualizations
                WHERE selection_job_id = :job_id;
            """)
            rows = conn.execute(stmt, {"job_id": job_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "chart_type": r[1],
                    "chart_config": r[2] if isinstance(r[2], dict) else json.loads(r[2] or "{}"),
                    "selection_reason": r[3],
                }
                for r in rows
            ]

    @classmethod
    def submit_review(
        cls,
        tenant_id: str,
        score_id: str,
        decision_status: str,
        reviewer_notes: Optional[str] = None,
        reviewer_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Mencatat keputusan tinjauan manusia (Human Review Gate)."""
        valid_statuses = ["approved", "rejected", "overridden"]
        if decision_status not in valid_statuses:
            raise ValueError(f"decision_status harus salah satu dari: {valid_statuses}")

        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                UPDATE selection_scoring_results
                SET decision_status = :status
                WHERE id = :id;
            """)
            conn.execute(stmt, {"status": decision_status, "id": score_id})

        return {
            "score_id": score_id,
            "decision_status": decision_status,
            "reviewer_id": reviewer_id,
            "reviewer_notes": reviewer_notes,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    def get_domain_categories(cls) -> List[Dict[str, Any]]:
        """Mengambil daftar kategori domain seleksi yang tersedia."""
        engine = get_database_engine()
        with engine.connect() as conn:
            stmt = sa.text("""
                SELECT id, category_key, display_name, description
                FROM selection_domain_categories
                WHERE is_active = true
                ORDER BY display_name ASC;
            """)
            rows = conn.execute(stmt).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "category_key": r[1],
                    "display_name": r[2],
                    "description": r[3],
                }
                for r in rows
            ]

    @classmethod
    def finalize_job(
        cls,
        tenant_id: str,
        job_id: str,
        reviewer_id: Optional[str] = None,
        approval_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Menyetujui pekerjaan seleksi secara final, memperbarui status menjadi 'completed',
        dan mencatat kejadian ke company_context_events sebagai audit trail.
        """
        now_dt = datetime.now(timezone.utc)
        with tenant_tx(tenant_id) as conn:
            check_stmt = sa.text("SELECT id, title FROM selection_jobs WHERE id = :id;")
            job_row = conn.execute(check_stmt, {"id": job_id}).fetchone()
            if not job_row:
                raise ValueError(f"Pekerjaan seleksi '{job_id}' tidak ditemukan.")

            update_stmt = sa.text("""
                UPDATE selection_jobs
                SET pipeline_stage = 'completed',
                    stage_progress_pct = 100.0,
                    completed_at = :now_dt
                WHERE id = :id;
            """)
            conn.execute(update_stmt, {"id": job_id, "now_dt": now_dt})

            event_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO company_context_events (
                        id, tenant_id, event_type, title, summary,
                        correlation_score, source_types, source_signals,
                        insights, recommended_actions, status, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, 'SELECTION_FINAL_APPROVAL',
                        :title, :summary,
                        1.0000, ARRAY['Native'], '[]'::jsonb,
                        :insights::jsonb, '[]'::jsonb, 'RESOLVED', :now_dt, :now_dt
                    );
                """),
                {
                    "id": event_id,
                    "tenant_id": tenant_id,
                    "title": f"Persetujuan Final Seleksi: {job_row.title}",
                    "summary": approval_notes or f"Pekerjaan seleksi '{job_row.title}' telah disetujui secara final.",
                    "insights": json.dumps({
                        "job_id": job_id,
                        "reviewer_id": reviewer_id,
                        "approval_notes": approval_notes,
                    }),
                    "now_dt": now_dt,
                },
            )

        return {
            "status": "approved",
            "job_id": job_id,
            "pipeline_stage": "completed",
            "reviewer_id": reviewer_id,
            "approval_notes": approval_notes,
            "final_approved_at": now_dt.isoformat(),
        }

    @classmethod
    def calibrate_job(
        cls,
        tenant_id: str,
        job_id: str,
        human_feedback_notes: Optional[str] = None,
        criteria_adjustments: Optional[Dict[str, float]] = None,
        human_reviewer_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mengkalibrasi bobot kriteria evaluasi seleksi secara dinamis.
        """
        with tenant_tx(tenant_id) as conn:
            check_stmt = sa.text("SELECT id, title FROM selection_jobs WHERE id = :id;")
            job_row = conn.execute(check_stmt, {"id": job_id}).fetchone()
            if not job_row:
                raise ValueError(f"Pekerjaan seleksi '{job_id}' tidak ditemukan.")

            if criteria_adjustments:
                for crit_key, adj_factor in criteria_adjustments.items():
                    conn.execute(
                        sa.text("""
                            UPDATE selection_criteria
                            SET weight = ROUND(CAST(weight * :factor AS numeric), 4)
                            WHERE selection_job_id = :job_id AND criterion_key = :key;
                        """),
                        {"factor": float(adj_factor), "job_id": job_id, "key": crit_key},
                    )

            profile_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO selection_calibration_profiles (
                        id, tenant_id, profile_name, domain_category,
                        calibration_factors, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :name, 'general',
                        :factors::jsonb, true, now(), now()
                    );
                """),
                {
                    "id": profile_id,
                    "tenant_id": tenant_id,
                    "name": f"Kalibrasi {job_row.title[:30]}",
                    "factors": json.dumps({
                        "adjustments": criteria_adjustments or {},
                        "feedback_notes": human_feedback_notes,
                        "reviewer_id": human_reviewer_id,
                    }),
                },
            )

        return {
            "status": "calibrated",
            "job_id": job_id,
            "calibration_profile_id": profile_id,
            "human_feedback_notes": human_feedback_notes,
            "criteria_adjustments": criteria_adjustments,
        }
