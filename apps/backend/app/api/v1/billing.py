"""
OrchestreeAI Billing & Credit Management Endpoints (PRD v2.2 Bagian 14 & Billing Specification)
Endpoints:
- GET  /api/v1/billing/plans (Katalog Paket Resmi & Matriks Fasilitas)
- GET  /api/v1/billing/facilities (Katalog 21 Fasilitas Platform)
- GET  /api/v1/billing/topup-packages (Paket Top-Up Resmi)
- GET  /api/v1/billing/activity-types (18 Baseline Metering Aktivitas AI)
- GET  /api/v1/billing/factors (Faktor Formula Kompleksitas, Model, Tool & Eksekusi)
- POST /api/v1/billing/estimate (Tahap 1: Estimasi Biaya Kredit AI)
- POST /api/v1/billing/reserve (Tahap 2: Reservasi Kredit AI dengan Row-Locking)
- POST /api/v1/billing/consume (Tahap 4: Konsumsi Kredit Aktual AI)
- POST /api/v1/billing/refund (Tahap 5: Pengembalian Reservasi Kredit)
- GET  /api/v1/billing/wallet (Status Dompet Kredit Tenant)
- GET  /api/v1/billing/wallet/summary (Ringkasan Kuota Siklus Berjalan)
- GET  /api/v1/billing/tenants/{tenant_id}/credit-wallet/summary (BAGIAN C Kontrak Spesifik)
- GET  /api/v1/billing/transactions (Buku Besar Mutasi Kredit)
- GET  /api/v1/billing/invoices (Daftar Faktur Pembayaran)
- POST /api/v1/billing/topup (Pembelian Top-Up / Faktur Baru)
- POST /api/v1/billing/sandbox-settle (Settlement Faktur Sandbox / Verifikasi Siklus)
- POST /api/v1/billing/tenant-subscriptions/override (Override Akun Unlimited Super Admin)
- GET  /api/v1/billing/admin/command-center (Super Admin Financial Command Center)
"""

import uuid
import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Header, Query, Request, status
from pydantic import BaseModel, Field, ConfigDict
import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine
from app.authz.pdp import (
    authorize,
    SubjectContext,
    ResourceContext,
    require_capability,
    public_endpoint,
)
from app.domains.billing.credits import (
    get_wallet,
    get_transactions,
    get_invoices,
    topup_credit,
    TenantWallet,
)
from app.domains.billing.credit_engine import (
    estimate_credit_cost,
    reserve_credit as engine_reserve_credit,
    consume_credit as engine_consume_credit,
    refund_credit as engine_refund_credit,
    get_tenant_credit_wallet_summary,
    CreditEstimate,
    ReservationToken,
    InsufficientCreditException,
)
from app.domains.billing.lifecycle import process_invoice_settlement

logger = logging.getLogger("orchestree.api.billing")

router = APIRouter(prefix="/api/v1/billing", tags=["Billing & Credit Wallet"])
tenant_summary_router = APIRouter(prefix="/api/v1/tenants", tags=["Tenant Credit Summary"])


# =============================================================================
# PYDANTIC SCHEMAS (STRICT MODE & EXTRA FORBID)
# =============================================================================

class StrictBillingRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChangeSubscriptionTierRequest(StrictBillingRequestModel):
    plan_code: str = Field(..., min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_-]+$", description="Kode paket tujuan")


class TopUpRequest(StrictBillingRequestModel):
    tenant_id: Optional[str] = Field(None, description="ID Organisasi/Tenant")
    amount: Decimal = Field(..., gt=0, description="Nominal top up dalam mata uang IDR")
    payment_gateway: str = Field("midtrans", description="Pilihan gateway: midtrans atau xendit")
    package_name: Optional[str] = Field("Top Up Kredit Standar", description="Nama paket kredit")
    package_id: Optional[str] = Field(None, description="ID paket credit_topup_packages (opsional)")


class TopUpResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    amount: float
    currency: str
    status: str
    payment_gateway: str
    payment_url: str
    client_key: Optional[str] = None


class SimulatePaymentRequest(StrictBillingRequestModel):
    invoice_number: str = Field(..., min_length=3, max_length=100, description="Nomor faktur yang akan disettle")
    payment_reference: Optional[str] = Field(None, max_length=100, description="ID transaksi referensi dari gateway")


class CreditWalletSummaryResponse(BaseModel):
    available: float
    reserved: float
    used_this_cycle: float
    total_allocated_this_cycle: float
    is_unlimited: bool
    low_balance_warning: bool


class EstimateCreditRequest(StrictBillingRequestModel):
    activity_code: str = Field(..., min_length=2, max_length=100, description="Kode aktivitas AI dari ai_activity_types")
    complexity_code: str = Field("medium", max_length=50, description="Tingkat kompleksitas: low, medium, high, very_high")
    llm_model_id: str = Field("default", max_length=100, description="Model LLM identifier atau ID")
    tool_risk_tier: Optional[str] = Field(None, max_length=50, description="Risk tier MCP tool jika ada: low, medium, high")
    execution_mode: str = Field("single_step", max_length=50, description="Mode eksekusi: single_step, multi_step, autonomous")


class ReserveCreditApiRequest(StrictBillingRequestModel):
    tenant_id: Optional[str] = Field(None, description="ID organisasi/tenant")
    estimate: CreditEstimate = Field(..., description="Hasil kalkulasi estimate_credit_cost")
    activity_type_id: str = Field(..., min_length=2, max_length=100, description="ID atau kode tipe aktivitas AI")
    reference_type: str = Field("ai_task", max_length=50, description="Tipe referensi tugas AI")
    reference_id: Optional[str] = Field(None, max_length=100, description="ID referensi konteks tugas")
    execution_ref: Optional[str] = Field(None, max_length=100, description="ID workflow execution atau tool invocation")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ConsumeCreditApiRequest(StrictBillingRequestModel):
    reservation_id: str = Field(..., min_length=3, max_length=100, description="ID token reservasi")
    tenant_id: str = Field(..., description="ID organisasi/tenant")
    actual_cost: float = Field(..., ge=0, description="Total kredit AI aktual yang dikonsumsi")
    execution_ref: Optional[str] = Field(None, max_length=100, description="ID referensi eksekusi workflow/tool")


class RefundCreditApiRequest(StrictBillingRequestModel):
    reservation_id: str = Field(..., min_length=3, max_length=100, description="ID token reservasi yang akan dikembalikan")
    tenant_id: str = Field(..., description="ID organisasi/tenant")
    reason: str = Field("Eksekusi dibatalkan atau gagal", max_length=500, description="Alasan pengembalian reservasi")


class TenantSubscriptionOverrideRequest(StrictBillingRequestModel):
    tenant_id: str = Field(..., min_length=3, max_length=100, description="ID tenant yang akan di-override")
    is_unlimited_override: bool = Field(..., description="True untuk akun unlimited tanpa batas kredit")
    unlimited_reason: Optional[str] = Field(None, max_length=500, description="Alasan wajib diisi jika is_unlimited_override=true")


class SubscriptionPlanUpdatePayload(StrictBillingRequestModel):
    display_name: Optional[str] = Field(None, max_length=100)
    monthly_price_idr: Optional[float] = Field(None, ge=0)
    price_monthly: Optional[float] = Field(None, ge=0)
    ai_credit_allowance: Optional[float] = Field(None, ge=0)
    human_staff_limit: Optional[int] = Field(None, ge=0)
    ai_agent_limit: Optional[int] = Field(None, ge=0)
    is_trial: Optional[bool] = None
    trial_duration_days: Optional[int] = Field(None, ge=0)
    is_custom_quote: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)


class FacilityMatrixCellUpdate(StrictBillingRequestModel):
    plan_id: str = Field(..., min_length=3, max_length=100)
    facility_key: str = Field(..., min_length=2, max_length=100)
    level: str = Field(..., max_length=50)  # 'none','basic','advanced','enterprise','custom','limited','unlimited'


class FacilityMatrixBatchUpdatePayload(StrictBillingRequestModel):
    updates: List[FacilityMatrixCellUpdate]


class ActivityTypeUpdatePayload(StrictBillingRequestModel):
    display_name: Optional[str] = Field(None, max_length=100)
    base_work_unit_min: float = Field(..., gt=0)
    base_work_unit_max: float = Field(..., gt=0)


class FactorMultiplierUpdatePayload(StrictBillingRequestModel):
    multiplier: float = Field(..., gt=0)


class CreditTopupPackagePayload(StrictBillingRequestModel):
    name: str = Field(..., min_length=2, max_length=100)
    credit_amount: float = Field(..., gt=0)
    price_idr: float = Field(..., ge=0)
    validity_days: int = Field(..., gt=0)
    is_active: bool = True


class ManualCreditAdjustmentPayload(StrictBillingRequestModel):
    tenant_id: str = Field(..., min_length=3, max_length=100, description="ID tenant tujuan penyesuaian kredit")
    amount: float = Field(..., description="Nominal penyesuaian kredit (positif atau negatif)")
    reason: str = Field(..., min_length=3, max_length=500, description="Alasan wajib penyesuaian kredit")


class TestCreditEstimatePayload(StrictBillingRequestModel):
    activity_code: str = Field(..., min_length=2, max_length=100)
    complexity_code: str = Field("medium", max_length=50)
    model_identifier: str = Field("gemini-1.5-flash", max_length=100)
    tool_risk_tier: Optional[str] = Field(None, max_length=50)
    execution_mode: str = Field("single_step", max_length=50)


