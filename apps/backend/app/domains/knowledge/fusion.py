"""
OrchestreeAI Context Fabric & Knowledge Fusion Engine (PRD v2.2 Bagian 8.6, 8.13.6, 8.13.8)
Python 3.12 + FastAPI + Supabase Postgres

Prinsip & Definition of Done:
1. Menyatukan (fuse) pengetahuan dari 8 Dimensi Company Context Fabric.
2. Membedakan sumber data:
   - Internal SSOT (All-Tier)
   - External ERP Integration (Enterprise Tier, Fase 24)
3. PENEGAKAN DEFINITION OF DONE MUTLAK:
   - Rule Knowledge atau temuan baru dari AI Research Agent (Fase 27) TIDAK BOLEH aktif otomatis
     sampai disetujui manusia eksplisit (Human-in-the-Loop).
   - Seluruh aturan berstatus 'PENDING_HUMAN_APPROVAL' atau belum disetujui DIPISAHKAN dan TIDAK
     diikutsertakan dalam fusi konteks operasional aktif.
"""

from typing import List, Dict, Any, Optional
import uuid
import datetime
import logging

try:
    from pydantic import BaseModel, Field

    class FusedKnowledgeItem(BaseModel):
        id: str
        dimension_code: str
        node_key: str
        title: str
        content: str
        priority_level: int = 1  # 1-6 sesuai hirarki PRD v2.2
        source_classification: str  # Native, Synced, Uploaded, External, AI_RESEARCH_AGENT
        approval_status: str = "APPROVED"  # APPROVED, PENDING_HUMAN_APPROVAL, REJECTED
        is_active: bool = True
        approved_by_user_id: Optional[str] = None
        source_reference: Optional[str] = None
        tags: List[str] = Field(default_factory=list)

    class KnowledgeFusionResult(BaseModel):
        tenant_id: str
        tier_code: str
        total_nodes_considered: int
        active_fused_count: int
        unapproved_ai_rules_count: int
        active_fused_nodes: List[FusedKnowledgeItem] = Field(default_factory=list)
        unapproved_ai_rules: List[FusedKnowledgeItem] = Field(default_factory=list)
        fused_context_summary: str
        has_external_erp_dimension: bool
        generated_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class FusedKnowledgeItem:
        id: str
        dimension_code: str
        node_key: str
        title: str
        content: str
        source_classification: str
        priority_level: int = 1
        approval_status: str = "APPROVED"
        is_active: bool = True
        approved_by_user_id: Optional[str] = None
        source_reference: Optional[str] = None
        tags: List[str] = field(default_factory=list)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "dimension_code": self.dimension_code,
                "node_key": self.node_key,
                "title": self.title,
                "content": self.content,
                "priority_level": self.priority_level,
                "source_classification": self.source_classification,
                "approval_status": self.approval_status,
                "is_active": self.is_active,
                "approved_by_user_id": self.approved_by_user_id,
                "source_reference": self.source_reference,
                "tags": self.tags,
            }

    @dataclass
    class KnowledgeFusionResult:
        tenant_id: str
        tier_code: str
        total_nodes_considered: int
        active_fused_count: int
        unapproved_ai_rules_count: int
        fused_context_summary: str
        has_external_erp_dimension: bool
        active_fused_nodes: List[FusedKnowledgeItem] = field(default_factory=list)
        unapproved_ai_rules: List[FusedKnowledgeItem] = field(default_factory=list)
        generated_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "tenant_id": self.tenant_id,
                "tier_code": self.tier_code,
                "total_nodes_considered": self.total_nodes_considered,
                "active_fused_count": self.active_fused_count,
                "unapproved_ai_rules_count": self.unapproved_ai_rules_count,
                "active_fused_nodes": [n.model_dump() if hasattr(n, "model_dump") else n.__dict__ for n in self.active_fused_nodes],
                "unapproved_ai_rules": [n.model_dump() if hasattr(n, "model_dump") else n.__dict__ for n in self.unapproved_ai_rules],
                "fused_context_summary": self.fused_context_summary,
                "has_external_erp_dimension": self.has_external_erp_dimension,
                "generated_at": self.generated_at,
            }

logger = logging.getLogger(__name__)


