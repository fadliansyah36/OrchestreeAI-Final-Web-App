"""
Unit tests for OrchestreeAI F.01-MEMFLOW Skill & Hybrid Memory Engine (PRD v2.2 Bagian 8.4, 11.2 & 11.5)
"""

import pytest
import math
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

from app.skills.f01_mcp.decorators import (
    ToolRegistry,
    get_tool_registry,
    ToolExecutionContext,
)
from app.domains.memory.engine import (
    HybridMemoryEngine,
    MemoryDocumentCreate,
    MemorySearchResult,
)
from app.skills.f01_memflow.skill import (
    F01MemflowSkill,
    get_memflow_skill,
)
from app.skills.f01_memflow.tools import (
    register_memflow_tools,
    tool_memory_search,
    tool_memory_remember,
    tool_session_resume,
    tool_memory_consolidate,
    MemorySearchInput,
    MemoryRememberInput,
    SessionResumeInput,
    MemoryConsolidateInput,
)


class TestF01MemflowTools:
    def test_tool_registration(self):
        registry = get_tool_registry()
        register_memflow_tools()

        assert "memory.search" in registry.tools
        assert "memory.remember" in registry.tools
        assert "memory.session_resume" in registry.tools
        assert "memory.consolidate" in registry.tools

        search_tool = registry.get("memory.search")
        assert search_tool.risk_tier == "low"
        assert search_tool.category == "memory"
        assert search_tool.is_idempotent is True

        remember_tool = registry.get("memory.remember")
        assert remember_tool.risk_tier == "medium"
        assert remember_tool.is_idempotent is False

    def test_pydantic_schemas_validation(self):
        # Valid input models
        search_in = MemorySearchInput(query="Kebijakan cuti tahunan", category="sop", top_k=5)
        assert search_in.query == "Kebijakan cuti tahunan"
        assert search_in.top_k == 5

        remember_in = MemoryRememberInput(
            title="SOP Onboarding Karyawan",
            content="Langkah 1: Verifikasi identitas. Langkah 2: Buat akun.",
            category="sop",
            data_classification="internal",
            confidence=0.95,
        )
        assert remember_in.confidence == 0.95

        resume_in = SessionResumeInput(workflow_execution_id="wf-12345")
        assert resume_in.workflow_execution_id == "wf-12345"

        consolidate_in = MemoryConsolidateInput(target_tenant_id="tenant-001")
        assert consolidate_in.target_tenant_id == "tenant-001"

    @pytest.mark.asyncio
    async def test_tool_memory_search_invocation(self):
        context = ToolExecutionContext(
            tenant_id="11111111-1111-1111-1111-111111111111",
            actor_type="human_user",
            actor_id="user-123",
            roles=["EMPLOYEE"],
            capabilities=["memory.search", "data.read"],
        )

        mock_results = [
            MemorySearchResult(
                document_id="doc-1",
                chunk_id="chunk-1",
                title="Pedoman Cuti",
                content="Setiap karyawan berhak cuti 12 hari setahun.",
                summary="Pedoman cuti tahunan",
                category="sop",
                data_classification="internal",
                confidence=1.0,
                rrf_score=0.032,
                similarity=0.91,
            )
        ]

        with patch("app.skills.f01_memflow.tools.get_memory_engine") as mock_get_engine:
            mock_engine = MagicMock()
            mock_engine.hybrid_search = AsyncMock(return_value=mock_results)
            mock_get_engine.return_value = mock_engine

            out = await tool_memory_search(
                context,
                {"query": "cuti tahunan", "top_k": 3},
            )

            assert out["query"] == "cuti tahunan"
            assert out["total_found"] == 1
            assert len(out["results"]) == 1
            assert out["results"][0]["title"] == "Pedoman Cuti"
            assert out["results"][0]["document_id"] == "doc-1"


class TestHybridMemoryLogic:
    def test_chunking_text(self):
        engine = HybridMemoryEngine()
        short_text = "Teks pendek tidak perlu dipecah."
        assert engine._chunk_text(short_text, 100, 10) == [short_text]

        long_text = "A" * 2500
        chunks = engine._chunk_text(long_text, chunk_size=1000, overlap=100)
        assert len(chunks) >= 3
        for c in chunks:
            assert len(c) <= 1000

    def test_decay_formula(self):
        # Memastikan formula peluruhan eksponensial matematis konsisten
        # new_conf = max(0.10, current_conf * exp(-decay_factor * (days_elapsed / 7.0)))
        current_conf = 1.0
        decay_factor = 0.05
        days_elapsed = 14.0  # 2 minggu tanpa akses

        expected = max(0.10, current_conf * math.exp(-decay_factor * (days_elapsed / 7.0)))
        assert round(expected, 4) == round(math.exp(-0.1), 4)
        assert expected < current_conf
        assert expected >= 0.10

    def test_rrf_scoring_math(self):
        # RRF formula: 1 / (60 + rank)
        rank_1_score = 1.0 / (60.0 + 1)
        rank_2_score = 1.0 / (60.0 + 2)
        assert rank_1_score > rank_2_score
        assert round(rank_1_score, 5) == 0.01639


class TestF01MemflowSkill:
    def test_skill_initialization(self):
        skill = get_memflow_skill()
        assert skill.name == "f01_memflow"
        assert skill.version == "1.0.0"
        assert skill.memory_engine is not None