# =============================================================================
# KATALOG KOMERSIAL RESMI & MASTER DATA METERING (BAGIAN A)
# =============================================================================

@router.get("/plans", dependencies=[Depends(public_endpoint("billing.catalog.view"))])
async def list_subscription_plans():
    """
    Daftar 5 Paket Komersial Resmi OrchestreeAI (PRD v2.2 Bagian 14.1 & Prompt Bagian A):
    TRIAL, STARTER, PROFESSIONAL, ENTERPRISE, CUSTOM.
    Termasuk matriks hak akses 21 fasilitas platform (plan_facility_matrix).
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT
                p.id,
                p.plan_code,
                p.tier_level,
                p.display_name,
                p.monthly_price_idr,
                p.ai_credit_allowance,
                p.human_staff_limit,
                p.ai_agent_limit,
                p.is_trial,
                p.trial_duration_days,
                p.is_custom_quote,
                p.display_order,
                p.currency
            FROM subscription_plans p
            ORDER BY p.display_order ASC, p.tier_level ASC;
        """))
        plan_rows = res.fetchall()

        # Ambil matriks fasilitas
        matrix_res = await conn.execute(sa.text("""
            SELECT plan_id, facility_key, level
            FROM plan_facility_matrix;
        """))
        matrix_rows = matrix_res.fetchall()
        matrix_map: Dict[str, Dict[str, str]] = {}
        for r in matrix_rows:
            pid = str(r[0])
            if pid not in matrix_map:
                matrix_map[pid] = {}
            matrix_map[pid][r[1]] = r[2]

    plans = []
    for r in plan_rows:
        pid = str(r[0])
        plans.append({
            "id": pid,
            "plan_code": r[1],
            "tier_level": r[2],
            "display_name": r[3],
            "monthly_price_idr": float(r[4]) if r[4] is not None else None,
            "ai_credit_allowance": float(r[5]) if r[5] is not None else None,
            "human_staff_limit": r[6],
            "ai_agent_limit": r[7],
            "is_trial": bool(r[8]),
            "trial_duration_days": r[9],
            "is_custom_quote": bool(r[10]),
            "display_order": r[11],
            "currency": r[12] or "IDR",
            "facilities": matrix_map.get(pid, {}),
        })

    return plans


@router.get("/facilities", dependencies=[Depends(public_endpoint("billing.catalog.view"))])
async def list_facility_catalog():
    """Katalog 21 Fasilitas Platform OrchestreeAI."""
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, facility_key, display_name, display_order
            FROM plan_facility_catalog
            ORDER BY display_order ASC;
        """))
        rows = res.fetchall()

    return [
        {
            "id": str(r[0]),
            "facility_key": r[1],
            "display_name": r[2],
            "display_order": r[3],
        }
        for r in rows
    ]


@router.get("/topup-packages", dependencies=[Depends(public_endpoint("billing.catalog.view"))])
async def list_topup_packages():
    """Daftar Paket Top-Up Kredit AI Resmi (Micro, Standar, Pro, Enterprise)."""
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, name, credit_amount, price_idr, validity_days, is_active
            FROM credit_topup_packages
            WHERE is_active = true
            ORDER BY price_idr ASC;
        """))
        rows = res.fetchall()

    return [
        {
            "id": str(r[0]),
            "name": r[1],
            "credit_amount": float(r[2]),
            "price_idr": float(r[3]),
            "validity_days": r[4],
            "is_active": bool(r[5]),
        }
        for r in rows
    ]


@router.get("/activity-types", dependencies=[Depends(public_endpoint("billing.catalog.view"))])
async def list_activity_types():
    """18 Baseline Metering Jenis Aktivitas AI OrchestreeAI."""
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, activity_code, display_name, base_work_unit_min, base_work_unit_max
            FROM ai_activity_types
            ORDER BY base_work_unit_min ASC;
        """))
        rows = res.fetchall()

    return [
        {
            "id": str(r[0]),
            "activity_code": r[1],
            "display_name": r[2],
            "base_work_unit_min": float(r[3]),
            "base_work_unit_max": float(r[4]),
        }
        for r in rows
    ]


@router.get("/factors", dependencies=[Depends(public_endpoint("billing.catalog.view"))])
async def list_credit_factors():
    """Faktor Pengali Formula Biaya Kredit AI (Kompleksitas, Model LLM, Tool Risk Tier, Mode Eksekusi)."""
    engine = get_engine()
    async with engine.begin() as conn:
        comp_res = await conn.execute(sa.text("SELECT complexity_code, multiplier FROM credit_complexity_factors;"))
        model_res = await conn.execute(sa.text("SELECT model_code, multiplier FROM credit_model_cost_factors;"))
        tool_res = await conn.execute(sa.text("SELECT risk_tier, multiplier FROM credit_tool_factors;"))
        exec_res = await conn.execute(sa.text("SELECT execution_mode, multiplier FROM credit_execution_factors;"))

        return {
            "complexity_factors": {r[0]: float(r[1]) for r in comp_res.fetchall()},
            "model_factors": {r[0]: float(r[1]) for r in model_res.fetchall()},
            "tool_factors": {r[0]: float(r[1]) for r in tool_res.fetchall()},
            "execution_factors": {r[0]: float(r[1]) for r in exec_res.fetchall()},
        }


# =============================================================================
# CREDIT ENGINE SIKLUS HIDUP 5 TAHAP (BAGIAN B)
# =============================================================================

@router.post("/estimate", dependencies=[Depends(require_capability("billing.credits.view"))])
async def calculate_credit_estimate(payload: EstimateCreditRequest):
    """
    Tahap 1: Estimasi Biaya Kredit AI (estimate_credit_cost).
    Transparan ditampilkan ke pengguna sebelum eksekusi beban kerja AI berat.
    """
    estimate = await estimate_credit_cost(
        activity_code=payload.activity_code,
        complexity_code=payload.complexity_code,
        llm_model_id=payload.llm_model_id,
        tool_risk_tier=payload.tool_risk_tier,
        execution_mode=payload.execution_mode,
    )
    return estimate.dict()


@router.post("/reserve", dependencies=[Depends(require_capability("billing.credits.manage"))])
async def reserve_credit_endpoint(
    payload: ReserveCreditApiRequest,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """
    Tahap 2: Reservasi Kredit AI (reserve_credit).
    Mengunci dompet dengan row-level lock (FOR UPDATE).
    Jika akun is_unlimited_override=true, tetap dicatat di reservasi & mutasi audit tanpa menolak saldo.
    """
    effective_tenant = payload.tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    try:
        token = await engine_reserve_credit(
            tenant_id=effective_tenant,
            estimate=payload.estimate,
            activity_type_id=payload.activity_type_id,
            reference_type=payload.reference_type,
            reference_id=payload.reference_id,
            execution_ref=payload.execution_ref,
            metadata=payload.metadata,
        )
        return token.model_dump()
    except InsufficientCreditException as e:
        raise HTTPException(status_code=402, detail=str(e))


@router.post("/consume", dependencies=[Depends(require_capability("billing.credits.manage"))])
async def consume_credit_endpoint(payload: ConsumeCreditApiRequest):
    """
    Tahap 4: Konsumsi Kredit Aktual AI (consume_credit).
    Memotong saldo dompet sesuai pemakaian riil dan mencatat ke buku besar transaksi.
    """
    token = ReservationToken(
        id=payload.reservation_id,
        tenant_id=payload.tenant_id,
        estimated_cost=payload.actual_cost,
        execution_ref=payload.execution_ref,
        status="reserved",
    )
    await engine_consume_credit(
        reservation=token,
        actual_cost=payload.actual_cost,
        execution_ref=payload.execution_ref,
    )
    return {"status": "consumed", "reservation_id": payload.reservation_id, "actual_cost": payload.actual_cost}


@router.post("/refund", dependencies=[Depends(require_capability("billing.credits.manage"))])
async def refund_credit_endpoint(payload: RefundCreditApiRequest):
    """
    Tahap 5: Pengembalian Reservasi Kredit (refund_credit).
    Melepaskan saldo yang direservasi bila eksekusi AI gagal atau dibatalkan.
    """
    token = ReservationToken(
        id=payload.reservation_id,
        tenant_id=payload.tenant_id,
        estimated_cost=0.0,
        status="reserved",
    )
    await engine_refund_credit(
        reservation=token,
        reason=payload.reason,
    )
    return {"status": "refunded", "reservation_id": payload.reservation_id, "reason": payload.reason}


# =============================================================================
# KONTRAK RINGKASAN WALLET KREDIT (BAGIAN C)
# =============================================================================

@router.get("/wallet/summary", dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_wallet_summary_current(x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id")):
    """Mengembalikan ringkasan saldo siklus tenant saat ini."""
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-Id header diperlukan.")
    return await get_tenant_credit_wallet_summary(x_tenant_id)


@router.get("/tenants/{tenant_id}/credit-wallet/summary", dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_tenant_credit_wallet_summary_path(tenant_id: str):
    """
    Kontrak Resmi BAGIAN C:
    GET /api/v1/tenants/{tenant_id}/credit-wallet/summary (dimount di bawah router billing & tenants).
    """
    return await get_tenant_credit_wallet_summary(tenant_id)


@tenant_summary_router.get("/{tenant_id}/credit-wallet/summary", dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_tenant_summary_direct(tenant_id: str):
    """Router alternatif langsung pada path /api/v1/tenants/{tenant_id}/credit-wallet/summary."""
    return await get_tenant_credit_wallet_summary(tenant_id)


@tenant_summary_router.get("/{tenant_id}/subscription/tier", dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_tenant_subscription_tier(tenant_id: str):
    """Mengambil status tier langganan tenant dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("""
                SELECT t.id, t.name, t.subscription_plan_id, p.plan_code, p.name as plan_name, p.tier_level
                FROM tenants t
                LEFT JOIN subscription_plans p ON t.subscription_plan_id = p.id
                WHERE t.id = :tid;
            """),
            {"tid": tenant_id}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tenant tidak ditemukan.")
        tier_level = int(row.tier_level or 1)
        plan_code = row.plan_code or "STARTER"
        return {
            "tenant_id": tenant_id,
            "tier_level": tier_level,
            "plan_code": plan_code,
            "plan_name": row.plan_name or plan_code,
            "is_enterprise": tier_level >= 3,
        }


