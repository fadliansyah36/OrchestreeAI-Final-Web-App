"""
OrchestreeAI Memory & Hybrid Search Endpoints (PRD v2.2 Bagian 8.4 & 11.5)
Endpoints:
- GET /api/v1/tenants/{tenant_id}/memory/search: Pencarian hybrid kNN HNSW + full-text RRF
- POST /api/v1/tenants/{tenant_id}/memory/documents: Penambahan dokumen memori Company Brain
- POST /api/v1/tenants/{tenant_id}/memory/consolidate: Memicu job peluruhan confidence memori
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Query, Path
from pydantic import BaseModel, Field

from app.domains.memory.engine import (
    get_memory_engine,
    MemoryDocumentCreate,
    MemorySearchResult,
)
from app.authz.pdp import SubjectContext, authorize, ResourceContext

router = APIRouter(prefix="/api/v1", tags=["Memory & Hybrid Search"])


class DocumentCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, description="Judul dokumen memori")
    content: str = Field(..., min_length=5, description="Isi dokumen memori")
    summary: Optional[str] = Field(None, description="Ringkasan opsional")
    category: str = Field("knowledge", description="Kategori: knowledge, sop, policy, client_crm, financial")
    source_type: str = Field("manual", description="manual, sop, workflow_execution, agent_reflection, conversation, document_upload")
    source_id: Optional[str] = None
    data_classification: str = Field("internal", description="public, internal, confidential, restricted")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.get("/tenants/{tenant_id}/memory/search", response_model=List[MemorySearchResult])
async def search_tenant_memory(
    tenant_id: str = Path(..., description="ID Tenant"),
    q: str = Query(..., min_length=1, description="Kata kunci atau pertanyaan semantik"),
    category: Optional[str] = Query(None, description="Filter kategori memori"),
    top_k: int = Query(5, ge=1, le=20, description="Batas hasil yang dikembalikan"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("STAFF_AI,EMPLOYEE", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("memory.search,data.read", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Pencarian hybrid multi-modal teks & vektor memori Company Brain.
    Tervalidasi secara ketat oleh isolasi RLS dan filter ABAC/PDP per entitas data.
    """
    roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=tenant_id,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
    )

    # Validasi awal kapabilitas memori
    pdp_decision = await authorize(
        subject=subject,
        resource=ResourceContext(
            tenant_id=tenant_id,
            resource_type="memory",
            resource_id="global_search",
        ),
        action="memory.search",
    )
    if not pdp_decision.is_authorized:
        raise HTTPException(
            status_code=403,
            detail=f"Akses pencarian memori ditolak PDP: {pdp_decision.reason}",
        )

    engine = get_memory_engine()
    results = await engine.hybrid_search(
        tenant_id=tenant_id,
        query=q,
        subject=subject,
        top_k=top_k,
        category=category,
    )
    return results


@router.post("/tenants/{tenant_id}/memory/documents")
async def create_tenant_memory_document(
    payload: DocumentCreateRequest,
    tenant_id: str = Path(..., description="ID Tenant"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("ADMIN,MANAGER", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("memory.documents.create", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Menyimpan dokumen pengetahuan baru dan menghasilkan representasi vektor embedding 1536.
    """
    roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=tenant_id,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
    )

    doc_in = MemoryDocumentCreate(
        title=payload.title,
        content=payload.content,
        summary=payload.summary,
        category=payload.category,
        source_type=payload.source_type,
        source_id=payload.source_id,
        data_classification=payload.data_classification,
        confidence=payload.confidence,
        created_by_user_id=x_user_id,
        metadata=payload.metadata,
    )

    engine = get_memory_engine()
    try:
        res = await engine.ingest_document(tenant_id=tenant_id, doc_in=doc_in, subject=subject)
        return res
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses dokumen memori: {str(e)}")


@router.post("/tenants/{tenant_id}/memory/consolidate")
async def consolidate_tenant_memory(
    tenant_id: str = Path(..., description="ID Tenant"),
    x_user_roles: Optional[str] = Header("SUPER_ADMIN,ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("memory.decay.consolidate", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Memicu evaluasi peluruhan (decay) confidence memori organisasi.
    """
    roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
    )

    pdp_decision = await authorize(
        subject=subject,
        resource=ResourceContext(tenant_id=tenant_id, resource_type="memory", resource_id="consolidate"),
        action="memory.decay.consolidate",
    )
    if not pdp_decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses konsolidasi memori ditolak: {pdp_decision.reason}")

    engine = get_memory_engine()
    res = await engine.consolidate_decay(tenant_id=tenant_id)
    return res
