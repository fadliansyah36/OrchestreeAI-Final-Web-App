"""
Unit tests for OrchestreeAI Cognitive Core, Orchestration Engine, Model Router, and MCP Tools (PRD v2.2)
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from app.core.config import settings
from app.core.model_router.router import (
    ModelRouter,
    ModelRouterRequest,
    ModelRouterResponse,
    NvidiaNimAdapter,
    OpenAIAdapter,
)
from app.skills.f01_mcp.decorators import (
    ToolRegistry,
    MCPToolMetadata,
    ToolExecutionContext,
    mcp_tool,
)
from app.skills.f01_mcp.tools import (
    tool_knowledge_lookup,
    tool_task_create_from_intent,
    tool_crm_contact_verify,
)
from app.core.orchestration.engine import (
    OrchestrationEngine,
    WorkflowDispatchRequest,
    WorkflowGraphSpec,
    WorkflowNodeSpec,
)


class TestModelRouter:
    def test_adapters_initialization(self):
        router = ModelRouter()
        assert list(router.adapters) == ["openai", "nvidia_nim"]

    def test_generation_models_are_server_selected(self):
        original = {
            "OPENAI_MODEL": settings.OPENAI_MODEL,
            "OPENAI_CONTENT_MODEL": settings.OPENAI_CONTENT_MODEL,
            "OPENAI_DOCUMENT_MODEL": settings.OPENAI_DOCUMENT_MODEL,
            "OPENAI_DESIGN_MODEL": settings.OPENAI_DESIGN_MODEL,
        }
        try:
            settings.OPENAI_MODEL = "openai-text-default"
            settings.OPENAI_CONTENT_MODEL = "openai-content"
            settings.OPENAI_DOCUMENT_MODEL = "openai-document"
            settings.OPENAI_DESIGN_MODEL = "openai-design"
            adapter = OpenAIAdapter()

            assert adapter._model(
                ModelRouterRequest(
                    tenant_id="tenant",
                    task_type="content_generation",
                    prompt="content",
                    preferred_model="legacy-provider-model",
                )
            ) == "openai-content"
            assert adapter._model(
                ModelRouterRequest(
                    tenant_id="tenant",
                    task_type="document_design",
                    prompt="document",
                    preferred_model="legacy-provider-model",
                )
            ) == "openai-document"
            assert adapter._model(
                ModelRouterRequest(
                    tenant_id="tenant",
                    task_type="design_generation",
                    prompt="design",
                    preferred_model="legacy-provider-model",
                )
            ) == "openai-design"
        finally:
            for key, value in original.items():
                setattr(settings, key, value)

    @pytest.mark.asyncio
    async def test_model_router_fallback(self):
        router = ModelRouter()
        router.adapters["openai"].generate = AsyncMock(
            return_value=ModelRouterResponse(
                content="",
                provider_id="openai",
                model_id="test-openai",
                status="failed",
                error_message="Simulated primary provider failure",
            )
        )
        router.adapters["nvidia_nim"].generate = AsyncMock(
            return_value=ModelRouterResponse(
                content="Jawaban sukses dari NVIDIA NIM",
                provider_id="nvidia_nim",
                model_id="test-nim",
                prompt_tokens=10,
                completion_tokens=20,
                total_tokens=30,
                latency_ms=150,
                status="success",
            )
        )
        router._log_usage = AsyncMock()

        req = ModelRouterRequest(
            tenant_id="11111111-1111-1111-1111-111111111111",
            prompt="Halo OrchestreeAI",
        )
        resp = await router.route(req)
        assert resp.status == "success"
        assert resp.provider_id == "nvidia_nim"
        assert resp.content == "Jawaban sukses dari NVIDIA NIM"


class TestMCPTools:
    @pytest.mark.asyncio
    async def test_crm_contact_verify_tool(self):
        ctx = ToolExecutionContext(
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["STAFF_AI"],
            capabilities=["mcp.tool.invoke"],
        )
        # Test valid WhatsApp number formatting
        res = await tool_crm_contact_verify(ctx, {"contact_value": "081234567890", "channel_type": "whatsapp"})
        assert res["is_valid"] is True
        assert res["formatted_target"] == "+6281234567890"

        # Test valid email
        res_email = await tool_crm_contact_verify(ctx, {"contact_value": "admin@orchestree.biz.id", "channel_type": "email"})
        assert res_email["is_valid"] is True
        assert res_email["formatted_target"] == "admin@orchestree.biz.id"

    @pytest.mark.asyncio
    async def test_knowledge_lookup_tool(self):
        ctx = ToolExecutionContext(
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["STAFF_AI"],
            capabilities=["mcp.tool.invoke"],
        )
        res = await tool_knowledge_lookup(ctx, {"query": "SOP onboarding"})
        assert len(res["results"]) > 0
        assert res["confidence"] > 0.8

    @pytest.mark.asyncio
    async def test_mcp_tool_pdp_denial(self):
        ctx_denied = ToolExecutionContext(
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["ANONYMOUS"],
            capabilities=[],  # No capabilities
        )
        registry = ToolRegistry()

        @mcp_tool(name="secure.test_tool", description="Test tool")
        async def dummy_handler(ctx, inp):
            return {"ok": True}

        with pytest.raises(PermissionError):
            await dummy_handler(ctx_denied, {})


class TestOrchestrationEngine:
    @pytest.mark.asyncio
    async def test_orchestration_engine_dispatch(self):
        engine = OrchestrationEngine()
        engine._save_node_run_start = AsyncMock()
        engine._save_node_run_finish = AsyncMock()
        engine._checkpoint_execution = AsyncMock()

        # Mock ModelRouter responses
        engine.model_router.route = AsyncMock(
            return_value=ModelRouterResponse(
                content='{"category": "task", "urgency": "high", "target_tool": "task.create_from_intent"}',
                provider_id="nvidia",
                model_id="meta/llama-3.2-11b-vision-instruct",
                status="success",
            )
        )

        req = WorkflowDispatchRequest(
            tenant_id="11111111-1111-1111-1111-111111111111",
            intent_text="Follow up klien potensial PT Maju Jaya via WhatsApp",
            roles=["TENANT_ADMIN"],
            capabilities=["workflow.dispatch", "workflow.node.execute", "mcp.tool.invoke", "tasks.board.manage"],
        )

        res = await engine.dispatch(req)
        assert res.status == "completed"
        assert len(res.nodes_executed) >= 3
        assert "node_classify" in res.nodes_executed
        assert "node_plan" in res.nodes_executed


def test_model_router_provider_policy_is_openai_then_nvidia():
    from app.core.model_router.router import ModelRouter

    router = ModelRouter()
    assert list(router.adapters) == ["openai", "nvidia_nim"]


def test_model_router_does_not_register_retired_providers():
    from app.core.model_router.router import ModelRouter

    router = ModelRouter()
    assert "openrouter" not in router.adapters
    assert "gemini" not in router.adapters
