
"""
Canonical OrchestreeAI Model Router.

Provider policy:
- OpenAI Responses API is the primary text/reasoning provider.
- NVIDIA NIM is the single text/reasoning fallback.
- OpenAI embeddings are used by the same canonical gateway for Memory/RAG.

There is exactly one Model Router implementation. Provider credentials and
provider selection remain server-side.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx
import sqlalchemy as sa
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_engine

logger = logging.getLogger("orchestree.model_router")


class ModelRouterRequest(BaseModel):
    tenant_id: str
    task_type: str = "text_generation"
    prompt: str
    system_prompt: Optional[str] = "Anda adalah asisten kognitif otonom OrchestreeAI."
    preferred_model: Optional[str] = None
    max_tokens: int = Field(default=2048, ge=1, le=32768)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    workflow_execution_id: Optional[str] = None
    user_id: Optional[str] = None


class ModelRouterResponse(BaseModel):
    content: str
    provider_id: str
    model_id: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    status: str = "success"
    error_message: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


class LLMProviderAdapter(ABC):
    @property
    @abstractmethod
    def provider_id(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def default_model(self) -> str:
        raise NotImplementedError

    @abstractmethod
    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        raise NotImplementedError


class OpenAIAdapter(LLMProviderAdapter):
    """Primary OpenAI Responses API adapter."""

    provider_id = "openai"

    @property
    def default_model(self) -> str:
        return settings.OPENAI_MODEL or ""

    def __init__(self) -> None:
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = (settings.OPENAI_BASE_URL or "").rstrip("/")

    def _model(self, request: ModelRouterRequest) -> str:
        return request.preferred_model or self.default_model

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        started = time.perf_counter()
        model = self._model(request)

        if not self.api_key or not self.base_url or not model:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model or "unconfigured",
                status="failed",
                error_message="OpenAI provider is not configured.",
            )

        payload: Dict[str, Any] = {
            "model": model,
            "input": [{"role": "user", "content": request.prompt}],
            "max_output_tokens": request.max_tokens,
        }
        if request.system_prompt:
            payload["instructions"] = request.system_prompt
        payload["temperature"] = request.temperature

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/responses",
                    json=payload,
                    headers=self._headers(),
                )
            latency_ms = int((time.perf_counter() - started) * 1000)

            if response.status_code >= 400:
                return ModelRouterResponse(
                    content="",
                    provider_id=self.provider_id,
                    model_id=model,
                    latency_ms=latency_ms,
                    status="failed",
                    error_message="OpenAI request failed.",
                    raw_response={"status_code": response.status_code},
                )

            data = response.json()
            content = str(data.get("output_text") or "")
            usage = data.get("usage") or {}

            return ModelRouterResponse(
                content=content,
                provider_id=self.provider_id,
                model_id=model,
                prompt_tokens=int(usage.get("input_tokens") or 0),
                completion_tokens=int(usage.get("output_tokens") or 0),
                total_tokens=int(usage.get("total_tokens") or 0),
                latency_ms=latency_ms,
                status="success" if content else "failed",
                error_message=None if content else "OpenAI returned an empty response.",
                raw_response={"id": data.get("id"), "status": data.get("status")},
            )
        except Exception:
            logger.exception("OpenAI generation request failed")
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model or "unconfigured",
                latency_ms=int((time.perf_counter() - started) * 1000),
                status="failed",
                error_message="OpenAI request could not be completed.",
            )

    async def embed_text(self, text: str, output_dimension: int = 1536) -> List[float]:
        if not self.api_key or not self.base_url or not settings.OPENAI_EMBEDDING_MODEL:
            raise RuntimeError("OpenAI embedding provider is not configured.")

        payload: Dict[str, Any] = {
            "model": settings.OPENAI_EMBEDDING_MODEL,
            "input": text,
            "encoding_format": "float",
            "dimensions": output_dimension,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    json=payload,
                    headers=self._headers(),
                )
            if response.status_code >= 400:
                logger.error("OpenAI embedding request failed with status %s", response.status_code)
                raise RuntimeError("OpenAI embedding request failed.")

            values = response.json().get("data", [{}])[0].get("embedding", [])
            if not values:
                raise RuntimeError("OpenAI returned an empty embedding.")
            return [float(value) for value in values]
        except RuntimeError:
            raise
        except Exception:
            logger.exception("OpenAI embedding request failed")
            raise RuntimeError("OpenAI embedding request could not be completed.")

    async def health_check(self) -> Dict[str, Any]:
        started = time.perf_counter()
        if not self.api_key or not self.base_url or not self.default_model:
            return {"status": "down", "latency_ms": 0, "error": "OpenAI provider is not configured."}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers(),
                )
            latency_ms = int((time.perf_counter() - started) * 1000)
            if response.status_code == 200:
                return {"status": "healthy", "latency_ms": latency_ms}
            return {"status": "degraded", "latency_ms": latency_ms, "error": "OpenAI health check failed."}
        except Exception:
            return {
                "status": "down",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "error": "OpenAI health check could not be completed.",
            }


class NvidiaNimAdapter(LLMProviderAdapter):
    """Single fallback provider for text/reasoning."""

    provider_id = "nvidia_nim"

    @property
    def default_model(self) -> str:
        return settings.NVIDIA_NIM_MODEL or ""

    def __init__(self) -> None:
        self.api_key = settings.NVIDIA_NIM_API_KEY
        self.base_url = (settings.NVIDIA_NIM_BASE_URL or "").rstrip("/")

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        started = time.perf_counter()
        model = self.default_model

        if not self.api_key or not self.base_url or not model:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model or "unconfigured",
                status="failed",
                error_message="NVIDIA NIM fallback is not configured.",
            )

        messages: List[Dict[str, str]] = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )
            latency_ms = int((time.perf_counter() - started) * 1000)

            if response.status_code >= 400:
                return ModelRouterResponse(
                    content="",
                    provider_id=self.provider_id,
                    model_id=model,
                    latency_ms=latency_ms,
                    status="failed",
                    error_message="NVIDIA NIM fallback request failed.",
                    raw_response={"status_code": response.status_code},
                )

            data = response.json()
            content = str(data.get("choices", [{}])[0].get("message", {}).get("content") or "")
            usage = data.get("usage") or {}

            return ModelRouterResponse(
                content=content,
                provider_id=self.provider_id,
                model_id=model,
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
                total_tokens=int(usage.get("total_tokens") or 0),
                latency_ms=latency_ms,
                status="success" if content else "failed",
                error_message=None if content else "NVIDIA NIM returned an empty response.",
                raw_response={"id": data.get("id")},
            )
        except Exception:
            logger.exception("NVIDIA NIM fallback request failed")
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model or "unconfigured",
                latency_ms=int((time.perf_counter() - started) * 1000),
                status="failed",
                error_message="NVIDIA NIM fallback request could not be completed.",
            )

    async def health_check(self) -> Dict[str, Any]:
        started = time.perf_counter()
        if not self.api_key or not self.base_url or not self.default_model:
            return {"status": "down", "latency_ms": 0, "error": "NVIDIA NIM fallback is not configured."}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
            latency_ms = int((time.perf_counter() - started) * 1000)
            if response.status_code == 200:
                return {"status": "healthy", "latency_ms": latency_ms}
            return {"status": "degraded", "latency_ms": latency_ms, "error": "NVIDIA NIM health check failed."}
        except Exception:
            return {
                "status": "down",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "error": "NVIDIA NIM health check could not be completed.",
            }


class ModelRouter:
    """
    The only canonical LLM gateway.

    Text/reasoning chain:
        OpenAI -> NVIDIA NIM

    The browser cannot select a provider. OpenRouter and Gemini are not
    registered in this router.
    """

    def __init__(self) -> None:
        self.adapters: Dict[str, LLMProviderAdapter] = {
            "openai": OpenAIAdapter(),
            "nvidia_nim": NvidiaNimAdapter(),
        }

    async def embed_text(self, text: str, output_dimension: int = 1536) -> List[float]:
        adapter = self.adapters["openai"]
        if not isinstance(adapter, OpenAIAdapter):
            raise RuntimeError("Canonical OpenAI embedding adapter is unavailable.")
        return await adapter.embed_text(text=text, output_dimension=output_dimension)

    async def route(self, request: ModelRouterRequest) -> ModelRouterResponse:
        tokenopt_context = None

        if request.tenant_id and request.task_type != "image_generation":
            try:
                from app.skills.f01_tokenopt import get_tokenopt_skill
                tokenopt = get_tokenopt_skill()

                async def _get_embedding(text_to_embed: str) -> List[float]:
                    return await self.embed_text(text_to_embed, output_dimension=1536)

                is_hit, cached_payload, tokenopt_context = await tokenopt.inspect_and_intercept(
                    tenant_id=request.tenant_id,
                    task_type=request.task_type,
                    prompt=request.prompt,
                    system_prompt=request.system_prompt,
                    preferred_model=request.preferred_model,
                    embed_fn=_get_embedding,
                )

                if is_hit and cached_payload:
                    cached_res = ModelRouterResponse(
                        content=cached_payload["response_content"],
                        provider_id=f"tokenopt_cache:{cached_payload['provider_id']}",
                        model_id=cached_payload["model_id"],
                        status="success",
                        prompt_tokens=tokenopt_context.get("estimated_prompt_tokens", 0),
                        completion_tokens=max(
                            0,
                            cached_payload["total_tokens"]
                            - tokenopt_context.get("estimated_prompt_tokens", 0),
                        ),
                        total_tokens=cached_payload["total_tokens"],
                        latency_ms=15,
                        raw_response={"cached": True, "cache_id": str(cached_payload["id"])},
                    )
                    await self._log_usage(request, cached_res)
                    return cached_res

                if tokenopt_context and not request.preferred_model:
                    request.preferred_model = tokenopt_context.get("selected_model")
            except Exception as opt_err:
                logger.warning("F.01-TOKENOPT intercept failed: %s", opt_err)

        reservation = None
        est = None
        if request.tenant_id:
            try:
                from app.domains.billing.credit_engine import estimate_credit_cost, reserve_credit

                act_code = "data_processing" if request.task_type == "image_generation" else "simple_chat"
                comp_code = "high" if request.task_type == "image_generation" else "medium"
                est = await estimate_credit_cost(
                    activity_code=act_code,
                    complexity_code=comp_code,
                    llm_model_id=settings.OPENAI_MODEL or "unconfigured",
                    tool_risk_tier=None,
                    execution_mode="single_step",
                )
                reservation = await reserve_credit(
                    tenant_id=request.tenant_id,
                    estimate=est,
                    activity_type_id=act_code,
                    reference_type="model_router",
                    reference_id=f"llm-{uuid.uuid4().hex[:12]}",
                    execution_ref=request.workflow_execution_id,
                    metadata={
                        "task_type": request.task_type,
                        "preferred_model": request.preferred_model,
                        "primary_provider": "openai",
                        "fallback_provider": "nvidia_nim",
                    },
                )
            except Exception:
                logger.exception("Credit reservation failed for tenant %s", request.tenant_id)
                return ModelRouterResponse(
                    content="",
                    provider_id="none",
                    model_id="none",
                    status="failed",
                    error_message="AI credit reservation could not be completed.",
                )

        for provider_id in ("openai", "nvidia_nim"):
            adapter = self.adapters[provider_id]
            try:
                response = await adapter.generate(request)
                if response.status == "success" and response.content:
                    if reservation:
                        try:
                            from app.domains.billing.credit_engine import consume_credit
                            actual_cost = max(1.0, float(response.total_tokens or 100) * 0.005)
                            await consume_credit(
                                reservation=reservation,
                                actual_cost=actual_cost,
                                execution_ref=(
                                    f"{response.provider_id}:{response.model_id}:"
                                    f"{request.workflow_execution_id or 'direct'}"
                                ),
                            )
                        except Exception:
                            logger.exception("Failed to consume AI credits")

                    if request.tenant_id and tokenopt_context:
                        try:
                            from app.skills.f01_tokenopt import get_tokenopt_skill
                            await get_tokenopt_skill().record_new_completion(
                                tenant_id=request.tenant_id,
                                task_type=request.task_type,
                                prompt=request.prompt,
                                response_content=response.content,
                                provider_id=response.provider_id,
                                model_id=response.model_id,
                                prompt_tokens=response.prompt_tokens,
                                completion_tokens=response.completion_tokens,
                                total_tokens=response.total_tokens,
                                latency_ms=response.latency_ms,
                                context=tokenopt_context,
                            )
                        except Exception:
                            logger.exception("Failed to record F.01-TOKENOPT completion")

                    await self._log_usage(request, response)
                    return response

                logger.warning("Provider %s failed; trying the next configured provider.", provider_id)
            except Exception:
                logger.exception("Provider %s raised an unexpected error.", provider_id)

        if reservation:
            try:
                from app.domains.billing.credit_engine import refund_credit
                await refund_credit(reservation)
            except Exception:
                logger.exception("Failed to refund AI credit reservation")

        failed_res = ModelRouterResponse(
            content="",
            provider_id="none",
            model_id="none",
            status="failed",
            error_message="All configured LLM providers are currently unavailable.",
        )
        await self._log_usage(request, failed_res)
        return failed_res

    async def _log_usage(self, request: ModelRouterRequest, response: ModelRouterResponse) -> None:
        workflow_execution_id = None
        if request.workflow_execution_id:
            try:
                workflow_execution_id = str(uuid.UUID(str(request.workflow_execution_id)))
            except (ValueError, AttributeError):
                workflow_execution_id = None

        try:
            engine = get_engine()
            async with engine.begin() as conn:
                if request.tenant_id:
                    await conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                        {"val": request.tenant_id},
                    )
                await conn.execute(
                    sa.text(
                        """
                        INSERT INTO llm_usage_logs (
                            tenant_id, workflow_execution_id, provider_id, model_id,
                            prompt_tokens, completion_tokens, total_tokens, latency_ms, status
                        ) VALUES (
                            :tenant_id, :workflow_execution_id, :provider_id, :model_id,
                            :prompt_tokens, :completion_tokens, :total_tokens, :latency_ms, :status
                        );
                        """
                    ),
                    {
                        "tenant_id": request.tenant_id,
                        "workflow_execution_id": workflow_execution_id,
                        "provider_id": response.provider_id,
                        "model_id": response.model_id,
                        "prompt_tokens": response.prompt_tokens,
                        "completion_tokens": response.completion_tokens,
                        "total_tokens": response.total_tokens,
                        "latency_ms": response.latency_ms,
                        "status": response.status,
                    },
                )
        except Exception:
            logger.exception("Failed to record LLM usage telemetry")

    async def get_all_providers_health(self) -> List[Dict[str, Any]]:
        display_names = {
            "openai": "OpenAI",
            "nvidia_nim": "NVIDIA NIM (Fallback)",
        }
        results = []
        for provider_id, adapter in self.adapters.items():
            health = await adapter.health_check()
            results.append(
                {
                    "id": provider_id,
                    "display_name": display_names[provider_id],
                    "is_active": True,
                    "health_status": health.get("status", "unknown"),
                    "latency_ms": health.get("latency_ms", 0),
                    "error_message": health.get("error"),
                }
            )
        return results

    async def stream_generate(self, request: ModelRouterRequest) -> AsyncIterator[Dict[str, Any]]:
        for provider_id in ("openai", "nvidia_nim"):
            adapter = self.adapters[provider_id]
            try:
                if provider_id == "openai" and isinstance(adapter, OpenAIAdapter):
                    if not adapter.api_key or not adapter.base_url or not adapter.default_model:
                        continue

                    model = adapter._model(request)
                    payload: Dict[str, Any] = {
                        "model": model,
                        "input": [{"role": "user", "content": request.prompt}],
                        "max_output_tokens": request.max_tokens,
                        "stream": True,
                    }
                    if request.system_prompt:
                        payload["instructions"] = request.system_prompt
                    payload["temperature"] = request.temperature

                    async with httpx.AsyncClient(timeout=90.0) as client:
                        async with client.stream(
                            "POST",
                            f"{adapter.base_url}/responses",
                            json=payload,
                            headers=adapter._headers(),
                        ) as response:
                            if response.status_code >= 400:
                                continue

                            emitted = False
                            async for line in response.aiter_lines():
                                line = line.strip()
                                if not line.startswith("data:"):
                                    continue
                                data_str = line[5:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    event = json.loads(data_str)
                                except json.JSONDecodeError:
                                    continue
                                if event.get("type") == "response.output_text.delta":
                                    delta = event.get("delta", "")
                                    if delta:
                                        emitted = True
                                        yield {
                                            "event": "token",
                                            "token": delta,
                                            "provider": provider_id,
                                            "model": model,
                                        }
                            if emitted:
                                return
                    continue

                if provider_id == "nvidia_nim" and isinstance(adapter, NvidiaNimAdapter):
                    if not adapter.api_key or not adapter.base_url or not adapter.default_model:
                        continue

                    model = adapter.default_model
                    messages: List[Dict[str, str]] = []
                    if request.system_prompt:
                        messages.append({"role": "system", "content": request.system_prompt})
                    messages.append({"role": "user", "content": request.prompt})
                    payload = {
                        "model": model,
                        "messages": messages,
                        "max_tokens": request.max_tokens,
                        "temperature": request.temperature,
                        "stream": True,
                    }

                    async with httpx.AsyncClient(timeout=90.0) as client:
                        async with client.stream(
                            "POST",
                            f"{adapter.base_url}/chat/completions",
                            json=payload,
                            headers={
                                "Authorization": f"Bearer {adapter.api_key}",
                                "Content-Type": "application/json",
                            },
                        ) as response:
                            if response.status_code >= 400:
                                continue

                            emitted = False
                            async for line in response.aiter_lines():
                                line = line.strip()
                                if not line.startswith("data:"):
                                    continue
                                data_str = line[5:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                except json.JSONDecodeError:
                                    continue
                                delta = (
                                    chunk.get("choices", [{}])[0]
                                    .get("delta", {})
                                    .get("content", "")
                                )
                                if delta:
                                    emitted = True
                                    yield {
                                        "event": "token",
                                        "token": delta,
                                        "provider": provider_id,
                                        "model": model,
                                    }
                            if emitted:
                                return
                    continue
            except Exception:
                logger.exception("Streaming provider %s failed; trying fallback.", provider_id)

        yield {
            "event": "error",
            "error": "Seluruh penyedia inferensi LLM yang dikonfigurasi tidak tersedia.",
        }


_model_router_instance: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    global _model_router_instance
    if _model_router_instance is None:
        _model_router_instance = ModelRouter()
    return _model_router_instance
