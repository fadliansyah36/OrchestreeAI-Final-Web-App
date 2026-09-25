"""Universal AI Selection & Intelligence API (PRD v2.2 Bagian 13.1 & 17.5)

Menyediakan REST endpoint untuk:
- Manajemen Pekerjaan Seleksi Multi-Kategori (Rekrutmen, Vendor, Keuangan, Penjualan, Operasional)
- Multi-Source Ingestion (Berkas Excel/CSV/PDF, Prompt Langsung, Integrasi Fabric, Omnichannel Forward)
- Eksekusi 10 Tahap Pipeline Seleksi via Cognitive Orchestration Engine
- Scoring Deterministik & Grounding Enforcement Matematis
- Dynamic Analytics Snapshot & Automatic Diagram Selection
- Sintesis Narasi Insight & Rekomendasi Tindakan AI
- Human Review Gate & Audit Trail Persetujuan
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field, ConfigDict
from app.authz.pdp import require_capability

from app.domains.selection.models import (
    PipelineStage,
    SourceChannel,
    CriteriaSourceType,
    DecisionStatus,
)
from app.domains.selection.service import SelectionDomainService

router = APIRouter(
    prefix="",
    tags=["Universal Selection Hub & Scoring"],
    dependencies=[Depends(require_capability("selection.hub.manage"))]
)


class StrictSelectionRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateSelectionJobRequest(StrictSelectionRequestModel):
    title: str = Field(..., min_length=3, max_length=200, description="Judul pekerjaan seleksi")
    instruction_prompt: Optional[str] = Field(default=None, max_length=5000, description="Perintah instruksi evaluasi seleksi")
    description: Optional[str] = Field(default=None, max_length=2000, description="Deskripsi kualifikasi atau lingkup seleksi")
    domain_category: Optional[str] = Field(default=None, max_length=100, description="Kategori domain: recruitment, supplier, finance, sales, general")
    category: Optional[str] = Field(default=None, max_length=100, description="Kategori kompatibilitas mundur")
    calibration_profile_id: Optional[str] = Field(default=None, max_length=100, description="UUID profil kalibrasi (jika ada)")
    criteria: Optional[List[Dict[str, Any]]] = Field(default=None, description="Daftar kriteria evaluasi")
    weights: Optional[Dict[str, float]] = Field(default=None, description="Bobot kriteria awal")
    source_documents: Optional[List[Dict[str, Any]]] = Field(default=None, description="Dokumen awal yang disertakan")


class UploadDocumentRequest(StrictSelectionRequestModel):
    document_name: Optional[str] = Field(default=None, max_length=200, description="Nama berkas atau label dokumen")
    candidate_name: Optional[str] = Field(default=None, max_length=200, description="Nama kandidat atau vendor")
    source_type: Optional[str] = Field(default="RESUME", max_length=100, description="Jenis berkas sumber (kompatibilitas)")
    source_channel: Optional[SourceChannel] = Field(default=SourceChannel.FILE_UPLOAD, description="Kanal sumber: file_upload, prompt_text, api, dst")
    raw_text: Optional[str] = Field(default=None, max_length=50000, description="Teks konten dokumen untuk ekstraksi")
    file_url: Optional[str] = Field(default=None, max_length=2000, description="URL berkas")
    file_artifact_id: Optional[str] = Field(default=None, max_length=100, description="UUID berkas di file_artifacts")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Metadata saluran tambahan")


class ExecutePipelineRequest(StrictSelectionRequestModel):
    model_used: Optional[str] = Field(default="meta-llama/llama-3.3-70b-instruct", max_length=100, description="Identifier model LLM")
    actor_id: Optional[str] = Field(default=None, max_length=100, description="UUID aktor pelaksana")
    actor_type: Optional[str] = Field(default="human_user", max_length=50, description="Tipe aktor: human_user atau ai_agent")


class SubmitReviewRequest(StrictSelectionRequestModel):
    decision: Optional[str] = Field(default=None, max_length=50, description="Keputusan tinjauan: approved, rejected, overridden (atau ACCEPTED, OVERRIDDEN, REJECTED)")
    decision_status: Optional[str] = Field(default=None, max_length=50, description="Status keputusan baru")
    override_score: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Skor override manusia jika disesuaikan")
    reviewer_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan justifikasi tinjauan manusia")
    reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID reviewer manusia")


class FinalizeJobRequest(StrictSelectionRequestModel):
    reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID peninjau / direktur")
    approval_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan persetujuan akhir")


class CalibrateJobRequest(StrictSelectionRequestModel):
    human_feedback_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan umpan balik kalibrasi")
    criteria_adjustments: Optional[Dict[str, float]] = Field(default=None, description="Faktor penyesuaian bobot per kriteria")
    human_reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID peninjau kalibrasi")


# ---------------------------------------------------------------------------
# Katalog Domain Categories
# ---------------------------------------------------------------------------

@router.get("/selection/domain-categories")
@router.get("/selection/tenants/{tenant_id}/domain-categories")
async def get_selection_domain_categories():
    """Mengambil katalog kategori domain evaluasi seleksi."""
    try:
        categories = SelectionDomainService.get_domain_categories()
        return {"status": "success", "data": categories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Pekerjaan Seleksi (Jobs)
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/jobs")
@router.get("/selection/tenants/{tenant_id}/jobs")
@router.get("/tenants/{tenant_id}/jobs")
async def list_selection_jobs(
    tenant_id: str,
    domain_category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """Mengambil seluruh pekerjaan seleksi organisasi."""
    try:
        jobs = SelectionDomainService.list_jobs(
            tenant_id=tenant_id,
            domain_category=domain_category,
            pipeline_stage=status,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/jobs")
@router.post("/selection/tenants/{tenant_id}/jobs")
@router.post("/tenants/{tenant_id}/jobs")
async def create_selection_job(tenant_id: str, request: CreateSelectionJobRequest):
    """Membuat pekerjaan seleksi baru."""
    try:
        prompt = request.instruction_prompt or request.description or f"Seleksi cerdas untuk {request.title}"
        domain_cat = request.domain_category or (request.category.lower() if request.category else "general")

        job = SelectionDomainService.create_job(
            tenant_id=tenant_id,
            title=request.title,
            instruction_prompt=prompt,
            domain_category=domain_cat,
            calibration_profile_id=request.calibration_profile_id,
            criteria=request.criteria,
            source_documents=request.source_documents,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": job}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}")
@router.get("/tenants/{tenant_id}/jobs/{job_id}")
async def get_selection_job_detail(tenant_id: str, job_id: str):
    """Mengambil rincian pekerjaan seleksi beserta kriteria dan progres."""
    try:
        job = SelectionDomainService.get_job_detail(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "data": job}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Multi-Source Document Ingestion
# ---------------------------------------------------------------------------

@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/documents")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/documents")
@router.post("/tenants/{tenant_id}/jobs/{job_id}/documents")
async def upload_source_document(tenant_id: str, job_id: str, request: UploadDocumentRequest):
    """Menambahkan dokumen sumber pelamar/vendor ke pekerjaan seleksi."""
    try:
        channel_val = request.source_channel.value if isinstance(request.source_channel, SourceChannel) else str(request.source_channel)
        doc_name = request.document_name or request.candidate_name or "Dokumen Sumber"
        raw_text = request.raw_text or ""
        if request.candidate_name and request.candidate_name not in raw_text:
            raw_text = f"Nama Entitas: {request.candidate_name}\n" + raw_text

        doc = SelectionDomainService.add_source_document(
            tenant_id=tenant_id,
            job_id=job_id,
            source_channel=channel_val,
            raw_text=raw_text,
            file_artifact_id=request.file_artifact_id,
            document_name=doc_name,
        )
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": doc}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Eksekusi Pipeline 10 Tahap via Orchestration Engine
# ---------------------------------------------------------------------------

@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/run")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/run")
@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/score")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/score")
@router.post("/tenants/{tenant_id}/jobs/{job_id}/score")
async def execute_selection_pipeline(
    tenant_id: str,
    job_id: str,
    request: Optional[ExecutePipelineRequest] = None,
):
    """
    Menjalankan alur 10 tahap pipeline seleksi kognitif melalui Orchestration Engine.
    Tahap: READ -> UNDERSTAND -> VALIDATE -> SELECT -> SCORE -> RANK -> ANALYZE -> VISUALIZE -> RECOMMEND -> RESULT.
    """
    try:
        actor_id = request.actor_id if request else None
        actor_type = request.actor_type if request else "human_user"

        result = await SelectionDomainService.run_pipeline(
            tenant_id=tenant_id,
            job_id=job_id,
            actor_id=actor_id,
            actor_type=actor_type,
        )
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Hasil Scoring & Ranking
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/results")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/results")
async def get_selection_results(tenant_id: str, job_id: str):
    """Mengambil hasil scoring berbobot dan perangkingan entitas."""
    try:
        results = SelectionDomainService.get_job_results(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Insight Naratif AI
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/insights")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/insights")
async def get_selection_insights(tenant_id: str, job_id: str):
    """Mengambil insight naratif AI (ranking reasons, strengths, weaknesses, risks, recommendations)."""
    try:
        insights = SelectionDomainService.get_job_insights(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Analitik Dinamis Tersimpan
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/analytics")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/analytics")
@router.get("/tenants/{tenant_id}/jobs/{job_id}/analytics")
async def get_selection_analytics(tenant_id: str, job_id: str):
    """Mengambil snapshot analitik dinamis (KPI, distribusi, statistik, perbandingan)."""
    try:
        analytics = SelectionDomainService.get_job_analytics(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": analytics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Visualisasi Otomatis
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/visualizations")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/visualizations")
async def get_selection_visualizations(tenant_id: str, job_id: str):
    """Mengambil diagram visualisasi data yang dipilih secara otomatis oleh AI."""
    try:
        visualizations = SelectionDomainService.get_job_visualizations(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": visualizations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Human Review Gate
# ---------------------------------------------------------------------------

@router.post("/tenants/{tenant_id}/selection/scores/{score_id}/review")
@router.post("/selection/tenants/{tenant_id}/scores/{score_id}/review")
@router.post("/tenants/{tenant_id}/scores/{score_id}/review")
async def submit_human_review(tenant_id: str, score_id: str, request: SubmitReviewRequest):
    """Mencatat keputusan tinjauan manusia terhadap hasil scoring kandidat/vendor."""
    try:
        decision_raw = request.decision_status or request.decision or "approved"
        # Normalisasi status
        norm_status = decision_raw.lower()
        if norm_status in ["accepted", "approved"]:
            norm_status = "approved"
        elif norm_status in ["overridden", "override"]:
            norm_status = "overridden"
        elif norm_status in ["rejected", "reject"]:
            norm_status = "rejected"
        else:
            norm_status = "approved"

        result = SelectionDomainService.submit_review(
            tenant_id=tenant_id,
            score_id=score_id,
            decision_status=norm_status,
            reviewer_notes=request.reviewer_notes,
            reviewer_id=request.reviewer_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/finalize")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/finalize")
async def finalize_selection_job(tenant_id: str, job_id: str, request: FinalizeJobRequest):
    """Mengesahkan dan menyelesaikan pekerjaan seleksi secara final (Audit Trail)."""
    try:
        result = SelectionDomainService.finalize_job(
            tenant_id=tenant_id,
            job_id=job_id,
            reviewer_id=request.reviewer_id,
            approval_notes=request.approval_notes,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/calibrate")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/calibrate")
async def calibrate_selection_job(tenant_id: str, job_id: str, request: CalibrateJobRequest):
    """Mengkalibrasi bobot kriteria evaluasi seleksi secara dinamis."""
    try:
        result = SelectionDomainService.calibrate_job(
            tenant_id=tenant_id,
            job_id=job_id,
            human_feedback_notes=request.human_feedback_notes,
            criteria_adjustments=request.criteria_adjustments,
            human_reviewer_id=request.human_reviewer_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