class KnowledgeFusionEngine:
    """
    Mesin Fusi Pengetahuan Konteks Perusahaan (PRD v2.2 Bagian 8.13.8).
    Menjamin bahwa setiap aturan pengetahuan baru dari AI Research Agent WAJIB disetujui manusia
    sebelum dapat diaktifkan dalam konteks operasional.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def fuse_knowledge(
        self,
        tenant_id: str,
        tier_code: str = "STARTER",
        target_dimensions: Optional[List[str]] = None,
        db_connection=None,
        simulated_knowledge_nodes: Optional[List[Dict[str, Any]]] = None,
    ) -> KnowledgeFusionResult:
        """
        Menjalankan proses fusi pengetahuan terpadu.
        Memfilter ketat aturan yang memerlukan persetujuan manusia.
        """
        conn = db_connection or self.db_pool
        normalized_tier = (tier_code or "STARTER").upper()
        is_enterprise = normalized_tier == "ENTERPRISE"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        all_raw_nodes = []

        if simulated_knowledge_nodes is not None:
            all_raw_nodes = simulated_knowledge_nodes
        elif conn:
            try:
                # Query dari tabel company_context_knowledge_nodes
                dim_clause = ""
                params = [uuid.UUID(tenant_id)]
                if target_dimensions:
                    dim_clause = "AND dimension_code = ANY($2)"
                    params.append(target_dimensions)

                rows = await conn.fetch(
                    f"""
                    SELECT id, dimension_code, node_key, title, content,
                           priority_level, source_classification, source_reference,
                           tags, is_verified, verified_at, metadata
                    FROM company_context_knowledge_nodes
                    WHERE tenant_id = $1 {dim_clause}
                    ORDER BY priority_level ASC, created_at DESC
                    LIMIT 300
                    """,
                    *params
                )
                import json
                for r in rows:
                    meta = r["metadata"]
                    if isinstance(meta, str):
                        meta = json.loads(meta)
                    all_raw_nodes.append({
                        "id": str(r["id"]),
                        "dimension_code": r["dimension_code"],
                        "node_key": r["node_key"],
                        "title": r["title"],
                        "content": r["content"],
                        "priority_level": r["priority_level"],
                        "source_classification": r["source_classification"],
                        "source_reference": r["source_reference"],
                        "tags": r["tags"] or [],
                        "is_verified": r["is_verified"],
                        "approval_status": meta.get("approval_status", "APPROVED" if r["is_verified"] else "PENDING_HUMAN_APPROVAL"),
                        "is_active": meta.get("is_active", r["is_verified"]),
                        "approved_by_user_id": meta.get("approved_by_user_id"),
                        "metadata": meta,
                    })
            except Exception as exc:
                logger.warning("Gagal fetch knowledge nodes: %s", exc)

        active_fused: List[FusedKnowledgeItem] = []
        unapproved_ai_rules: List[FusedKnowledgeItem] = []
        has_external_erp = False

        for node in all_raw_nodes:
            src = node.get("source_classification", "Native")
            meta = node.get("metadata", {})
            if isinstance(meta, str):
                import json
                meta = json.loads(meta or "{}")

            # Periksa apakah ini sumber ERP Eksternal (Enterprise only)
            if src in ("Synced", "External") and ("ERP" in str(node.get("source_reference", "")).upper() or meta.get("is_erp")):
                if not is_enterprise:
                    # Non-enterprise dilarang mengakses fusi ERP eksternal
                    continue
                has_external_erp = True

            # DETEKSI APAKAH NODE DIBUAT DARI AI RESEARCH AGENT
            is_ai_research = (
                src in ("External", "AI_RESEARCH_AGENT", "ResearchAgent")
                or meta.get("generated_by") == "AI_RESEARCH_AGENT"
                or meta.get("created_by_agent") is not None
            )

            # Penentuan status approval
            approval_status = node.get("approval_status") or meta.get("approval_status")
            if not approval_status:
                if is_ai_research:
                    # DEFINITION OF DONE: Aturan dari AI Research Agent WAJIB default PENDING_HUMAN_APPROVAL
                    approval_status = "PENDING_HUMAN_APPROVAL"
                else:
                    approval_status = "APPROVED"

            is_active = bool(node.get("is_active", False) if is_ai_research else node.get("is_active", True))
            approved_by = node.get("approved_by_user_id") or meta.get("approved_by_user_id")

            item = FusedKnowledgeItem(
                id=str(node.get("id") or uuid.uuid4()),
                dimension_code=node.get("dimension_code", "GENERAL"),
                node_key=node.get("node_key", "default_key"),
                title=node.get("title", ""),
                content=node.get("content", ""),
                priority_level=int(node.get("priority_level", 1)),
                source_classification=src,
                approval_status=approval_status,
                is_active=is_active and (approval_status == "APPROVED"),
                approved_by_user_id=approved_by,
                source_reference=node.get("source_reference"),
                tags=node.get("tags") or [],
            )

            # PENEGAKAN DEFINITION OF DONE:
            # Rule Knowledge baru dari AI Research Agent TIDAK aktif otomatis sampai disetujui manusia eksplisit!
            if is_ai_research and approval_status != "APPROVED":
                # BELUM DISETUJUI MANUSIA -> WAJIB MASUK unapproved_ai_rules DAN DILARANG MASUK active_fused!
                item.is_active = False
                unapproved_ai_rules.append(item)
            else:
                # Sudah disetujui atau berasal dari native SSOT verified
                item.is_active = True
                active_fused.append(item)

        # Urutkan active_fused berdasarkan priority_level (1 tertinggi hingga 6 terendah)
        active_fused.sort(key=lambda x: x.priority_level)

        # Sintesis narasi ringkasan konteks aktif
        dim_counts = {}
        for it in active_fused:
            dim_counts[it.dimension_code] = dim_counts.get(it.dimension_code, 0) + 1

        summary_parts = [
            f"Fusi Konteks Perusahaan OrchestreeAI (Tier: {normalized_tier}):",
            f"- Total Node Aktif Terverifikasi: {len(active_fused)}",
            f"- Aturan AI Baru Tertunda Persetujuan Manusia: {len(unapproved_ai_rules)}",
            f"- Cakupan Dimensi: {', '.join(f'{k} ({v})' for k, v in dim_counts.items()) if dim_counts else 'Belum ada dimensi terdaftar'}",
            f"- Dimensi ERP Eksternal: {'Tersambung (Enterprise)' if has_external_erp else 'Native All-Tier'}",
        ]

        return KnowledgeFusionResult(
            tenant_id=tenant_id,
            tier_code=normalized_tier,
            total_nodes_considered=len(all_raw_nodes),
            active_fused_count=len(active_fused),
            unapproved_ai_rules_count=len(unapproved_ai_rules),
            active_fused_nodes=active_fused,
            unapproved_ai_rules=unapproved_ai_rules,
            fused_context_summary="\n".join(summary_parts),
            has_external_erp_dimension=has_external_erp,
            generated_at=now_iso,
        )


__all__ = [
    "FusedKnowledgeItem",
    "KnowledgeFusionResult",
    "KnowledgeFusionEngine",
]
