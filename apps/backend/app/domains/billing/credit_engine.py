"""
OrchestreeAI Credit Engine (PRD v2.2 Bagian 14 & Billing Specification)
Mengimplementasikan siklus hidup 5 tahap biaya kredit AI:
Estimate -> Reserve -> Execute -> Consume -> Refund

Prinsip:
1. "1 Tenant = 1 Balance = 1 Ledger": Seluruh modul AI memotong tenant_credit_wallet yang sama.
2. Tenant dengan is_unlimited_override=true tidak pernah gagal karena saldo,
   namun seluruh aktivitas TETAP dicatat penuh di ledger audit untuk kepatuhan & analitik.
3. Estimasi biaya transparan sebelum pemanggilan beban kerja berat (Model Router / MCP Tools).
"""

import uuid
import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine, tenant_tx_async

logger = logging.getLogger("orchestree.billing.credit_engine")


class InsufficientCreditException(Exception):
    """Dilempar ketika saldo kredit tersedia tidak mencukupi untuk reservasi."""
    def __init__(self, tenant_id: str, message: Optional[str] = None):
        self.tenant_id = tenant_id
        super().__init__(message or f"Saldo kredit organisasi {tenant_id} tidak mencukupi.")


class CreditEstimate(BaseModel):
    base: float = Field(default=0.0, description="Nilai dasar unit kerja dari jenis aktivitas AI")
    complexity: float = Field(default=1.0, description="Faktor pengali kompleksitas tugas")
    model: float = Field(default=1.0, description="Faktor pengali model LLM yang dipilih")
    tool: float = Field(default=1.0, description="Faktor pengali perkakas MCP berdasarkan risk tier")
    execution: float = Field(default=1.0, description="Faktor pengali mode eksekusi")
    final_estimate: float = Field(..., description="Total estimasi kredit AI yang dibutuhkan")
    activity_code: Optional[str] = None
    base_work_units: Optional[float] = None
    complexity_multiplier: Optional[float] = None
    model_multiplier: Optional[float] = None
    tool_multiplier: Optional[float] = None
    execution_multiplier: Optional[float] = None

    def model_post_init(self, __context: Any) -> None:
        if self.base_work_units is not None and self.base == 0.0:
            self.base = self.base_work_units
        if self.complexity_multiplier is not None and self.complexity == 1.0:
            self.complexity = self.complexity_multiplier
        if self.model_multiplier is not None and self.model == 1.0:
            self.model = self.model_multiplier
        if self.tool_multiplier is not None and self.tool == 1.0:
            self.tool = self.tool_multiplier
        if self.execution_multiplier is not None and self.execution == 1.0:
            self.execution = self.execution_multiplier

    def dict(self, *args, **kwargs) -> Dict[str, Any]:
        return self.model_dump(*args, **kwargs)


class ReservationToken(BaseModel):
    id: str
    tenant_id: str
    estimated_cost: float
    activity_type_id: Optional[str] = None
    cost_breakdown: Dict[str, Any] = Field(default_factory=dict)
    reference_type: str = "ai_task"
    reference_id: str = ""
    execution_ref: Optional[str] = None
    status: str = "reserved"
    is_unlimited_override: bool = False


class Factor(BaseModel):
    multiplier: float = 1.0


class ActivityTypeRecord(BaseModel):
    id: str
    activity_code: str
    display_name: str
    base_work_unit_min: float
    base_work_unit_max: float


class ActiveSubscriptionRecord(BaseModel):
    id: str
    tenant_id: str
    plan_id: str
    status: str
    is_unlimited_override: bool
    unlimited_reason: Optional[str] = None


TenantSubscriptionEntity = ActiveSubscriptionRecord


class CreditExecutionType(str):
    AI_AGENT_TASK = "ai_agent_task"
    MODEL_ROUTER = "model_router"
    GENERATIVE_IMAGE = "generative_image"
    MCP_TOOL_CALL = "mcp_tool_call"
    SINGLE_STEP = "single_step"


