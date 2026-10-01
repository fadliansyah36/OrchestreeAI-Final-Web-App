"""OrchestreeAI Memory & Hybrid Search API — trusted identity boundary (R1-B.2)."""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Path, Depends, Request
from pydantic import BaseModel, Field

from app.domains.memory.engine import (
    get_memory_engine,
    MemoryDocumentCreate,
    MemorySearchResult,
)
from app.authz.pdp import SubjectContext, authorize, ResourceContext, require_capability
from app.core.security import AuthenticatedTenantContext, get_trusted_request_context

router = APIRouter(prefix="/api/v1", tags=["Memory & Hybrid Search"])


class DocumentCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, description="Judul dokumen memori")
    content: str = Field(..., min_length=5, description="Isi dokumen memori")
    summary: Optional[str] = Field(None, description="Ringkasan opsional")
    category: str = Field("knowledge", description="Kategori: knowledge, sop, policy, client_crm, financial")
    source_type: str = Field("manual", description="manual, sop, workflow_execution, agent_reflection, conversation, document_upload")
    source_id: Optional[str] = None
    data_classification: str = Field("internal", description="public, internal, confidential, restricted")
    audience_scope: str = Field("internal_only", description="internal_only, customer_facing_safe, both")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SearchMemoryPostRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Kata kunci atau pertanyaan semantik")
    category: Optional[str] = Field(None, description="Filter kategori memori")
    limit: Optional[int] = Field(5, ge=1, le=50, description="Batas hasil pencarian")
    top_k: Optional[int] = Field(None, ge=1, le=50, description="Alias batas hasil")
    execution_context: str = Field("internal_dashboard", description="omnichannel, proactive, atau internal_dashboard")


def _subject(context: AuthenticatedTenantContext) -> SubjectContext:
    return SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )


def _authorize_memory(context: AuthenticatedTenantContext, action: str, resource_type: str, resource_id: str) -> SubjectContext:
    subject = _subject(context)
    decision = authorize(
        subject=subject,
        resource=ResourceContext(
            tenant_id=context.tenant_id,
            owner_tenant_id=context.tenant_id,
            resource_type=resource_type,
            resource_id=resource_id,
        ),
        action=action,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses memori ditolak PDP: {decision.reason}")
    return subject


@router.get(
    "/tenants/{tenant_id}/memory/search",
    response_model=List[MemorySearchResult],
    dependencies=[Depends(require_capability("memory.search"))],
)
async def search_tenant_memory(
    request: Request,
    tenant_id: str = Path(..., description="ID Tenant"),
    q: str = Query(..., min_length=1, description="Kata kunci atau pertanyaan semantik"),
    category: Optional[str] = Query(None, description="Filter kategori memori"),
    top_k: int = Query(5, ge=1, le=20, description="Batas hasil yang dikembalikan"),
    execution_context: str = Query("internal_dashboard", description="Konteks eksekusi pemanggil"),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    subject = _authorize_memory(context, "memory.search", "memory", "global_search")
    engine = get_memory_engine()
    return await engine.hybrid_search(
        tenant_id=context.tenant_id,
        query=q,
        subject=subject,
        top_k=top_k,
        category=category,
        execution_context=execution_context,
    )


@router.post(
    "/tenants/{tenant_id}/memory/search",
    dependencies=[Depends(require_capability("memory.search"))],
)
async def search_tenant_memory_post(
    payload: SearchMemoryPostRequest,
    request: Request,
    tenant_id: str = Path(..., description="ID Tenant"),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    subject = _authorize_memory(context, "memory.search", "memory", "global_search")
    engine = get_memory_engine()
    limit = payload.limit or payload.top_k or 5
    results = await engine.hybrid_search(
        tenant_id=context.tenant_id,
        query=payload.query,
        subject=subject,
        top_k=limit,
        category=payload.category,
        execution_context=payload.execution_context,
    )
    return {"results": [r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in results]}


@router.get(
    "/tenants/{tenant_id}/memory/documents",
    dependencies=[Depends(require_capability("memory.documents.read"))],
)
async def list_tenant_memory_documents(
    tenant_id: str = Path(..., description="ID Tenant"),
    category: Optional[str] = Query(None, description="Filter kategori memori"),
    limit: int = Query(50, ge=1, le=200),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_memory(context, "memory.documents.read", "memory", "documents_list")

    from app.core.database import get_database_engine
    import sqlalchemy as sa

    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": context.tenant_id},
        )
        sql = """
            SELECT id, tenant_id, title, summary, category, source_type,
                   data_classification, audience_scope, confidence, decay_factor, access_count,
                   last_accessed_at, created_at
            FROM memory_documents
            WHERE tenant_id = :tenant_id
        """
        params = {"tenant_id": context.tenant_id, "limit": limit}
        if category and category != "all":
            sql += " AND category = :category"
            params["category"] = category
        sql += " ORDER BY created_at DESC LIMIT :limit;"

        rows = conn.execute(sa.text(sql), params).fetchall()
        return [
            {
                "id": str(r[0]),
                "tenant_id": str(r[1]),
                "title": r[2],
                "summary": r[3],
                "category": r[4],
                "source_type": r[5],
                "data_classification": r[6],
                "audience_scope": r[7] if r[7] else "internal_only",
                "confidence": float(r[8]),
                "decay_factor": float(r[9]),
                "access_count": int(r[10]),
                "last_accessed_at": r[11].isoformat() if r[11] else None,
                "created_at": r[12].isoformat() if r[12] else None,
            }
            for r in rows
        ]


@router.post(
    "/tenants/{tenant_id}/memory/documents",
    dependencies=[Depends(require_capability("memory.documents.create"))],
)
async def create_tenant_memory_document(
    payload: DocumentCreateRequest,
    tenant_id: str = Path(..., description="ID Tenant"),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    subject = _authorize_memory(context, "memory.documents.create", "memory_document", "new")

    doc_in = MemoryDocumentCreate(
        title=payload.title,
        content=payload.content,
        summary=payload.summary,
        category=payload.category,
        source_type=payload.source_type,
        source_id=payload.source_id,
        data_classification=payload.data_classification,
        audience_scope=payload.audience_scope,
        confidence=payload.confidence,
        created_by_user_id=context.user_id,
        metadata=payload.metadata,
    )

    engine = get_memory_engine()
    try:
        return await engine.ingest_document(
            tenant_id=context.tenant_id,
            doc_in=doc_in,
            subject=subject,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal memproses dokumen memori: {exc}")


@router.post(
    "/tenants/{tenant_id}/memory/consolidate",
    dependencies=[Depends(require_capability("memory.decay.consolidate"))],
)
async def consolidate_tenant_memory(
    tenant_id: str = Path(..., description="ID Tenant"),
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    _authorize_memory(context, "memory.decay.consolidate", "memory", "consolidate")
    engine = get_memory_engine()
    return await engine.consolidate_decay(tenant_id=context.tenant_id)
