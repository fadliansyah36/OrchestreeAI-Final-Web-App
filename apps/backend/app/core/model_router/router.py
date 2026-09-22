"""
OrchestreeAI Multi-LLM Model Router (PRD v2.2 Bagian 8.2)
Mengatur perutean inferensi dinamis, fallback multi-provider, dan pencatatan telemetri penggunaan nyata ke llm_usage_logs.

Adapter Nyata:
1. NVIDIA NIM (Prioritas 1)
2. OpenRouter (Prioritas 2)
3. GPT-Image-2 (APIMart / OpenAI Modality Gambar)
4. Google Gemini (GenAI Multimodal)
"""

import time
import os
import json
import uuid
import logging
from decimal import Decimal
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine

logger = logging.getLogger("orchestree.model_router")


class ModelRouterRequest(BaseModel):
    tenant_id: str
    task_type: str = "text_generation"  # text_generation, classification, planning, vision, image_generation
    prompt: str
    system_prompt: Optional[str] = "Anda adalah asisten kognitif otonom OrchestreeAI."
    preferred_provider: Optional[str] = None
    preferred_model: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
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
    """Antarmuka dasar adapter penyedia model LLM."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        pass

    @abstractmethod
    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        pass

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        pass


class NvidiaNimAdapter(LLMProviderAdapter):
    """Adapter NVIDIA NIM Enterprise API (Prioritas 1)."""

    @property
    def provider_id(self) -> str:
        return "nvidia"

    @property
    def default_model(self) -> str:
        return "meta/llama-3.2-11b-vision-instruct"

    def __init__(self):
        self.api_key = os.getenv("NVIDIA_API_KEY") or os.getenv("NVIDIA_NIM_API_KEY") or ""
        self.base_url = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        start_time = time.perf_counter()
        model = request.preferred_model or self.default_model

        if not self.api_key:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                status="failed",
                error_message="NVIDIA NIM API key is not configured.",
            )

        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(
                    f"{self.base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                latency_ms = int((time.perf_counter() - start_time) * 1000)

                if res.status_code != 200:
                    return ModelRouterResponse(
                        content="",
                        provider_id=self.provider_id,
                        model_id=model,
                        latency_ms=latency_ms,
                        status="failed",
                        error_message=f"NVIDIA NIM error {res.status_code}: {res.text[:200]}",
                    )

                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                usage = data.get("usage", {})

                return ModelRouterResponse(
                    content=content,
                    provider_id=self.provider_id,
                    model_id=model,
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                    latency_ms=latency_ms,
                    status="success",
                    raw_response=data,
                )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                latency_ms=latency_ms,
                status="failed",
                error_message=str(e),
            )

    async def health_check(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.api_key:
            return {"status": "down", "latency_ms": 0, "error": "API key missing"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{self.base_url.rstrip('/')}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {"status": "healthy", "latency_ms": latency, "models_count": len(res.json().get("data", []))}
                return {"status": "degraded", "latency_ms": latency, "error": f"Status {res.status_code}"}
        except Exception as e:
            return {"status": "down", "latency_ms": int((time.perf_counter() - start) * 1000), "error": str(e)}


class OpenRouterAdapter(LLMProviderAdapter):
    """Adapter OpenRouter Multi-LLM Gateway (Prioritas 2)."""

    @property
    def provider_id(self) -> str:
        return "openrouter"

    @property
    def default_model(self) -> str:
        return "liquid/lfm-2.5-2.6b:free"

    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        start_time = time.perf_counter()
        model = request.preferred_model or self.default_model

        if not self.api_key:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                status="failed",
                error_message="OpenRouter API key is not configured.",
            )

        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://orchestree.biz.id",
            "X-Title": "OrchestreeAI",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(
                    f"{self.base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                latency_ms = int((time.perf_counter() - start_time) * 1000)

                if res.status_code != 200:
                    return ModelRouterResponse(
                        content="",
                        provider_id=self.provider_id,
                        model_id=model,
                        latency_ms=latency_ms,
                        status="failed",
                        error_message=f"OpenRouter error {res.status_code}: {res.text[:200]}",
                    )

                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                usage = data.get("usage", {})

                return ModelRouterResponse(
                    content=content,
                    provider_id=self.provider_id,
                    model_id=model,
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                    latency_ms=latency_ms,
                    status="success",
                    raw_response=data,
                )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                latency_ms=latency_ms,
                status="failed",
                error_message=str(e),
            )

    async def health_check(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.api_key:
            return {"status": "down", "latency_ms": 0, "error": "API key missing"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{self.base_url.rstrip('/')}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {"status": "healthy", "latency_ms": latency}
                return {"status": "degraded", "latency_ms": latency, "error": f"Status {res.status_code}"}
        except Exception as e:
            return {"status": "down", "latency_ms": int((time.perf_counter() - start) * 1000), "error": str(e)}


class GptImage2Adapter(LLMProviderAdapter):
    """Adapter GPT-Image-2 (APIMart / OpenAI Modality Image)."""

    @property
    def provider_id(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return "gpt-image-2"

    def __init__(self):
        self.api_key = os.getenv("GPT_IMAGE_2_API_KEY") or os.getenv("OPENAI_API_KEY", "")
        self.endpoint_url = os.getenv("GPT_IMAGE_2_API_URL", "https://api.apimart.ai/v1/images/generations")

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        start_time = time.perf_counter()
        model = request.preferred_model or self.default_model

        if not self.api_key:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                status="failed",
                error_message="GPT-Image-2 API key is not configured.",
            )

        payload = {
            "model": model,
            "prompt": request.prompt,
            "n": 1,
            "size": "1024x1024",
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(
                    self.endpoint_url,
                    json=payload,
                    headers=headers,
                )
                latency_ms = int((time.perf_counter() - start_time) * 1000)

                if res.status_code != 200:
                    return ModelRouterResponse(
                        content="",
                        provider_id=self.provider_id,
                        model_id=model,
                        latency_ms=latency_ms,
                        status="failed",
                        error_message=f"GPT-Image-2 error {res.status_code}: {res.text[:200]}",
                    )

                data = res.json()
                img_url = data.get("data", [{}])[0].get("url", "")
                return ModelRouterResponse(
                    content=img_url,
                    provider_id=self.provider_id,
                    model_id=model,
                    latency_ms=latency_ms,
                    status="success",
                    raw_response=data,
                )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                latency_ms=latency_ms,
                status="failed",
                error_message=str(e),
            )

    async def health_check(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.api_key:
            return {"status": "down", "latency_ms": 0, "error": "API key missing"}
        try:
            # Check ping / endpoint response
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    self.endpoint_url,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"prompt": "ping health check", "n": 1, "size": "256x256"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                # If balance is 0 or 400 with specific code, provider is reachable but constrained
                if res.status_code in (200, 400, 402):
                    return {"status": "healthy" if res.status_code == 200 else "degraded", "latency_ms": latency}
                return {"status": "degraded", "latency_ms": latency, "error": f"Status {res.status_code}"}
        except Exception as e:
            return {"status": "down", "latency_ms": int((time.perf_counter() - start) * 1000), "error": str(e)}


class GeminiAdapter(LLMProviderAdapter):
    """Adapter Google Gemini GenAI Multimodal."""

    @property
    def provider_id(self) -> str:
        return "gemini"

    @property
    def default_model(self) -> str:
        return "gemini-3.6-flash"

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")

    async def generate(self, request: ModelRouterRequest) -> ModelRouterResponse:
        start_time = time.perf_counter()
        model = request.preferred_model or self.default_model

        if not self.api_key:
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                status="failed",
                error_message="Gemini API key is not configured.",
            )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"

        contents = []
        if request.system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTION: {request.system_prompt}"}]})
        contents.append({"role": "user", "parts": [{"text": request.prompt}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": request.max_tokens,
                "temperature": request.temperature,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                res = await client.post(url, json=payload)
                latency_ms = int((time.perf_counter() - start_time) * 1000)

                if res.status_code != 200:
                    return ModelRouterResponse(
                        content="",
                        provider_id=self.provider_id,
                        model_id=model,
                        latency_ms=latency_ms,
                        status="failed",
                        error_message=f"Gemini API error {res.status_code}: {res.text[:200]}",
                    )

                data = res.json()
                text = ""
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    text = "".join(p.get("text", "") for p in parts)

                usage = data.get("usageMetadata", {})
                return ModelRouterResponse(
                    content=text,
                    provider_id=self.provider_id,
                    model_id=model,
                    prompt_tokens=usage.get("promptTokenCount", 0),
                    completion_tokens=usage.get("candidatesTokenCount", 0),
                    total_tokens=usage.get("totalTokenCount", 0),
                    latency_ms=latency_ms,
                    status="success",
                    raw_response=data,
                )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return ModelRouterResponse(
                content="",
                provider_id=self.provider_id,
                model_id=model,
                latency_ms=latency_ms,
                status="failed",
                error_message=str(e),
            )

    async def health_check(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.api_key:
            return {"status": "down", "latency_ms": 0, "error": "API key missing"}
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url)
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {"status": "healthy", "latency_ms": latency}
                return {"status": "degraded", "latency_ms": latency, "error": f"Status {res.status_code}"}
        except Exception as e:
            return {"status": "down", "latency_ms": int((time.perf_counter() - start) * 1000), "error": str(e)}


class ModelRouter:
    """
    Router Multi-LLM Terpusat dengan Prioritas Dinamis:
    1. NVIDIA NIM
    2. OpenRouter
    3. Google Gemini
    Fallback otomatis berantai jika penyedia gagal atau rate limited.
    """

    def __init__(self):
        self.adapters: Dict[str, LLMProviderAdapter] = {
            "nvidia": NvidiaNimAdapter(),
            "openrouter": OpenRouterAdapter(),
            "openai": GptImage2Adapter(),
            "gemini": GeminiAdapter(),
        }

    async def route(self, request: ModelRouterRequest) -> ModelRouterResponse:
        """
        Rute inferensi dengan urutan prioritas adaptif.
        Menyimpan telemetri panggilan ke llm_usage_logs.
        Mengintegrasikan Credit State Machine (reserve_credit -> consume_credit -> refund_credit).
        """
        # Reservasi kredit sebelum memanggil provider
        reservation = None
        if request.tenant_id:
            try:
                from app.domains.billing.credits import reserve_credit
                estimated = Decimal("50.0000") if request.task_type == "image_generation" else Decimal("15.0000")
                reservation = await reserve_credit(
                    tenant_id=request.tenant_id,
                    estimated_cost=estimated,
                    reference_type="model_router",
                    reference_id=f"llm-{uuid.uuid4().hex[:12]}",
                    metadata={"task_type": request.task_type, "preferred_model": request.preferred_model},
                )
            except Exception as e:
                logger.error(f"Credit reservation failed for tenant {request.tenant_id}: {e}")
                return ModelRouterResponse(
                    content="",
                    provider_id="none",
                    model_id="none",
                    status="failed",
                    error_message=f"Gagal reservasi kredit: {str(e)}",
                )

        # Urutan prioritas eksekusi
        if request.task_type == "image_generation":
            provider_chain = ["openai", "gemini"]
        else:
            if request.preferred_provider and request.preferred_provider in self.adapters:
                provider_chain = [request.preferred_provider] + [p for p in ["nvidia", "openrouter", "gemini"] if p != request.preferred_provider]
            else:
                provider_chain = ["nvidia", "openrouter", "gemini"]

        last_error = None
        for prov_id in provider_chain:
            adapter = self.adapters.get(prov_id)
            if not adapter:
                continue

            try:
                response = await adapter.generate(request)
                if response.status == "success" and response.content:
                    # Konsumsi kredit aktual
                    if reservation:
                        try:
                            from app.domains.billing.credits import consume_credit
                            if request.task_type == "image_generation":
                                actual_cost = Decimal("40.0000")
                            else:
                                actual_cost = max(Decimal("1.0000"), Decimal(str(response.total_tokens or 100)) * Decimal("0.0050"))
                            await consume_credit(
                                reservation_id=reservation.id,
                                actual_cost=actual_cost,
                                metadata={
                                    "provider_id": response.provider_id,
                                    "model_id": response.model_id,
                                    "total_tokens": response.total_tokens,
                                },
                            )
                        except Exception as cred_err:
                            logger.warning(f"Gagal mencatat konsumsi kredit: {cred_err}")

                    await self._log_usage(request, response)
                    return response
                else:
                    last_error = response.error_message
                    logger.warning(f"Provider {prov_id} failed: {response.error_message}. Trying fallback...")
            except Exception as e:
                last_error = str(e)
                logger.error(f"Error calling adapter {prov_id}: {e}")

        # Jika semua provider gagal, refund kredit yang direservasi
        if reservation:
            try:
                from app.domains.billing.credits import refund_credit
                await refund_credit(
                    reservation_id=reservation.id,
                    reason=f"Semua provider LLM gagal: {last_error}",
                    metadata={"error": str(last_error)},
                )
            except Exception as ref_err:
                logger.warning(f"Gagal melakukan refund kredit reservasi {reservation.id}: {ref_err}")

        failed_res = ModelRouterResponse(
            content="",
            provider_id="none",
            model_id="none",
            status="failed",
            error_message=f"Semua provider LLM gagal dipanggil. Kesalahan terakhir: {last_error}",
        )
        await self._log_usage(request, failed_res)
        return failed_res

    async def _log_usage(self, request: ModelRouterRequest, response: ModelRouterResponse):
        """Catat penggunaan token, latensi, dan status ke tabel llm_usage_logs di database."""
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                # Set tenant session variable untuk RLS
                if request.tenant_id:
                    await conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                        {"val": request.tenant_id},
                    )

                await conn.execute(
                    sa.text("""
                        INSERT INTO llm_usage_logs (
                            tenant_id,
                            workflow_execution_id,
                            provider_id,
                            model_id,
                            prompt_tokens,
                            completion_tokens,
                            total_tokens,
                            latency_ms,
                            status
                        ) VALUES (
                            :tenant_id,
                            :workflow_execution_id,
                            :provider_id,
                            :model_id,
                            :prompt_tokens,
                            :completion_tokens,
                            :total_tokens,
                            :latency_ms,
                            :status
                        );
                    """),
                    {
                        "tenant_id": request.tenant_id,
                        "workflow_execution_id": request.workflow_execution_id,
                        "provider_id": response.provider_id,
                        "model_id": response.model_id,
                        "prompt_tokens": response.prompt_tokens,
                        "completion_tokens": response.completion_tokens,
                        "total_tokens": response.total_tokens,
                        "latency_ms": response.latency_ms,
                        "status": response.status,
                    },
                )
        except Exception as e:
            logger.warning(f"Gagal mencatat log penggunaan LLM: {e}")

    async def get_all_providers_health(self) -> List[Dict[str, Any]]:
        """Lakukan health check real-time ke semua provider dan perbarui status di DB."""
        results = []
        for prov_id, adapter in self.adapters.items():
            health = await adapter.health_check()
            results.append({
                "id": prov_id,
                "display_name": {
                    "nvidia": "NVIDIA NIM Enterprise API",
                    "openrouter": "OpenRouter AI Gateway",
                    "openai": "GPT-Image-2 (APIMart / OpenAI)",
                    "gemini": "Google Gemini GenAI Multimodal",
                }.get(prov_id, prov_id),
                "is_active": True,
                "health_status": health.get("status", "unknown"),
                "latency_ms": health.get("latency_ms", 0),
                "error_message": health.get("error"),
            })

            # Update ke database
            try:
                engine = get_engine()
                async with engine.begin() as conn:
                    await conn.execute(
                        sa.text("""
                            UPDATE llm_providers
                            SET health_status = :status,
                                latency_ms = :latency_ms,
                                last_health_check = now()
                            WHERE id = :id;
                        """),
                        {
                            "id": prov_id,
                            "status": health.get("status", "unknown"),
                            "latency_ms": health.get("latency_ms", 0),
                        },
                    )
            except Exception as e:
                logger.warning(f"Gagal update status provider {prov_id} ke DB: {e}")

        return results


_model_router_instance: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    global _model_router_instance
    if _model_router_instance is None:
        _model_router_instance = ModelRouter()
    return _model_router_instance