class CreditEstimateRequest(BaseModel):
    tenant_id: str
    execution_type: str = CreditExecutionType.AI_AGENT_TASK
    model_id: str = "default"
    input_tokens: int = 0
    output_tokens: int = 0
    complexity_tier: str = "medium"
    activity_code: Optional[str] = None


class CreditEngine:
    """Wrapper class CreditEngine untuk pemanggilan berorientasi objek di suite pengujian & service layer."""
    async def estimate_credit_cost(self, request_or_code: Any, *args, **kwargs) -> CreditEstimate:
        if isinstance(request_or_code, CreditEstimateRequest):
            return await estimate_credit_cost(
                activity_code=request_or_code.activity_code or "ai_agent_task",
                complexity_code=request_or_code.complexity_tier,
                llm_model_id=request_or_code.model_id,
            )
        return await estimate_credit_cost(request_or_code, *args, **kwargs)

    async def reserve_credit(self, *args, **kwargs) -> ReservationToken:
        return await reserve_credit(*args, **kwargs)

    async def consume_credit(self, *args, **kwargs) -> Dict[str, Any]:
        return await consume_credit(*args, **kwargs)

    async def refund_credit(self, *args, **kwargs) -> Dict[str, Any]:
        return await refund_credit(*args, **kwargs)



# ---------------------------------------------------------------------------
# Repositori Data Faktor & Baseline Metering (Database-Backed with Fallback)
# ---------------------------------------------------------------------------

class AiActivityTypeRepo:
    async def get_by_code(self, activity_code: str) -> ActivityTypeRecord:
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT id, activity_code, display_name, base_work_unit_min, base_work_unit_max
                    FROM ai_activity_types
                    WHERE activity_code = :code
                    LIMIT 1;
                """),
                {"code": activity_code},
            )
            row = res.fetchone()
            if row:
                return ActivityTypeRecord(
                    id=str(row[0]),
                    activity_code=row[1],
                    display_name=row[2],
                    base_work_unit_min=float(row[3]),
                    base_work_unit_max=float(row[4]),
                )

        # Baseline standar platform bila lookup tabel belum termigrasi
        defaults: Dict[str, tuple[float, float, str]] = {
            "simple_chat": (1.0, 3.0, "Simple Conversational Query"),
            "summarization": (2.0, 5.0, "Document & Meeting Summarization"),
            "basic_analysis": (3.0, 8.0, "Basic Operational Analysis"),
            "document_analysis": (5.0, 15.0, "Deep Document & Contract Analysis"),
            "research": (8.0, 20.0, "Competitor & Market Research Crawl"),
            "advanced_analysis": (10.0, 25.0, "Multi-Variable Quantitative Analysis"),
            "report_generation": (12.0, 30.0, "Automated Executive Briefing & Report"),
            "ai_selection": (5.0, 15.0, "Candidate & Lead Smart Selection"),
            "scoring_ranking": (4.0, 12.0, "Multi-Criteria Scoring & Ranking"),
            "data_processing": (3.0, 10.0, "Data Quality & Anomaly Detection"),
            "workflow_execution": (2.0, 6.0, "Single Workflow Node Execution"),
            "automation": (4.0, 12.0, "Automated Scheduled Campaign Execution"),
            "ai_agent_execution": (15.0, 35.0, "Specialist AI Agent Goal Execution"),
            "multi_agent_task": (25.0, 60.0, "Cross-Department Multi-Agent Orchestration"),
            "tool_operation": (5.0, 15.0, "MCP Sandboxed Tool Invocation"),
            "autonomous_execution": (30.0, 75.0, "Chief of Staff Autonomous Strategic Sweep"),
            "proactive_ai_analysis": (6.0, 18.0, "Proactive Event Correlator & Alert"),
            "omnichannel_ai_task": (2.0, 8.0, "Omnichannel Message Intake & Auto-Response"),
        }
        b_min, b_max, name = defaults.get(activity_code, (2.0, 5.0, activity_code))
        return ActivityTypeRecord(
            id=f"act-{activity_code}",
            activity_code=activity_code,
            display_name=name,
            base_work_unit_min=b_min,
            base_work_unit_max=b_max,
        )


class CreditComplexityFactorRepo:
    async def get(self, complexity_code: str) -> Factor:
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT multiplier FROM credit_complexity_factors
                    WHERE complexity_code = :code
                    LIMIT 1;
                """),
                {"code": complexity_code.lower() if complexity_code else "medium"},
            )
            row = res.fetchone()
            if row:
                return Factor(multiplier=float(row[0]))

        defaults = {"low": 1.0, "medium": 1.5, "high": 2.5, "very_high": 4.0}
        return Factor(multiplier=defaults.get(complexity_code.lower() if complexity_code else "medium", 1.5))


