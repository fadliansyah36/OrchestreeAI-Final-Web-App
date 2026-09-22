"""MCP Tools untuk Domain Penjualan Berisiko Tinggi (PRD v2.2 Bagian 11.2 & Fase 4)

Mengimplementasikan 4 perkakas MCP risiko tinggi (risk_tier='high'):
1. sales_discount_apply -> sales.discount.apply
2. sales_refund_process -> sales.refund.process
3. sales_order_cancel   -> sales.order.cancel
4. sales_custom_contract -> sales.custom_contract.create

Seluruh perkakas ini terintegrasi langsung dengan SalesGuardrailService:
Bila dipanggil oleh AI Agent, permintaan yang melanggar batas (misal diskon > 10%, refund, cancel, kontrak khusus)
SELALU berhenti di status 'PENDING_APPROVAL' dan TIDAK PERNAH tereksekusi otomatis.
"""

from typing import Any, Dict
from tests.harness.mcp_contract_harness import (
    BaseMCPTool,
    MCPExecutionContext,
    MCPToolResult,
    register_mcp_tool,
)
from orchestree.domains.sales.guardrails import SalesGuardrailService


class SalesDiscountApplyTool(BaseMCPTool):
    """Perkakas MCP untuk mengajukan/menerapkan diskon penjualan dengan evaluasi guardrail."""
    name = "sales_discount_apply"
    description = "Menerapkan diskon harga khusus ke pesanan atau penawaran penjualan dengan batas guardrail aman."
    version = "1.0.0"
    category = "sales"
    required_capabilities = ["sales.discount.apply"]
    is_idempotent = True
    timeout_seconds = 10.0

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "discount_pct": {"type": "number"},
                "reason": {"type": "string"},
                "persona_type": {"type": "string"},
            },
            "required": ["order_id", "discount_pct"],
        }

    @property
    def output_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "executed": {"type": "boolean"},
                "status": {"type": "string"},
                "requires_human_approval": {"type": "boolean"},
                "approval_id": {"type": "string"},
                "reason": {"type": "string"},
                "message": {"type": "string"},
            },
            "required": ["executed", "status", "requires_human_approval"],
        }

    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        persona = params.get("persona_type", "sales_specialist")
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=context.tenant_id,
            action_type="DISCOUNT",
            actor_type="ai_agent",
            actor_id=context.user_id,
            persona_type=persona,
            target_resource_type="order",
            target_resource_id=params.get("order_id"),
            payload={
                "order_id": params.get("order_id"),
                "discount_pct": params.get("discount_pct"),
                "reason": params.get("reason", "Pengajuan diskon negosiasi pembeli"),
            },
            request_id=context.request_id,
        )

        return MCPToolResult(
            success=True,
            data=result,
            metadata={
                "tenant_id": context.tenant_id,
                "tool": self.name,
                "risk_tier": "high",
                "stopped_at_approval": result.get("requires_human_approval", False),
            },
        )


class SalesRefundProcessTool(BaseMCPTool):
    """Perkakas MCP untuk memproses pengembalian dana (refund) dengan wajib human approval."""
    name = "sales_refund_process"
    description = "Mengajukan proses pengembalian dana (refund) transaksi pelanggan dengan eskalasi wajib human approval."
    version = "1.0.0"
    category = "sales"
    required_capabilities = ["sales.refund.process"]
    is_idempotent = False
    timeout_seconds = 10.0

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "amount": {"type": "number"},
                "reason": {"type": "string"},
                "persona_type": {"type": "string"},
            },
            "required": ["order_id", "amount", "reason"],
        }

    @property
    def output_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "executed": {"type": "boolean"},
                "status": {"type": "string"},
                "requires_human_approval": {"type": "boolean"},
                "approval_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["executed", "status", "requires_human_approval"],
        }

    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        persona = params.get("persona_type", "sales_specialist")
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=context.tenant_id,
            action_type="REFUND",
            actor_type="ai_agent",
            actor_id=context.user_id,
            persona_type=persona,
            target_resource_type="order",
            target_resource_id=params.get("order_id"),
            payload={
                "order_id": params.get("order_id"),
                "amount": params.get("amount"),
                "reason": params.get("reason"),
            },
            request_id=context.request_id,
        )

        return MCPToolResult(
            success=True,
            data=result,
            metadata={"tenant_id": context.tenant_id, "tool": self.name, "risk_tier": "high"},
        )


