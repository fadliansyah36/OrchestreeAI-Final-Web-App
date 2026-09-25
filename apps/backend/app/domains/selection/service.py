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
import os
import hmac
import hashlib

import sqlalchemy as sa
from app.core.database import get_database_engine, tenant_tx
from app.core.orchestration.engine import OrchestrationEngine, WorkflowDispatchRequest, WorkflowGraphSpec, WorkflowNodeSpec
from app.domains.selection.models import (
    PipelineStage,
    SourceChannel,
    CriteriaSourceType,
    DecisionStatus,
    SELECTION_PIPELINE_NODES,
    PROTECTED_HUMAN_REVIEW_DOMAINS,
    STRUCTURAL_AI_AGENT_ROLES,
)
from app.domains.selection.exporter import SelectionReportExporter

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
                SELECT s.id, s.entity_label, s.total_score, s.score_breakdown, s.rank_position,
                       s.priority_level, s.recommendation_classification, s.risk_score,
                       s.confidence_score, s.decision_status, s.source_document_id,
                       s.previous_rank_position, s.reviewer_notes, s.reviewer_id,
                       COALESCE(d.quality_score, 100.0) as quality_score
                FROM selection_scoring_results s
                LEFT JOIN selection_source_documents d ON d.id = s.source_document_id
                WHERE s.selection_job_id = :job_id
                ORDER BY s.rank_position ASC NULLS LAST, s.total_score DESC;
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
                    "previous_rank_position": r[11],
                    "reviewer_notes": r[12],
                    "reviewer_id": str(r[13]) if r[13] else None,
                    "quality_score": float(r[14]) if r[14] is not None else 100.0,
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

    # ---------------------------------------------------------------------------
    # BAGIAN B: SELECTION HISTORY (Rerun & Compare)
    # ---------------------------------------------------------------------------

    @classmethod
    def create_rerun(
        cls,
        tenant_id: str,
        original_job_id: str,
        title: Optional[str] = None,
        instruction_prompt: Optional[str] = None,
        criteria: Optional[List[Dict[str, Any]]] = None,
        calibration_profile_id: Optional[str] = None,
        initiated_by_agent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Membuat pekerjaan seleksi baru dari pekerjaan yang sudah ada dengan variasi kriteria.
        Mencatat perbedaan kriteria (diff) ke tabel selection_reruns.
        """
        orig_job = cls.get_job_detail(tenant_id, original_job_id)
        if not orig_job:
            raise ValueError(f"Pekerjaan asal '{original_job_id}' tidak ditemukan.")

        orig_criteria = orig_job.get("criteria", [])
        orig_weights = {c["key"]: c["weight"] for c in orig_criteria}

        # Kriteria baru: gabungkan atau pakai yang disesuaikan
        new_criteria = criteria if criteria is not None else orig_criteria
        new_weights = {c["key"]: c.get("weight", 0.0) for c in new_criteria}

        # Hitung diff kriteria yang diubah
        changed_criteria = {
            "weight_diffs": {},
            "added_criteria": [],
            "removed_criteria": [],
        }

        all_keys = set(orig_weights.keys()).union(set(new_weights.keys()))
        for k in all_keys:
            old_w = orig_weights.get(k)
            new_w = new_weights.get(k)
            if old_w is None:
                changed_criteria["added_criteria"].append(k)
            elif new_w is None:
                changed_criteria["removed_criteria"].append(k)
            elif abs(float(old_w) - float(new_w)) > 0.0001:
                changed_criteria["weight_diffs"][k] = {
                    "original": float(old_w),
                    "new": float(new_w),
                    "delta": round(float(new_w) - float(old_w), 4),
                }

        new_title = title or f"{orig_job.get('title', 'Seleksi')} (Rerun)"
        new_prompt = instruction_prompt or orig_job.get("instruction_prompt", "")
        new_calib_id = calibration_profile_id or orig_job.get("calibration_profile_id")
        agent_id = initiated_by_agent_id or orig_job.get("initiated_by_agent_id")

        # Buat selection_jobs baru
        new_job = cls.create_job(
            tenant_id=tenant_id,
            title=new_title,
            instruction_prompt=new_prompt,
            domain_category=orig_job.get("domain_category", "general"),
            calibration_profile_id=new_calib_id,
            criteria=new_criteria,
            initiated_by_agent_id=agent_id,
        )
        new_job_id = new_job["id"]

        # Salin seluruh dokumen sumber dari pekerjaan asal ke pekerjaan baru
        with tenant_tx(tenant_id) as conn:
            docs_stmt = sa.text("""
                SELECT source_channel, file_artifact_id, raw_text_ref
                FROM selection_source_documents
                WHERE selection_job_id = :orig_id;
            """)
            docs = conn.execute(docs_stmt, {"orig_id": original_job_id}).fetchall()
            for d in docs:
                new_doc_id = str(uuid.uuid4())
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
                        "id": new_doc_id,
                        "tenant_id": tenant_id,
                        "job_id": new_job_id,
                        "channel": d[0],
                        "file_id": d[1],
                        "raw_text": d[2],
                    },
                )

            # Catat relasi rerun ke selection_reruns
            rerun_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO selection_reruns (
                        id, tenant_id, original_selection_job_id, new_selection_job_id,
                        changed_criteria, created_at
                    ) VALUES (
                        :id, :tenant_id, :orig_id, :new_id,
                        :diff::jsonb, now()
                    );
                """),
                {
                    "id": rerun_id,
                    "tenant_id": tenant_id,
                    "orig_id": original_job_id,
                    "new_id": new_job_id,
                    "diff": json.dumps(changed_criteria),
                },
            )

        return {
            "rerun_id": rerun_id,
            "original_job_id": original_job_id,
            "new_job_id": new_job_id,
            "changed_criteria": changed_criteria,
            "new_job": new_job,
        }

    @classmethod
    def get_job_reruns(cls, tenant_id: str, job_id: str) -> List[Dict[str, Any]]:
        """Mengambil riwayat eksekusi ulang (rerun) yang terkait dengan pekerjaan seleksi."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT r.id, r.original_selection_job_id, r.new_selection_job_id,
                       r.changed_criteria, r.created_at,
                       j_orig.title as orig_title, j_new.title as new_title,
                       j_new.pipeline_stage, j_new.stage_progress_pct
                FROM selection_reruns r
                JOIN selection_jobs j_orig ON j_orig.id = r.original_selection_job_id
                JOIN selection_jobs j_new ON j_new.id = r.new_selection_job_id
                WHERE r.original_selection_job_id = :job_id OR r.new_selection_job_id = :job_id
                ORDER BY r.created_at DESC;
            """)
            rows = conn.execute(stmt, {"job_id": job_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "original_selection_job_id": str(r[1]),
                    "new_selection_job_id": str(r[2]),
                    "changed_criteria": r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}"),
                    "created_at": r[4].isoformat() if r[4] else None,
                    "original_job_title": r[5],
                    "new_job_title": r[6],
                    "new_job_stage": r[7],
                    "new_job_progress": float(r[8]) if r[8] is not None else 0.0,
                }
                for r in rows
            ]

    @classmethod
    def compare_jobs(
        cls,
        tenant_id: str,
        job_id_1: str,
        job_id_2: str,
    ) -> Dict[str, Any]:
        """
        Menampilkan perbandingan berdampingan antara dua pekerjaan seleksi.
        Menghitung perbedaan ranking dan skor per entitas yang sama, serta diff kriteria.
        """
        job1 = cls.get_job_detail(tenant_id, job_id_1)
        job2 = cls.get_job_detail(tenant_id, job_id_2)
        if not job1 or not job2:
            raise ValueError("Satu atau kedua pekerjaan seleksi yang dibandingkan tidak ditemukan.")

        res1 = cls.get_job_results(tenant_id, job_id_1)
        res2 = cls.get_job_results(tenant_id, job_id_2)

        # Mapping entitas berdasarkan entity_label
        map1 = {r["entity_label"].strip().lower(): r for r in res1}
        map2 = {r["entity_label"].strip().lower(): r for r in res2}

        all_entity_keys = list(dict.fromkeys(list(map1.keys()) + list(map2.keys())))

        entity_comparisons = []
        improved_count = 0
        declined_count = 0
        unchanged_count = 0

        for key in all_entity_keys:
            r1 = map1.get(key)
            r2 = map2.get(key)

            label = (r2.get("entity_label") if r2 else None) or (r1.get("entity_label") if r1 else key)
            rank1 = r1.get("rank_position") if r1 else None
            rank2 = r2.get("rank_position") if r2 else None

            score1 = r1.get("total_score") if r1 else None
            score2 = r2.get("total_score") if r2 else None

            rank_delta = (rank1 - rank2) if (rank1 is not None and rank2 is not None) else None
            score_delta = round(score2 - score1, 2) if (score1 is not None and score2 is not None) else None

            if rank_delta is not None:
                if rank_delta > 0:
                    improved_count += 1
                elif rank_delta < 0:
                    declined_count += 1
                else:
                    unchanged_count += 1

            entity_comparisons.append({
                "entity_label": label,
                "job_1": {
                    "rank": rank1,
                    "score": score1,
                    "recommendation": r1.get("recommendation_classification") if r1 else None,
                    "decision": r1.get("decision_status") if r1 else None,
                    "risk_score": r1.get("risk_score") if r1 else None,
                },
                "job_2": {
                    "rank": rank2,
                    "score": score2,
                    "recommendation": r2.get("recommendation_classification") if r2 else None,
                    "decision": r2.get("decision_status") if r2 else None,
                    "risk_score": r2.get("risk_score") if r2 else None,
                },
                "rank_delta": rank_delta,  # Positif berarti naik peringkat
                "score_delta": score_delta,
                "status_changed": (r1.get("decision_status") != r2.get("decision_status")) if (r1 and r2) else True,
            })

        # Urutkan perbandingan berdasarkan peringkat job 2
        entity_comparisons.sort(key=lambda x: (x["job_2"]["rank"] or 999, x["job_1"]["rank"] or 999))

        # Diff Kriteria antar kedua pekerjaan
        crits1 = {c["key"]: c for c in job1.get("criteria", [])}
        crits2 = {c["key"]: c for c in job2.get("criteria", [])}
        crit_keys = set(crits1.keys()).union(set(crits2.keys()))

        criteria_diff = []
        for k in crit_keys:
            c1 = crits1.get(k)
            c2 = crits2.get(k)
            label = (c2.get("label") if c2 else None) or (c1.get("label") if c1 else k)
            w1 = float(c1["weight"]) if c1 else None
            w2 = float(c2["weight"]) if c2 else None
            criteria_diff.append({
                "key": k,
                "label": label,
                "weight_job_1": w1,
                "weight_job_2": w2,
                "weight_delta": round(w2 - w1, 4) if (w1 is not None and w2 is not None) else None,
            })

        avg1 = sum(r["total_score"] for r in res1) / len(res1) if res1 else 0.0
        avg2 = sum(r["total_score"] for r in res2) / len(res2) if res2 else 0.0

        return {
            "job_1": {
                "id": job1["id"],
                "title": job1["title"],
                "domain_category": job1.get("domain_category"),
                "total_entities": len(res1),
                "average_score": round(avg1, 2),
                "created_at": job1.get("created_at"),
            },
            "job_2": {
                "id": job2["id"],
                "title": job2["title"],
                "domain_category": job2.get("domain_category"),
                "total_entities": len(res2),
                "average_score": round(avg2, 2),
                "created_at": job2.get("created_at"),
            },
            "summary": {
                "total_compared_entities": len(entity_comparisons),
                "improved_ranks_count": improved_count,
                "declined_ranks_count": declined_count,
                "unchanged_ranks_count": unchanged_count,
                "average_score_delta": round(avg2 - avg1, 2),
            },
            "criteria_diff": criteria_diff,
            "entities": entity_comparisons,
        }

    # ---------------------------------------------------------------------------
    # BAGIAN C: EXPORT & REPORT GENERATION
    # ---------------------------------------------------------------------------

    @classmethod
    def export_report(
        cls,
        tenant_id: str,
        job_id: str,
        export_format: str = "pdf",
        report_type: str = "detailed_selection",
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Menghasilkan dokumen laporan nyata (PDF/Excel/CSV), menyimpan ke storage lokal/Supabase,
        mencatat kejadian di Audit Ledger, dan mengembalikan tautan unduh.
        """
        fmt = export_format.lower()
        if fmt not in ["pdf", "excel", "csv"]:
            raise ValueError(f"Format ekspor '{export_format}' tidak didukung. Gunakan: pdf, excel, atau csv.")

        job_info = cls.get_job_detail(tenant_id, job_id)
        if not job_info:
            raise ValueError(f"Pekerjaan seleksi '{job_id}' tidak ditemukan.")

        results = cls.get_job_results(tenant_id, job_id)
        insights = cls.get_job_insights(tenant_id, job_id)

        now_dt = datetime.now(timezone.utc)
        safe_title = "".join(c if c.isalnum() else "_" for c in job_info.get("title", "seleksi"))[:25]
        timestamp_str = now_dt.strftime("%Y%m%d_%H%M%S")

        if fmt == "csv":
            file_bytes = SelectionReportExporter.generate_csv(job_info, results, report_type)
            filename = f"Laporan_Seleksi_{safe_title}_{timestamp_str}.csv"
            content_type = "text/csv"
        elif fmt == "excel":
            file_bytes = SelectionReportExporter.generate_excel_xlsx(job_info, results, report_type)
            filename = f"Laporan_Seleksi_{safe_title}_{timestamp_str}.xlsx"
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            file_bytes = SelectionReportExporter.generate_pdf(job_info, results, insights, report_type)
            filename = f"Laporan_Seleksi_{safe_title}_{timestamp_str}.pdf"
            content_type = "application/pdf"

        # Simpan berkas ke direktori penyimpanan tenant
        save_dir = os.path.join("storage_data", "documents", "tenants", tenant_id, "selection_reports")
        os.makedirs(save_dir, exist_ok=True)
        file_path = os.path.join(save_dir, filename)

        with open(file_path, "wb") as f:
            f.write(file_bytes)

        # Catat ke Audit Ledger (company_context_events)
        with tenant_tx(tenant_id) as conn:
            event_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO company_context_events (
                        id, tenant_id, event_type, title, summary,
                        correlation_score, source_types, source_signals,
                        insights, recommended_actions, status, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, 'SELECTION_REPORT_EXPORTED',
                        :title, :summary,
                        1.0000, ARRAY['Native'], '[]'::jsonb,
                        :insights::jsonb, '[]'::jsonb, 'RESOLVED', :now_dt, :now_dt
                    );
                """),
                {
                    "id": event_id,
                    "tenant_id": tenant_id,
                    "title": f"Ekspor Laporan Seleksi ({fmt.upper()}): {job_info.get('title')}",
                    "summary": f"Pengguna {user_id or 'admin'} mengekspor laporan tipe {report_type} dalam format {fmt.upper()}.",
                    "insights": json.dumps({
                        "job_id": job_id,
                        "format": fmt,
                        "report_type": report_type,
                        "filename": filename,
                        "size_bytes": len(file_bytes),
                        "user_id": user_id,
                    }),
                    "now_dt": now_dt,
                },
            )

        download_url = f"/api/v1/tenants/{tenant_id}/selection/reports/download?filename={filename}"

        return {
            "status": "success",
            "filename": filename,
            "format": fmt,
            "report_type": report_type,
            "download_url": download_url,
            "size_bytes": len(file_bytes),
            "content_type": content_type,
            "exported_at": now_dt.isoformat(),
        }

    # ---------------------------------------------------------------------------
    # BAGIAN D: HUMAN REVIEW & APPROVAL (Guardrail & Audit)
    # ---------------------------------------------------------------------------

    @classmethod
    def submit_result_review(
        cls,
        tenant_id: str,
        result_id: str,
        decision: str,
        override_rank: Optional[int] = None,
        override_score: Optional[float] = None,
        notes: Optional[str] = None,
        reviewer_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Meninjau hasil seleksi individual.
        Jika rejected atau overridden, catatan justifikasi (notes) wajib diisi.
        Jika overridden, menyimpan previous_rank_position dan merekam audit trail perubahan manual.
        """
        norm_decision = decision.lower()
        if norm_decision in ["accepted", "approved"]:
            norm_decision = "approved"
        elif norm_decision in ["overridden", "override"]:
            norm_decision = "overridden"
        elif norm_decision in ["rejected", "reject"]:
            norm_decision = "rejected"
        else:
            raise ValueError(f"Keputusan '{decision}' tidak valid. Pilihan: approved, rejected, overridden.")

        # Penegakan catatan wajib jika ditolak atau disesuaikan
        if norm_decision in ["rejected", "overridden"]:
            if not notes or len(notes.strip()) < 3:
                raise ValueError("Catatan justifikasi tinjauan wajib diisi untuk keputusan penolakan (rejected) atau penyesuaian (overridden).")

        now_dt = datetime.now(timezone.utc)

        with tenant_tx(tenant_id) as conn:
            # Ambil data hasil saat ini
            check_stmt = sa.text("""
                SELECT id, selection_job_id, entity_label, total_score, rank_position, decision_status
                FROM selection_scoring_results
                WHERE id = :id;
            """)
            row = conn.execute(check_stmt, {"id": result_id}).fetchone()
            if not row:
                raise ValueError(f"Hasil skor seleksi '{result_id}' tidak ditemukan.")

            job_id = str(row[1])
            entity_label = row[2]
            current_score = float(row[3])
            current_rank = row[4]

            prev_rank = current_rank if norm_decision == "overridden" else None
            new_rank = override_rank if (norm_decision == "overridden" and override_rank is not None) else current_rank
            new_score = override_score if (norm_decision == "overridden" and override_score is not None) else current_score

            update_stmt = sa.text("""
                UPDATE selection_scoring_results
                SET decision_status = :decision,
                    previous_rank_position = COALESCE(:prev_rank, previous_rank_position),
                    rank_position = :new_rank,
                    total_score = :new_score,
                    reviewer_notes = :notes,
                    reviewed_by_user_id = :reviewer_id,
                    reviewed_at = :now_dt
                WHERE id = :id;
            """)
            conn.execute(
                update_stmt,
                {
                    "id": result_id,
                    "decision": norm_decision,
                    "prev_rank": prev_rank,
                    "new_rank": new_rank,
                    "new_score": new_score,
                    "notes": notes,
                    "reviewer_id": reviewer_id,
                    "now_dt": now_dt,
                },
            )

            # Catat kejadian ke company_context_events untuk audit trail
            event_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO company_context_events (
                        id, tenant_id, event_type, title, summary,
                        correlation_score, source_types, source_signals,
                        insights, recommended_actions, status, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, 'SELECTION_HUMAN_REVIEW',
                        :title, :summary,
                        1.0000, ARRAY['Native'], '[]'::jsonb,
                        :insights::jsonb, '[]'::jsonb, 'RESOLVED', :now_dt, :now_dt
                    );
                """),
                {
                    "id": event_id,
                    "tenant_id": tenant_id,
                    "title": f"Tinjauan Manusia ({norm_decision.upper()}): {entity_label}",
                    "summary": f"Entitas '{entity_label}' diubah statusnya menjadi {norm_decision.upper()} oleh reviewer {reviewer_id or 'admin'}.",
                    "insights": json.dumps({
                        "result_id": result_id,
                        "selection_job_id": job_id,
                        "decision": norm_decision,
                        "previous_rank": prev_rank,
                        "new_rank": new_rank,
                        "previous_score": current_score,
                        "new_score": new_score,
                        "notes": notes,
                        "reviewer_id": reviewer_id,
                    }),
                    "now_dt": now_dt,
                },
            )

        return {
            "result_id": result_id,
            "selection_job_id": job_id,
            "entity_label": entity_label,
            "decision_status": norm_decision,
            "previous_rank_position": prev_rank,
            "rank_position": new_rank,
            "total_score": new_score,
            "reviewer_notes": notes,
            "reviewed_by_user_id": reviewer_id,
            "reviewed_at": now_dt.isoformat(),
        }

    # ---------------------------------------------------------------------------
    # BAGIAN E: AI AGENT INTEGRATION (15 Structural Roles Mapping)
    # ---------------------------------------------------------------------------

    @classmethod
    def list_eligible_agents(cls, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Mengambil daftar AI Agent organisasi yang relevan dengan domain seleksi cerdas,
        dipetakan ke 15 Jabatan Utama resmi (HR Agent, Finance Agent, Procurement Agent, dll).
        """
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT a.id, a.name, a.role, a.department_id, a.is_active,
                       COALESCE(jt.title, a.role) as job_title
                FROM ai_agents a
                LEFT JOIN ai_agent_job_titles jt ON jt.id = a.job_title_id
                WHERE a.tenant_id = :tenant_id AND a.is_active = true
                ORDER BY a.name ASC;
            """)
            agent_rows = conn.execute(stmt, {"tenant_id": tenant_id}).fetchall()

            result = []
            for r in agent_rows:
                agent_id = str(r[0])
                name = r[1]
                role = r[2]
                dept = str(r[3]) if r[3] else None
                job_title = r[5] or role

                # Cari kecocokan struktural
                matched_role = next(
                    (sr for sr in STRUCTURAL_AI_AGENT_ROLES if sr["title"].lower() in job_title.lower() or sr["role_key"] in role.lower()),
                    None
                )
                result.append({
                    "id": agent_id,
                    "name": name,
                    "role": role,
                    "job_title": job_title,
                    "department_id": dept,
                    "structural_mapping": matched_role or {
                        "role_key": "general_agent",
                        "title": job_title,
                        "department": "Operasional",
                        "domain_categories": ["general"],
                    },
                })
            return result

    # ---------------------------------------------------------------------------
    # BAGIAN F: AUTOMATION & PROACTIVE SELECTION
    # ---------------------------------------------------------------------------

    @classmethod
    def list_automation_triggers(cls, tenant_id: str) -> List[Dict[str, Any]]:
        """Mengambil seluruh pemicu otomasi seleksi milik tenant."""
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT t.id, t.trigger_name, t.trigger_type, t.trigger_config,
                       t.target_agent_id, t.criteria_template, t.calibration_profile_id,
                       t.is_active, t.created_at,
                       a.name as target_agent_name,
                       cp.profile_name as calibration_profile_name
                FROM selection_automation_triggers t
                LEFT JOIN ai_agents a ON a.id = t.target_agent_id
                LEFT JOIN selection_calibration_profiles cp ON cp.id = t.calibration_profile_id
                WHERE t.tenant_id = :tenant_id
                ORDER BY t.created_at DESC;
            """)
            rows = conn.execute(stmt, {"tenant_id": tenant_id}).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "trigger_name": r[1],
                    "trigger_type": r[2],
                    "trigger_config": r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}"),
                    "target_agent_id": str(r[4]) if r[4] else None,
                    "criteria_template": r[5] if isinstance(r[5], list) else json.loads(r[5] or "[]"),
                    "calibration_profile_id": str(r[6]) if r[6] else None,
                    "is_active": bool(r[7]),
                    "created_at": r[8].isoformat() if r[8] else None,
                    "target_agent_name": r[9],
                    "calibration_profile_name": r[10],
                }
                for r in rows
            ]

    @classmethod
    def create_automation_trigger(
        cls,
        tenant_id: str,
        trigger_name: str,
        trigger_type: str,
        trigger_config: Dict[str, Any],
        target_agent_id: Optional[str] = None,
        criteria_template: Optional[List[Dict[str, Any]]] = None,
        calibration_profile_id: Optional[str] = None,
        is_active: bool = True,
    ) -> Dict[str, Any]:
        """Membuat pemicu seleksi otomatis baru."""
        valid_types = ["new_file_upload", "scheduled", "webhook", "workflow_trigger"]
        if trigger_type not in valid_types:
            raise ValueError(f"trigger_type '{trigger_type}' tidak valid. Pilihan: {valid_types}")

        trigger_id = str(uuid.uuid4())
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                INSERT INTO selection_automation_triggers (
                    id, tenant_id, trigger_name, trigger_type, trigger_config,
                    target_agent_id, criteria_template, calibration_profile_id,
                    is_active, created_at, updated_at
                ) VALUES (
                    :id, :tenant_id, :name, :type, :config::jsonb,
                    :agent_id, :criteria::jsonb, :calib_id,
                    :active, now(), now()
                );
            """)
            conn.execute(
                stmt,
                {
                    "id": trigger_id,
                    "tenant_id": tenant_id,
                    "name": trigger_name,
                    "type": trigger_type,
                    "config": json.dumps(trigger_config),
                    "agent_id": target_agent_id,
                    "criteria": json.dumps(criteria_template or []),
                    "calib_id": calibration_profile_id,
                    "active": is_active,
                },
            )

        return {
            "id": trigger_id,
            "trigger_name": trigger_name,
            "trigger_type": trigger_type,
            "trigger_config": trigger_config,
            "target_agent_id": target_agent_id,
            "criteria_template": criteria_template or [],
            "calibration_profile_id": calibration_profile_id,
            "is_active": is_active,
        }

    @classmethod
    def update_automation_trigger(
        cls,
        tenant_id: str,
        trigger_id: str,
        trigger_name: Optional[str] = None,
        trigger_config: Optional[Dict[str, Any]] = None,
        target_agent_id: Optional[str] = None,
        criteria_template: Optional[List[Dict[str, Any]]] = None,
        calibration_profile_id: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Memperbarui konfigurasi pemicu otomasi."""
        with tenant_tx(tenant_id) as conn:
            updates = []
            params: Dict[str, Any] = {"id": trigger_id, "now": datetime.now(timezone.utc)}

            if trigger_name is not None:
                updates.append("trigger_name = :name")
                params["name"] = trigger_name
            if trigger_config is not None:
                updates.append("trigger_config = :config::jsonb")
                params["config"] = json.dumps(trigger_config)
            if target_agent_id is not None:
                updates.append("target_agent_id = :agent_id")
                params["agent_id"] = target_agent_id
            if criteria_template is not None:
                updates.append("criteria_template = :criteria::jsonb")
                params["criteria"] = json.dumps(criteria_template)
            if calibration_profile_id is not None:
                updates.append("calibration_profile_id = :calib_id")
                params["calib_id"] = calibration_profile_id
            if is_active is not None:
                updates.append("is_active = :active")
                params["active"] = is_active

            updates.append("updated_at = :now")

            query = f"UPDATE selection_automation_triggers SET {', '.join(updates)} WHERE id = :id;"
            conn.execute(sa.text(query), params)

        return {"id": trigger_id, "status": "updated"}

    @classmethod
    def delete_automation_trigger(cls, tenant_id: str, trigger_id: str) -> Dict[str, Any]:
        """Menghapus pemicu otomasi seleksi."""
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("DELETE FROM selection_automation_triggers WHERE id = :id;"),
                {"id": trigger_id},
            )
        return {"id": trigger_id, "status": "deleted"}

    @classmethod
    async def execute_automation_trigger(
        cls,
        tenant_id: str,
        trigger_id: str,
        payload_data: Optional[Dict[str, Any]] = None,
        execution_source: str = "scheduled",
    ) -> Dict[str, Any]:
        """
        Mengeksekusi pemicu otomasi: membuat selection_job baru atas nama target_agent_id,
        menambahkan dokumen jika ada, menjalankan pipeline 10 tahap, dan mencatat riwayat eksekusi.
        """
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                SELECT trigger_name, trigger_type, trigger_config,
                       target_agent_id, criteria_template, calibration_profile_id, is_active
                FROM selection_automation_triggers
                WHERE id = :id;
            """)
            t_row = conn.execute(stmt, {"id": trigger_id}).fetchone()
            if not t_row:
                raise ValueError(f"Pemicu otomasi '{trigger_id}' tidak ditemukan.")

            if not t_row.is_active:
                raise ValueError(f"Pemicu otomasi '{t_row.trigger_name}' sedang dinonaktifkan.")

            trigger_name = t_row.trigger_name
            target_agent_id = str(t_row.target_agent_id) if t_row.target_agent_id else None
            criteria_tmpl = t_row.criteria_template if isinstance(t_row.criteria_template, list) else json.loads(t_row.criteria_template or "[]")
            calib_id = str(t_row.calibration_profile_id) if t_row.calibration_profile_id else None

        # Susun judul dan prompt evaluasi otomatis
        now_dt = datetime.now(timezone.utc)
        title = f"{trigger_name} ({now_dt.strftime('%d %b %H:%M')})"
        prompt = (payload_data or {}).get("instruction_prompt") or f"Seleksi proaktif otomatis yang dipicu oleh '{trigger_name}'."
        domain_cat = (payload_data or {}).get("domain_category") or "general"
        source_docs = (payload_data or {}).get("source_documents") or []

        # Buat selection job baru
        new_job = cls.create_job(
            tenant_id=tenant_id,
            title=title,
            instruction_prompt=prompt,
            domain_category=domain_cat,
            calibration_profile_id=calib_id,
            criteria=criteria_tmpl,
            source_documents=source_docs,
            initiated_by_agent_id=target_agent_id,
        )
        job_id = new_job["id"]

        exec_id = str(uuid.uuid4())
        try:
            # Jalankan pipeline 10 tahap secara otomatis atas nama AI Agent
            pipe_res = await cls.run_pipeline(
                tenant_id=tenant_id,
                job_id=job_id,
                actor_id=target_agent_id,
                actor_type="ai_agent",
            )
            status = "success"
            detail = f"Eksekusi seleksi otomatis selesai. Job: {job_id} ({pipe_res.get('status')})"
        except Exception as e:
            logger.error(f"Gagal mengeksekusi pipeline seleksi otomatis (Trigger {trigger_id}): {e}")
            status = "failed"
            detail = str(e)

        # Catat ke riwayat eksekusi otomasi
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO selection_automation_executions (
                        id, tenant_id, trigger_id, selection_job_id,
                        status, detail, executed_at
                    ) VALUES (
                        :id, :tenant_id, :trigger_id, :job_id,
                        :status, :detail, now()
                    );
                """),
                {
                    "id": exec_id,
                    "tenant_id": tenant_id,
                    "trigger_id": trigger_id,
                    "job_id": job_id,
                    "status": status,
                    "detail": detail,
                },
            )

        return {
            "execution_id": exec_id,
            "trigger_id": trigger_id,
            "selection_job_id": job_id,
            "status": status,
            "detail": detail,
            "target_agent_id": target_agent_id,
            "executed_at": now_dt.isoformat(),
        }

    @classmethod
    def list_automation_executions(
        cls,
        tenant_id: str,
        trigger_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Mengambil riwayat log eksekusi pemicu seleksi otomatis."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT e.id, e.trigger_id, e.selection_job_id, e.status, e.detail, e.executed_at,
                       t.trigger_name, t.trigger_type, j.title as job_title
                FROM selection_automation_executions e
                JOIN selection_automation_triggers t ON t.id = e.trigger_id
                LEFT JOIN selection_jobs j ON j.id = e.selection_job_id
                WHERE e.tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if trigger_id:
                query += " AND e.trigger_id = :trigger_id"
                params["trigger_id"] = trigger_id

            query += " ORDER BY e.executed_at DESC LIMIT 50;"

            rows = conn.execute(sa.text(query), params).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "trigger_id": str(r[1]),
                    "selection_job_id": str(r[2]) if r[2] else None,
                    "status": r[3],
                    "detail": r[4],
                    "executed_at": r[5].isoformat() if r[5] else None,
                    "trigger_name": r[6],
                    "trigger_type": r[7],
                    "job_title": r[8],
                }
                for r in rows
            ]

    @classmethod
    async def handle_file_upload_event(
        cls,
        tenant_id: str,
        document_name: str,
        raw_text: Optional[str] = None,
        file_artifact_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Menangani event unggah berkas baru (new_file_upload) dari Supabase Storage.
        Mencari pemicu aktif tipe 'new_file_upload' dan memicu pipeline seleksi baru secara otomatis.
        """
        triggers = cls.list_automation_triggers(tenant_id)
        upload_triggers = [t for t in triggers if t["trigger_type"] == "new_file_upload" and t["is_active"]]

        results = []
        for trig in upload_triggers:
            payload = {
                "instruction_prompt": f"Seleksi otomatis untuk berkas baru '{document_name}'",
                "source_documents": [
                    {
                        "source_channel": "file_upload",
                        "raw_text": raw_text or "",
                        "file_artifact_id": file_artifact_id,
                        "document_name": document_name,
                    }
                ],
            }
            res = await cls.execute_automation_trigger(
                tenant_id=tenant_id,
                trigger_id=trig["id"],
                payload_data=payload,
                execution_source="new_file_upload",
            )
            results.append(res)
        return results

    @classmethod
    async def handle_public_webhook(
        cls,
        trigger_id: str,
        signature: Optional[str],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Menangani permintaan webhook publik untuk memicu seleksi otomatis dengan verifikasi signature.
        """
        engine = get_database_engine()
        with engine.connect() as conn:
            stmt = sa.text("""
                SELECT id, tenant_id, trigger_name, trigger_config, is_active
                FROM selection_automation_triggers
                WHERE id = :id AND trigger_type = 'webhook';
            """)
            row = conn.execute(stmt, {"id": trigger_id}).fetchone()
            if not row:
                raise ValueError("Webhook trigger tidak ditemukan atau tipe bukan webhook.")

            if not row.is_active:
                raise ValueError("Webhook trigger sedang tidak aktif.")

            tenant_id = str(row.tenant_id)
            config = row.trigger_config if isinstance(row.trigger_config, dict) else json.loads(row.trigger_config or "{}")
            secret = config.get("webhook_secret")

            # Verifikasi signature jika webhook_secret dikonfigurasi
            if secret:
                if not signature:
                    raise ValueError("Signature header X-Orchestree-Signature wajib disertakan.")
                expected_sig = hmac.new(
                    secret.encode("utf-8"),
                    json.dumps(payload, sort_keys=True).encode("utf-8"),
                    hashlib.sha256,
                ).hexdigest()
                if not hmac.compare_digest(signature, expected_sig):
                    raise ValueError("Verifikasi signature webhook gagal.")

        return await cls.execute_automation_trigger(
            tenant_id=tenant_id,
            trigger_id=trigger_id,
            payload_data=payload,
            execution_source="webhook",
        )

    # -----------------------------------------------------------------------
    # BAGIAN G: Profil Kalibrasi Seleksi (Selection Calibration Profiles)
    # -----------------------------------------------------------------------

    @classmethod
    def create_calibration_profile(
        cls,
        tenant_id: str,
        profile_name: str,
        domain_category: Optional[str] = None,
        created_by_membership_id: Optional[str] = None,
        items: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Membuat profil kalibrasi seleksi baru beserta item persentase dinamis."""
        profile_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc)

        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                INSERT INTO selection_calibration_profiles (
                    id, tenant_id, profile_name, domain_category,
                    created_by_membership_id, is_active, created_at
                ) VALUES (
                    :id, :tenant_id, :name, :domain_cat,
                    :member_id, true, :created_at
                );
            """)
            conn.execute(
                stmt,
                {
                    "id": profile_id,
                    "tenant_id": tenant_id,
                    "name": profile_name,
                    "domain_cat": domain_category,
                    "member_id": created_by_membership_id,
                    "created_at": created_at,
                },
            )

            created_items = []
            total_pct = 0.0
            if items:
                for idx, item in enumerate(items):
                    item_id = str(uuid.uuid4())
                    field_name = str(item.get("field_type_name", "")).strip()
                    pct = float(item.get("percentage", 0.0))
                    order = int(item.get("display_order", idx))
                    if not field_name:
                        continue
                    if pct < 0.0 or pct > 100.0:
                        raise ValueError(f"Persentase '{field_name}' harus antara 0 dan 100%.")

                    item_stmt = sa.text("""
                        INSERT INTO selection_calibration_items (
                            id, calibration_profile_id, field_type_name,
                            percentage, display_order, created_at
                        ) VALUES (
                            :id, :profile_id, :field_name,
                            :pct, :order, :created_at
                        );
                    """)
                    conn.execute(
                        item_stmt,
                        {
                            "id": item_id,
                            "profile_id": profile_id,
                            "field_name": field_name,
                            "pct": pct,
                            "order": order,
                            "created_at": created_at,
                        },
                    )
                    created_items.append({
                        "id": item_id,
                        "calibration_profile_id": profile_id,
                        "field_type_name": field_name,
                        "percentage": pct,
                        "display_order": order,
                        "created_at": created_at.isoformat(),
                    })
                    total_pct += pct

        return {
            "id": profile_id,
            "tenant_id": tenant_id,
            "profile_name": profile_name,
            "domain_category": domain_category,
            "created_by_membership_id": created_by_membership_id,
            "is_active": True,
            "created_at": created_at.isoformat(),
            "items": created_items,
            "total_percentage": round(total_pct, 2),
        }

    @classmethod
    def list_calibration_profiles(
        cls,
        tenant_id: str,
        domain_category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Mengambil seluruh profil kalibrasi aktif untuk tenant beserta ringkasan item."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT p.id, p.tenant_id, p.profile_name, p.domain_category,
                       p.created_by_membership_id, p.is_active, p.created_at,
                       COALESCE(SUM(i.percentage), 0) as total_percentage,
                       COUNT(i.id) as items_count
                FROM selection_calibration_profiles p
                LEFT JOIN selection_calibration_items i ON i.calibration_profile_id = p.id
                WHERE p.tenant_id = :tenant_id AND p.is_active = true
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if domain_category:
                query += " AND (p.domain_category = :domain_cat OR p.domain_category IS NULL)"
                params["domain_cat"] = domain_category

            query += " GROUP BY p.id ORDER BY p.created_at DESC;"

            rows = conn.execute(sa.text(query), params).fetchall()
            return [
                {
                    "id": str(r[0]),
                    "tenant_id": str(r[1]),
                    "profile_name": r[2],
                    "domain_category": r[3],
                    "created_by_membership_id": str(r[4]) if r[4] else None,
                    "is_active": bool(r[5]),
                    "created_at": r[6].isoformat() if r[6] else None,
                    "total_percentage": round(float(r[7]), 2),
                    "items_count": int(r[8]),
                }
                for r in rows
            ]

    @classmethod
    def get_calibration_profile(
        cls,
        tenant_id: str,
        profile_id: str,
    ) -> Dict[str, Any]:
        """Mengambil rincian profil kalibrasi beserta seluruh itemnya."""
        with tenant_tx(tenant_id) as conn:
            p_stmt = sa.text("""
                SELECT id, tenant_id, profile_name, domain_category,
                       created_by_membership_id, is_active, created_at
                FROM selection_calibration_profiles
                WHERE id = :id AND tenant_id = :tenant_id;
            """)
            p_row = conn.execute(p_stmt, {"id": profile_id, "tenant_id": tenant_id}).fetchone()
            if not p_row:
                raise ValueError(f"Profil kalibrasi '{profile_id}' tidak ditemukan.")

            items_stmt = sa.text("""
                SELECT id, calibration_profile_id, field_type_name,
                       percentage, display_order, created_at
                FROM selection_calibration_items
                WHERE calibration_profile_id = :profile_id
                ORDER BY display_order ASC, created_at ASC;
            """)
            i_rows = conn.execute(items_stmt, {"profile_id": profile_id}).fetchall()
            items = [
                {
                    "id": str(r[0]),
                    "calibration_profile_id": str(r[1]),
                    "field_type_name": r[2],
                    "percentage": float(r[3]),
                    "display_order": int(r[4]),
                    "created_at": r[5].isoformat() if r[5] else None,
                }
                for r in i_rows
            ]
            total_pct = sum(item["percentage"] for item in items)

            return {
                "id": str(p_row[0]),
                "tenant_id": str(p_row[1]),
                "profile_name": p_row[2],
                "domain_category": p_row[3],
                "created_by_membership_id": str(p_row[4]) if p_row[4] else None,
                "is_active": bool(p_row[5]),
                "created_at": p_row[6].isoformat() if p_row[6] else None,
                "items": items,
                "total_percentage": round(total_pct, 2),
            }

    @classmethod
    def add_calibration_item(
        cls,
        tenant_id: str,
        profile_id: str,
        field_type_name: str,
        percentage: float,
        display_order: int = 0,
    ) -> Dict[str, Any]:
        """Menambahkan baris item kalibrasi baru ke profil yang ada."""
        if not field_type_name.strip():
            raise ValueError("Field Nama Tipe tidak boleh kosong.")
        if percentage < 0.0 or percentage > 100.0:
            raise ValueError("Persentase harus berada pada rentang 0 sampai 100.")

        # Verifikasi profil milik tenant
        cls.get_calibration_profile(tenant_id, profile_id)

        item_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc)
        with tenant_tx(tenant_id) as conn:
            stmt = sa.text("""
                INSERT INTO selection_calibration_items (
                    id, calibration_profile_id, field_type_name,
                    percentage, display_order, created_at
                ) VALUES (
                    :id, :profile_id, :field_name,
                    :pct, :order, :created_at
                );
            """)
            conn.execute(
                stmt,
                {
                    "id": item_id,
                    "profile_id": profile_id,
                    "field_name": field_type_name.strip(),
                    "pct": percentage,
                    "order": display_order,
                    "created_at": created_at,
                },
            )

        return cls.get_calibration_profile(tenant_id, profile_id)

    @classmethod
    def delete_calibration_item(
        cls,
        tenant_id: str,
        profile_id: str,
        item_id: str,
    ) -> Dict[str, Any]:
        """Menghapus item kalibrasi individual dari profil."""
        cls.get_calibration_profile(tenant_id, profile_id)
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    DELETE FROM selection_calibration_items
                    WHERE id = :item_id AND calibration_profile_id = :profile_id;
                """),
                {"item_id": item_id, "profile_id": profile_id},
            )
        return cls.get_calibration_profile(tenant_id, profile_id)

    @classmethod
    def delete_calibration_profile(
        cls,
        tenant_id: str,
        profile_id: str,
    ) -> Dict[str, Any]:
        """Menghapus profil kalibrasi beserta seluruh itemnya (cascade)."""
        cls.get_calibration_profile(tenant_id, profile_id)
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("DELETE FROM selection_calibration_profiles WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": profile_id, "tenant_id": tenant_id},
            )
        return {"status": "success", "deleted_profile_id": profile_id}

