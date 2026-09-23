"""Universal Selection Hub & Scoring Engine API (Bagian 13.1, 17.5)

Menyediakan REST endpoint untuk:
- Manajemen Pekerjaan Seleksi Multi-Kategori (Rekrutmen, Vendor, Tender)
- Multi-Source Upload & Data Understanding (LLM Parsing)
- Kalibrasi Berkelanjutan Bobot Kriteria Berdasarkan Umpan Balik Reviewer
- Scoring Deterministik & Perangkingan dengan Reproducibility Hash (SHA-256)
- Human Review Gate Wajib Sebelum Persetujuan Akhir
- Analitik Distribusi Skor & Audit Trail
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field
from app.authz.pdp import require_capability

from orchestree.domains.selection.scoring import (
    UniversalSelectionService,
    SelectionJobCategory,
    SourceDocumentType,
    HumanReviewStatus,
)

router = APIRouter(
    prefix="/selection",
    tags=["Universal Selection Hub & Scoring"],
    dependencies=[Depends(require_capability("selection.hub.manage"))]
)


class CreateSelectionJobRequest(BaseModel):
    title: str = Field(..., description="Judul pekerjaan seleksi")
    category: SelectionJobCategory = Field(default=SelectionJobCategory.RECRUITMENT, description="Kategori seleksi")
    description: Optional[str] = Field(default=None, description="Deskripsi kualifikasi atau lingkup seleksi")
    criteria: Optional[List[Dict[str, Any]]] = Field(default=None, description="Daftar kriteria evaluasi")
    weights: Optional[Dict[str, float]] = Field(default=None, description="Bobot kriteria (akan dinormalisasi ke total 1.0)")


class UploadDocumentRequest(BaseModel):
    document_name: str = Field(..., description="Nama berkas (misal: Resume_John.pdf)")
    candidate_name: str = Field(..., description="Nama kandidat atau vendor")
    source_type: SourceDocumentType = Field(default=SourceDocumentType.RESUME, description="Jenis berkas sumber")
    candidate_email: Optional[str] = Field(default=None, description="Email kandidat/vendor")
    candidate_phone: Optional[str] = Field(default=None, description="Nomor telepon kandidat/vendor")
    raw_text: Optional[str] = Field(default=None, description="Teks konten dokumen untuk ekstraksi data understanding")
    file_url: Optional[str] = Field(default=None, description="URL berkas")


class CalibrateWeightsRequest(BaseModel):
    human_feedback_notes: str = Field(..., min_length=5, description="Catatan panduan penyesuaian bobot dari reviewer")
    criteria_adjustments: Dict[str, float] = Field(..., description="Faktor pengali per kriteria (misal: {'tech_depth': 1.2, 'culture_fit': 0.8})")
    human_reviewer_id: Optional[str] = Field(default=None, description="UUID reviewer manusia")


class ExecuteScoringRequest(BaseModel):
    model_used: Optional[str] = Field(default="meta-llama/llama-3.3-70b-instruct", description="Identifier model LLM")


class SubmitReviewRequest(BaseModel):
    decision: HumanReviewStatus = Field(..., description="Keputusan tinjauan: ACCEPTED, OVERRIDDEN, REJECTED")
    override_score: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Skor override manusia jika disesuaikan")
    reviewer_notes: str = Field(..., min_length=5, description="Catatan justifikasi tinjauan manusia")
    reviewer_id: Optional[str] = Field(default=None, description="UUID reviewer manusia")


class FinalizeJobRequest(BaseModel):
    reviewer_id: str = Field(..., description="UUID penanggung jawab persetujuan")
    approval_notes: str = Field(..., min_length=10, description="Catatan persetujuan akhir komprehensif")


@router.get("/tenants/{tenant_id}/jobs")
async def list_selection_jobs(tenant_id: str, status: Optional[str] = Query(None)):
    """Mengambil seluruh pekerjaan seleksi organisasi."""
    try:
        jobs = UniversalSelectionService.get_jobs(tenant_id, status=status)
        return {"status": "success", "tenant_id": tenant_id, "data": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/jobs")
async def create_selection_job(tenant_id: str, request: CreateSelectionJobRequest):
    """Membuat pekerjaan seleksi baru."""
    try:
        job = UniversalSelectionService.create_selection_job(
            tenant_id=tenant_id,
            title=request.title,
            category=request.category,
            description=request.description,
            criteria=request.criteria,
            weights=request.weights,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": job}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tenants/{tenant_id}/jobs/{job_id}")
async def get_selection_job_detail(tenant_id: str, job_id: str):
    """Mengambil rincian pekerjaan seleksi beserta dokumen, hasil scoring, dan riwayat kalibrasi."""
    try:
        job = UniversalSelectionService.get_job_detail(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "data": job}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/jobs/{job_id}/documents")
async def upload_source_document(tenant_id: str, job_id: str, request: UploadDocumentRequest):
    """Menambahkan dokumen sumber pelamar/vendor ke pekerjaan seleksi dan mengekstraksi fiturnya."""
    try:
        doc = UniversalSelectionService.upload_source_document(
            tenant_id=tenant_id,
            job_id=job_id,
            document_name=request.document_name,
            candidate_name=request.candidate_name,
            source_type=request.source_type,
            candidate_email=request.candidate_email,
            candidate_phone=request.candidate_phone,
            raw_text=request.raw_text,
            file_url=request.file_url,
        )
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": doc}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/jobs/{job_id}/calibrate")
async def calibrate_selection_weights(tenant_id: str, job_id: str, request: CalibrateWeightsRequest):
    """Mengadaptasi bobot kriteria berlandaskan umpan balik manusia dan mencatat ke audit trail."""
    try:
        result = UniversalSelectionService.calibrate_weights(
            tenant_id=tenant_id,
            job_id=job_id,
            human_feedback_notes=request.human_feedback_notes,
            criteria_adjustments=request.criteria_adjustments,
            human_reviewer_id=request.human_reviewer_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/jobs/{job_id}/score")
async def execute_scoring_and_ranking(tenant_id: str, job_id: str, request: ExecuteScoringRequest):
    """Menjalankan scoring deterministik, menghasilkan Reproducibility Hash, dan menyusun ranking."""
    try:
        job = UniversalSelectionService.execute_scoring_and_ranking(
            tenant_id=tenant_id,
            job_id=job_id,
            model_used=request.model_used or "meta-llama/llama-3.3-70b-instruct",
        )
        return {"status": "success", "tenant_id": tenant_id, "job_id": job_id, "data": job}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/scores/{score_id}/review")
async def submit_human_review(tenant_id: str, score_id: str, request: SubmitReviewRequest):
    """Mencatat keputusan tinjauan manusia (wajib untuk integritas audit)."""
    try:
        result = UniversalSelectionService.submit_human_review(
            tenant_id=tenant_id,
            scoring_result_id=score_id,
            human_decision=request.decision,
            human_override_score=request.override_score,
            human_reviewer_notes=request.reviewer_notes,
            human_reviewer_id=request.reviewer_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/jobs/{job_id}/finalize")
async def finalize_selection_job(tenant_id: str, job_id: str, request: FinalizeJobRequest):
    """
    Menyetujui hasil seleksi secara final (FINAL_APPROVED).
    Menolak jika Human Review pada setiap kandidat belum diselesaikan!
    """
    try:
        job = UniversalSelectionService.finalize_selection_job(
            tenant_id=tenant_id,
            job_id=job_id,
            human_reviewer_id=request.reviewer_id,
            human_review_notes=request.approval_notes,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": job}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/jobs/{job_id}/analytics")
async def get_selection_analytics(tenant_id: str, job_id: str):
    """Mengambil analitik distribusi, rerata kriteria, dan verifikasi hash reproduksibilitas."""
    try:
        analytics = UniversalSelectionService.get_selection_analytics(tenant_id, job_id)
        return {"status": "success", "tenant_id": tenant_id, "data": analytics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
