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
import os
from fastapi import APIRouter, HTTPException, Query, status, Depends
from fastapi.responses import FileResponse
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
    initiated_by_agent_id: Optional[str] = Field(default=None, max_length=100, description="UUID AI Agent pemicu")


class RerunSelectionJobRequest(StrictSelectionRequestModel):
    title: Optional[str] = Field(default=None, max_length=200, description="Judul baru untuk job rerun")
    instruction_prompt: Optional[str] = Field(default=None, max_length=5000, description="Prompt evaluasi baru atau disesuaikan")
    criteria: Optional[List[Dict[str, Any]]] = Field(default=None, description="Kriteria baru atau disesuaikan")
    calibration_profile_id: Optional[str] = Field(default=None, max_length=100, description="Profil kalibrasi baru")
    initiated_by_agent_id: Optional[str] = Field(default=None, max_length=100, description="UUID AI Agent pemicu")


class ExportSelectionReportRequest(StrictSelectionRequestModel):
    format: Optional[str] = Field(default="pdf", max_length=20, description="Format: pdf, excel, csv")
    report_type: Optional[str] = Field(default="detailed_selection", max_length=50, description="Tipe laporan")


class CreateAutomationTriggerRequest(StrictSelectionRequestModel):
    trigger_name: str = Field(..., min_length=3, max_length=200, description="Nama pemicu otomasi")
    trigger_type: str = Field(..., max_length=50, description="new_file_upload, scheduled, webhook, workflow_trigger")
    trigger_config: Dict[str, Any] = Field(default_factory=dict, description="Konfigurasi pemicu")
    target_agent_id: Optional[str] = Field(default=None, max_length=100, description="UUID AI Agent pelaksana")
    criteria_template: Optional[List[Dict[str, Any]]] = Field(default=None, description="Template kriteria")
    calibration_profile_id: Optional[str] = Field(default=None, max_length=100, description="UUID profil kalibrasi")
    is_active: bool = Field(default=True, description="Status aktif")


class UpdateAutomationTriggerRequest(StrictSelectionRequestModel):
    trigger_name: Optional[str] = Field(default=None, max_length=200)
    trigger_config: Optional[Dict[str, Any]] = Field(default=None)
    target_agent_id: Optional[str] = Field(default=None, max_length=100)
    criteria_template: Optional[List[Dict[str, Any]]] = Field(default=None)
    calibration_profile_id: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = Field(default=None)


class FileUploadEventRequest(StrictSelectionRequestModel):
    document_name: str = Field(..., min_length=1, max_length=200)
    raw_text: Optional[str] = Field(default=None, max_length=50000)
    file_artifact_id: Optional[str] = Field(default=None, max_length=100)


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
    decision: Optional[str] = Field(default=None, max_length=50, description="Keputusan tinjauan: approved, rejected, overridden")
    decision_status: Optional[str] = Field(default=None, max_length=50, description="Status keputusan baru")
    override_score: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Skor override manusia jika disesuaikan")
    override_rank: Optional[int] = Field(default=None, ge=1, description="Posisi peringkat baru jika overridden")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan justifikasi tinjauan manusia")
    reviewer_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan justifikasi tinjauan manusia")
    reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID reviewer manusia")


class FinalizeJobRequest(StrictSelectionRequestModel):
    reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID peninjau / direktur")
    approval_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan persetujuan akhir")


class CalibrateJobRequest(StrictSelectionRequestModel):
    human_feedback_notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan umpan balik kalibrasi")
    criteria_adjustments: Optional[Dict[str, float]] = Field(default=None, description="Faktor penyesuaian bobot per kriteria")
    human_reviewer_id: Optional[str] = Field(default=None, max_length=100, description="UUID peninjau kalibrasi")


class CalibrationItemPayload(StrictSelectionRequestModel):
    field_type_name: str = Field(..., min_length=1, max_length=200, description="Nama field tipe dari preferensi user")
    percentage: float = Field(..., ge=0.0, le=100.0, description="Persentase bobot kriteria (0-100)")
    display_order: Optional[int] = Field(default=0, ge=0, description="Urutan tampilan item")


class CreateCalibrationProfileRequest(StrictSelectionRequestModel):
    profile_name: str = Field(..., min_length=1, max_length=200, description="Nama profil kalibrasi")
    domain_category: Optional[str] = Field(default=None, max_length=100, description="Kategori domain opsional")
    created_by_membership_id: Optional[str] = Field(default=None, max_length=100, description="UUID keanggotaan pembuat")
    items: Optional[List[CalibrationItemPayload]] = Field(default=None, description="Daftar awal item kalibrasi")