class CreditModelCostFactorRepo:
    async def get(self, model_identifier: str) -> Factor:
        engine = get_engine()
        async with engine.begin() as conn:
            # Cari berdasarkan model_code atau id uuid
            res = await conn.execute(
                sa.text("""
                    SELECT multiplier FROM credit_model_cost_factors
                    WHERE model_code = :code
                       OR (llm_model_id::text = :code)
                    LIMIT 1;
                """),
                {"code": str(model_identifier)},
            )
            row = res.fetchone()
            if row:
                return Factor(multiplier=float(row[0]))

        defaults = {
            "meta-llama/llama-3.1-70b-instruct": 1.2,
            "meta-llama/llama-3.1-8b-instruct": 0.8,
            "gemini-1.5-pro": 1.5,
            "gemini-1.5-flash": 0.7,
            "gemini-2.5-flash": 0.75,
            "gemini-2.5-pro": 1.6,
            "gpt-4o": 2.0,
            "gpt-4o-mini": 0.6,
            "default": 1.0,
        }
        return Factor(multiplier=defaults.get(str(model_identifier).lower(), 1.0))


class CreditToolFactorRepo:
    async def get(self, risk_tier: Optional[str]) -> Factor:
        if not risk_tier:
            return Factor(multiplier=1.0)
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT multiplier FROM credit_tool_factors
                    WHERE risk_tier = :tier
                    LIMIT 1;
                """),
                {"tier": risk_tier.lower()},
            )
            row = res.fetchone()
            if row:
                return Factor(multiplier=float(row[0]))

        defaults = {"low": 1.0, "medium": 1.3, "high": 2.0}
        return Factor(multiplier=defaults.get(risk_tier.lower(), 1.0))


class CreditExecutionFactorRepo:
    async def get(self, execution_mode: str) -> Factor:
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT multiplier FROM credit_execution_factors
                    WHERE execution_mode = :mode
                    LIMIT 1;
                """),
                {"mode": execution_mode.lower() if execution_mode else "single_step"},
            )
            row = res.fetchone()
            if row:
                return Factor(multiplier=float(row[0]))

        defaults = {"single_step": 1.0, "multi_step": 1.8, "autonomous": 3.0}
        return Factor(multiplier=defaults.get(execution_mode.lower() if execution_mode else "single_step", 1.0))