class SalesOrderCancelTool(BaseMCPTool):
    """Perkakas MCP untuk pembatalan pesanan yang wajib diverifikasi staf manusia."""
    name = "sales_order_cancel"
    description = "Membatalkan pesanan pelanggan yang telah terkonfirmasi dengan evaluasi guardrail dan eskalasi persetujuan."
    version = "1.0.0"
    category = "sales"
    required_capabilities = ["sales.order.cancel"]
    is_idempotent = True
    timeout_seconds = 10.0

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "reason": {"type": "string"},
                "persona_type": {"type": "string"},
            },
            "required": ["order_id", "reason"],
        }

    @property
    def output_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "executed": {"type": "boolean"},
                "status": {"type": "string"},
                "requires_human_approval": {"type": "boolean"},
                "approval_id": {"type": "string"},
            },
            "required": ["executed", "status", "requires_human_approval"],
        }

    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        persona = params.get("persona_type", "sales_specialist")
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=context.tenant_id,
            action_type="CANCEL_ORDER",
            actor_type="ai_agent",
            actor_id=context.user_id,
            persona_type=persona,
            target_resource_type="order",
            target_resource_id=params.get("order_id"),
            payload={"order_id": params.get("order_id"), "reason": params.get("reason")},
            request_id=context.request_id,
        )

        return MCPToolResult(
            success=True,
            data=result,
            metadata={"tenant_id": context.tenant_id, "tool": self.name, "risk_tier": "high"},
        )


class SalesCustomContractTool(BaseMCPTool):
    """Perkakas MCP untuk pembuatan kontrak khusus non-standar yang wajib disetujui staf manusia."""
    name = "sales_custom_contract"
    description = "Mengajukan pembuatan kontrak B2B khusus atau klausul komersial khusus dengan persetujuan manusia."
    version = "1.0.0"
    category = "sales"
    required_capabilities = ["sales.custom_contract.create"]
    is_idempotent = False
    timeout_seconds = 10.0

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
                "terms": {"type": "string"},
                "estimated_value": {"type": "number"},
                "persona_type": {"type": "string"},
            },
            "required": ["customer_id", "terms"],
        }

    @property
    def output_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "executed": {"type": "boolean"},
                "status": {"type": "string"},
                "requires_human_approval": {"type": "boolean"},
                "approval_id": {"type": "string"},
            },
            "required": ["executed", "status", "requires_human_approval"],
        }

    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        persona = params.get("persona_type", "sales_specialist")
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=context.tenant_id,
            action_type="CUSTOM_CONTRACT",
            actor_type="ai_agent",
            actor_id=context.user_id,
            persona_type=persona,
            target_resource_type="customer",
            target_resource_id=params.get("customer_id"),
            payload={
                "customer_id": params.get("customer_id"),
                "terms": params.get("terms"),
                "estimated_value": params.get("estimated_value", 0.0),
            },
            request_id=context.request_id,
        )

        return MCPToolResult(
            success=True,
            data=result,
            metadata={"tenant_id": context.tenant_id, "tool": self.name, "risk_tier": "high"},
        )


# Mendaftarkan seluruh 4 tool MCP ke registri global
register_mcp_tool(SalesDiscountApplyTool())
register_mcp_tool(SalesRefundProcessTool())
register_mcp_tool(SalesOrderCancelTool())
register_mcp_tool(SalesCustomContractTool())