@tenant_summary_router.post("/{tenant_id}/subscription/change-tier", dependencies=[Depends(require_capability("billing.credits.manage"))])
async def change_tenant_subscription_tier(tenant_id: str, payload: ChangeSubscriptionTierRequest):
    """Mengubah tier langganan tenant."""
    target_plan_code = payload.plan_code.upper()
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            p_row = conn.execute(
                sa.text("SELECT id, plan_code, name, tier_level FROM subscription_plans WHERE plan_code = :pcode;"),
                {"pcode": target_plan_code}
            ).fetchone()
            if not p_row:
                raise HTTPException(status_code=404, detail=f"Paket langganan '{target_plan_code}' tidak ditemukan.")

            conn.execute(
                sa.text("UPDATE tenants SET subscription_plan_id = :pid, updated_at = now() WHERE id = :tid;"),
                {"pid": p_row.id, "tid": tenant_id}
            )
            return {
                "status": "success",
                "message": f"Berhasil beralih ke paket {p_row.name} (Tier {p_row.tier_level}).",
                "tenant_id": tenant_id,
                "plan_code": p_row.plan_code,
                "tier_level": int(p_row.tier_level or 1),
                "is_enterprise": int(p_row.tier_level or 1) >= 3,
            }


@tenant_summary_router.get("/{tenant_id}/billing/wallet", dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_tenant_billing_wallet_direct(tenant_id: str):
    """Mengambil status dompet kredit tenant dari Supabase."""
    return await get_wallet(tenant_id)


@router.get("/reservations", dependencies=[Depends(require_capability("billing.credits.view"))])
async def list_credit_reservations(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    tenant_id: Optional[str] = Query(None),
):
    """Mengambil daftar reservasi kredit organisasi."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, estimated_cost, actual_cost, status, reference_type, reference_id, created_at
                FROM credit_reservations
                WHERE tenant_id = :tid
                ORDER BY created_at DESC LIMIT 50;
            """),
            {"tid": effective_tenant}
        ).fetchall()
        return [
            {
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "estimated_cost": float(r.estimated_cost),
                "actual_cost": float(r.actual_cost) if r.actual_cost is not None else None,
                "status": r.status,
                "reference_type": r.reference_type,
                "reference_id": r.reference_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


# =============================================================================
# DOMPET, TRANSAKSI, DAN FAKTUR (PRD v2.2 Bagian 14)
# =============================================================================

@router.get("/wallet", response_model=TenantWallet, dependencies=[Depends(require_capability("billing.credits.view"))])
@router.get("/wallets/{tenant_id}", response_model=TenantWallet, dependencies=[Depends(require_capability("billing.credits.view"))])
async def get_tenant_wallet(
    tenant_id: Optional[str] = None,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Mengambil status dompet kredit organisasi."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    return await get_wallet(effective_tenant)


@router.get("/transactions", dependencies=[Depends(require_capability("billing.credits.view"))])
async def list_transactions(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Mengambil riwayat mutasi kredit (buku besar)."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    return await get_transactions(effective_tenant, limit=limit, offset=offset)


@router.get("/invoices", dependencies=[Depends(require_capability("billing.invoices.view"))])
async def list_invoices(
    tenant_id: Optional[str] = Query(None),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Mengambil daftar faktur pembayaran organisasi."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    return await get_invoices(effective_tenant)


@router.post("/topup", response_model=TopUpResponse, dependencies=[Depends(require_capability("billing.invoices.manage"))])
async def create_topup_invoice(
    payload: TopUpRequest,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """
    Membuat faktur baru untuk pembelian top up kredit AI.
    Menghasilkan payment URL (Midtrans Snap atau Xendit Invoice).
    """
    effective_tenant = payload.tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    invoice_id = str(uuid.uuid4())
    short_id = uuid.uuid4().hex[:6].upper()
    order_id = f"INV-TOPUP-{short_id}-{int(payload.amount)}"
    gateway = payload.payment_gateway.lower()

    payment_url = f"https://simulator.sandbox.midtrans.com/snap/v2/vtweb/{order_id}"
    if gateway == "midtrans" and settings.MIDTRANS_SERVER_KEY:
        try:
            import base64
            auth_str = base64.b64encode(f"{settings.MIDTRANS_SERVER_KEY}:".encode()).decode()
            snap_endpoint = (
                "https://app.midtrans.com/snap/v1/transactions"
                if settings.MIDTRANS_IS_PRODUCTION
                else "https://app.sandbox.midtrans.com/snap/v1/transactions"
            )

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    snap_endpoint,
                    headers={
                        "Authorization": f"Basic {auth_str}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "transaction_details": {
                            "order_id": order_id,
                            "gross_amount": int(payload.amount),
                        },
                        "item_details": [
                            {
                                "id": payload.package_id or "credit-topup",
                                "price": int(payload.amount),
                                "quantity": 1,
                                "name": payload.package_name,
                            }
                        ],
                    },
                )
                if res.status_code in (200, 201):
                    snap_data = res.json()
                    payment_url = snap_data.get("redirect_url", payment_url)
        except Exception as e:
            logger.warning(f"Gagal memanggil Midtrans Snap API, menggunakan fallback URL: {e}")

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": effective_tenant},
        )
        await conn.execute(sa.text("""
            INSERT INTO invoices (
                id, tenant_id, invoice_number, amount, currency, status,
                payment_gateway, payment_reference, payment_url, items
            ) VALUES (
                :id, :tenant_id, :invoice_number, :amount, 'IDR', 'pending',
                :gateway, :order_id, :payment_url, :items
            );
        """), {
            "id": invoice_id,
            "tenant_id": effective_tenant,
            "invoice_number": order_id,
            "amount": payload.amount,
            "gateway": gateway,
            "order_id": order_id,
            "payment_url": payment_url,
            "items": json.dumps([{
                "type": "topup_purchase",
                "package_id": payload.package_id,
                "name": payload.package_name,
                "amount": float(payload.amount),
                "qty": 1,
            }]),
        })

    return TopUpResponse(
        invoice_id=invoice_id,
        invoice_number=order_id,
        amount=float(payload.amount),
        currency="IDR",
        status="pending",
        payment_gateway=gateway,
        payment_url=payment_url,
        client_key=settings.MIDTRANS_CLIENT_KEY,
    )


@router.post("/sandbox-settle", dependencies=[Depends(require_capability("billing.invoices.manage"))])
async def sandbox_settle_payment(payload: SimulatePaymentRequest):
    """
    Pelunasan faktur langsung untuk keperluan verifikasi pengujian & sandbox environment.
    Menjalankan alur resmi Entitlement + AI Credit Allocation (BAGIAN D) secara menyeluruh.
    """
    settlement_result = await process_invoice_settlement(
        invoice_number=payload.invoice_number,
        payment_reference=payload.payment_reference or f"test-settle-{uuid.uuid4().hex[:8]}",
        payment_gateway="simulator",
    )
    if settlement_result.get("status") == "error":
        raise HTTPException(status_code=404, detail=settlement_result.get("message", "Faktur tidak ditemukan."))

    return {
        "status": "success",
        "message": f"Faktur {payload.invoice_number} berhasil dilunasi via Billing Engine.",
        "details": settlement_result,
    }


# =============================================================================
# SUPER ADMIN OVERRIDE & COMMERCIAL MANAGEMENT HUB (PRD v2.2 Bagian 14 & 18.2)
# =============================================================================

async def log_billing_audit(
    conn,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    payload_before: Optional[Dict[str, Any]] = None,
    payload_after: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
):
    """Mencatat aktivitas komersial/billing secara nyata ke audit_logs."""
    res_uuid = None
    if resource_id:
        try:
            res_uuid = uuid.UUID(str(resource_id))
        except (ValueError, TypeError):
            res_uuid = None

    t_uuid = None
    if tenant_id:
        try:
            t_uuid = uuid.UUID(str(tenant_id))
        except (ValueError, TypeError):
            t_uuid = None

    act_uuid = None
    if actor_id:
        try:
            act_uuid = uuid.UUID(str(actor_id))
        except (ValueError, TypeError):
            act_uuid = None

    await conn.execute(
        sa.text("""
            INSERT INTO audit_logs (
                id, tenant_id, actor_type, actor_id, action,
                resource_type, resource_id, payload_before, payload_after,
                request_id, created_at
            ) VALUES (
                :id, :tid, 'human_user', :aid, :action,
                :rtype, :rid, :p_before, :p_after,
                :req_id, now()
            );
        """),
        {
            "id": str(uuid.uuid4()),
            "tid": t_uuid,
            "aid": act_uuid,
            "action": action,
            "rtype": resource_type,
            "rid": res_uuid,
            "p_before": json.dumps(payload_before) if payload_before else None,
            "p_after": json.dumps(payload_after) if payload_after else None,
            "req_id": request_id or str(uuid.uuid4()),
        },
    )


# -----------------------------------------------------------------------------
# 1. SUBSCRIPTION PLANS CRUD (SubscriptionPlanScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/plans", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_list_subscription_plans():
    """
    CRUD Subscription Plans: Daftar 5 paket komersial resmi (Trial, Starter, Professional, Enterprise, Custom).
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT
                id, plan_code, display_name, monthly_price_idr, price_monthly,
                ai_credit_allowance, human_staff_limit, ai_agent_limit,
                is_trial, trial_duration_days, is_custom_quote, display_order, currency
            FROM subscription_plans
            ORDER BY display_order ASC;
        """))
        rows = res.fetchall()

    plans = []
    for r in rows:
        plans.append({
            "id": str(r[0]),
            "plan_code": r[1],
            "display_name": r[2],
            "monthly_price_idr": float(r[3]) if r[3] is not None else (float(r[4]) if r[4] is not None else None),
            "price_monthly": float(r[4]) if r[4] is not None else None,
            "ai_credit_allowance": float(r[5]) if r[5] is not None else None,
            "human_staff_limit": r[6],
            "ai_agent_limit": r[7],
            "is_trial": bool(r[8]),
            "trial_duration_days": r[9],
            "is_custom_quote": bool(r[10]),
            "display_order": r[11],
            "currency": r[12] or "IDR",
        })
    return {"plans": plans}


@router.put("/admin/plans/{plan_id}", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_update_subscription_plan(
    plan_id: str,
    payload: SubscriptionPlanUpdatePayload,
):
    """
    Update paket komersial: harga, credit allowance, batas staff/agent, durasi trial.
    Perubahan harga TIDAK mengubah invoice/faktur tenant siklus berjalan karena invoice menyimpan snapshot harga riil.
    Tercatat di Audit Ledger.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        curr_res = await conn.execute(
            sa.text("SELECT id, plan_code, display_name, monthly_price_idr, ai_credit_allowance FROM subscription_plans WHERE id = :id;"),
            {"id": plan_id},
        )
        curr = curr_res.fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Paket langganan tidak ditemukan.")

        before_data = {
            "id": str(curr[0]),
            "plan_code": curr[1],
            "display_name": curr[2],
            "monthly_price_idr": float(curr[3]) if curr[3] is not None else None,
            "ai_credit_allowance": float(curr[4]) if curr[4] is not None else None,
        }

        updates = []
        params: Dict[str, Any] = {"id": plan_id}

        if payload.display_name is not None:
            updates.append("display_name = :dname")
            params["dname"] = payload.display_name
        if payload.monthly_price_idr is not None:
            updates.append("monthly_price_idr = :mprice, price_monthly = :mprice")
            params["mprice"] = payload.monthly_price_idr
        if payload.ai_credit_allowance is not None:
            updates.append("ai_credit_allowance = :allowance")
            params["allowance"] = payload.ai_credit_allowance
        if payload.human_staff_limit is not None:
            updates.append("human_staff_limit = :hlimit")
            params["hlimit"] = payload.human_staff_limit
        if payload.ai_agent_limit is not None:
            updates.append("ai_agent_limit = :alimit")
            params["alimit"] = payload.ai_agent_limit
        if payload.is_trial is not None:
            updates.append("is_trial = :istrial")
            params["istrial"] = payload.is_trial
        if payload.trial_duration_days is not None:
            updates.append("trial_duration_days = :tdays")
            params["tdays"] = payload.trial_duration_days
        if payload.is_custom_quote is not None:
            updates.append("is_custom_quote = :cquote")
            params["cquote"] = payload.is_custom_quote
        if payload.display_order is not None:
            updates.append("display_order = :dorder")
            params["dorder"] = payload.display_order

        if updates:
            sql = f"UPDATE subscription_plans SET {', '.join(updates)} WHERE id = :id;"
            await conn.execute(sa.text(sql), params)

        # Log audit
        await log_billing_audit(
            conn=conn,
            action="subscription_plan.updated",
            resource_type="subscription_plan",
            resource_id=plan_id,
            payload_before=before_data,
            payload_after={**before_data, **payload.model_dump(exclude_unset=True), "capability": "billing.plans.manage"},
        )

    return {"status": "success", "message": f"Paket {curr[1]} berhasil diperbarui."}


# -----------------------------------------------------------------------------
# 2. PLAN FACILITY MATRIX (PlanFacilityMatrixScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/facility-matrix", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_get_facility_matrix():
    """
    Mengambil katalog fasilitas, daftar paket, dan seluruh matriks hak akses paket komersial.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        cat_res = await conn.execute(sa.text("""
            SELECT id, facility_key, display_name, display_order
            FROM plan_facility_catalog
            ORDER BY display_order ASC;
        """))
        catalog_rows = cat_res.fetchall()

        plan_res = await conn.execute(sa.text("""
            SELECT id, plan_code, display_name, display_order
            FROM subscription_plans
            ORDER BY display_order ASC;
        """))
        plan_rows = plan_res.fetchall()

        mat_res = await conn.execute(sa.text("""
            SELECT plan_id, facility_key, level
            FROM plan_facility_matrix;
        """))
        matrix_rows = mat_res.fetchall()

    catalog = [{"id": str(r[0]), "facility_key": r[1], "display_name": r[2], "display_order": r[3]} for r in catalog_rows]
    plans = [{"id": str(r[0]), "plan_code": r[1], "display_name": r[2], "display_order": r[3]} for r in plan_rows]
    matrix = {}
    for r in matrix_rows:
        pid = str(r[0])
        fkey = r[1]
        lvl = r[2]
        if pid not in matrix:
            matrix[pid] = {}
        matrix[pid][fkey] = lvl

    return {
        "catalog": catalog,
        "plans": plans,
        "matrix": matrix,
    }


@router.put("/admin/facility-matrix", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_update_facility_matrix(payload: FacilityMatrixBatchUpdatePayload):
    """
    Memperbarui nilai sel matriks hak akses fasilitas paket secara batch atau single cell.
    Nilai level valid: none, basic, advanced, enterprise, custom, limited, unlimited.
    Tercatat di Audit Ledger.
    """
    valid_levels = {'none', 'basic', 'advanced', 'enterprise', 'custom', 'limited', 'unlimited'}
    for cell in payload.updates:
        if cell.level not in valid_levels:
            raise HTTPException(status_code=400, detail=f"Tingkat akses '{cell.level}' tidak valid.")

    engine = get_engine()
    async with engine.begin() as conn:
        for cell in payload.updates:
            await conn.execute(
                sa.text("""
                    INSERT INTO plan_facility_matrix (plan_id, facility_key, level)
                    VALUES (:pid, :fkey, :lvl)
                    ON CONFLICT (plan_id, facility_key)
                    DO UPDATE SET level = EXCLUDED.level;
                """),
                {"pid": cell.plan_id, "fkey": cell.facility_key, "lvl": cell.level},
            )

        # Audit Ledger
        await log_billing_audit(
            conn=conn,
            action="plan_facility_matrix.updated",
            resource_type="plan_facility_matrix",
            payload_after={
                "updated_count": len(payload.updates),
                "cells": [c.model_dump() for c in payload.updates],
                "capability": "billing.plans.manage",
            },
        )

    return {"status": "success", "message": f"{len(payload.updates)} entri matriks fasilitas berhasil diperbarui."}


# -----------------------------------------------------------------------------
# 3. CREDIT FORMULA CONFIGURATION (CreditFormulaConfigScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/formula-factors", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_get_formula_factors():
    """
    Mengambil seluruh parameter formula biaya kredit AI:
    - 18 baseline aktivitas AI (ai_activity_types)
    - Faktor kompleksitas (credit_complexity_factors)
    - Faktor model AI (credit_model_cost_factors)
    - Faktor MCP tool risk tier (credit_tool_factors)
    - Faktor mode eksekusi (credit_execution_factors)
    """
    engine = get_engine()
    async with engine.begin() as conn:
        act_res = await conn.execute(sa.text("""
            SELECT id, activity_code, display_name, base_work_unit_min, base_work_unit_max
            FROM ai_activity_types
            ORDER BY activity_code ASC;
        """))
        activities = [
            {
                "id": str(r[0]),
                "activity_code": r[1],
                "display_name": r[2],
                "base_work_unit_min": float(r[3]),
                "base_work_unit_max": float(r[4]),
            }
            for r in act_res.fetchall()
        ]

        comp_res = await conn.execute(sa.text("""
            SELECT id, complexity_code, multiplier
            FROM credit_complexity_factors
            ORDER BY multiplier ASC;
        """))
        complexities = [
            {"id": str(r[0]), "complexity_code": r[1], "multiplier": float(r[2])}
            for r in comp_res.fetchall()
        ]

        mod_res = await conn.execute(sa.text("""
            SELECT id, model_code, llm_model_id, multiplier
            FROM credit_model_cost_factors
            ORDER BY multiplier ASC;
        """))
        models = [
            {
                "id": str(r[0]),
                "model_code": r[1],
                "llm_model_id": str(r[2]) if r[2] else None,
                "multiplier": float(r[3]),
            }
            for r in mod_res.fetchall()
        ]

        tool_res = await conn.execute(sa.text("""
            SELECT id, risk_tier, multiplier
            FROM credit_tool_factors
            ORDER BY multiplier ASC;
        """))
        tools = [
            {"id": str(r[0]), "risk_tier": r[1], "multiplier": float(r[2])}
            for r in tool_res.fetchall()
        ]

        exec_res = await conn.execute(sa.text("""
            SELECT id, execution_mode, multiplier
            FROM credit_execution_factors
            ORDER BY multiplier ASC;
        """))
        executions = [
            {"id": str(r[0]), "execution_mode": r[1], "multiplier": float(r[2])}
            for r in exec_res.fetchall()
        ]

    return {
        "activity_types": activities,
        "complexity_factors": complexities,
        "model_cost_factors": models,
        "tool_factors": tools,
        "execution_factors": executions,
    }


@router.put("/admin/formula-factors/activity-type/{item_id}", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_update_activity_type(item_id: str, payload: ActivityTypeUpdatePayload):
    """Update baseline metering aktivitas AI. Wajib tercatat di Audit Ledger."""
    if payload.base_work_unit_min > payload.base_work_unit_max:
        raise HTTPException(status_code=400, detail="base_work_unit_min tidak boleh lebih besar dari base_work_unit_max.")

    engine = get_engine()
    async with engine.begin() as conn:
        curr_res = await conn.execute(
            sa.text("SELECT id, activity_code, display_name, base_work_unit_min, base_work_unit_max FROM ai_activity_types WHERE id = :id;"),
            {"id": item_id},
        )
        curr = curr_res.fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Tipe aktivitas AI tidak ditemukan.")

        before_data = {
            "id": str(curr[0]),
            "activity_code": curr[1],
            "display_name": curr[2],
            "base_work_unit_min": float(curr[3]),
            "base_work_unit_max": float(curr[4]),
        }

        await conn.execute(
            sa.text("""
                UPDATE ai_activity_types
                SET display_name = coalesce(:dname, display_name),
                    base_work_unit_min = :bmin,
                    base_work_unit_max = :bmax
                WHERE id = :id;
            """),
            {
                "id": item_id,
                "dname": payload.display_name,
                "bmin": payload.base_work_unit_min,
                "bmax": payload.base_work_unit_max,
            },
        )

        await log_billing_audit(
            conn=conn,
            action="credit_formula.activity_type.updated",
            resource_type="ai_activity_types",
            resource_id=item_id,
            payload_before=before_data,
            payload_after={**before_data, **payload.model_dump(), "capability": "billing.formula.manage"},
        )

    return {"status": "success", "message": f"Aktivitas {curr[1]} berhasil diperbarui."}


@router.put("/admin/formula-factors/complexity/{item_id}", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_update_complexity_factor(item_id: str, payload: FactorMultiplierUpdatePayload):
    """Update multiplier kompleksitas. Wajib tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, complexity_code, multiplier FROM credit_complexity_factors WHERE id = :id;"),
            {"id": item_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Faktor kompleksitas tidak ditemukan.")

        before_data = {"id": str(curr[0]), "complexity_code": curr[1], "multiplier": float(curr[2])}
        await conn.execute(
            sa.text("UPDATE credit_complexity_factors SET multiplier = :mult WHERE id = :id;"),
            {"id": item_id, "mult": payload.multiplier},
        )
        await log_billing_audit(
            conn=conn,
            action="credit_formula.complexity_factor.updated",
            resource_type="credit_complexity_factors",
            resource_id=item_id,
            payload_before=before_data,
            payload_after={"id": str(curr[0]), "complexity_code": curr[1], "multiplier": payload.multiplier, "capability": "billing.formula.manage"},
        )
    return {"status": "success", "message": f"Faktor kompleksitas {curr[1]} diperbarui menjadi {payload.multiplier}x."}


@router.put("/admin/formula-factors/model/{item_id}", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_update_model_cost_factor(item_id: str, payload: FactorMultiplierUpdatePayload):
    """Update multiplier model AI. Wajib tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, model_code, multiplier FROM credit_model_cost_factors WHERE id = :id;"),
            {"id": item_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Faktor model tidak ditemukan.")

        before_data = {"id": str(curr[0]), "model_code": curr[1], "multiplier": float(curr[2])}
        await conn.execute(
            sa.text("UPDATE credit_model_cost_factors SET multiplier = :mult WHERE id = :id;"),
            {"id": item_id, "mult": payload.multiplier},
        )
        await log_billing_audit(
            conn=conn,
            action="credit_formula.model_factor.updated",
            resource_type="credit_model_cost_factors",
            resource_id=item_id,
            payload_before=before_data,
            payload_after={"id": str(curr[0]), "model_code": curr[1], "multiplier": payload.multiplier, "capability": "billing.formula.manage"},
        )
    return {"status": "success", "message": f"Faktor model {curr[1]} diperbarui menjadi {payload.multiplier}x."}


@router.put("/admin/formula-factors/tool/{item_id}", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_update_tool_factor(item_id: str, payload: FactorMultiplierUpdatePayload):
    """Update multiplier alat MCP. Wajib tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, risk_tier, multiplier FROM credit_tool_factors WHERE id = :id;"),
            {"id": item_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Faktor alat tidak ditemukan.")

        before_data = {"id": str(curr[0]), "risk_tier": curr[1], "multiplier": float(curr[2])}
        await conn.execute(
            sa.text("UPDATE credit_tool_factors SET multiplier = :mult WHERE id = :id;"),
            {"id": item_id, "mult": payload.multiplier},
        )
        await log_billing_audit(
            conn=conn,
            action="credit_formula.tool_factor.updated",
            resource_type="credit_tool_factors",
            resource_id=item_id,
            payload_before=before_data,
            payload_after={"id": str(curr[0]), "risk_tier": curr[1], "multiplier": payload.multiplier, "capability": "billing.formula.manage"},
        )
    return {"status": "success", "message": f"Faktor alat tingkat {curr[1]} diperbarui menjadi {payload.multiplier}x."}


@router.put("/admin/formula-factors/execution/{item_id}", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_update_execution_factor(item_id: str, payload: FactorMultiplierUpdatePayload):
    """Update multiplier mode eksekusi. Wajib tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, execution_mode, multiplier FROM credit_execution_factors WHERE id = :id;"),
            {"id": item_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Faktor mode eksekusi tidak ditemukan.")

        before_data = {"id": str(curr[0]), "execution_mode": curr[1], "multiplier": float(curr[2])}
        await conn.execute(
            sa.text("UPDATE credit_execution_factors SET multiplier = :mult WHERE id = :id;"),
            {"id": item_id, "mult": payload.multiplier},
        )
        await log_billing_audit(
            conn=conn,
            action="credit_formula.execution_factor.updated",
            resource_type="credit_execution_factors",
            resource_id=item_id,
            payload_before=before_data,
            payload_after={"id": str(curr[0]), "execution_mode": curr[1], "multiplier": payload.multiplier, "capability": "billing.formula.manage"},
        )
    return {"status": "success", "message": f"Faktor mode eksekusi {curr[1]} diperbarui menjadi {payload.multiplier}x."}


@router.post("/admin/formula-factors/test-estimate", dependencies=[Depends(require_capability("billing.formula.manage"))])
async def admin_test_estimate_formula(payload: TestCreditEstimatePayload):
    """
    Uji nyata formula kredit AI: menghitung estimasi biaya kredit secara langsung
    dari database PostgreSQL (membuktikan perubahan multiplier seketika memengaruhi hasil kalkulasi).
    """
    estimate = await estimate_credit_cost(
        activity_code=payload.activity_code,
        complexity_code=payload.complexity_code,
        model_identifier=payload.model_identifier,
        tool_risk_tier=payload.tool_risk_tier,
        execution_mode=payload.execution_mode,
    )
    return estimate


# -----------------------------------------------------------------------------
# 4. CREDIT TOPUP PACKAGES CRUD (CreditTopupPackageScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/topup-packages", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_list_topup_packages():
    """CRUD Paket Top-Up Kredit: Menampilkan seluruh paket dari credit_topup_packages."""
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, name, credit_amount, price_idr, validity_days, is_active
            FROM credit_topup_packages
            ORDER BY price_idr ASC;
        """))
        rows = res.fetchall()

    packages = [
        {
            "id": str(r[0]),
            "name": r[1],
            "credit_amount": float(r[2]),
            "price_idr": float(r[3]),
            "validity_days": r[4],
            "is_active": bool(r[5]),
        }
        for r in rows
    ]
    return {"packages": packages}


@router.post("/admin/topup-packages", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_create_topup_package(payload: CreditTopupPackagePayload):
    """Menambahkan paket top-up baru ke katalog resmi. Tercatat di Audit Ledger."""
    engine = get_engine()
    pkg_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("""
                INSERT INTO credit_topup_packages (id, name, credit_amount, price_idr, validity_days, is_active)
                VALUES (:id, :name, :credits, :price, :vdays, :active);
            """),
            {
                "id": pkg_id,
                "name": payload.name,
                "credits": payload.credit_amount,
                "price": payload.price_idr,
                "vdays": payload.validity_days,
                "active": payload.is_active,
            },
        )
        await log_billing_audit(
            conn=conn,
            action="credit_topup_package.created",
            resource_type="credit_topup_packages",
            resource_id=pkg_id,
            payload_after={**payload.model_dump(), "id": pkg_id, "capability": "billing.plans.manage"},
        )
    return {"status": "success", "id": pkg_id, "message": f"Paket top-up '{payload.name}' berhasil dibuat."}


@router.put("/admin/topup-packages/{package_id}", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_update_topup_package(package_id: str, payload: CreditTopupPackagePayload):
    """Memperbarui paket top-up yang ada. Tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, name FROM credit_topup_packages WHERE id = :id;"),
            {"id": package_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Paket top-up tidak ditemukan.")

        await conn.execute(
            sa.text("""
                UPDATE credit_topup_packages
                SET name = :name,
                    credit_amount = :credits,
                    price_idr = :price,
                    validity_days = :vdays,
                    is_active = :active
                WHERE id = :id;
            """),
            {
                "id": package_id,
                "name": payload.name,
                "credits": payload.credit_amount,
                "price": payload.price_idr,
                "vdays": payload.validity_days,
                "active": payload.is_active,
            },
        )
        await log_billing_audit(
            conn=conn,
            action="credit_topup_package.updated",
            resource_type="credit_topup_packages",
            resource_id=package_id,
            payload_after={**payload.model_dump(), "id": package_id, "capability": "billing.plans.manage"},
        )
    return {"status": "success", "message": f"Paket top-up '{payload.name}' berhasil diperbarui."}


@router.delete("/admin/topup-packages/{package_id}", dependencies=[Depends(require_capability("billing.plans.manage"))])
async def admin_delete_topup_package(package_id: str):
    """Menonaktifkan paket top-up. Tercatat di Audit Ledger."""
    engine = get_engine()
    async with engine.begin() as conn:
        curr = (await conn.execute(
            sa.text("SELECT id, name FROM credit_topup_packages WHERE id = :id;"),
            {"id": package_id},
        )).fetchone()
        if not curr:
            raise HTTPException(status_code=404, detail="Paket top-up tidak ditemukan.")

        await conn.execute(
            sa.text("UPDATE credit_topup_packages SET is_active = false WHERE id = :id;"),
            {"id": package_id},
        )
        await log_billing_audit(
            conn=conn,
            action="credit_topup_package.deactivated",
            resource_type="credit_topup_packages",
            resource_id=package_id,
            payload_after={"id": package_id, "name": curr[1], "is_active": False, "capability": "billing.plans.manage"},
        )
    return {"status": "success", "message": f"Paket top-up '{curr[1]}' dinonaktifkan."}


# -----------------------------------------------------------------------------
# 5. TENANT CREDIT OVERRIDE & MANUAL ADJUSTMENT (TenantCreditOverrideScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/tenant-subscriptions", dependencies=[Depends(require_capability("billing.credits.view"))])
async def admin_list_tenant_subscriptions():
    """
    Menampilkan daftar tenant beserta detail langganan aktif, status unlimited override,
    dan saldo kredit (balance, reserved, available).
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT
                t.id as tenant_id,
                coalesce(t.display_name, t.legal_name) as tenant_name,
                coalesce(p.plan_code, 'NONE') as plan_code,
                coalesce(p.display_name, 'Belum Berlangganan') as plan_name,
                coalesce(s.status, 'inactive') as subscription_status,
                coalesce(s.is_unlimited_override, false) as is_unlimited_override,
                s.unlimited_reason,
                coalesce(w.balance, 0) as balance,
                coalesce(w.reserved_balance, 0) as reserved_balance,
                coalesce(w.balance - w.reserved_balance, 0) as available_balance,
                w.updated_at,
                coalesce(t.is_founder_account, false) as is_founder_account
            FROM tenants t
            LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id AND s.status IN ('active', 'trialing')
            LEFT JOIN subscription_plans p ON s.plan_id = p.id
            LEFT JOIN tenant_credit_wallet w ON w.tenant_id = t.id
            ORDER BY w.balance DESC, t.display_name ASC;
        """))
        rows = res.fetchall()

    tenants = [
        {
            "tenant_id": str(r[0]),
            "tenant_name": r[1],
            "plan_code": r[2],
            "plan_name": r[3],
            "subscription_status": r[4],
            "is_unlimited_override": bool(r[5]),
            "unlimited_reason": r[6],
            "balance": float(r[7]),
            "reserved_balance": float(r[8]),
            "available_balance": float(r[9]),
            "updated_at": r[10].isoformat() if r[10] else None,
            "is_founder_account": bool(r[11]),
        }
        for r in rows
    ]
    return {"tenants": tenants}


@router.post("/admin/tenant-override", dependencies=[Depends(require_capability("billing.unlimited_grant"))])
@router.post("/tenant-subscriptions/override", dependencies=[Depends(require_capability("billing.unlimited_grant"))])
async def set_tenant_unlimited_override(
    payload: TenantSubscriptionOverrideRequest,
    x_user_roles: Optional[str] = Header("PLATFORM_SUPERADMIN", alias="X-User-Roles"),
):
    """
    Super Admin Override: Mengaktifkan/menonaktifkan akun tanpa batas kredit (is_unlimited_override).
    ATURAN KETAT:
    1. Hanya role SUPER_ADMIN atau PLATFORM_SUPERADMIN yang berwenang.
    2. Alasan (unlimited_reason) WAJIB diisi jika is_unlimited_override=true.
    3. Tercatat di Audit Ledger dengan capability 'billing.unlimited_grant' dan risk_tier 'critical'.
    """
    roles_upper = [r.strip().upper() for r in (x_user_roles or "").split(",") if r.strip()]
    if "SUPER_ADMIN" not in roles_upper and "PLATFORM_SUPERADMIN" not in roles_upper and "PLATFORM_SUPER_ADMIN" not in roles_upper:
        raise HTTPException(
            status_code=403,
            detail="Akses ditolak: Hanya peran SUPER_ADMIN yang berwenang memberikan unlimited override (PRD v2.2 Bagian 14 & 18.2)."
        )

    if payload.is_unlimited_override and (not payload.unlimited_reason or not payload.unlimited_reason.strip()):
        raise HTTPException(
            status_code=400,
            detail="Alasan (unlimited_reason) wajib diisi bila is_unlimited_override diaktifkan.",
        )

    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(
            sa.text("""
                SELECT id FROM tenant_subscriptions
                WHERE tenant_id = :tid AND status IN ('active', 'trialing')
                ORDER BY created_at DESC LIMIT 1;
            """),
            {"tid": payload.tenant_id},
        )
        row = res.fetchone()

        if row:
            sub_id = str(row[0])
            await conn.execute(
                sa.text("""
                    UPDATE tenant_subscriptions
                    SET is_unlimited_override = :unlim,
                        unlimited_reason = :reason
                    WHERE id = :id;
                """),
                {
                    "unlim": payload.is_unlimited_override,
                    "reason": payload.unlimited_reason if payload.is_unlimited_override else None,
                    "id": sub_id,
                },
            )
        else:
            p_res = await conn.execute(sa.text("SELECT id FROM subscription_plans WHERE plan_code = 'ENTERPRISE' LIMIT 1;"))
            p_row = p_res.fetchone()
            plan_id = str(p_row[0]) if p_row else str(uuid.uuid4())

            await conn.execute(
                sa.text("""
                    INSERT INTO tenant_subscriptions (
                        id, tenant_id, plan_id, billing_cycle_start, billing_cycle_end,
                        status, is_unlimited_override, unlimited_reason
                    ) VALUES (
                        :id, :tid, :pid, now(), now() + interval '365 days',
                        'active', :unlim, :reason
                    );
                """),
                {
                    "id": str(uuid.uuid4()),
                    "tid": payload.tenant_id,
                    "pid": plan_id,
                    "unlim": payload.is_unlimited_override,
                    "reason": payload.unlimited_reason if payload.is_unlimited_override else None,
                },
            )

        # Audit Ledger - Risk Tier Tertinggi ('critical')
        await log_billing_audit(
            conn=conn,
            action="tenant_subscription.unlimited_override",
            resource_type="tenant_subscriptions",
            tenant_id=payload.tenant_id,
            payload_after={
                "tenant_id": payload.tenant_id,
                "is_unlimited_override": payload.is_unlimited_override,
                "unlimited_reason": payload.unlimited_reason,
                "risk_tier": "critical",
                "capability": "billing.unlimited_grant",
                "authorized_by_role": "SUPER_ADMIN",
            },
        )

    logger.info(
        f"Super Admin mengubah is_unlimited_override tenant {payload.tenant_id}: "
        f"{payload.is_unlimited_override} (Alasan: {payload.unlimited_reason})"
    )

    return {
        "status": "success",
        "tenant_id": payload.tenant_id,
        "is_unlimited_override": payload.is_unlimited_override,
        "unlimited_reason": payload.unlimited_reason,
    }


@router.post("/admin/manual-adjustment", dependencies=[Depends(require_capability("billing.adjustment.execute"))])
async def admin_manual_credit_adjustment(payload: ManualCreditAdjustmentPayload):
    """
    Super Admin Manual Credit Adjustment:
    Menyesuaikan saldo kredit tenant secara manual (misal refund kompensasi insiden).
    Alasan (reason) WAJIB diisi.
    Mencatat ke tenant_credit_wallet, credit_allocations, tenant_credit_transactions, dan audit_logs.
    """
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Alasan penyesuaian manual kredit wajib diisi.")

    engine = get_engine()
    async with engine.begin() as conn:
        # Cek / inisialisasi wallet
        w_res = await conn.execute(
            sa.text("SELECT id, balance FROM tenant_credit_wallet WHERE tenant_id = :tid FOR UPDATE;"),
            {"tid": payload.tenant_id},
        )
        w_row = w_res.fetchone()
        if not w_row:
            w_id = str(uuid.uuid4())
            await conn.execute(
                sa.text("""
                    INSERT INTO tenant_credit_wallet (id, tenant_id, balance, reserved_balance, currency)
                    VALUES (:id, :tid, :bal, 0, 'IDR');
                """),
                {"id": w_id, "tid": payload.tenant_id, "bal": payload.amount},
            )
            old_bal = 0.0
            new_bal = float(payload.amount)
        else:
            old_bal = float(w_row[1])
            new_bal = old_bal + float(payload.amount)
            await conn.execute(
                sa.text("""
                    UPDATE tenant_credit_wallet
                    SET balance = balance + :amt, updated_at = now()
                    WHERE tenant_id = :tid;
                """),
                {"amt": payload.amount, "tid": payload.tenant_id},
            )

        # Catat ke credit_allocations
        alloc_id = str(uuid.uuid4())
        await conn.execute(
            sa.text("""
                INSERT INTO credit_allocations (
                    id, tenant_id, source_type, source_reference_id,
                    credit_amount, created_at
                ) VALUES (
                    :id, :tid, 'manual_adjustment', :ref,
                    :amt, now()
                );
            """),
            {"id": alloc_id, "tid": payload.tenant_id, "ref": None, "amt": payload.amount},
        )

        # Catat mutasi transaksi kredit
        tx_id = str(uuid.uuid4())
        await conn.execute(
            sa.text("""
                INSERT INTO tenant_credit_transactions (
                    id, tenant_id, transaction_type, amount, balance_after, description, reference_id, created_at
                ) VALUES (
                    :id, :tid, 'adjustment', :amt, :after, :desc, :ref, now()
                );
            """),
            {
                "id": tx_id,
                "tid": payload.tenant_id,
                "amt": payload.amount,
                "after": new_bal,
                "desc": f"Penyesuaian Manual Super Admin: {payload.reason}",
                "ref": alloc_id,
            },
        )

        # Catat ke Audit Ledger
        await log_billing_audit(
            conn=conn,
            action="credit.manual_adjustment",
            resource_type="tenant_credit_wallet",
            tenant_id=payload.tenant_id,
            payload_after={
                "tenant_id": payload.tenant_id,
                "adjustment_amount": payload.amount,
                "balance_before": old_bal,
                "balance_after": new_bal,
                "reason": payload.reason,
                "capability": "billing.adjustment.execute",
            },
        )

    return {
        "status": "success",
        "tenant_id": payload.tenant_id,
        "adjustment_amount": payload.amount,
        "new_balance": new_bal,
        "message": f"Penyesuaian kredit sebesar {payload.amount} berhasil diterapkan.",
    }


# -----------------------------------------------------------------------------
# 6. EXPANDED FINANCIAL COMMAND CENTER (FinancialCommandCenterScreen)
# -----------------------------------------------------------------------------

@router.get("/admin/command-center")
async def get_financial_command_center(
    x_user_roles: Optional[str] = Header("PLATFORM_SUPERADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("admin.financial.view", alias="X-User-Capabilities"),
):
    """
    Pusat Kendali Finansial Super Admin (PRD v2.2 Bagian 14 & 18.2).
    Menampilkan agregasi finansial komprehensif lintas organisasi:
    - Likuiditas kredit sirkulasi, reservasi, & saldo tersedia
    - MRR (Monthly Recurring Revenue) dari paket aktif
    - Distribusi tenant per paket langganan
    - Top consumer kredit (organisasi dengan konsumsi tertinggi)
    - Proyeksi revenue dari alokasi top-up + invoice lunas
    - Rekonsiliasi payment gateway (Midtrans & Xendit)
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.financial.view").split(",") if c.strip()]

    subject = SubjectContext(roles=roles, capabilities=capabilities, actor_type="user")
    resource = ResourceContext(resource_type="financial_command_center", resource_id="global", owner_tenant_id="global")
    decision = authorize(subject=subject, action="admin.financial.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    engine = get_engine()
    async with engine.begin() as conn:
        # 1. Agregat Wallet
        wallet_agg = await conn.execute(sa.text("""
            SELECT
                count(*) as total_tenants,
                coalesce(sum(balance), 0) as total_circulating_balance,
                coalesce(sum(reserved_balance), 0) as total_reserved_balance
            FROM tenant_credit_wallet;
        """))
        w_row = wallet_agg.fetchone()

        # 2. Agregat Invoices Lunas
        rev_agg = await conn.execute(sa.text("""
            SELECT
                count(*) as total_invoices,
                coalesce(sum(amount), 0) as total_revenue
            FROM invoices
            WHERE status = 'paid';
        """))
        r_row = rev_agg.fetchone()

        # 3. MRR (Monthly Recurring Revenue) dari tenant aktif
        mrr_res = await conn.execute(sa.text("""
            SELECT coalesce(sum(p.monthly_price_idr), 0)
            FROM tenant_subscriptions s
            JOIN subscription_plans p ON s.plan_id = p.id
            WHERE s.status IN ('active', 'trialing');
        """))
        mrr_val = float(mrr_res.fetchone()[0])

        # 4. Distribusi Tenant per Paket
        dist_res = await conn.execute(sa.text("""
            SELECT
                p.plan_code,
                p.display_name,
                p.display_order,
                coalesce(count(s.id), 0) as tenant_count
            FROM subscription_plans p
            LEFT JOIN tenant_subscriptions s ON s.plan_id = p.id AND s.status IN ('active', 'trialing')
            GROUP BY p.id, p.plan_code, p.display_name, p.display_order
            ORDER BY p.display_order ASC;
        """))
        plan_distribution = [
            {
                "plan_code": r[0],
                "display_name": r[1],
                "display_order": r[2],
                "tenant_count": int(r[3]),
            }
            for r in dist_res.fetchall()
        ]

        # 5. Top Consumer Kredit (10 organisasi terbesar)
        consumers_res = await conn.execute(sa.text("""
            SELECT
                t.id as tenant_id,
                t.name as tenant_name,
                coalesce(sum(tx.amount), 0) as total_consumed,
                coalesce(w.balance, 0) as current_balance
            FROM tenants t
            LEFT JOIN tenant_credit_transactions tx ON tx.tenant_id = t.id AND tx.transaction_type = 'usage'
            LEFT JOIN tenant_credit_wallet w ON w.tenant_id = t.id
            GROUP BY t.id, t.name, w.balance
            ORDER BY total_consumed DESC
            LIMIT 10;
        """))
        top_consumers = [
            {
                "tenant_id": str(r[0]),
                "tenant_name": r[1],
                "total_consumed": float(r[2]),
                "current_balance": float(r[3]),
            }
            for r in consumers_res.fetchall()
        ]

        # 6. Proyeksi Revenue dari Allocations & Invoices
        alloc_res = await conn.execute(sa.text("""
            SELECT
                source_type,
                coalesce(sum(credit_amount), 0) as total_credits,
                count(*) as count
            FROM credit_allocations
            GROUP BY source_type;
        """))
        allocations_summary = {
            r[0]: {"total_credits": float(r[1]), "count": int(r[2])}
            for r in alloc_res.fetchall()
        }

        # 7. Daftar Wallet Tenant
        wallets_res = await conn.execute(sa.text("""
            SELECT w.id, w.tenant_id, t.name as tenant_name, w.balance, w.reserved_balance,
                   (w.balance - w.reserved_balance) as available_balance, w.currency, w.updated_at
            FROM tenant_credit_wallet w
            LEFT JOIN tenants t ON t.id = w.tenant_id
            ORDER BY w.balance DESC
            LIMIT 50;
        """))
        wallet_rows = wallets_res.fetchall()

        # 8. Log Rekonsiliasi Webhook
        recon_res = await conn.execute(sa.text("""
            SELECT id, tenant_id, invoice_id, payment_gateway, event_type, signature_verified, status, created_at
            FROM payment_reconciliation_log
            ORDER BY created_at DESC
            LIMIT 30;
        """))
        recon_rows = recon_res.fetchall()

    return {
        "summary": {
            "total_tenants": int(w_row[0]),
            "total_circulating_balance": float(w_row[1]),
            "total_reserved_balance": float(w_row[2]),
            "total_available_balance": float(w_row[1] - w_row[2]),
            "total_paid_invoices": int(r_row[0]),
            "total_revenue_collected": float(r_row[1]),
            "mrr_idr": mrr_val,
            "currency": "IDR",
        },
        "plan_distribution": plan_distribution,
        "top_credit_consumers": top_consumers,
        "revenue_projection": {
            "total_invoice_revenue_idr": float(r_row[1]),
            "mrr_current_idr": mrr_val,
            "allocations_by_source": allocations_summary,
        },
        "tenant_wallets": [
            {
                "id": str(r[0]),
                "tenant_id": str(r[1]),
                "tenant_name": r[2] or f"Organisasi {str(r[1])[:8]}",
                "balance": float(r[3]),
                "reserved_balance": float(r[4]),
                "available_balance": float(r[5]),
                "currency": r[6],
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in wallet_rows
        ],
        "recent_reconciliations": [
            {
                "id": str(r[0]),
                "tenant_id": str(r[1]) if r[1] else None,
                "invoice_id": str(r[2]) if r[2] else None,
                "payment_gateway": r[3],
                "event_type": r[4],
                "signature_verified": bool(r[5]),
                "status": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in recon_rows
        ],
    }


# ============================================================================
# SISTEM REKONSILIASI PEMBAYARAN GATEWAY & AUDIT WEBHOOK (PRD v2.2 Bagian 2, 3.5, 12.5, 14.3)
# ============================================================================

from app.domains.billing.payment_reconciliation import (
    payment_reconciliation_repo,
    recheck_payment_status,
    manual_resolve_case,
    detect_payment_reconciliation_cases,
)


class ManualResolveReconciliationPayload(BaseModel):
    resolution_status: str = Field(..., description="'resolved' atau 'rejected'")
    resolution_notes: str = Field(..., min_length=5, description="Catatan verifikasi manual dan referensi bukti transfer mutasi")


class TenantReportPaymentPayload(BaseModel):
    reference_id: str = Field(..., description="Nomor faktur (INV-...) atau nomor pesanan (ORD-...)")
    notes: Optional[str] = Field(None, description="Keterangan transfer atau mutasi dari tenant")


class DetectReconciliationPayload(BaseModel):
    threshold_minutes: int = Field(default=15, ge=1, le=1440, description="Batas usia transaksi tertunda dalam menit")


@router.get(
    "/admin/reconciliation/cases",
    dependencies=[Depends(require_capability("admin.commercial.reconciliation.view"))],
    summary="Daftar Kasus Rekonsiliasi Pembayaran Super Admin",
)
async def admin_get_reconciliation_cases(
    tab: str = Query("error_confirm", description="Tab monitoring: success, pending, atau error_confirm"),
    tenant_id: Optional[str] = Query(None, description="Filter spesifik ID tenant"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Mengambil data tiga tab monitoring:
    1. Berhasil: Transaksi status 'paid' dari orders dan invoices.
    2. Pending: Transaksi 'pending_payment' usia < ambang batas.
    3. Error Konfirmasi: Kasus payment_reconciliation_cases berstatus open / verified_mismatch_escalated.
    """
    counts = await payment_reconciliation_repo.get_counts(tenant_id=tenant_id)
    cases = await payment_reconciliation_repo.list_cases(
        tab=tab,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )
    return {
        "active_tab": tab,
        "counts": counts,
        "cases": cases,
    }


@router.post(
    "/admin/reconciliation/cases/{case_id}/recheck",
    dependencies=[Depends(require_capability("admin.commercial.reconciliation.manage"))],
    summary="Cek Ulang Status ke Gateway Resmi",
)
async def admin_recheck_gateway_case(case_id: str):
    """
    Memanggil Get Transaction Status API Midtrans secara nyata.
    Jika settlement/capture: memicu handle_payment_webhook kanonik untuk mengaktifkan entitlement.
    Jika expire/deny/cancel: eskalasi status kasus ke verified_mismatch_escalated untuk review manual.
    """
    try:
        result = await recheck_payment_status(case_id)
        return {
            "status": "ok",
            "case_id": result.case_id,
            "gateway_status": result.gateway_status,
            "resolution_status": result.resolution_status,
            "message": result.message,
        }
    except Exception as exc:
        logger.error(f"Gagal memeriksa status gateway untuk kasus {case_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/admin/reconciliation/cases/{case_id}/resolve",
    dependencies=[Depends(require_capability("admin.commercial.reconciliation.manage"))],
    summary="Penyelesaian Manual Kasus Eskalasi Rekonsiliasi",
)
async def admin_manual_resolve_case(
    case_id: str,
    payload: ManualResolveReconciliationPayload,
    request: Request,
):
    """
    Form review manual Super Admin untuk kasus verified_mismatch_escalated.
    Super Admin dapat menandai resolved (dengan bukti mutasi bank manual) atau rejected.
    Tindakan dicatat dalam Audit Ledger ber-risk tier HIGH.
    """
    admin_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000001"
    try:
        res = await manual_resolve_case(
            case_id=case_id,
            resolution_status=payload.resolution_status,
            resolution_notes=payload.resolution_notes,
            admin_user_id=admin_id,
        )
        return {
            "status": "ok",
            "data": res,
            "message": f"Kasus berhasil diselesaikan dengan status '{payload.resolution_status}'.",
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.error(f"Gagal menyelesaikan kasus rekonsiliasi {case_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/admin/reconciliation/detect",
    dependencies=[Depends(require_capability("admin.commercial.reconciliation.manage"))],
    summary="Jalankan Deteksi Otomatis Transaksi Tertunda",
)
async def admin_run_reconciliation_detection(payload: DetectReconciliationPayload = DetectReconciliationPayload()):
    """
    Menjalankan siklus deteksi otomatis kasus sudah bayar tapi webhook hilang/terlambat.
    Memindai transaksi tertunda > threshold_minutes, melakukan verifikasi langsung ke Midtrans,
    dan mengaktifkan entitlement secara otomatis.
    """
    report = await detect_payment_reconciliation_cases(threshold_minutes=payload.threshold_minutes)
    return {
        "status": "ok",
        "report": report,
    }


@router.get(
    "/reconciliation/cases",
    dependencies=[Depends(require_capability("billing.invoice.view"))],
    summary="Riwayat Kasus Rekonsiliasi Tenant",
)
async def tenant_get_reconciliation_cases(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
):
    """
    Menampilkan status kasus rekonsiliasi milik tenant aktif (read-only transparan).
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        # Fallback ke header x-tenant-id jika ada
        tenant_id = request.headers.get("x-tenant-id")

    if not tenant_id:
        return {"cases": []}

    cases = await payment_reconciliation_repo.list_cases(
        tab="error_confirm",
        tenant_id=tenant_id,
        limit=limit,
    )
    return {"cases": cases}


@router.post(
    "/reconciliation/report-payment",
    dependencies=[Depends(require_capability("billing.invoice.view"))],
    summary="Klaim Konfirmasi Pembayaran oleh Tenant",
)
async def tenant_report_payment(
    payload: TenantReportPaymentPayload,
    request: Request,
):
    """
    Tenant melaporkan bahwa pembayaran telah berhasil dilakukan di Midtrans namun status internal belum berubah.
    Sistem akan membuat kasus 'error_confirm' dan langsung memverifikasi status ke gateway secara real-time.
    """
    tenant_id = getattr(request.state, "tenant_id", None) or request.headers.get("x-tenant-id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context is required")

    ref_id = payload.reference_id.strip()

    # Cari apakah ref_id merujuk ke invoice atau order
    engine = get_engine()
    inv_id = None
    order_id = None
    internal_before = "pending"

    async with engine.begin() as conn:
        r_inv = await conn.execute(
            sa.text("SELECT id, status FROM invoices WHERE invoice_number = :ref AND tenant_id = :t LIMIT 1;"),
            {"ref": ref_id, "t": tenant_id},
        )
        row_inv = r_inv.mappings().first()
        if row_inv:
            inv_id = str(row_inv["id"])
            internal_before = row_inv["status"]

        if not inv_id:
            r_ord = await conn.execute(
                sa.text("SELECT id, payment_status FROM orders WHERE order_number = :ref AND tenant_id = :t LIMIT 1;"),
                {"ref": ref_id, "t": tenant_id},
            )
            row_ord = r_ord.mappings().first()
            if row_ord:
                order_id = str(row_ord["id"])
                internal_before = row_ord["payment_status"]

    if not inv_id and not order_id:
        raise HTTPException(status_code=404, detail=f"Nomor referensi '{ref_id}' tidak ditemukan untuk organisasi Anda.")

    # Cek apakah sudah ada case terbuka
    existing_case = await payment_reconciliation_repo.get_by_gateway_ref(ref_id)
    if existing_case:
        case_id = existing_case["id"]
    else:
        case_id = await payment_reconciliation_repo.create_case(
            tenant_id=tenant_id,
            gateway_reference_id=ref_id,
            detected_status="error_confirm",
            internal_status_before=internal_before,
            invoice_id=inv_id,
            order_id=order_id,
            resolution_status="open",
            resolution_notes=payload.notes or "Pelaporan konfirmasi pembayaran manual oleh pengguna.",
        )

    # Jalankan recheck langsung
    recheck_res = await recheck_payment_status(case_id)
    return {
        "status": "ok",
        "case_id": case_id,
        "gateway_status": recheck_res.gateway_status,
        "resolution_status": recheck_res.resolution_status,
        "message": "Pemeriksaan status pembayaran ke gateway selesai.",
    }