class CreateCalibrationItemRequest(StrictSelectionRequestModel):
    field_type_name: str = Field(..., min_length=1, max_length=200, description="Nama field tipe dari preferensi user")
    percentage: float = Field(..., ge=0.0, le=100.0, description="Persentase bobot kriteria (0-100)")
    display_order: Optional[int] = Field(default=0, ge=0, description="Urutan tampilan item")


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
            initiated_by_agent_id=request.initiated_by_agent_id,
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


@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/audit-lifecycle")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/audit-lifecycle")
async def get_selection_job_audit_lifecycle(tenant_id: str, job_id: str):
    """
    Mengambil jejak audit komprehensif seluruh siklus hidup pekerjaan seleksi:
    Prompt instruksi awal & kriteria, dokumen sumber dataset, agen AI eksekutor beserta verifikasi ABAC,
    hasil scoring & perangkingan entitas, keputusan approval & review manusia, riwayat ekspor laporan berkas nyata,
    dan rantai kronologis seluruh kejadian dari Audit Ledger (company_context_events).
    """
    try:
        lifecycle_audit = SelectionDomainService.get_job_audit_lifecycle(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": lifecycle_audit}
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


# ---------------------------------------------------------------------------
# BAGIAN B: Riwayat Seleksi, Rerun & Perbandingan (Compare)
# ---------------------------------------------------------------------------

@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/rerun")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/rerun")
async def create_selection_rerun(tenant_id: str, job_id: str, request: RerunSelectionJobRequest):
    """
    Membuat pekerjaan seleksi baru dari pekerjaan yang sudah ada dengan variasi kriteria/kalibrasi.
    Mencatat diff kriteria ke selection_reruns.
    """
    try:
        result = SelectionDomainService.create_rerun(
            tenant_id=tenant_id,
            original_job_id=job_id,
            title=request.title,
            instruction_prompt=request.instruction_prompt,
            criteria=request.criteria,
            calibration_profile_id=request.calibration_profile_id,
            initiated_by_agent_id=request.initiated_by_agent_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/reruns")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/reruns")
