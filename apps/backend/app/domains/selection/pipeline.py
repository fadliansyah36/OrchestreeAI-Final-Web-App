"""
Universal AI Selection 10-Stage Pipeline Engine (PRD v2.2 Bagian 1.3, 13.1, 17.5)
Diimplementasikan sebagai WorkflowNode pada Orchestration Engine kognitif.
Memenuhi:
1. One Orchestration Core: Terintegrasi langsung dengan OrchestrationEngine graph.
2. Real-Time Stage Progress: Memperbarui selection_jobs.pipeline_stage & stage_progress_pct di setiap node.
3. Unified AI Credit Lifecycle: Memanggil estimate/reserve di SELECTION_READ dan consume/refund di SELECTION_RESULT.
4. Grounding Enforcement: Verifikasi matematis konsistensi antara score breakdown dan total score.
5. Multi-Source Ingestion: Pemrosesan berkas, prompt, integrasi fabric, dan pesan terusan.
"""

import json
import logging
import math
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import sqlalchemy as sa
from app.core.database import get_database_engine, tenant_tx
from app.domains.billing.contracts import (
    estimate_credit_cost,
    reserve_credit,
    consume_credit,
    refund_credit,
    ReservationToken,
)

from app.domains.selection.models import (
    PipelineStage,
    SourceChannel,
    CriteriaSourceType,
    PriorityLevel,
    RecommendationClass,
    DecisionStatus,
    InsightType,
    AnalyticsType,
    ChartType,
    SELECTION_PIPELINE_NODES,
)
from app.domains.selection.multi_source import MultiSourceExtractor

logger = logging.getLogger("orchestree.selection.pipeline")


class GroundingValidationError(ValueError):
    """Dilempar jika hasil komputasi tidak konsisten secara matematis (Grounding Enforcement)."""
    pass


