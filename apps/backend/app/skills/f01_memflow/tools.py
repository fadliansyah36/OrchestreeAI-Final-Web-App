"""
OrchestreeAI F.01-MEMFLOW Skill (PRD v2.2 Bagian 8.4, 11.2 & 11.5)
Perkakas Memori Persisten & Resume Orchestration Lintas-Hari:
1. memory.search: Pencarian hybrid (pgvector HNSW + tsvector fulltext + RRF) terintegrasi RLS & PDP.
2. memory.remember: Menyimpan pengetahuan baru, refleksi tugas, atau SOP ke memory_documents dan embeddings.
3. memory.session_resume: Menyambung kembali sesi eksekusi workflow/tugas AI Agent lintas-hari dari durable checkpoint.
4. memory.consolidate: Memicu peluruhan nilai kepercayaan (confidence decay) terhadap memori usang.
"""

import json
import uuid
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine
from app.skills.f01_mcp.decorators import mcp_tool, ToolExecutionContext
from app.domains.memory.engine import get_memory_engine, MemoryDocumentCreate
from app.authz.pdp import SubjectContext

logger = logging.getLogger("orchestree.skills.f01_memflow")


# --- 1. Tool: memory.search ---
class MemorySearchInput(BaseModel):
    query: str = Field(..., description="Pertanyaan atau kata kunci pencarian memori/SOP")
    category: Optional[str] = Field(None, description="Kategori filter opsional (knowledge, sop, policy, etc)")
    top_k: int = Field(5, ge=1, le=20, description="Jumlah hasil terbaik yang diminta")


class MemorySearchOutput(BaseModel):
    query: str
    total_found: int
    results: List[Dict[str, Any]]


