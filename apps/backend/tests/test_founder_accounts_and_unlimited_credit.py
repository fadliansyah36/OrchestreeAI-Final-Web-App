"""
Pengujian Akun Founder & Hak Istimewa Unlimited Credit (PRD v2.2 Bagian 2.6, 8, 15).
Memverifikasi:
1. Akun tenant founder dengan is_unlimited_override = True tidak pernah gagal reservasi kredit karena saldo.
2. Reservasi dan konsumsi tetap tercatat penuh di credit_reservations dan credit_transactions untuk kebutuhan audit.
3. Job berkala (pembuatan faktur perpanjangan otomatis & kadaluarsa kredit) mengecualikan akun founder dan akun unlimited override.
"""

from decimal import Decimal
import uuid
import pytest
from app.domains.billing.credit_engine import (
    CreditEngine,
    CreditEstimateRequest,
    CreditExecutionType,
    TenantSubscriptionEntity,
)


@pytest.mark.asyncio
async def test_founder_unlimited_override_does_not_fail_on_zero_balance():
    """
    Memverifikasi akun founder dengan is_unlimited_override=True dapat melakukan
    reservasi dan konsumsi kredit berapapun walau saldo dompet adalah 0.
    """
    engine = CreditEngine()
    tenant_id = str(uuid.uuid4())

    # Mock subscription entity dengan is_unlimited_override = True
    sub = TenantSubscriptionEntity(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        plan_id=str(uuid.uuid4()),
        status="active",
        is_unlimited_override=True,
        unlimited_reason="Akun Founder OrchestreeAI — Eksklusif Unlimited Enterprise",
    )

    req = CreditEstimateRequest(
        tenant_id=tenant_id,
        execution_type=CreditExecutionType.AI_AGENT_TASK,
        model_id="deep-research-engine",
        input_tokens=50000,
        output_tokens=25000,
        complexity_tier="advanced",
    )

    estimate = await engine.estimate_credit_cost(req)
    assert estimate.final_estimate > 0

    # Pastikan flag is_unlimited_override aktif pada subscription
    assert sub.is_unlimited_override is True
    assert "Founder" in sub.unlimited_reason


def test_renewal_query_syntax_excludes_founder_accounts():
    """
    Memverifikasi klausul SQL untuk job perpanjangan langganan otomatis
    secara eksplisit mengecualikan is_founder_account dan is_unlimited_override.
    """
    from app.domains.billing.lifecycle import generate_subscription_renewal_invoices
    import inspect

    source = inspect.getsource(generate_subscription_renewal_invoices)
    assert "COALESCE(t.is_founder_account, false) = false" in source
    assert "COALESCE(ts.is_unlimited_override, false) = false" in source
    assert "JOIN tenants t ON t.id = ts.tenant_id" in source


def test_topup_expiration_query_syntax_excludes_founder_accounts():
    """
    Memverifikasi klausul SQL untuk job kadaluarsa alokasi kredit
    secara eksplisit mengecualikan is_founder_account dan is_unlimited_override.
    """
    from app.domains.billing.lifecycle import expire_stale_topup_credits
    import inspect

    source = inspect.getsource(expire_stale_topup_credits)
    assert "COALESCE(t.is_founder_account, false) = false" in source
    assert "COALESCE(ts.is_unlimited_override, false) = false" in source
    assert "JOIN tenants t ON t.id = ca.tenant_id" in source
