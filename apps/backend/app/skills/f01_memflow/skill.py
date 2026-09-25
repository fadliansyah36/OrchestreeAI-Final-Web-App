"""
OrchestreeAI F.01-MEMFLOW Skill Implementation (PRD v2.2 Bagian 8.4, 11.2 & 11.5)

Mengintegrasikan Company Brain, Hybrid Memory Search (pgvector HNSW + tsvector + RRF),
perluasan checkpoint durable Orchestration Engine (resume sesi AI Agent lintas-hari),
serta scheduled Memory Consolidator (confidence decay job).
"""

import json
import logging
from typing import Optional, List, Dict, Any
import sqlalchemy as sa

from app.core.database import get_engine
from app.domains.memory.engine import (
    get_memory_engine,
    HybridMemoryEngine,
    MemoryDocumentCreate,
    MemorySearchResult,
)
from app.authz.pdp import SubjectContext
from app.skills.f01_memflow.tools import (
    register_memflow_tools,
    tool_memory_search,
    tool_memory_remember,
    tool_session_resume,
    tool_memory_consolidate,
)

logger = logging.getLogger("orchestree.skills.f01_memflow.skill")


class F01MemflowSkill:
    """
    Skill F.01-MEMFLOW:
    Pusat kordinasi memori jangka panjang agentic & resume alur kerja durable.
    """

    name: str = "f01_memflow"
    version: str = "1.0.0"
    description: str = (
        "Perkakas Memori Persisten & Resume Orchestration Lintas-Hari "
        "(Company Brain, Hybrid Search pgvector+tsvector+RRF, Durable Checkpoint Resume, Memory Consolidator)"
    )

    def __init__(self, memory_engine: Optional[HybridMemoryEngine] = None):
        self._memory_engine = memory_engine or get_memory_engine()

    @property
    def memory_engine(self) -> HybridMemoryEngine:
        return self._memory_engine

    def register_tools(self) -> None:
        """Mendaftarkan perkakas ke ToolRegistry MCP global."""
        register_memflow_tools()

    async def search(
        self,
        tenant_id: str,
        query: str,
        subject: Optional[SubjectContext] = None,
        top_k: int = 5,
        category: Optional[str] = None,
        execution_context: str = "internal_dashboard",
    ) -> List[MemorySearchResult]:
        """
        Pencarian semantik hybrid:
        pgvector HNSW kNN + tsvector fulltext + Reciprocal Rank Fusion (RRF),
        disertai evaluasi otorisasi PDP (ABAC) dan audit logging.
        """
        return await self._memory_engine.hybrid_search(
            tenant_id=tenant_id,
            query=query,
            subject=subject,
            top_k=top_k,
            category=category,
            execution_context=execution_context,
        )

    async def remember(
        self,
        tenant_id: str,
        doc_in: MemoryDocumentCreate,
        subject: Optional[SubjectContext] = None,
    ) -> Dict[str, Any]:
        """
        Menyimpan dokumen pengetahuan, SOP, atau refleksi agen ke memory_documents
        dan membuat chunk embeddings 1536-dim vector ke memory_embeddings.
        """
        return await self._memory_engine.ingest_document(
            tenant_id=tenant_id,
            doc_in=doc_in,
            subject=subject,
        )

    async def resume_session(
        self,
        tenant_id: str,
        workflow_execution_id: str,
        context_updates: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Memulihkan sesi kerja agen lintas hari dari durable checkpoint di workflow_executions.
        """
        from app.core.orchestration.engine import get_orchestration_engine

        db_engine = get_engine()
        async with db_engine.begin() as conn:
            await conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                {"tid": tenant_id},
            )
            res = await conn.execute(
                sa.text("""
                    SELECT id, status, current_node_id, context_data, updated_at
                    FROM workflow_executions
                    WHERE id = :id AND tenant_id = :tid::uuid;
                """),
                {"id": workflow_execution_id, "tid": tenant_id},
            )
            row = res.fetchone()
            if not row:
                raise ValueError(
                    f"Sesi eksekusi '{workflow_execution_id}' tidak ditemukan di organisasi {tenant_id}."
                )

            status = row[1]
            current_node_id = row[2]
            ctx_data = row[3] or {}
            if isinstance(ctx_data, str):
                try:
                    ctx_data = json.loads(ctx_data)
                except Exception:
                    ctx_data = {}

            if status not in ("waiting_approval", "paused", "running"):
                return {
                    "workflow_execution_id": str(row[0]),
                    "status": status,
                    "current_node_id": current_node_id,
                    "can_resume": False,
                    "message": f"Sesi sudah dalam status final '{status}', tidak dapat di-resume.",
                }

        # Jalankan resume pada OrchestrationEngine
        orch = get_orchestration_engine()
        dispatch_result = await orch.resume(
            execution_id=workflow_execution_id,
            tenant_id=tenant_id,
            context_updates=context_updates,
        )

        return {
            "workflow_execution_id": workflow_execution_id,
            "status": dispatch_result.status,
            "nodes_executed": dispatch_result.nodes_executed,
            "final_output": dispatch_result.final_output,
            "error_detail": dispatch_result.error_detail,
            "can_resume": dispatch_result.status in ("waiting_approval", "paused"),
        }

    async def consolidate_decay(
        self,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Memicu Memory Consolidator:
        Melakukan peluruhan kepercayaan (exponential decay) pada dokumen memori
        yang jarang diakses seiring berjalannya waktu.
        """
        return await self._memory_engine.consolidate_decay(tenant_id=tenant_id)


_memflow_skill_instance: Optional[F01MemflowSkill] = None


def get_memflow_skill() -> F01MemflowSkill:
    """Mengambil singleton instance F01MemflowSkill."""
    global _memflow_skill_instance
    if _memflow_skill_instance is None:
        _memflow_skill_instance = F01MemflowSkill()
    return _memflow_skill_instance
