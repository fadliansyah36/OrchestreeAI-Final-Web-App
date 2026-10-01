"""
OrchestreeAI Memory & Hybrid Search Engine (PRD v2.2 Bagian 8.4)
Komponen Inti:
1. Hybrid Search (pgvector kNN HNSW + tsvector full-text + Reciprocal Rank Fusion / RRF).
2. Grounding Pipeline yang difilter otorisasi RLS + ABAC sebelum disuntikkan ke prompt LLM.
3. Memory Ingestion & Chunking dengan vector embedding 1536 dimensi (Gemini Embedding).
4. Memory Consolidator: Job terjadwal untuk peluruhan (decay) confidence memori seiring waktu.
"""

import math
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import tenant_tx_async
from app.core.model_router.router import get_model_router
from app.authz.pdp import authorize, SubjectContext, ResourceContext

logger = logging.getLogger("orchestree.memory_engine")


class MemoryDocumentCreate(BaseModel):
    title: str = Field(..., description="Judul dokumen memori / SOP")
    content: str = Field(..., description="Isi lengkap dokumen memori")
    summary: Optional[str] = Field(None, description="Ringkasan eksekutif dokumen")
    category: str = Field("knowledge", description="Kategori: knowledge, sop, policy, client_crm, financial")
    source_type: str = Field("manual", description="Sumber: manual, sop, workflow_execution, agent_reflection, conversation, document_upload")
    source_id: Optional[str] = None
    data_classification: str = Field("internal", description="Klasifikasi: public, internal, confidential, restricted")
    audience_scope: str = Field("internal_only", description="Scope: internal_only, customer_facing_safe, both")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    decay_factor: float = Field(0.05, ge=0.0)
    created_by_agent_id: Optional[str] = None
    created_by_user_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MemorySearchResult(BaseModel):
    document_id: str
    chunk_id: Optional[str] = None
    title: str
    content: str
    summary: Optional[str] = None
    category: str
    data_classification: str
    audience_scope: str = "internal_only"
    confidence: float
    rrf_score: float
    vector_rank: Optional[int] = None
    text_rank: Optional[int] = None
    similarity: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class HybridMemoryEngine:
    """
    Engine Memori & Pencarian Hybrid Cerdas OrchestreeAI.
    Menerapkan pgvector HNSW kNN + tsvector fulltext + Reciprocal Rank Fusion (RRF).
    """

    def __init__(self):
        self.model_router = get_model_router()

    async def ingest_document(
        self,
        tenant_id: str,
        doc_in: MemoryDocumentCreate,
        subject: Optional[SubjectContext] = None,
    ) -> Dict[str, Any]:
        """
        Menyimpan dokumen memori baru, menghasilkan chunk, dan mengomputasi embedding vektor nyata.
        """
        # Evaluasi otorisasi PDP
        if subject:
            pdp_decision = authorize(
                subject=subject,
                resource=ResourceContext(
                    tenant_id=tenant_id,
                    resource_type="memory_documents",
                    resource_id=doc_in.source_id or "new_document",
                    attributes={"data_classification": doc_in.data_classification},
                ),
                action="memory.documents.create",
            )
            if not pdp_decision.is_authorized:
                raise PermissionError(f"Otorisasi ditolak untuk membuat dokumen memori: {pdp_decision.reason}")

        doc_id = str(uuid.uuid4())
        chunks = self._chunk_text(doc_in.content, max_chars=1200, overlap=150)

        async with tenant_tx_async(tenant_id) as conn:
            # Set context RLS bertenant
            await conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                {"tid": tenant_id},
            )

            # 1. Simpan dokumen master
            await conn.execute(
                sa.text("""
                    INSERT INTO memory_documents (
                        id, tenant_id, title, content, summary, category, source_type,
                        source_id, data_classification, audience_scope, confidence, decay_factor,
                        created_by_agent_id, created_by_user_id, metadata
                    ) VALUES (
                        :id, :tenant_id, :title, :content, :summary, :category, :source_type,
                        :source_id, :data_classification, :audience_scope, :confidence, :decay_factor,
                        :created_by_agent_id, :created_by_user_id, :metadata
                    );
                """),
                {
                    "id": doc_id,
                    "tenant_id": tenant_id,
                    "title": doc_in.title,
                    "content": doc_in.content,
                    "summary": doc_in.summary or (doc_in.content[:200] + "..."),
                    "category": doc_in.category,
                    "source_type": doc_in.source_type,
                    "source_id": doc_in.source_id,
                    "data_classification": doc_in.data_classification,
                    "audience_scope": doc_in.audience_scope,
                    "confidence": doc_in.confidence,
                    "decay_factor": doc_in.decay_factor,
                    "created_by_agent_id": doc_in.created_by_agent_id,
                    "created_by_user_id": doc_in.created_by_user_id,
                    "metadata": json.dumps(doc_in.metadata),
                },
            )

            # 2. Proses chunk dan buat vector embedding nyata
            for idx, chunk_text in enumerate(chunks):
                chunk_id = str(uuid.uuid4())
                vector = await self.model_router.embed_text(chunk_text, output_dimension=1536)
                vector_str = "[" + ",".join(str(v) for v in vector) + "]"

                await conn.execute(
                    sa.text("""
                        INSERT INTO memory_embeddings (
                            id, tenant_id, document_id, chunk_index, chunk_content,
                            embedding, model_name, token_count, metadata
                        ) VALUES (
                            :id, :tenant_id, :document_id, :chunk_index, :chunk_content,
                            :embedding::vector, :model_name, :token_count, :metadata
                        );
                    """),
                    {
                        "id": chunk_id,
                        "tenant_id": tenant_id,
                        "document_id": doc_id,
                        "chunk_index": idx,
                        "chunk_content": chunk_text,
                        "embedding": vector_str,
                        "model_name": "gemini-embedding-001",
                        "token_count": len(chunk_text.split()),
                        "metadata": json.dumps({"source_doc_title": doc_in.title}),
                    },
                )

        logger.info(f"Dokumen memori '{doc_in.title}' ({doc_id}) tersimpan dengan {len(chunks)} chunks.")
        return {
            "document_id": doc_id,
            "title": doc_in.title,
            "category": doc_in.category,
            "chunks_count": len(chunks),
            "status": "ingested",
        }

    async def hybrid_search(
        self,
        tenant_id: str,
        query: str,
        subject: Optional[SubjectContext] = None,
        top_k: int = 5,
        category: Optional[str] = None,
        rrf_k: int = 60,
        execution_context: str = "internal_dashboard",
        scope_in: Optional[List[str]] = None,
    ) -> List[MemorySearchResult]:
        """
        Pencarian Hybrid:
        1. Vektor kNN Cosine Similarity via pgvector HNSW pada memory_embeddings.
        2. Teks Full-Text Search via tsvector / ts_rank pada memory_documents.
        3. Reciprocal Rank Fusion (RRF): score = (1 / (rrf_k + rank_vec)) + (1 / (rrf_k + rank_text)).
        4. Memory Retrieval Boundary: Pemfilteran ketat audience_scope ('customer_facing_safe' & 'both' untuk omnichannel).
        5. Otorisasi PDP (ABAC) per item dokumen sebelum dikembalikan.
        6. Audit logging ke memory_access_log.
        """
        if not query.strip():
            return []

        # Tentukan audience_scope yang diperbolehkan berdasarkan execution_context (PRD v2.2 Bagian E.5)
        if scope_in is not None:
            allowed_scopes = scope_in
        elif execution_context == "omnichannel":
            allowed_scopes = ["customer_facing_safe", "both"]
        else:
            allowed_scopes = ["internal_only", "customer_facing_safe", "both"]

        # 1. Hasilkan embedding untuk query
        query_vector = await self.model_router.embed_text(query, output_dimension=1536)
        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

        async with self.engine.begin() as conn:
            # Set context RLS bertenant
            await conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                {"tid": tenant_id},
            )

            # Query 1: Vector Search kNN (Top 20 kandidat)
            vec_params: Dict[str, Any] = {
                "tenant_id": tenant_id,
                "q_emb": vector_str,
                "limit": 20,
                "allowed_scopes": allowed_scopes,
            }
            cat_clause_doc = ""
            if category:
                cat_clause_doc = "AND d.category = :category"
                vec_params["category"] = category

            vec_sql = f"""
                SELECT 
                    e.document_id,
                    e.id as chunk_id,
                    d.title,
                    e.chunk_content,
                    d.summary,
                    d.category,
                    d.data_classification,
                    COALESCE(d.audience_scope, 'internal_only') as audience_scope,
                    d.confidence,
                    d.metadata,
                    1 - (e.embedding <=> :q_emb::vector) as similarity
                FROM memory_embeddings e
                JOIN memory_documents d ON e.document_id = d.id
                WHERE e.tenant_id = :tenant_id::uuid
                  AND COALESCE(d.audience_scope, 'internal_only') = ANY(:allowed_scopes)
                {cat_clause_doc}
                ORDER BY e.embedding <=> :q_emb::vector ASC
                LIMIT :limit;
            """
            vec_res = await conn.execute(sa.text(vec_sql), vec_params)
            vec_rows = vec_res.fetchall()

            # Query 2: Full-text Search tsvector (Top 20 kandidat)
            text_params: Dict[str, Any] = {
                "tenant_id": tenant_id,
                "q_text": query,
                "limit": 20,
                "allowed_scopes": allowed_scopes,
            }
            if category:
                text_params["category"] = category

            text_sql = f"""
                SELECT 
                    d.id as document_id,
                    NULL as chunk_id,
                    d.title,
                    d.content as chunk_content,
                    d.summary,
                    d.category,
                    d.data_classification,
                    COALESCE(d.audience_scope, 'internal_only') as audience_scope,
                    d.confidence,
                    d.metadata,
                    ts_rank(d.search_vector, plainto_tsquery('indonesian', :q_text)) as text_score
                FROM memory_documents d
                WHERE d.tenant_id = :tenant_id::uuid
                  AND COALESCE(d.audience_scope, 'internal_only') = ANY(:allowed_scopes)
                  AND (
                      d.search_vector @@ plainto_tsquery('indonesian', :q_text)
                      OR d.title ILIKE '%' || :q_text || '%'
                  )
                  {cat_clause_doc}
                ORDER BY text_score DESC
                LIMIT :limit;
            """
            text_res = await conn.execute(sa.text(text_sql), text_params)
            text_rows = text_res.fetchall()

        # 3. Reciprocal Rank Fusion (RRF)
        # Struktur kandidat: doc_id -> score
        candidates: Dict[str, Dict[str, Any]] = {}

        # Bobot Vektor
        for rank, row in enumerate(vec_rows, start=1):
            d_id = str(row[0])
            if d_id not in candidates:
                candidates[d_id] = {
                    "document_id": d_id,
                    "chunk_id": str(row[1]) if row[1] else None,
                    "title": row[2],
                    "content": row[3],
                    "summary": row[4],
                    "category": row[5],
                    "data_classification": row[6],
                    "audience_scope": str(row[7]),
                    "confidence": float(row[8]),
                    "metadata": row[9] if isinstance(row[9], dict) else {},
                    "vector_rank": rank,
                    "similarity": float(row[10]),
                    "text_rank": None,
                    "rrf_score": 1.0 / (rrf_k + rank),
                }
            else:
                candidates[d_id]["vector_rank"] = rank
                candidates[d_id]["similarity"] = float(row[10])
                candidates[d_id]["rrf_score"] += 1.0 / (rrf_k + rank)

        # Bobot Teks Full-Text
        for rank, row in enumerate(text_rows, start=1):
            d_id = str(row[0])
            if d_id not in candidates:
                candidates[d_id] = {
                    "document_id": d_id,
                    "chunk_id": None,
                    "title": row[2],
                    "content": row[3][:1200],
                    "summary": row[4],
                    "category": row[5],
                    "data_classification": row[6],
                    "audience_scope": str(row[7]),
                    "confidence": float(row[8]),
                    "metadata": row[9] if isinstance(row[9], dict) else {},
                    "vector_rank": None,
                    "similarity": None,
                    "text_rank": rank,
                    "rrf_score": 1.0 / (rrf_k + rank),
                }
            else:
                candidates[d_id]["text_rank"] = rank
                candidates[d_id]["rrf_score"] += 1.0 / (rrf_k + rank)

        # Kalikan skor RRF dengan confidence memori
        for cand in candidates.values():
            cand["rrf_score"] = cand["rrf_score"] * cand["confidence"]

        sorted_candidates = sorted(candidates.values(), key=lambda x: x["rrf_score"], reverse=True)

        # 4. Filter Otorisasi RLS + ABAC sebelum hasil dipakai
        verified_results: List[MemorySearchResult] = []
        for cand in sorted_candidates:
            if subject:
                pdp_eval = authorize(
                    subject=subject,
                    resource=ResourceContext(
                        tenant_id=tenant_id,
                        resource_type="memory_documents",
                        resource_id=cand["document_id"],
                        attributes={"data_classification": cand["data_classification"]},
                    ),
                    action="data.read",
                )
                if not pdp_eval.is_authorized:
                    logger.info(f"Akses memori '{cand['document_id']}' ditolak PDP ABAC ({pdp_eval.audit_decision}).")
                    continue

            verified_results.append(MemorySearchResult(**cand))
            if len(verified_results) >= top_k:
                break

        # 5. Catat audit akses ke memory_access_log
        try:
            actor_type = "ai_agent" if subject and (subject.roles and "STAFF_AI" in subject.roles or subject.agent_id) else "human_user"
            actor_id = (subject.agent_id or subject.user_id) if subject else "anonymous"

            async with self.engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                    {"tid": tenant_id},
                )
                for res in verified_results:
                    await conn.execute(
                        sa.text("""
                            INSERT INTO memory_access_log (
                                tenant_id, document_id, actor_type, actor_id,
                                action, query_text, similarity_score, abac_decision, context
                            ) VALUES (
                                :tenant_id, :doc_id, :actor_type, :actor_id,
                                'search_read', :query, :score, 'ALLOW', :ctx
                            );
                            UPDATE memory_documents
                            SET access_count = access_count + 1,
                                last_accessed_at = now()
                            WHERE id = :doc_id;
                        """),
                        {
                            "tenant_id": tenant_id,
                            "doc_id": res.document_id,
                            "actor_type": actor_type,
                            "actor_id": actor_id,
                            "query": query,
                            "score": res.rrf_score,
                            "ctx": json.dumps({"similarity": res.similarity, "category": res.category}),
                        },
                    )
        except Exception as log_err:
            logger.warning(f"Gagal mencatat log akses memori: {log_err}")

        return verified_results

    async def consolidate_decay(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        if not tenant_id:
            raise ValueError("Cross-tenant memory consolidation must be dispatched per tenant through tenant_tx_async().")
        """
        Memory Consolidator (PRD v2.2 Bagian 11.5 / F.01-MEMFLOW):
        Job terjadwal yang menurunkan (decay) confidence memory seiring waktu
        berdasarkan rumus: confidence = confidence * exp(-decay_factor * days_since_last_access).
        """
        async with self.engine.begin() as conn:
            if tenant_id:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                    {"tid": tenant_id},
                )
                select_sql = """
                    SELECT id, confidence, decay_factor, coalesce(last_accessed_at, created_at) as ref_time
                    FROM memory_documents
                    WHERE tenant_id = :tid::uuid AND confidence > 0.1;
                """
                res = await conn.execute(sa.text(select_sql), {"tid": tenant_id})
            else:
                select_sql = """
                    SELECT id, confidence, decay_factor, coalesce(last_accessed_at, created_at) as ref_time
                    FROM memory_documents
                    WHERE confidence > 0.1;
                """
                res = await conn.execute(sa.text(select_sql))

            rows = res.fetchall()
            updated_count = 0
            now = datetime.now(timezone.utc)

            for row in rows:
                doc_id = str(row[0])
                current_conf = float(row[1])
                decay_factor = float(row[2])
                ref_time = row[3]
                if not ref_time:
                    continue

                if ref_time.tzinfo is None:
                    ref_time = ref_time.replace(tzinfo=timezone.utc)

                days_elapsed = (now - ref_time).total_seconds() / 86400.0
                if days_elapsed >= 1.0:
                    # Rumus peluruhan eksponensial
                    new_conf = max(0.10, current_conf * math.exp(-decay_factor * (days_elapsed / 7.0)))
                    if abs(new_conf - current_conf) > 0.001:
                        await conn.execute(
                            sa.text("""
                                UPDATE memory_documents
                                SET confidence = :conf,
                                    updated_at = now()
                                WHERE id = :id;
                            """),
                            {"conf": round(new_conf, 4), "id": doc_id},
                        )
                        updated_count += 1

            return {
                "tenant_id": tenant_id or "all_tenants",
                "scanned_documents": len(rows),
                "decayed_documents": updated_count,
                "status": "consolidated",
            }

    def _chunk_text(self, text: str, max_chars: int = 1200, overlap: int = 150) -> List[str]:
        """Membagi teks panjang menjadi beberapa chunk yang tumpang-tindih (overlapping)."""
        if len(text) <= max_chars:
            return [text]

        chunks = []
        start = 0
        while start < len(text):
            end = start + max_chars
            chunk = text[start:end]
            chunks.append(chunk.strip())
            start += max_chars - overlap
        return [c for c in chunks if c]

    async def filter_internal_only(self, retrieved_doc_ids: List[str], tenant_id: Optional[str] = None) -> List[str]:
        if not tenant_id:
            raise ValueError("tenant_id is required for memory access filtering.")
        """
        Mengidentifikasi dokumen mana saja di antara retrieved_doc_ids yang berstatus 'internal_only'.
        Digunakan oleh sanitize_customer_facing_output sebagai lapisan kedua pertahanan data.
        """
        if not retrieved_doc_ids:
            return []
        try:
            async with self.engine.begin() as conn:
                if tenant_id:
                    await conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :tid, true);"),
                        {"tid": tenant_id},
                    )
                query = sa.text("""
                    SELECT id FROM memory_documents
                    WHERE id = ANY(:doc_ids::uuid[])
                      AND COALESCE(audience_scope, 'internal_only') = 'internal_only';
                """)
                res = await conn.execute(query, {"doc_ids": retrieved_doc_ids})
                return [str(row[0]) for row in res.fetchall()]
        except Exception as e:
            logger.warning(f"Gagal memeriksa filter_internal_only: {e}")
            return []


_memory_engine_instance: Optional[HybridMemoryEngine] = None


def get_memory_engine() -> HybridMemoryEngine:
    global _memory_engine_instance
    if _memory_engine_instance is None:
        _memory_engine_instance = HybridMemoryEngine()
    return _memory_engine_instance


async def hybrid_memory_search(
    tenant_id: str,
    query: str,
    execution_context: str = "internal_dashboard",
    top_k: int = 5,
    category: Optional[str] = None,
    subject: Optional[SubjectContext] = None,
) -> List[MemorySearchResult]:
    """
    Antarmuka resmi Hybrid Memory Search dengan penegakan Memory Retrieval Boundary (PRD v2.2 Bagian E.5).
    Panggilan RAG dari node manapun pada percakapan Omnichannel WAJIB menggunakan execution_context='omnichannel'.
    """
    engine = get_memory_engine()
    return await engine.hybrid_search(
        tenant_id=tenant_id,
        query=query,
        subject=subject,
        top_k=top_k,
        category=category,
        execution_context=execution_context,
    )