@mcp_tool(
    name="memory.search",
    description="Melakukan pencarian memori semantik hybrid (vektor kNN + kata kunci) pada basis pengetahuan Company Brain",
    risk_tier="low",
    category="memory",
    is_idempotent=True,
    timeout_seconds=30.0,
    input_model=MemorySearchInput,
    output_model=MemorySearchOutput,
)
async def tool_memory_search(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_memory_engine()
    query = input_data.get("query", "")
    category = input_data.get("category")
    top_k = input_data.get("top_k", 5)

    subject = SubjectContext(
        user_id=context.actor_id if context.actor_type == "human_user" else None,
        agent_id=context.actor_id if context.actor_type == "ai_agent" else None,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )

    results = await engine.hybrid_search(
        tenant_id=context.tenant_id,
        query=query,
        subject=subject,
        top_k=top_k,
        category=category,
        execution_context=context.execution_context or "internal_dashboard",
    )

    formatted = [
        {
            "document_id": r.document_id,
            "title": r.title,
            "snippet": r.content[:400] + ("..." if len(r.content) > 400 else ""),
            "summary": r.summary,
            "category": r.category,
            "confidence": r.confidence,
            "rrf_score": round(r.rrf_score, 4),
            "similarity": round(r.similarity, 4) if r.similarity is not None else None,
            "data_classification": r.data_classification,
        }
        for r in results
    ]

    return {
        "query": query,
        "total_found": len(formatted),
        "results": formatted,
    }


# --- 2. Tool: memory.remember ---
class MemoryRememberInput(BaseModel):
    title: str = Field(..., description="Judul ringkas memori yang disimpan")
    content: str = Field(..., description="Isi pengetahuan atau hasil pembelajaran")
    summary: Optional[str] = Field(None, description="Ringkasan eksekutif")
    category: str = Field("knowledge", description="Kategori (knowledge, sop, agent_reflection, etc)")
    data_classification: str = Field("internal", description="Klasifikasi: public, internal, confidential, restricted")
    confidence: float = Field(1.0, ge=0.0, le=1.0)


class MemoryRememberOutput(BaseModel):
    document_id: str
    title: str
    chunks_count: int
    status: str


@mcp_tool(
    name="memory.remember",
    description="Menyimpan pengetahuan baru, refleksi hasil kerja, atau kebijakan ke memori persisten bertenant",
    risk_tier="medium",
    category="memory",
    is_idempotent=False,
    timeout_seconds=30.0,
    input_model=MemoryRememberInput,
    output_model=MemoryRememberOutput,
)
async def tool_memory_remember(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_memory_engine()
    doc_in = MemoryDocumentCreate(
        title=input_data.get("title", ""),
        content=input_data.get("content", ""),
        summary=input_data.get("summary"),
        category=input_data.get("category", "knowledge"),
        source_type="agent_reflection" if context.actor_type == "ai_agent" else "manual",
        source_id=context.workflow_execution_id,
        data_classification=input_data.get("data_classification", "internal"),
        confidence=float(input_data.get("confidence", 1.0)),
        created_by_agent_id=context.actor_id if context.actor_type == "ai_agent" else None,
        created_by_user_id=context.actor_id if context.actor_type == "human_user" else None,
        metadata={"workflow_execution_id": context.workflow_execution_id},
    )

    subject = SubjectContext(
        user_id=context.actor_id if context.actor_type == "human_user" else None,
        agent_id=context.actor_id if context.actor_type == "ai_agent" else None,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )

    res = await engine.ingest_document(tenant_id=context.tenant_id, doc_in=doc_in, subject=subject)
    return res


# --- 3. Tool: memory.session_resume ---
class SessionResumeInput(BaseModel):
    workflow_execution_id: str = Field(..., description="ID eksekusi alur kerja yang hendak dilanjutkan")


class SessionResumeOutput(BaseModel):
    workflow_execution_id: str
    status: str
    current_node_id: Optional[str]
    context_keys: List[str]
    can_resume: bool
    resumed_at: str


@mcp_tool(
    name="memory.session_resume",
    description="Menyambung kembali sesi eksekusi alur kerja agen yang tertunda lintas hari berdasarkan durable checkpoint",
    risk_tier="medium",
    category="memory",
    is_idempotent=True,
    timeout_seconds=20.0,
    input_model=SessionResumeInput,
    output_model=SessionResumeOutput,
)
async def tool_session_resume(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    wf_id = input_data.get("workflow_execution_id", "")
    db_engine = get_engine()

    async with db_engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
            {"tid": context.tenant_id},
        )
        res = await conn.execute(
            sa.text("""
                SELECT id, status, current_node_id, context_data, updated_at
                FROM workflow_executions
                WHERE id = :id AND tenant_id = :tid::uuid;
            """),
            {"id": wf_id, "tid": context.tenant_id},
        )
        row = res.fetchone()
        if not row:
            raise ValueError(f"Sesi eksekusi alur kerja '{wf_id}' tidak ditemukan di organisasi ini.")

        status = row[1]
        node_id = row[2]
        ctx_data = row[3] or {}
        if isinstance(ctx_data, str):
            try:
                ctx_data = json.loads(ctx_data)
            except Exception:
                ctx_data = {}

        return {
            "workflow_execution_id": str(row[0]),
            "status": status,
            "current_node_id": node_id,
            "context_keys": list(ctx_data.keys()),
            "can_resume": status in ("waiting_approval", "paused", "running"),
            "resumed_at": str(row[4]),
        }


# --- 4. Tool: memory.consolidate ---
class MemoryConsolidateInput(BaseModel):
    target_tenant_id: Optional[str] = Field(None, description="ID tenant spesifik atau kosong untuk organisasi aktif")


class MemoryConsolidateOutput(BaseModel):
    tenant_id: str
    scanned_documents: int
    decayed_documents: int
    status: str


@mcp_tool(
    name="memory.consolidate",
    description="Memicu job pemeliharaan memori untuk meluruhkan (decay) confidence dokumen yang jarang diakses",
    risk_tier="low",
    category="memory",
    is_idempotent=False,
    timeout_seconds=30.0,
    input_model=MemoryConsolidateInput,
    output_model=MemoryConsolidateOutput,
)
async def tool_memory_consolidate(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    target_tid = input_data.get("target_tenant_id") or context.tenant_id
    engine = get_memory_engine()
    res = await engine.consolidate_decay(tenant_id=target_tid)
    return res


def register_memflow_tools():
    """Registrasi perkakas F.01-MEMFLOW ke ToolRegistry global."""
    from app.skills.f01_mcp.decorators import get_tool_registry
    registry = get_tool_registry()
    registry.register(tool_memory_search)
    registry.register(tool_memory_remember)
    registry.register(tool_session_resume)
    registry.register(tool_memory_consolidate)
    logger.info("F.01-MEMFLOW tools successfully registered into ToolRegistry.")
