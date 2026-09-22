"""Sales Guardrails Matrix & Approvals API (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)
Menyediakan REST endpoint untuk:
- Konfigurasi Matriks Guardrail Sales per Tenant
- Evaluasi & Eskalasi Otomatis Aksi Berisiko Tinggi ke Human Approval
- Manajemen Antrean Persetujuan Manusia (Review/Approve/Reject)
- Audit Ledger Aksi Berisiko AI Agent dengan pelaporan persona_type
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from orchestree.domains.sales.guardrails import (
    SalesGuardrailService,
    SalesGuardrailAction,
)

router = APIRouter(prefix="/sales", tags=["Sales Guardrails & Human Approval"])


class EvaluateActionRequest(BaseModel):
    action_type: str = Field(..., description="Tipe aksi: DISCOUNT, REFUND, CANCEL_ORDER, CUSTOM_CONTRACT")
    actor_type: str = Field(default="ai_agent", description="Tipe aktor: ai_agent, human_user, system")
    actor_id: Optional[str] = Field(default=None, description="UUID atau ID aktor pemohon")
    persona_type: str = Field(default="sales_specialist", description="Persona AI pemohon (misal: sales_specialist)")
    target_resource_type: str = Field(default="order", description="Jenis resource target: order, cart, customer, contract")
    target_resource_id: Optional[str] = Field(default=None, description="ID resource target")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Argumen aksi (misal: discount_pct, amount, order_id)")
    request_id: Optional[str] = Field(default=None, description="Request ID idempotensi/penelusuran")


class ReviewApprovalRequest(BaseModel):
    decision: str = Field(..., description="Keputusan: APPROVED atau REJECTED")
    reviewer_user_id: Optional[str] = Field(default=None, description="UUID staf manusia yang menyetujui/menolak")
    approval_notes: Optional[str] = Field(default=None, description="Catatan persetujuan")
    rejection_reason: Optional[str] = Field(default=None, description="Alasan penolakan jika ditolak")


@router.get("/tenants/{tenant_id}/guardrails")
async def get_guardrail_rules(tenant_id: str):
    """Mengambil matriks guardrail penjualan untuk tenant dari Supabase Postgres."""
    try:
        rules = SalesGuardrailService.get_guardrail_rules(tenant_id)
        return {"status": "success", "tenant_id": tenant_id, "data": rules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/guardrails/evaluate")
async def evaluate_and_execute_action(tenant_id: str, request: EvaluateActionRequest):
    """
    Evaluasi guardrail: Memeriksa toleransi otonom AI.
    Bila melanggar batas (misal diskon > 10%, refund, cancel, kontrak khusus):
    SELALU berhenti di status PENDING_APPROVAL dan dicatat ke Audit Ledger dengan persona_type.
    """
    try:
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=tenant_id,
            action_type=request.action_type,
            actor_type=request.actor_type,
            actor_id=request.actor_id,
            persona_type=request.persona_type,
            target_resource_type=request.target_resource_type,
            target_resource_id=request.target_resource_id,
            payload=request.payload,
            request_id=request.request_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/guardrails/approvals")
async def list_guardrail_approvals(
    tenant_id: str,
    status_filter: Optional[str] = Query(None, alias="status", description="Filter status: PENDING_APPROVAL, APPROVED, REJECTED")
):
    """Mengambil daftar tiket antrean persetujuan manusia guardrail penjualan."""
    try:
        approvals = SalesGuardrailService.list_approvals(tenant_id, status=status_filter)
        return {"status": "success", "tenant_id": tenant_id, "data": approvals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/guardrails/approvals/{approval_id}/review")
async def review_guardrail_approval(
    tenant_id: str,
    approval_id: str,
    request: ReviewApprovalRequest
):
    """
    Menyetujui atau menolak tiket eskalasi guardrail oleh staf manusia (Human-in-the-Loop).
    """
    try:
        result = SalesGuardrailService.review_approval(
            tenant_id=tenant_id,
            approval_id=approval_id,
            reviewer_user_id=request.reviewer_user_id,
            decision=request.decision,
            approval_notes=request.approval_notes,
            rejection_reason=request.rejection_reason,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
