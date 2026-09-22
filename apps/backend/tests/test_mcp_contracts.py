"""
Pengujian Kontrak MCP Tool Runtime (PRD v2.2 Bagian 2.6 & Bagian 11).
Memastikan seluruh MCP Tool mematuhi spesifikasi kontrak tanpa regresi.
"""

from typing import Any, Dict
import pytest
from tests.harness.mcp_contract_harness import (
    BaseMCPTool,
    MCPContractTestSuite,
    MCPExecutionContext,
    MCPToolResult,
    discover_registered_mcp_tools,
)


class ExampleReferenceMCPTool(BaseMCPTool):
    """Tool referensi pengujian integritas harness kontrak."""
    name = "crm_verify_customer_contact"
    description = "Memverifikasi validitas format nomor kontak atau email pelanggan di CRM."
    version = "1.0.0"
    category = "sales"
    required_capabilities = ["crm:read", "crm:contact_verify"]
    is_idempotent = True
    timeout_seconds = 5.0

    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "contact_value": {"type": "string"},
                "channel_type": {"type": "string", "enum": ["whatsapp", "telegram", "email"]},
            },
            "required": ["contact_value", "channel_type"],
        }

    @property
    def output_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "is_valid": {"type": "boolean"},
                "formatted_target": {"type": "string"},
            },
            "required": ["is_valid"],
        }

    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        contact = params.get("contact_value", "")
        is_valid = len(contact) > 5
        return MCPToolResult(
            success=True,
            data={"is_valid": is_valid, "formatted_target": contact.strip()},
            metadata={"tenant_id": context.tenant_id},
        )


@pytest.mark.asyncio
async def test_mcp_harness_with_reference_tool():
    """
    Memastikan MCP Contract Test Harness berfungsi akurat terhadap implementasi kontrak.
    """
    tool = ExampleReferenceMCPTool()

    # 1. Validasi metadata
    MCPContractTestSuite.verify_tool_metadata(tool)

    # 2. Validasi struktur skema
    MCPContractTestSuite.verify_tool_schema(tool)

    # 3. Validasi penolakan akses tanpa kapabilitas PDP
    await MCPContractTestSuite.verify_unauthorized_rejection(tool)

    # 4. Validasi penolakan argumen yang tidak lengkap
    await MCPContractTestSuite.verify_missing_required_params_rejection(tool)

    # 5. Eksekusi sukses saat diotorisasi penuh
    authorized_context = MCPExecutionContext(
        tenant_id="tenant-alpha-001",
        user_id="user-lead-sales",
        roles=["staff"],
        capabilities=["crm:read", "crm:contact_verify"],
        request_id="req-sales-exec-01",
    )
    result = await tool.execute_with_guard(
        authorized_context,
        {"contact_value": "08123456789", "channel_type": "whatsapp"}
    )
    assert result.success is True
    assert result.data["is_valid"] is True


def test_discover_registered_tools_suite():
    """
    Menemukan seluruh tool MCP di modul produksi dan memverifikasi kontraknya.
    Pada fase awal ini, mengonfirmasi kesiapan penampung registri sebelum Fase 4.
    """
    tools = discover_registered_mcp_tools()
    if not tools:
        # Menunggu registrasi tool MCP di modul berikutnya (Fase 4 dan seterusnya)
        pytest.skip("Belum ada tool MCP produksi terdaftar di registri (dijadwalkan mulai Fase 4).")

    for tool in tools:
        MCPContractTestSuite.verify_tool_metadata(tool)
        MCPContractTestSuite.verify_tool_schema(tool)