async def get_selection_reruns(tenant_id: str, job_id: str):
    """Mengambil riwayat eksekusi ulang (rerun) yang terhubung dengan pekerjaan seleksi."""
    try:
        reruns = SelectionDomainService.get_job_reruns(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "data": reruns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/jobs/{job_id}/compare/{target_job_id}")
@router.get("/selection/tenants/{tenant_id}/jobs/{job_id}/compare/{target_job_id}")
async def compare_selection_jobs(tenant_id: str, job_id: str, target_job_id: str):
    """
    Membandingkan dua pekerjaan seleksi berdampingan:
    Menghitung perbedaan peringkat dan skor per entitas yang sama dari hasil komputasi nyata.
    """
    try:
        comparison = SelectionDomainService.compare_jobs(
            tenant_id=tenant_id,
            job_id_1=job_id,
            job_id_2=target_job_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": comparison}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# BAGIAN C: Ekspor Laporan Nyata & Audit Ledger (PDF, Excel, CSV)
# ---------------------------------------------------------------------------

@router.post("/tenants/{tenant_id}/selection/{job_id}/export")
@router.post("/tenants/{tenant_id}/selection/jobs/{job_id}/export")
@router.post("/selection/tenants/{tenant_id}/jobs/{job_id}/export")
async def export_selection_report(tenant_id: str, job_id: str, request: ExportSelectionReportRequest):
    """
    Menghasilkan dokumen laporan nyata dalam format PDF, Excel (xlsx), atau CSV,
    menyimpannya ke penyimpanan aman, dan mencatat ekspor ke Audit Ledger.
    """
    try:
        report_meta = SelectionDomainService.export_report(
            tenant_id=tenant_id,
            job_id=job_id,
            export_format=request.format or "pdf",
            report_type=request.report_type or "detailed_selection",
        )
        return {"status": "success", "tenant_id": tenant_id, "data": report_meta}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/reports/download")
async def download_selection_report(tenant_id: str, filename: str):
    """Mengunduh berkas laporan hasil ekspor."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join("storage_data", "documents", "tenants", tenant_id, "selection_reports", safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Berkas laporan tidak ditemukan.")

    media_type = "application/octet-stream"
    if safe_filename.endswith(".csv"):
        media_type = "text/csv"
    elif safe_filename.endswith(".xlsx"):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif safe_filename.endswith(".pdf"):
        media_type = "application/pdf"

    return FileResponse(file_path, filename=safe_filename, media_type=media_type)


# ---------------------------------------------------------------------------
# BAGIAN D: Tinjauan Manusia & Persetujuan (Human Review & Approval)
# ---------------------------------------------------------------------------

@router.patch("/tenants/{tenant_id}/selection/results/{result_id}/review")
@router.post("/tenants/{tenant_id}/selection/results/{result_id}/review")
async def review_selection_result(tenant_id: str, result_id: str, request: SubmitReviewRequest):
    """
    Tinjauan manusia terhadap hasil skor kandidat individual.
    Mendukung keputusan: approved, rejected, overridden.
    Wajib menyertakan catatan untuk keputusan rejected atau overridden.
    Menyimpan previous_rank_position dan merekam audit trail perubahan manual.
    """
    try:
        decision_val = request.decision or request.decision_status or "approved"
        notes_val = request.notes or request.reviewer_notes

        result = SelectionDomainService.submit_result_review(
            tenant_id=tenant_id,
            result_id=result_id,
            decision=decision_val,
            override_rank=request.override_rank,
            override_score=request.override_score,
            notes=notes_val,
            reviewer_id=request.reviewer_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# BAGIAN E: Integrasi AI Agent & 15 Jabatan Utama
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/eligible-agents")
@router.get("/selection/tenants/{tenant_id}/eligible-agents")
async def get_selection_eligible_agents(tenant_id: str):
    """Mengambil daftar AI Agent organisasi yang relevan dengan 15 Jabatan Utama."""
    try:
        agents = SelectionDomainService.list_eligible_agents(tenant_id)
        return {"status": "success", "tenant_id": tenant_id, "data": agents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# BAGIAN F: Otomasi Seleksi Proaktif & Pemicu (Automation Triggers)
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/triggers")
@router.get("/selection/tenants/{tenant_id}/triggers")
async def list_selection_triggers(tenant_id: str):
    """Mengambil daftar pemicu seleksi otomatis (terjadwal, berkas, webhook)."""
    try:
        triggers = SelectionDomainService.list_automation_triggers(tenant_id)
        return {"status": "success", "tenant_id": tenant_id, "data": triggers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/triggers")
@router.post("/selection/tenants/{tenant_id}/triggers")
async def create_selection_trigger(tenant_id: str, request: CreateAutomationTriggerRequest):
    """Membuat pemicu seleksi otomatis baru."""
    try:
        trigger = SelectionDomainService.create_automation_trigger(
            tenant_id=tenant_id,
            trigger_name=request.trigger_name,
            trigger_type=request.trigger_type,
            trigger_config=request.trigger_config,
            target_agent_id=request.target_agent_id,
            criteria_template=request.criteria_template,
            calibration_profile_id=request.calibration_profile_id,
            is_active=request.is_active,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": trigger}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tenants/{tenant_id}/selection/triggers/{trigger_id}")
@router.put("/selection/tenants/{tenant_id}/triggers/{trigger_id}")
async def update_selection_trigger(tenant_id: str, trigger_id: str, request: UpdateAutomationTriggerRequest):
    """Memperbarui konfigurasi pemicu seleksi otomatis."""
    try:
        result = SelectionDomainService.update_automation_trigger(
            tenant_id=tenant_id,
            trigger_id=trigger_id,
            trigger_name=request.trigger_name,
            trigger_config=request.trigger_config,
            target_agent_id=request.target_agent_id,
            criteria_template=request.criteria_template,
            calibration_profile_id=request.calibration_profile_id,
            is_active=request.is_active,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tenants/{tenant_id}/selection/triggers/{trigger_id}")
@router.delete("/selection/tenants/{tenant_id}/triggers/{trigger_id}")
async def delete_selection_trigger(tenant_id: str, trigger_id: str):
    """Menghapus pemicu seleksi otomatis."""
    try:
        result = SelectionDomainService.delete_automation_trigger(tenant_id, trigger_id)
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/triggers/{trigger_id}/execute")
@router.post("/selection/tenants/{tenant_id}/triggers/{trigger_id}/execute")
async def execute_selection_trigger(tenant_id: str, trigger_id: str):
    """Mengeksekusi pemicu seleksi otomatis secara manual atau terjadwal."""
    try:
        result = await SelectionDomainService.execute_automation_trigger(
            tenant_id=tenant_id,
            trigger_id=trigger_id,
            execution_source="manual_dispatch",
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/triggers/executions")
@router.get("/selection/tenants/{tenant_id}/triggers/executions")
async def list_selection_trigger_executions(tenant_id: str, trigger_id: Optional[str] = Query(None)):
    """Mengambil riwayat log eksekusi pemicu seleksi otomatis."""
    try:
        executions = SelectionDomainService.list_automation_executions(tenant_id, trigger_id)
        return {"status": "success", "tenant_id": tenant_id, "data": executions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/triggers/file-upload-event")
async def file_upload_selection_event(tenant_id: str, request: FileUploadEventRequest):
    """Event webhook internal saat berkas baru diunggah untuk memicu seleksi proaktif."""
    try:
        results = await SelectionDomainService.handle_file_upload_event(
            tenant_id=tenant_id,
            document_name=request.document_name,
            raw_text=request.raw_text,
            file_artifact_id=request.file_artifact_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "triggered_count": len(results), "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# BAGIAN G: Profil Kalibrasi Seleksi (Selection Calibration Profiles)
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/selection/calibration-profiles", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.get("/selection/tenants/{tenant_id}/calibration-profiles", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def list_calibration_profiles(tenant_id: str, domain_category: Optional[str] = Query(None)):
    """Mengambil seluruh profil kalibrasi seleksi aktif milik tenant."""
    try:
        profiles = SelectionDomainService.list_calibration_profiles(tenant_id, domain_category)
        return {"status": "success", "tenant_id": tenant_id, "data": profiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/calibration-profiles", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.post("/selection/tenants/{tenant_id}/calibration-profiles", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def create_calibration_profile(tenant_id: str, request: CreateCalibrationProfileRequest):
    """Membuat profil kalibrasi seleksi baru beserta daftar item tipe dan persentase."""
    try:
        items_data = [item.model_dump() for item in request.items] if request.items else None
        profile = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name=request.profile_name,
            domain_category=request.domain_category,
            created_by_membership_id=request.created_by_membership_id,
            items=items_data,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": profile}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/selection/calibration-profiles/{profile_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.get("/selection/tenants/{tenant_id}/calibration-profiles/{profile_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def get_calibration_profile(tenant_id: str, profile_id: str):
    """Mengambil detail profil kalibrasi spesifik beserta seluruh item kriteria."""
    try:
        profile = SelectionDomainService.get_calibration_profile(tenant_id, profile_id)
        return {"status": "success", "tenant_id": tenant_id, "data": profile}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/selection/calibration-profiles/{profile_id}/items", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.post("/selection/tenants/{tenant_id}/calibration-profiles/{profile_id}/items", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def add_calibration_profile_item(tenant_id: str, profile_id: str, request: CreateCalibrationItemRequest):
    """Menambahkan baris item kalibrasi baru (Field Nama Tipe + Persentase) ke profil."""
    try:
        updated_profile = SelectionDomainService.add_calibration_item(
            tenant_id=tenant_id,
            profile_id=profile_id,
            field_type_name=request.field_type_name,
            percentage=request.percentage,
            display_order=request.display_order or 0,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": updated_profile}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tenants/{tenant_id}/selection/calibration-profiles/{profile_id}/items/{item_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.delete("/selection/tenants/{tenant_id}/calibration-profiles/{profile_id}/items/{item_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def delete_calibration_profile_item(tenant_id: str, profile_id: str, item_id: str):
    """Menghapus item kalibrasi dari profil."""
    try:
        updated_profile = SelectionDomainService.delete_calibration_item(
            tenant_id=tenant_id,
            profile_id=profile_id,
            item_id=item_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": updated_profile}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tenants/{tenant_id}/selection/calibration-profiles/{profile_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
@router.delete("/selection/tenants/{tenant_id}/calibration-profiles/{profile_id}", dependencies=[Depends(require_capability("selection.calibration.manage"))])
async def delete_calibration_profile(tenant_id: str, profile_id: str):
    """Menghapus profil kalibrasi seleksi beserta seluruh itemnya."""
    try:
        result = SelectionDomainService.delete_calibration_profile(tenant_id, profile_id)
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

