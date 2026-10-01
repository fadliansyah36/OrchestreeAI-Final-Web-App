"""
OrchestreeAI Ask AI & Real-time Assistant Streaming API (PRD v2.2 Bagian 8.2 & 14.1)
Endpoints:
- POST /api/v1/chat/messages (SSE Streaming + Model Router + Credit Ledger)
"""

import uuid
import json
import logging
import asyncio
from decimal import Decimal
from typing import Optional, Dict, Any, AsyncGenerator
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict

from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability
from app.core.model_router.router import get_model_router, ModelRouterRequest
from app.core.security import AuthenticatedTenantContext, get_trusted_request_context, wrap_untrusted_external_content, sanitize_ai_output
from app.domains.billing.credits import reserve_credit, consume_credit, refund_credit
from app.domains.billing.credit_engine import estimate_credit_cost

logger = logging.getLogger("orchestree.api.chat")

router = APIRouter(prefix="/api/v1/chat", tags=["Ask AI & Chat Streaming"])


class ChatMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(..., min_length=1, max_length=10000, description="Pesan pertanyaan dari staf")
    session_id: Optional[str] = Field(None, max_length=100, description="ID Sesi percakapan")
    system_prompt: Optional[str] = Field(
        "Anda adalah asisten kognitif cerdas OrchestreeAI. Berikan jawaban yang tepat, ringkas, dan profesional.",
        max_length=2000,
        description="Petunjuk sistem",
    )
    preferred_provider: Optional[str] = Field(None, max_length=50, description="nvidia, openrouter, gemini")
    preferred_model: Optional[str] = Field(None, max_length=100, description="Model LLM spesifik")


@router.post("/messages", dependencies=[Depends(require_capability("chat.message.create"))])
async def stream_chat_message(
    payload: ChatMessageRequest,
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    """
    Streaming SSE untuk asisten Ask AI (PRD v2.2 Bagian 8.2):
    1. Validasi PDP authorize()
    2. Reservasi Kredit di Credit Ledger (Estimated 15 CR)
    3. Eksekusi inferensi multi-provider melalui Model Router
    4. Streaming token per token via text/event-stream (SSE)
    5. Rekonsiliasi & konsumsi kredit aktual saat selesai, atau refund jika gagal
    """
    # 1. PDP Authorization
    user_id = context.user_id
    tenant_id = context.tenant_id
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="chat_session",
        resource_id=payload.session_id,
        owner_tenant_id=tenant_id,
    )
    decision = authorize(subject, "chat.message.create", resource)
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Otorisasi ditolak: {decision.reason}")

    # 2. Estimasi & Reservasi Kredit di Dompet Tenant via Credit Engine
    session_id = payload.session_id or str(uuid.uuid4())
    try:
        estimate = await estimate_credit_cost(
            activity_code="simple_chat",
            complexity_code="medium",
            llm_model_id=payload.preferred_model or "default",
            tool_risk_tier=None,
            execution_mode="single_step",
        )
        estimated_cost = Decimal(str(estimate.final_estimate))
    except Exception as est_err:
        logger.warning(f"Gagal kalkulasi estimasi kredit kustom, fallback ke default: {est_err}")
        estimated_cost = Decimal("15.0000")

    reservation = None
    try:
        reservation = await reserve_credit(
            tenant_id=tenant_id,
            estimated_cost=estimated_cost,
            reference_type="chat_message",
            reference_id=session_id,
            metadata={
                "user_id": user_id,
                "provider": payload.preferred_provider,
                "activity_code": "simple_chat",
                "estimated_cost": float(estimated_cost),
            },
        )
    except Exception as e:
        logger.error(f"Gagal melakukan reservasi kredit untuk chat: {e}")
        raise HTTPException(
            status_code=402,
            detail=f"Saldo kredit tidak mencukupi atau dompet kredit bermasalah: {str(e)}",
        )

    # 3. Model Router Stream Generator (Anti-Prompt-Injection & Output Sanitization)
    router_inst = get_model_router()
    secure_prompt = wrap_untrusted_external_content(
        content=payload.message,
        source_type="chat_user_input",
        source_id=user_id,
    )
    req = ModelRouterRequest(
        tenant_id=tenant_id,
        task_type="text_generation",
        prompt=secure_prompt,
        system_prompt=payload.system_prompt,
        preferred_provider=payload.preferred_provider,
        preferred_model=payload.preferred_model,
        max_tokens=1500,
        temperature=0.7,
        user_id=user_id,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        total_tokens = 0
        collected_text = []
        last_provider = "unknown"
        last_model = "unknown"

        # Emit event start
        yield f"data: {json.dumps({'event': 'start', 'session_id': session_id, 'reservation_id': reservation.id})}\n\n"

        try:
            async for chunk in router_inst.stream_generate(req):
                ev_type = chunk.get("event", "token")
                if ev_type == "token":
                    raw_tok = chunk.get("token", "")
                    tok = sanitize_ai_output(raw_tok)
                    collected_text.append(tok)
                    total_tokens += 1
                    last_provider = chunk.get("provider", last_provider)
                    last_model = chunk.get("model", last_model)
                    yield f"data: {json.dumps({'event': 'token', 'token': tok})}\n\n"
                elif ev_type == "error":
                    err_msg = chunk.get("error", "Error pada stream LLM")
                    yield f"data: {json.dumps({'event': 'error', 'error': err_msg})}\n\n"
                    # Refund kredit
                    if reservation:
                        await refund_credit(reservation.id, reason=err_msg)
                        reservation = None
                    return

            # Konsumsi kredit aktual
            actual_cost = max(Decimal("1.0000"), Decimal(str(total_tokens)) * Decimal("0.0050"))
            if reservation:
                await consume_credit(
                    reservation_id=reservation.id,
                    actual_cost=actual_cost,
                    metadata={
                        "provider_id": last_provider,
                        "model_id": last_model,
                        "total_tokens": total_tokens,
                        "session_id": session_id,
                    },
                )

            # Emit event done
            yield f"data: {json.dumps({'event': 'done', 'session_id': session_id, 'cost': float(actual_cost), 'tokens': total_tokens, 'provider': last_provider, 'model': last_model})}\n\n"

        except Exception as stream_err:
            logger.error(f"Kesalahan fatal pada generator SSE chat: {stream_err}")
            yield f"data: {json.dumps({'event': 'error', 'error': str(stream_err)})}\n\n"
            if reservation:
                try:
                    await refund_credit(reservation.id, reason=f"Stream exception: {str(stream_err)}")
                except Exception as ref_e:
                    logger.warning(f"Gagal refund kredit reservasi {reservation.id}: {ref_e}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
