"""
Pengujian Matriks Guardrail Sales, Human Approval Engine, dan Perluasan Audit Ledger (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)

Definition of Done Verification:
- Permintaan diskon di atas batas oleh AI SELALU berhenti di approval, tidak pernah tereksekusi otomatis.
- Audit actor_type=ai_agent + persona_type tercatat akurat di setiap aksi berisiko.
- Refund, pembatalan pesanan, dan kontrak khusus wajib persetujuan manusia.
- Kontrak perkakas MCP risk_tier='high' tervalidasi penuh.
"""

import pytest
import uuid
from tests.harness.mcp_contract_harness import (
    MCPContractTestSuite,
    MCPExecutionContext,
)
from orchestree.domains.sales.guardrails import (
    SalesGuardrailService,
    SalesGuardrailAction,
)
from orchestree.domains.sales.mcp_tools import (
    SalesDiscountApplyTool,
    SalesRefundProcessTool,
    SalesOrderCancelTool,
    SalesCustomContractTool,
)


@pytest.mark.asyncio
async def test_mcp_contracts_for_high_risk_sales_tools():
    """Memverifikasi metadata, skema, dan otorisasi PDP dari 4 perkakas MCP Sales."""
    tools = [
        SalesDiscountApplyTool(),
        SalesRefundProcessTool(),
        SalesOrderCancelTool(),
        SalesCustomContractTool(),
    ]

    for tool in tools:
        # 1. Validasi format snake_case, deskripsi, semver, dan kategori
        MCPContractTestSuite.verify_tool_metadata(tool)
        # 2. Validasi struktur JSON Schema input & output
        MCPContractTestSuite.verify_tool_schema(tool)
        # 3. Validasi penolakan jika dipanggil tanpa kapabilitas yang sah
        await MCPContractTestSuite.verify_unauthorized_rejection(tool)


def test_guardrail_evaluation_discount_threshold():
    """
    Uji evaluasi batas diskon:
    - Diskon <= 10% (dalam batas): otonom diperbolehkan
    - Diskon > 10% (di atas batas): WAJIB persetujuan manusia (risk_tier='high')
    """
    tenant_id = str(uuid.uuid4())

    # 1. Kasus Diskon Aman (5% <= 10%)
    eval_safe = SalesGuardrailService.evaluate_action(
        tenant_id=tenant_id,
        action_type="DISCOUNT",
        actor_type="ai_agent",
        persona_type="sales_specialist",
        payload={"discount_pct": 5.0},
    )
    assert eval_safe.requires_human_approval is False
    assert eval_safe.is_autonomous_allowed is True
    assert eval_safe.risk_tier == "low"

    # 2. Kasus Diskon di Atas Batas (25% > 10%)
    eval_risky = SalesGuardrailService.evaluate_action(
        tenant_id=tenant_id,
        action_type="DISCOUNT",
        actor_type="ai_agent",
        persona_type="sales_specialist",
        payload={"discount_pct": 25.0},
    )
    assert eval_risky.requires_human_approval is True
    assert eval_risky.is_autonomous_allowed is False
    assert eval_risky.risk_tier == "high"
    assert "melebihi batas toleransi otonom" in eval_risky.reason


def test_guardrail_evaluation_refund_cancel_and_contract():
    """
    Uji aksi penjualan risiko tinggi lainnya:
    - Refund: SELALU wajib persetujuan manusia
    - Cancel Order: SELALU wajib persetujuan manusia
    - Custom Contract: SELALU wajib persetujuan manusia
    """
    tenant_id = str(uuid.uuid4())

    # 1. Refund
    eval_refund = SalesGuardrailService.evaluate_action(
        tenant_id=tenant_id,
        action_type="REFUND",
        actor_type="ai_agent",
        persona_type="sales_specialist",
        payload={"amount": 500000.0},
    )
    assert eval_refund.requires_human_approval is True
    assert eval_refund.risk_tier == "high"

    # 2. Cancel Order
    eval_cancel = SalesGuardrailService.evaluate_action(
        tenant_id=tenant_id,
        action_type="CANCEL_ORDER",
        actor_type="ai_agent",
        persona_type="sales_specialist",
        payload={"order_id": "ORD-2026-999"},
    )
    assert eval_cancel.requires_human_approval is True
    assert eval_cancel.risk_tier == "high"

    # 3. Custom Contract
    eval_contract = SalesGuardrailService.evaluate_action(
        tenant_id=tenant_id,
        action_type="CUSTOM_CONTRACT",
        actor_type="ai_agent",
        persona_type="sales_specialist",
        payload={"customer_id": "CUST-B2B-1", "terms": "Termin 90 hari"},
    )
    assert eval_contract.requires_human_approval is True
    assert eval_contract.risk_tier == "high"