class TenantSubscriptionRepo:
    async def get_active(self, tenant_id: str) -> ActiveSubscriptionRecord:
        async with tenant_tx_async(tenant_id) as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT id, tenant_id, plan_id, status, is_unlimited_override, unlimited_reason
                    FROM tenant_subscriptions
                    WHERE tenant_id = :tid AND status IN ('active', 'trialing')
                    ORDER BY created_at DESC
                    LIMIT 1;
                """),
                {"tid": tenant_id},
            )
            row = res.fetchone()
            if row:
                return ActiveSubscriptionRecord(
                    id=str(row[0]),
                    tenant_id=str(row[1]),
                    plan_id=str(row[2]),
                    status=row[3],
                    is_unlimited_override=bool(row[4]),
                    unlimited_reason=row[5],
                )

        return ActiveSubscriptionRecord(
            id=f"sub-default-{tenant_id}",
            tenant_id=tenant_id,
            plan_id="plan-standard",
            status="active",
            is_unlimited_override=False,
            unlimited_reason=None,
        )


ai_activity_type_repo = AiActivityTypeRepo()
credit_complexity_factor_repo = CreditComplexityFactorRepo()
credit_model_cost_factor_repo = CreditModelCostFactorRepo()
credit_tool_factor_repo = CreditToolFactorRepo()
credit_execution_factor_repo = CreditExecutionFactorRepo()
tenant_subscription_repo = TenantSubscriptionRepo()


# ---------------------------------------------------------------------------
# SIKLUS HIDUP 5 TAHAP CREDIT ENGINE
# ---------------------------------------------------------------------------

async def estimate_credit_cost(
    activity_code: str,
    complexity_code: str = "medium",
    llm_model_id: str = "default",
    tool_risk_tier: Optional[str] = None,
    execution_mode: str = "single_step",
) -> CreditEstimate:
    """
    Tahap 1: Estimasi Biaya Kredit AI (estimate_credit_cost).
    Dipanggil SEBELUM eksekusi berat, ditampilkan ke user untuk konfirmasi
    (Credit UX: 'estimasi biaya sebelum pekerjaan berat').
    """
    activity = await ai_activity_type_repo.get_by_code(activity_code)
    complexity = await credit_complexity_factor_repo.get(complexity_code)
    model_factor = await credit_model_cost_factor_repo.get(llm_model_id)
    tool_factor = await credit_tool_factor_repo.get(tool_risk_tier)
    execution_factor = await credit_execution_factor_repo.get(execution_mode)

    base = (activity.base_work_unit_min + activity.base_work_unit_max) / 2.0
    final = (
        base
        * complexity.multiplier
        * model_factor.multiplier
        * tool_factor.multiplier
        * execution_factor.multiplier
    )

    return CreditEstimate(
        base=round(base, 4),
        complexity=round(complexity.multiplier, 3),
        model=round(model_factor.multiplier, 3),
        tool=round(tool_factor.multiplier, 3),
        execution=round(execution_factor.multiplier, 3),
        final_estimate=round(final, 4),
    )


async def reserve_credit(
    tenant_id: str,
    estimate: CreditEstimate,
    activity_type_id: str,
    reference_type: str = "ai_task",
    reference_id: Optional[str] = None,
    execution_ref: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ReservationToken:
    """
    Tahap 2: Reservasi Kredit AI (reserve_credit).
    Mengunci dompet dengan SELECT ... FOR UPDATE.
    Bila is_unlimited_override=true: tidak menolak saldo, tetap mencatat reservasi & transaksi audit.
    """
    subscription = await tenant_subscription_repo.get_active(tenant_id)
    ref_id = reference_id or f"ref-{uuid.uuid4().hex[:12]}"
    meta = metadata or {}
    meta["cost_breakdown"] = estimate.dict()
    if subscription.is_unlimited_override:
        meta["is_unlimited_override"] = True
        meta["unlimited_reason"] = subscription.unlimited_reason

    async with tenant_tx_async(tenant_id) as conn:

        # 1. Kunci dompet tenant (Row-Level Locking)
        res_w = await conn.execute(
            sa.text("""
                SELECT id, balance, reserved_balance, currency
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid
                FOR UPDATE;
            """),
            {"tid": tenant_id},
        )
        w_row = res_w.fetchone()

        if not w_row:
            # Inisialisasi dompet jika belum ada
            w_id = str(uuid.uuid4())
            init_bal = Decimal("250000.0000")
            await conn.execute(
                sa.text("""
                    INSERT INTO tenant_credit_wallet (id, tenant_id, balance, reserved_balance, currency)
                    VALUES (:id, :tid, :bal, 0, 'IDR')
                    ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
                    RETURNING id, balance, reserved_balance, currency;
                """),
                {"id": w_id, "tid": tenant_id, "bal": init_bal},
            )
            balance = float(init_bal)
            reserved = 0.0
            wallet_id = w_id
        else:
            wallet_id = str(w_row[0])
            balance = float(w_row[1])
            reserved = float(w_row[2])

        available = balance - reserved

        # Cek kecukupan saldo jika bukan akun unlimited override
        if not subscription.is_unlimited_override and available < estimate.final_estimate:
            logger.warning(
                f"Saldo kredit tidak mencukupi untuk tenant {tenant_id}: "
                f"Tersedia {available:.2f} < Kebutuhan {estimate.final_estimate:.2f}"
            )
            raise InsufficientCreditException(
                tenant_id,
                f"Saldo kredit tidak mencukupi. Tersedia: {available:.2f}, Kebutuhan estimasi: {estimate.final_estimate:.2f} AI Credits."
            )

        # Update reserved_balance jika bukan unlimited override
        new_reserved = reserved + (0.0 if subscription.is_unlimited_override else estimate.final_estimate)
        if not subscription.is_unlimited_override:
            await conn.execute(
                sa.text("""
                    UPDATE tenant_credit_wallet
                    SET reserved_balance = :res, updated_at = now()
                    WHERE id = :wid;
                """),
                {"res": new_reserved, "wid": wallet_id},
            )

        # Buat entri reservasi di credit_reservations
        reservation_id = str(uuid.uuid4())
        await conn.execute(
            sa.text("""
                INSERT INTO credit_reservations (
                    id, tenant_id, estimated_cost, status, reference_type,
                    reference_id, cost_breakdown, execution_ref, metadata
                ) VALUES (
                    :id, :tid, :est, 'reserved', :ref_type,
                    :ref_id, :breakdown, :exec_ref, :meta
                );
            """),
            {
                "id": reservation_id,
                "tid": tenant_id,
                "est": estimate.final_estimate,
                "ref_type": reference_type,
                "ref_id": ref_id,
                "breakdown": json.dumps(estimate.dict()),
                "exec_ref": execution_ref,
                "meta": json.dumps(meta),
            },
        )

        # Catat mutasi audit di tenant_credit_transactions
        balance_after = balance - new_reserved
        await conn.execute(
            sa.text("""
                INSERT INTO tenant_credit_transactions (
                    id, tenant_id, reservation_id, transaction_type, amount,
                    balance_after, reference_id, description, metadata
                ) VALUES (
                    :id, :tid, :rid, 'reserved', :amount,
                    :bal_after, :ref_id, :desc, :meta
                );
            """),
            {
                "id": str(uuid.uuid4()),
                "tid": tenant_id,
                "rid": reservation_id,
                "amount": -estimate.final_estimate,
                "bal_after": max(0.0, balance_after),
                "ref_id": ref_id,
                "desc": f"Reservasi kredit untuk {reference_type}:{ref_id}",
                "meta": json.dumps(meta),
            },
        )

    logger.info(
        f"Kredit direservasi: {estimate.final_estimate} untuk tenant {tenant_id} (ResID: {reservation_id})"
    )

    return ReservationToken(
        id=reservation_id,
        tenant_id=tenant_id,
        estimated_cost=estimate.final_estimate,
        activity_type_id=activity_type_id,
        cost_breakdown=estimate.dict(),
        reference_type=reference_type,
        reference_id=ref_id,
        execution_ref=execution_ref,
        status="reserved",
    )


async def consume_credit(
    reservation: ReservationToken,
    actual_cost: float,
    execution_ref: Optional[str] = None,
) -> None:
    """
    Tahap 4: Konsumsi Kredit Aktual (consume_credit).
    Bila is_unlimited_override=true: tidak memotong balance fisik, namun TETAP
    mencatat konsumsi di ledger audit.
    """
    subscription = await tenant_subscription_repo.get_active(reservation.tenant_id)
    exec_reference = execution_ref or reservation.execution_ref or reservation.reference_id
    cost = max(0.0, actual_cost)

    async with tenant_tx_async(reservation.tenant_id) as conn:

        # 1. Kunci dompet tenant
        res_w = await conn.execute(
            sa.text("""
                SELECT id, balance, reserved_balance
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid
                FOR UPDATE;
            """),
            {"tid": reservation.tenant_id},
        )
        w_row = res_w.fetchone()

        if w_row:
            wallet_id = str(w_row[0])
            balance = float(w_row[1])
            reserved = float(w_row[2])

            if not subscription.is_unlimited_override:
                new_reserved = max(0.0, reserved - reservation.estimated_cost)
                new_balance = max(0.0, balance - cost)
                await conn.execute(
                    sa.text("""
                        UPDATE tenant_credit_wallet
                        SET balance = :bal, reserved_balance = :res, updated_at = now()
                        WHERE id = :wid;
                    """),
                    {"bal": new_balance, "res": new_reserved, "wid": wallet_id},
                )
                balance_after = new_balance - new_reserved
            else:
                balance_after = balance - reserved
        else:
            balance_after = 0.0

        # 2. Update status reservasi
        await conn.execute(
            sa.text("""
                UPDATE credit_reservations
                SET status = 'consumed',
                    actual_cost = :act,
                    execution_ref = :eref,
                    updated_at = now()
                WHERE id = :rid;
            """),
            {"act": cost, "eref": exec_reference, "rid": reservation.id},
        )

        # 3. Catat audit ledger di tenant_credit_transactions
        await conn.execute(
            sa.text("""
                INSERT INTO tenant_credit_transactions (
                    id, tenant_id, reservation_id, transaction_type, amount,
                    balance_after, reference_id, description, metadata
                ) VALUES (
                    :id, :tid, :rid, 'consumed', :amount,
                    :bal_after, :ref_id, :desc, :meta
                );
            """),
            {
                "id": str(uuid.uuid4()),
                "tid": reservation.tenant_id,
                "rid": reservation.id,
                "amount": -cost,
                "bal_after": max(0.0, balance_after),
                "ref_id": exec_reference,
                "desc": f"Konsumsi kredit AI untuk {reservation.reference_type}:{exec_reference}",
                "meta": json.dumps({
                    "is_unlimited_override": subscription.is_unlimited_override,
                    "estimated_cost": reservation.estimated_cost,
                    "actual_cost": cost,
                }),
            },
        )

    logger.info(
        f"Kredit dikonsumsi: {cost} AI Credits (estimasi: {reservation.estimated_cost}) "
        f"untuk tenant {reservation.tenant_id} (ResID: {reservation.id})"
    )


async def refund_credit(
    reservation: ReservationToken,
    reason: str = "Eksekusi dibatalkan atau gagal",
) -> None:
    """
    Tahap 5: Pengembalian Reservasi Kredit (refund_credit).
    Melepaskan saldo yang direservasi dan mengembalikan ke saldo tersedia.
    """
    subscription = await tenant_subscription_repo.get_active(reservation.tenant_id)

    async with tenant_tx_async(reservation.tenant_id) as conn:

        res_w = await conn.execute(
            sa.text("""
                SELECT id, balance, reserved_balance
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid
                FOR UPDATE;
            """),
            {"tid": reservation.tenant_id},
        )
        w_row = res_w.fetchone()

        if w_row:
            wallet_id = str(w_row[0])
            balance = float(w_row[1])
            reserved = float(w_row[2])

            if not subscription.is_unlimited_override:
                new_reserved = max(0.0, reserved - reservation.estimated_cost)
                await conn.execute(
                    sa.text("""
                        UPDATE tenant_credit_wallet
                        SET reserved_balance = :res, updated_at = now()
                        WHERE id = :wid;
                    """),
                    {"res": new_reserved, "wid": wallet_id},
                )
                balance_after = balance - new_reserved
            else:
                balance_after = balance - reserved
        else:
            balance_after = 0.0

        # Update status reservasi
        await conn.execute(
            sa.text("""
                UPDATE credit_reservations
                SET status = 'refunded',
                    actual_cost = 0.0,
                    updated_at = now()
                WHERE id = :rid;
            """),
            {"rid": reservation.id},
        )

        # Catat mutasi audit refund
        await conn.execute(
            sa.text("""
                INSERT INTO tenant_credit_transactions (
                    id, tenant_id, reservation_id, transaction_type, amount,
                    balance_after, reference_id, description, metadata
                ) VALUES (
                    :id, :tid, :rid, 'refunded', :amount,
                    :bal_after, :ref_id, :desc, :meta
                );
            """),
            {
                "id": str(uuid.uuid4()),
                "tid": reservation.tenant_id,
                "rid": reservation.id,
                "amount": reservation.estimated_cost,
                "bal_after": max(0.0, balance_after),
                "ref_id": reservation.reference_id,
                "desc": f"Pengembalian reservasi kredit AI: {reason}",
                "meta": json.dumps({"reason": reason}),
            },
        )

    logger.info(
        f"Kredit di-refund: {reservation.estimated_cost} AI Credits untuk tenant {reservation.tenant_id} (Alasan: {reason})"
    )


# ---------------------------------------------------------------------------
# Hitung Ringkasan Wallet (Sesuai Kontrak BAGIAN C)
# ---------------------------------------------------------------------------

async def get_tenant_credit_wallet_summary(tenant_id: str) -> Dict[str, Any]:
    """
    Kontrak BAGIAN C:
    GET /api/v1/tenants/{t}/credit-wallet/summary
    Mengembalikan PERSIS bentuk:
    {
      "available": 42500.0,
      "reserved": 2000.0,
      "used_this_cycle": 5500.0,
      "total_allocated_this_cycle": 50000.0,
      "is_unlimited": false,
      "low_balance_warning": false
    }
    """
    subscription = await tenant_subscription_repo.get_active(tenant_id)
    async with tenant_tx_async(tenant_id) as conn:

        # Ambil saldo wallet
        w_res = await conn.execute(
            sa.text("""
                SELECT balance, reserved_balance, low_balance_threshold
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid;
            """),
            {"tid": tenant_id},
        )
        w_row = w_res.fetchone()

        if w_row:
            balance = float(w_row[0])
            reserved = float(w_row[1])
            threshold = float(w_row[2])
        else:
            balance = 0.0
            reserved = 0.0
            threshold = 50000.0

        available = max(0.0, balance - reserved)

        # Hitung alokasi siklus berjalan dari credit_allocations
        alloc_res = await conn.execute(
            sa.text("""
                SELECT COALESCE(SUM(credit_amount), 0)
                FROM credit_allocations
                WHERE tenant_id = :tid
                  AND created_at >= date_trunc('month', now());
            """),
            {"tid": tenant_id},
        )
        alloc_row = alloc_res.fetchone()
        total_allocated = float(alloc_row[0]) if alloc_row else 0.0

        # Jika belum ada record alokasi siklus ini, periksa kuota paket langganan
        if total_allocated <= 0.0:
            plan_res = await conn.execute(
                sa.text("""
                    SELECT sp.ai_credit_allowance
                    FROM tenant_subscriptions ts
                    JOIN subscription_plans sp ON sp.id = ts.plan_id
                    WHERE ts.tenant_id = :tid AND ts.status IN ('active', 'trialing')
                    LIMIT 1;
                """),
                {"tid": tenant_id},
            )
            p_row = plan_res.fetchone()
            if p_row and p_row[0] is not None:
                total_allocated = float(p_row[0])
            else:
                total_allocated = balance

        # Hitung penggunaan siklus berjalan dari credit_reservations status consumed
        used_res = await conn.execute(
            sa.text("""
                SELECT COALESCE(SUM(actual_cost), 0)
                FROM credit_reservations
                WHERE tenant_id = :tid
                  AND status = 'consumed'
                  AND created_at >= date_trunc('month', now());
            """),
            {"tid": tenant_id},
        )
        used_row = used_res.fetchone()
        used_this_cycle = float(used_row[0]) if used_row else 0.0

    return {
        "available": available,
        "reserved": reserved,
        "used_this_cycle": used_this_cycle,
        "total_allocated_this_cycle": total_allocated,
        "is_unlimited": subscription.is_unlimited_override,
        "low_balance_warning": (available <= threshold and not subscription.is_unlimited_override),
    }