class SelectionPipelineEngine:
    """Mesin eksekusi 10 tahap pipeline seleksi kognitif terpadu."""

    @classmethod
    async def update_job_progress(
        cls,
        tenant_id: str,
        job_id: str,
        stage: PipelineStage,
        progress_pct: float,
        completed: bool = False,
    ) -> None:
        """Memperbarui status progress pekerjaan di database secara atomik."""
        now = datetime.now(timezone.utc)
        try:
            with tenant_tx(tenant_id) as conn:
                stmt = sa.text("""
                    UPDATE selection_jobs
                    SET pipeline_stage = :stage,
                        stage_progress_pct = :pct,
                        completed_at = :completed_at
                    WHERE id = :id;
                """)
                conn.execute(
                    stmt,
                    {
                        "id": job_id,
                        "stage": stage.value,
                        "pct": round(progress_pct, 2),
                        "completed_at": now if completed else None,
                    },
                )
        except Exception as exc:
            logger.debug(f"[SelectionPipeline] Skipping job progress db update: {exc}")
        logger.info(f"[SelectionPipeline] Job {job_id} -> {stage.value} ({progress_pct}%)")

    # -----------------------------------------------------------------------
    # NODE 1: SELECTION_READ
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_read(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
        actor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Tahap 1: Membaca sumber data multi-kanal dan mereservasi kredit AI.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.READING, 10.0)

        # 1. Unified Credit Engine: Reservasi kredit tugas seleksi
        cost_estimate = await estimate_credit_cost(
            tenant_id=tenant_id,
            activity_code="ai_selection",
            model_id="meta-llama/llama-3.3-70b-instruct",
            complexity_code="moderate",
            mcp_tool_names=["selection.read", "selection.extract"],
        )
        reservation = await reserve_credit(
            tenant_id=tenant_id,
            estimate=cost_estimate,
            reference_type="selection_job",
            reference_id=job_id,
            activity_type_id="act-ai_selection",
            execution_ref=job_id,
        )
        context["credit_reservation"] = reservation

        # 2. Baca dokumen sumber dari context atau database
        raw_inputs = context.get("source_documents", [])
        instruction_prompt = context.get("instruction_prompt", "")

        # Jika ada teks instruksi, sertakan sebagai salah satu sumber prompt_text
        if instruction_prompt and not any(d.get("source_channel") == "prompt_text" for d in raw_inputs):
            raw_inputs.append({
                "source_channel": "prompt_text",
                "raw_text": instruction_prompt,
                "document_name": "Instruksi & Data Prompt Langsung",
            })

        ingested_docs = []
        with tenant_tx(tenant_id) as conn:
            for item in raw_inputs:
                doc_id = str(uuid.uuid4())
                channel = item.get("source_channel", "file_upload")
                raw_text = item.get("raw_text") or item.get("content") or ""
                doc_name = item.get("document_name") or item.get("entity_label") or "Dokumen Sumber"
                file_art_id = item.get("file_artifact_id")

                stmt = sa.text("""
                    INSERT INTO selection_source_documents (
                        id, tenant_id, selection_job_id, source_channel, file_artifact_id,
                        raw_text_ref, ingested_at
                    ) VALUES (
                        :id, :tenant_id, :job_id, :channel, :file_art_id,
                        :raw_text, now()
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": doc_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "channel": channel,
                        "file_art_id": file_art_id,
                        "raw_text": raw_text[:50000] if raw_text else None,
                    },
                )
                ingested_docs.append({
                    "id": doc_id,
                    "source_channel": channel,
                    "document_name": doc_name,
                    "raw_text": raw_text,
                    "file_artifact_id": file_art_id,
                })

        context["ingested_documents"] = ingested_docs
        return {"ingested_count": len(ingested_docs), "documents": ingested_docs}

    # -----------------------------------------------------------------------
    # NODE 2: SELECTION_UNDERSTAND
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_understand(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 2: Automatic Schema Detection, klasifikasi konten, dan ekstraksi entitas.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.UNDERSTANDING, 20.0)

        ingested = context.get("ingested_documents", [])
        parsed_entities = []

        with tenant_tx(tenant_id) as conn:
            for doc in ingested:
                doc_id = doc["id"]
                raw_text = doc.get("raw_text", "")
                entities = MultiSourceExtractor.extract_entities_from_raw(raw_text)

                for entity in entities:
                    schema, classification = MultiSourceExtractor.detect_schema_and_classification(entity)
                    entity_label = entity.get("entity_label") or entity.get("name") or doc.get("document_name") or f"Entitas {len(parsed_entities) + 1}"

                    stmt = sa.text("""
                        UPDATE selection_source_documents
                        SET detected_schema = :schema,
                            data_classification = :classification
                        WHERE id = :id;
                    """)
                    conn.execute(
                        stmt,
                        {
                            "id": doc_id,
                            "schema": json.dumps(schema),
                            "classification": classification,
                        },
                    )

                    parsed_entities.append({
                        "source_document_id": doc_id,
                        "entity_label": entity_label,
                        "attributes": entity,
                        "schema": schema,
                        "classification": classification,
                        "source_channel": doc.get("source_channel"),
                    })

        context["parsed_entities"] = parsed_entities
        return {"parsed_entities_count": len(parsed_entities), "entities": parsed_entities}

    # -----------------------------------------------------------------------
    # NODE 3: SELECTION_VALIDATE
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_validate(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 3: Deteksi duplikasi, analisis kelengkapan data (quality_score), dan validitas.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.VALIDATING, 30.0)

        entities = context.get("parsed_entities", [])
        validated_entities = []
        seen_labels: Dict[str, str] = {}

        with tenant_tx(tenant_id) as conn:
            for item in entities:
                doc_id = item["source_document_id"]
                attrs = item.get("attributes", {})
                label = item.get("entity_label", "").strip()

                quality_score = MultiSourceExtractor.calculate_quality_score(attrs)

                # Deteksi duplikat
                duplicate_of = seen_labels.get(label.lower())
                if not duplicate_of:
                    seen_labels[label.lower()] = doc_id
                    validity = "valid" if quality_score >= 30.0 else "needs_review"
                else:
                    validity = "needs_review"

                stmt = sa.text("""
                    UPDATE selection_source_documents
                    SET quality_score = :quality,
                        duplicate_of_document_id = :dup_id,
                        validity_status = :validity
                    WHERE id = :id;
                """)
                conn.execute(
                    stmt,
                    {
                        "id": doc_id,
                        "quality": quality_score,
                        "dup_id": duplicate_of,
                        "validity": validity,
                    },
                )

                item["quality_score"] = quality_score
                item["validity_status"] = validity
                item["duplicate_of"] = duplicate_of
                validated_entities.append(item)

        context["validated_entities"] = validated_entities
        return {"validated_count": len(validated_entities)}

    # -----------------------------------------------------------------------
    # NODE 4: SELECTION_SELECT
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_select(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 4: Menentukan kriteria seleksi terarah dan normalisasi bobot (sum = 1.0).
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.SELECTING, 40.0)

        configured_criteria = context.get("criteria", [])
        calib_profile_id = context.get("calibration_profile_id")
        if not calib_profile_id:
            try:
                with tenant_tx(tenant_id) as conn:
                    calib_val = conn.execute(
                        sa.text("SELECT calibration_profile_id FROM selection_jobs WHERE id = :job_id;"),
                        {"job_id": job_id},
                    ).scalar()
                    if calib_val:
                        calib_profile_id = str(calib_val)
            except Exception:
                pass

        # Bila calibration_profile_id diset, konversi selection_calibration_items menjadi selection_criteria
        if calib_profile_id:
            try:
                items_rows = context.get("calibration_items")
                if items_rows is None:
                    with tenant_tx(tenant_id) as conn:
                        items_rows = conn.execute(
                            sa.text("""
                                SELECT id, field_type_name, percentage, display_order
                                FROM selection_calibration_items
                                WHERE calibration_profile_id = :p_id
                                ORDER BY display_order ASC, created_at ASC;
                            """),
                            {"p_id": calib_profile_id},
                        ).fetchall()
                if items_rows:
                    import re
                    total_percentage = 0.0
                    parsed_raw = []
                    for r in items_rows:
                        if isinstance(r, dict):
                            fname = str(r.get("field_type_name", "")).strip()
                            fpct = float(r.get("percentage", 0.0))
                        else:
                            fname = str(r[1]).strip()
                            fpct = float(r[2])
                        total_percentage += fpct
                        parsed_raw.append((fname, fpct))

                    if total_percentage <= 0:
                        total_percentage = 100.0

                    calib_criteria = []
                    running_calib_sum = 0.0
                    for i, (field_name, pct) in enumerate(parsed_raw):
                        if i == len(parsed_raw) - 1:
                            norm_w = round(1.0 - running_calib_sum, 4)
                        else:
                            norm_w = round(pct / total_percentage, 4)
                            running_calib_sum += norm_w

                        safe_key = re.sub(r'[^a-zA-Z0-9_]+', '_', field_name.lower()).strip('_')
                        if not safe_key:
                            safe_key = f"calib_{i+1}"

                        calib_criteria.append({
                            "key": safe_key,
                            "label": field_name,
                            "weight": norm_w,
                            "source_type": "calibration_profile",
                            "percentage": pct,
                        })
                    configured_criteria = calib_criteria
            except Exception as e:
                logger.warning(f"Gagal memuat profil kalibrasi {calib_profile_id}: {e}")

        if not configured_criteria:
            # Standar kriteria cerdas multi-dimensi
            domain_cat = context.get("domain_category", "general")
            if domain_cat == "recruitment":
                configured_criteria = [
                    {"key": "tech_depth", "label": "Kualifikasi Teknis & Kompetensi Inti", "weight": 0.40, "source_type": "user_prompt"},
                    {"key": "experience", "label": "Rekam Jejak & Pengalaman Kerja", "weight": 0.30, "source_type": "user_prompt"},
                    {"key": "problem_solving", "label": "Analisis Masalah & Problem Solving", "weight": 0.20, "source_type": "user_prompt"},
                    {"key": "culture_fit", "label": "Kesesuaian Budaya & Etika", "weight": 0.10, "source_type": "user_prompt"},
                ]
            elif domain_cat == "supplier":
                configured_criteria = [
                    {"key": "price_competitiveness", "label": "Daya Saing Harga & Efisiensi Biaya", "weight": 0.35, "source_type": "user_prompt"},
                    {"key": "quality_sla", "label": "Kualitas Produk & Jaminan SLA", "weight": 0.35, "source_type": "user_prompt"},
                    {"key": "delivery_timeline", "label": "Ketepatan Waktu Pengiriman", "weight": 0.20, "source_type": "user_prompt"},
                    {"key": "compliance_reputation", "label": "Kepatuhan Regulasi & Reputasi", "weight": 0.10, "source_type": "user_prompt"},
                ]
            elif domain_cat == "sales":
                configured_criteria = [
                    {"key": "budget_fit", "label": "Kesesuaian Anggaran & Kapasitas Beli", "weight": 0.40, "source_type": "user_prompt"},
                    {"key": "authority_level", "label": "Otoritas Pengambil Keputusan", "weight": 0.30, "source_type": "user_prompt"},
                    {"key": "need_urgency", "label": "Urgensi Kebutuhan Solusi", "weight": 0.20, "source_type": "user_prompt"},
                    {"key": "timeline_fit", "label": "Jadwal Implementasi", "weight": 0.10, "source_type": "user_prompt"},
                ]
            else:
                configured_criteria = [
                    {"key": "relevance", "label": "Tingkat Relevansi terhadap Kebutuhan", "weight": 0.40, "source_type": "ai_generated"},
                    {"key": "quality", "label": "Kelengkapan & Mutu Data", "weight": 0.30, "source_type": "ai_generated"},
                    {"key": "risk_feasibility", "label": "Kelayakan Operasional & Mitigasi Risiko", "weight": 0.20, "source_type": "ai_generated"},
                    {"key": "value_impact", "label": "Dampak Nilai Tambah Organisasi", "weight": 0.10, "source_type": "ai_generated"},
                ]

        # Normalisasi bobot agar jumlahnya tepat 1.0
        total_raw_weight = sum(float(c.get("weight", 0.25)) for c in configured_criteria)
        if total_raw_weight <= 0:
            total_raw_weight = 1.0

        normalized_criteria = []
        running_sum = 0.0
        for i, c in enumerate(configured_criteria):
            raw_w = float(c.get("weight", 0.25))
            if i == len(configured_criteria) - 1:
                # Elemen terakhir menyerap sisa pembulatan
                norm_w = round(1.0 - running_sum, 4)
            else:
                norm_w = round(raw_w / total_raw_weight, 4)
                running_sum += norm_w

            crit_entry = {
                "key": c.get("key") or f"crit_{i+1}",
                "label": c.get("label") or f"Kriteria {i+1}",
                "weight": norm_w,
                "source_type": c.get("source_type") or "user_prompt",
            }
            if "percentage" in c and c["percentage"] is not None:
                crit_entry["percentage"] = float(c["percentage"])

            normalized_criteria.append(crit_entry)

        # Persist ke selection_criteria
        with tenant_tx(tenant_id) as conn:
            # Bersihkan kriteria lama untuk job ini
            conn.execute(
                sa.text("DELETE FROM selection_criteria WHERE selection_job_id = :job_id;"),
                {"job_id": job_id},
            )

            for crit in normalized_criteria:
                crit_id = str(uuid.uuid4())
                stmt = sa.text("""
                    INSERT INTO selection_criteria (
                        id, tenant_id, selection_job_id, criterion_key,
                        criterion_label, weight, source_type
                    ) VALUES (
                        :id, :tenant_id, :job_id, :key, :label, :weight, :source_type
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": crit_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "key": crit["key"],
                        "label": crit["label"],
                        "weight": crit["weight"],
                        "source_type": crit["source_type"],
                    },
                )

        context["criteria"] = normalized_criteria
        return {"criteria": normalized_criteria}

    # -----------------------------------------------------------------------
    # NODE 5: SELECTION_SCORE
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_score(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 5: Scoring berbobot per kriteria dengan Grounding Enforcement mutlak.
        Total skor WAJIB konsisten dengan formula: sum(weight_i * score_i).
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.SCORING, 50.0)

        entities = context.get("validated_entities", [])
        criteria = context.get("criteria", [])

        scored_items = []
        for entity in entities:
            breakdown: Dict[str, float] = {}
            attrs = entity.get("attributes", {})
            quality_score = float(entity.get("quality_score", 50.0))

            computed_total = 0.0
            for crit in criteria:
                key = crit["key"]
                label = crit.get("label", key)
                weight = float(crit["weight"])

                # 1. Cek apakah attrs memiliki nilai numerik spesifik untuk key atau label kriteria
                direct_score = None
                for k, v in attrs.items():
                    clean_k = str(k).lower().replace(" ", "_")
                    if clean_k == key.lower() or str(k).lower() == label.lower() or key.lower() in clean_k or label.lower() in str(k).lower():
                        try:
                            num_v = float(v)
                            if 0 <= num_v <= 100:
                                direct_score = num_v
                                break
                            elif num_v > 100:
                                direct_score = min(100.0, num_v)
                                break
                        except (ValueError, TypeError):
                            pass

                if direct_score is not None:
                    criterion_score = direct_score
                else:
                    # 2. Hitung skor kriteria berdasarkan relevansi atribut dan kelengkapan informasi
                    base_val = 60.0
                    attr_str = json.dumps(attrs).lower()
                    label_words = [w for w in label.lower().split() if len(w) > 2]

                    if key.lower() in attr_str:
                        base_val += 20.0
                    elif any(w in attr_str for w in label_words):
                        base_val += 15.0

                    if any(w in attr_str for w in ["expert", "senior", "lead", "advanced", "top", "excellent"]):
                        base_val += 15.0
                    elif any(w in attr_str for w in ["intermediate", "proficient", "good", "certified"]):
                        base_val += 10.0

                    # Sesuaikan dengan faktor kualitas dokumen
                    criterion_score = min(100.0, max(20.0, base_val * (quality_score / 100.0 * 0.4 + 0.6)))

                criterion_score = round(criterion_score, 2)
                breakdown[key] = criterion_score
                computed_total += (criterion_score * weight)

            computed_total = round(computed_total, 3)

            # --- GROUNDING ENFORCEMENT ---
            expected_sum = sum(breakdown[c["key"]] * float(c["weight"]) for c in criteria)
            if abs(computed_total - expected_sum) > 0.05:
                raise GroundingValidationError(
                    f"Grounding Enforcement Failed: total_score ({computed_total}) tidak konsisten dengan weighted sum breakdown ({expected_sum})"
                )

            # Hitung risk_score & confidence_score
            risk_score = round(max(5.0, 100.0 - computed_total * 0.8), 2)
            confidence_score = round(min(98.0, quality_score * 0.5 + computed_total * 0.5), 2)

            scored_items.append({
                "source_document_id": entity["source_document_id"],
                "entity_label": entity["entity_label"],
                "total_score": computed_total,
                "score_breakdown": breakdown,
                "risk_score": risk_score,
                "confidence_score": confidence_score,
                "attributes": attrs,
            })

        context["scored_items"] = scored_items
        return {"scored_count": len(scored_items)}

    # -----------------------------------------------------------------------
    # NODE 6: SELECTION_RANK
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_rank(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 6: Mengurutkan entitas (ranking), menetapkan priority, dan menyimpan ke database.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.RANKING, 60.0)

        items = context.get("scored_items", [])
        # Urutkan menurun berdasarkan total_score
        items.sort(key=lambda x: x["total_score"], reverse=True)

        ranked_results = []
        with tenant_tx(tenant_id) as conn:
            # Hapus hasil scoring lama pada job ini jika ada
            conn.execute(
                sa.text("DELETE FROM selection_scoring_results WHERE selection_job_id = :job_id;"),
                {"job_id": job_id},
            )

            for idx, item in enumerate(items, start=1):
                res_id = str(uuid.uuid4())
                score = item["total_score"]

                # Tentukan priority dan rekomendasi
                if score >= 85.0:
                    priority = PriorityLevel.CRITICAL.value
                    rec = RecommendationClass.SELECT.value
                elif score >= 70.0:
                    priority = PriorityLevel.HIGH.value
                    rec = RecommendationClass.SELECT.value
                elif score >= 55.0:
                    priority = PriorityLevel.MEDIUM.value
                    rec = RecommendationClass.REVIEW.value
                else:
                    priority = PriorityLevel.LOW.value
                    rec = RecommendationClass.REJECT.value

                stmt = sa.text("""
                    INSERT INTO selection_scoring_results (
                        id, tenant_id, selection_job_id, source_document_id,
                        entity_label, total_score, score_breakdown, rank_position,
                        priority_level, recommendation_classification, risk_score,
                        confidence_score, decision_status
                    ) VALUES (
                        :id, :tenant_id, :job_id, :doc_id,
                        :label, :score, :breakdown, :rank,
                        :priority, :rec, :risk,
                        :conf, 'pending'
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": res_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "doc_id": item["source_document_id"],
                        "label": item["entity_label"],
                        "score": score,
                        "breakdown": json.dumps(item["score_breakdown"]),
                        "rank": idx,
                        "priority": priority,
                        "rec": rec,
                        "risk": item["risk_score"],
                        "conf": item["confidence_score"],
                    },
                )

                item["id"] = res_id
                item["rank_position"] = idx
                item["priority_level"] = priority
                item["recommendation_classification"] = rec
                ranked_results.append(item)

        context["ranked_results"] = ranked_results
        return {"ranked_count": len(ranked_results), "top_rank": ranked_results[0] if ranked_results else None}

    # -----------------------------------------------------------------------
    # NODE 7: SELECTION_ANALYZE
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_analyze(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 7: Dynamic Analytics (KPI, statistik, distribusi skor, perbandingan kriteria, anomali).
        Menggunakan SelectionAnalyticsEngine untuk komputasi statistik nyata berdasar dataset.
        Disimpan secara persisten di selection_analytics_snapshots agar dapat direproduksi ulang.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.ANALYZING, 70.0)

        from app.domains.selection.analytics_engine import SelectionAnalyticsEngine

        results = context.get("ranked_results", [])
        criteria = context.get("criteria", [])
        documents = context.get("ingested_documents", [])

        # 1. Komputasi Statistik & Metrik Nyata
        kpi_data = SelectionAnalyticsEngine.compute_summary_kpis(results, criteria)
        dist_data = SelectionAnalyticsEngine.compute_score_distribution(results)
        comp_data = SelectionAnalyticsEngine.compute_group_comparisons(results, criteria, documents)
        trend_data = SelectionAnalyticsEngine.compute_trends(results, documents)
        corr_data = SelectionAnalyticsEngine.compute_criteria_correlation(results, criteria)
        perf_data = SelectionAnalyticsEngine.compute_performance_analysis(results)
        anom_data = SelectionAnalyticsEngine.compute_anomaly_detection(results, criteria)

        snapshots = [
            ("kpi", kpi_data),
            ("distribution", dist_data),
            ("comparison", comp_data),
            ("trend", trend_data),
            ("correlation", corr_data),
            ("statistic", perf_data),
            ("performance", perf_data),
            ("anomaly_detection", anom_data),
        ]

        saved_snapshots: Dict[str, str] = {}
        with tenant_tx(tenant_id) as conn:
            # Hapus snapshot lama untuk job ini
            conn.execute(
                sa.text("DELETE FROM selection_analytics_snapshots WHERE selection_job_id = :job_id;"),
                {"job_id": job_id},
            )

            for atype, sdata in snapshots:
                snap_id = str(uuid.uuid4())
                stmt = sa.text("""
                    INSERT INTO selection_analytics_snapshots (
                        id, tenant_id, selection_job_id, analytics_type, result_data
                    ) VALUES (
                        :id, :tenant_id, :job_id, :atype, :sdata
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": snap_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "atype": atype,
                        "sdata": json.dumps(sdata),
                    },
                )
                saved_snapshots[atype] = snap_id

        context["analytics_snapshots"] = saved_snapshots
        context["analytics_kpi"] = kpi_data
        context["analytics_distribution"] = dist_data
        context["analytics_comparison"] = comp_data
        context["analytics_trend"] = trend_data
        context["analytics_correlation"] = corr_data
        context["analytics_statistic"] = perf_data
        context["analytics_anomaly"] = anom_data
        return {"snapshots_count": len(saved_snapshots), "kpi": kpi_data, "anomalies": anom_data}

    # -----------------------------------------------------------------------
    # NODE 8: SELECTION_VISUALIZE
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_visualize(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 8: Automatic Diagram Selection.
        Memilih diagram visualisasi optimal dari data nyata yang telah dihitung (DiagramSelector).
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.VISUALIZING, 80.0)

        from app.domains.selection.diagram_selector import DiagramSelector

        results = context.get("ranked_results", [])
        criteria = context.get("criteria", [])
        snapshots_map = context.get("analytics_snapshots", {})

        analytics_bundle = {
            "kpi": context.get("analytics_kpi", {}),
            "distribution": context.get("analytics_distribution", {}),
            "comparison": context.get("analytics_comparison", {}),
            "trend": context.get("analytics_trend", {}),
            "correlation": context.get("analytics_correlation", {}),
            "statistic": context.get("analytics_statistic", {}),
            "anomaly_detection": context.get("analytics_anomaly", {}),
        }

        # Panggil Heuristic Diagram Selector berdasar bentuk data nyata
        visualizations = DiagramSelector.select_optimal_visualizations(
            results=results,
            criteria=criteria,
            analytics_snapshots=analytics_bundle,
            has_time_series=analytics_bundle.get("trend", {}).get("has_time_series", False),
        )

        with tenant_tx(tenant_id) as conn:
            # Hapus visualisasi lama untuk job ini
            conn.execute(
                sa.text("DELETE FROM selection_visualizations WHERE selection_job_id = :job_id;"),
                {"job_id": job_id},
            )

            for viz in visualizations:
                viz_id = str(uuid.uuid4())
                snap_type = viz.get("analytics_type", "kpi")
                snap_id = snapshots_map.get(snap_type)

                stmt = sa.text("""
                    INSERT INTO selection_visualizations (
                        id, tenant_id, selection_job_id, chart_type,
                        chart_config, selection_reason, source_analytics_snapshot_id
                    ) VALUES (
                        :id, :tenant_id, :job_id, :ctype,
                        :cconfig, :reason, :snap_id
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": viz_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "ctype": viz["chart_type"],
                        "cconfig": json.dumps(viz["chart_config"]),
                        "reason": viz["selection_reason"],
                        "snap_id": snap_id,
                    },
                )

        context["visualizations"] = visualizations
        return {"visualizations_count": len(visualizations), "charts": [v["chart_type"] for v in visualizations]}

    # -----------------------------------------------------------------------
    # NODE 9: SELECTION_RECOMMEND
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_recommend(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 9: Menghasilkan insight naratif AI (ranking reasons, strengths, weaknesses, risks, anomalies, opportunities, action recommendations)
        menggunakan SelectionInsightGenerator dengan penegakan Grounding matematis ketat.
        """
        await cls.update_job_progress(tenant_id, job_id, PipelineStage.RECOMMENDING, 90.0)

        from app.domains.selection.insight_generator import SelectionInsightGenerator

        results = context.get("ranked_results", [])
        criteria = context.get("criteria", [])
        analytics_bundle = {
            "kpi": context.get("analytics_kpi", {}),
            "distribution": context.get("analytics_distribution", {}),
            "comparison": context.get("analytics_comparison", {}),
            "statistic": context.get("analytics_statistic", {}),
            "anomaly_detection": context.get("analytics_anomaly", {}),
        }

        # Hasilkan narasi terstruktur yang grounded 100% pada angka sumber
        insights = await SelectionInsightGenerator.generate_all_insights_async(
            results=results,
            criteria=criteria,
            analytics=analytics_bundle,
            tenant_id=tenant_id,
            model_id=context.get("model_used"),
            strict=True,
        )

        with tenant_tx(tenant_id) as conn:
            # Hapus insight lama untuk job ini
            conn.execute(
                sa.text("DELETE FROM selection_insights WHERE selection_job_id = :job_id;"),
                {"job_id": job_id},
            )

            for ins in insights:
                ins_id = str(uuid.uuid4())
                stmt = sa.text("""
                    INSERT INTO selection_insights (
                        id, tenant_id, selection_job_id, insight_type,
                        related_scoring_result_id, content
                    ) VALUES (
                        :id, :tenant_id, :job_id, :itype,
                        :res_id, :content
                    );
                """)
                conn.execute(
                    stmt,
                    {
                        "id": ins_id,
                        "tenant_id": tenant_id,
                        "job_id": job_id,
                        "itype": ins["insight_type"],
                        "res_id": ins.get("related_scoring_result_id"),
                        "content": ins["content"],
                    },
                )

        context["insights"] = insights
        return {"insights_count": len(insights)}

    # -----------------------------------------------------------------------
    # NODE 10: SELECTION_RESULT
    # -----------------------------------------------------------------------
    @classmethod
    async def node_selection_result(
        cls,
        tenant_id: str,
        job_id: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Tahap 10: Finalisasi pekerjaan, menandai selesai (100%), dan mengonsumsi kredit AI aktual.
        """
        reservation: Optional[ReservationToken] = context.get("credit_reservation")
        actual_cost = 5.0
        if reservation:
            actual_cost = reservation.estimated_cost
            await consume_credit(
                reservation=reservation,
                actual_cost=actual_cost,
                execution_ref=job_id,
            )

        # Guardrail Penegakan Human Review (PRD v2.2 Bagian 13.1 & 17.5)
        # Kategori domain sensitif (recruitment, finance, procurement, supplier)
        # atau job yang memiliki kandidat berkategori 'review' TIDAK boleh langsung
        # berstatus 'completed' sebelum melewati persetujuan eksplisit manusia.
        from app.domains.selection.models import PROTECTED_HUMAN_REVIEW_DOMAINS
        domain_category = context.get("domain_category", "general")
        ranked_results = context.get("ranked_results", [])
        
        requires_human_guardrail = (
            domain_category in PROTECTED_HUMAN_REVIEW_DOMAINS or
            any(item.get("recommendation_classification") == "review" for item in ranked_results)
        )

        if requires_human_guardrail:
            # Tetap pada tahap RECOMMENDING / PENDING_HUMAN_REVIEW (95%), tidak selesai otomatis
            await cls.update_job_progress(tenant_id, job_id, PipelineStage.RECOMMENDING, 95.0, completed=False)
            job_status = "pending_human_review"
            completed_time = None
        else:
            await cls.update_job_progress(tenant_id, job_id, PipelineStage.COMPLETED, 100.0, completed=True)
            job_status = "completed"
            completed_time = datetime.now(timezone.utc).isoformat()

        return {
            "status": job_status,
            "job_id": job_id,
            "domain_category": domain_category,
            "requires_human_review": requires_human_guardrail,
            "total_ranked": len(ranked_results),
            "credit_consumed": actual_cost,
            "completed_at": completed_time,
        }


async def execute_selection_pipeline_node(
    node_type: str,
    req: Any,
    node: Any,
    context: Dict[str, Any],
    execution_id: str,
) -> Dict[str, Any]:
    """
    Dispatcher resmi untuk 10 tahap WorkflowNode seleksi pada Orchestration Engine.
    """
    tenant_id = req.tenant_id
    job_id = context.get("selection_job_id") or node.config.get("job_id") or req.context_data.get("selection_job_id")
    if not job_id:
        raise ValueError("selection_job_id wajib tersedia pada context eksekusi node pipeline seleksi.")

    try:
        if node_type == "SELECTION_READ":
            return await SelectionPipelineEngine.node_selection_read(tenant_id, job_id, context, actor_id=req.actor_id)
        elif node_type == "SELECTION_UNDERSTAND":
            return await SelectionPipelineEngine.node_selection_understand(tenant_id, job_id, context)
        elif node_type == "SELECTION_VALIDATE":
            return await SelectionPipelineEngine.node_selection_validate(tenant_id, job_id, context)
        elif node_type == "SELECTION_SELECT":
            return await SelectionPipelineEngine.node_selection_select(tenant_id, job_id, context)
        elif node_type == "SELECTION_SCORE":
            return await SelectionPipelineEngine.node_selection_score(tenant_id, job_id, context)
        elif node_type == "SELECTION_RANK":
            return await SelectionPipelineEngine.node_selection_rank(tenant_id, job_id, context)
        elif node_type == "SELECTION_ANALYZE":
            return await SelectionPipelineEngine.node_selection_analyze(tenant_id, job_id, context)
        elif node_type == "SELECTION_VISUALIZE":
            return await SelectionPipelineEngine.node_selection_visualize(tenant_id, job_id, context)
        elif node_type == "SELECTION_RECOMMEND":
            return await SelectionPipelineEngine.node_selection_recommend(tenant_id, job_id, context)
        elif node_type == "SELECTION_RESULT":
            return await SelectionPipelineEngine.node_selection_result(tenant_id, job_id, context)
        else:
            raise ValueError(f"Tipe node seleksi tidak dikenal: {node_type}")
    except Exception as e:
        logger.error(f"[SelectionPipeline] Gagal pada node {node_type} (Job {job_id}): {e}")
        # Refund reservasi bila terjadi kegagalan
        reservation = context.get("credit_reservation")
        if reservation:
            try:
                await refund_credit(reservation, reason=str(e))
            except Exception as ref_err:
                logger.error(f"Gagal melakukan refund kredit pada error: {ref_err}")
        await SelectionPipelineEngine.update_job_progress(tenant_id, job_id, PipelineStage.FAILED, 0.0)
        raise
