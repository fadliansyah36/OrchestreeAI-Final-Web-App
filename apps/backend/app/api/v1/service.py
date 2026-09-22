"""
OrchestreeAI Customer Service, Handover Protocol & Indonesian Humanizer API
(PRD v2.2 Bagian 11.9, 12.7, 13, 14, 16)
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field

from orchestree.domains.service.intake import (
    CustomerServiceIntakeNode,
    ServiceRequestCategory,
    ServiceRequestStatus,
    ServiceRequestPriority,
    process_customer_service_intake,
    approve_service_request,
    reject_service_request,
)
from orchestree.domains.sales.handover import (
    build_handover_summary,
    evaluate_handover_trigger,
    HandoverTriggerType,
)
from orchestree.skills.f01_humanize_id.skill import (
    F01HumanizeIdSkill,
    humanize_indonesian_response,
    verify_factual_invariance,
)
from orchestree.domains.commerce.abandoned_cart import (
    schedule_abandoned_cart_recovery,
    process_due_abandoned_cart_recoveries,
    mark_cart_recovered,
)

router = APIRouter(prefix="/tenants/{tenant_id}/service", tags=["Customer Service & Handover"])


# Pydantic Request Models
class CreateServiceRequestPayload(BaseModel):
    subject: str
    description: str
    category_override: Optional[ServiceRequestCategory] = None
    customer_id: Optional[str] = None
    conversation_id: Optional[str] = None
    order_id: Optional[str] = None
    amount: float = 0.0
    channel: str = "WHATSAPP"
    attachments: Optional[List[Dict[str, Any]]] = None


class ApproveTicketPayload(BaseModel):
    user_id: str
    resolution_notes: str


class RejectTicketPayload(BaseModel):
    user_id: str
    rejection_reason: str


class EvaluateHandoverPayload(BaseModel):
    customer_message: str
    model_confidence: float = 1.0
    objection_type: Optional[str] = None
    refund_amount: float = 0.0


class BuildHandoverSummaryPayload(BaseModel):
    conversation_id: str
    customer_id: Optional[str] = None
    lead_id: Optional[str] = None
    trigger_reason: str = "EXPLICIT_HUMAN_REQUEST"
    trigger_details: Optional[Dict[str, Any]] = None


class HumanizeTextPayload(BaseModel):
    text_content: str
    customer_name: Optional[str] = None
    honorific: str = "Kak"
    enforce_grounding: bool = True


class ScheduleAbandonedCartPayload(BaseModel):
    cart_id: str
    customer_id: Optional[str] = None
    cart_value: float = 0.0
    customer_name: Optional[str] = None
    channel: str = "WHATSAPP"
    delay_minutes: int = 30
    discount_code: str = "PULIH10"


# Endpoints
@router.post("/requests")
async def create_service_request_endpoint(
    tenant_id: str = Path(...),
    payload: CreateServiceRequestPayload = Body(...),
):
    """
    Node CUSTOMER_SERVICE_INTAKE:
    Mencatat komplain/refund/return sebagai baris nyata.
    Refund wajib berhenti di HUMAN_APPROVAL, tidak diputuskan sepihak oleh AI.
    """
    res = process_customer_service_intake(
        tenant_id=tenant_id,
        customer_id=payload.customer_id,
        conversation_id=payload.conversation_id,
        order_id=payload.order_id,
        subject=payload.subject,
        description=payload.description,
        category_override=payload.category_override,
        amount=payload.amount,
        channel=payload.channel,
        attachments=payload.attachments,
    )
    return {"status": "success", "ticket": res}


@router.post("/requests/{ticket_id}/approve")
async def approve_service_request_endpoint(
    tenant_id: str = Path(...),
    ticket_id: str = Path(...),
    payload: ApproveTicketPayload = Body(...),
):
    """Persetujuan resmi manusia untuk tiket refund atau komplain."""
    res = approve_service_request(
        tenant_id=tenant_id,
        ticket_id=ticket_id,
        user_id=payload.user_id,
        resolution_notes=payload.resolution_notes,
    )
    return {"status": "success", "approval": res}


@router.post("/requests/{ticket_id}/reject")
async def reject_service_request_endpoint(
    tenant_id: str = Path(...),
    ticket_id: str = Path(...),
    payload: RejectTicketPayload = Body(...),
):
    """Penolakan tiket oleh staf manusia."""
    res = reject_service_request(
        tenant_id=tenant_id,
        ticket_id=ticket_id,
        user_id=payload.user_id,
        rejection_reason=payload.rejection_reason,
    )
    return {"status": "success", "rejection": res}


@router.post("/handover/evaluate")
async def evaluate_handover_endpoint(
    tenant_id: str = Path(...),
    payload: EvaluateHandoverPayload = Body(...),
):
    """Mengevaluasi 4 trigger handover: explicit request, low confidence, objection, high-value refund."""
    should_handover, trigger_type, explanation = evaluate_handover_trigger(
        customer_message=payload.customer_message,
        model_confidence=payload.model_confidence,
        objection_type=payload.objection_type,
        refund_amount=payload.refund_amount,
    )
    return {
        "should_handover": should_handover,
        "trigger_type": trigger_type,
        "explanation": explanation,
    }


@router.post("/handover/summary")
async def build_handover_summary_endpoint(
    tenant_id: str = Path(...),
    payload: BuildHandoverSummaryPayload = Body(...),
):
    """
    Menghasilkan ringkasan handover terstruktur (PRD v2.2 Bagian 12.7).
    Field numerik diambil langsung dari data terstruktur nyata.
    """
    summary = build_handover_summary(
        tenant_id=tenant_id,
        conversation_id=payload.conversation_id,
        customer_id=payload.customer_id,
        lead_id=payload.lead_id,
        trigger_reason=payload.trigger_reason,
        trigger_details=payload.trigger_details,
    )
    return {"status": "success", "handover_summary": summary}


@router.post("/humanize")
async def humanize_output_endpoint(
    payload: HumanizeTextPayload = Body(...),
):
    """
    F.01-HUMANIZE-ID: Post-processing pass akhir Output Validator khusus Bahasa Indonesia.
    TIDAK PERNAH mengubah fakta/angka, hanya gaya bahasa.
    """
    skill = F01HumanizeIdSkill(default_honorific=payload.honorific)
    res = skill.humanize(
        text_content=payload.text_content,
        customer_name=payload.customer_name,
        enforce_grounding=payload.enforce_grounding,
    )
    return res


@router.post("/abandoned-carts/schedule")
async def schedule_abandoned_cart_endpoint(
    tenant_id: str = Path(...),
    payload: ScheduleAbandonedCartPayload = Body(...),
):
    """Menjadwalkan pesan recovery keranjang ditinggalkan nyata."""
    res = schedule_abandoned_cart_recovery(
        tenant_id=tenant_id,
        cart_id=payload.cart_id,
        customer_id=payload.customer_id,
        cart_value=payload.cart_value,
        customer_name=payload.customer_name,
        channel=payload.channel,
        delay_minutes=payload.delay_minutes,
        discount_code=payload.discount_code,
    )
    return {"status": "success", "recovery_job": res}


@router.post("/abandoned-carts/process")
async def process_abandoned_carts_endpoint(
    tenant_id: str = Path(...),
):
    """Mengeksekusi recovery keranjang yang jatuh tempo dengan gaya bahasa F.01-HUMANIZE-ID."""
    dispatched = process_due_abandoned_cart_recoveries(tenant_id=tenant_id)
    return {
        "status": "success",
        "processed_count": len(dispatched),
        "dispatched": dispatched,
    }
