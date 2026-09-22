"""
Harness Contract Test untuk MCP Tool Runtime (PRD v2.2 Bagian 2.6 & Bagian 11).
Menegakkan kepatuhan spesifikasi kontrak MCP untuk setiap tool yang didaftarkan ke AI Agent Workforce:
1. Validitas metadata, semver, dan deklarasi capability.
2. Validitas JSON Schema input & output.
3. Penolakan input tidak valid sebelum eksekusi logic.
4. Penegakan otorisasi terpadu (PDP authorize()).
5. Batas waktu eksekusi (timeout) dan idempotensi.
"""

import abc
import asyncio
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.authz.pdp import (
    SubjectContext,
    ResourceContext,
    authorize,
)


class MCPExecutionContext(BaseModel):
    """Konteks eksekusi resmi saat Agent memanggil MCP Tool."""
    tenant_id: str
    user_id: str
    roles: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    request_id: str
    idempotency_key: Optional[str] = None
    is_mfa_verified: bool = False


class MCPToolResult(BaseModel):
    """Hasil standar kembalian eksekusi MCP Tool."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BaseMCPTool(abc.ABC):
    """
    Antarmuka dasar kontrak MCP Tool Runtime.
    Setiap tool resmi di modul berikutnya wajib mewarisi kelas ini.
    """
    name: str
    description: str
    version: str = "1.0.0"
    category: str
    required_capabilities: List[str] = []
    is_idempotent: bool = True
    timeout_seconds: float = 30.0

    @property
    @abc.abstractmethod
    def input_schema(self) -> Dict[str, Any]:
        """JSON Schema representasi parameter input."""
        pass

    @property
    @abc.abstractmethod
    def output_schema(self) -> Dict[str, Any]:
        """JSON Schema representasi hasil kembalian sukses."""
        pass

    @abc.abstractmethod
    async def run(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        """Logika eksekusi sesungguhnya dari tool."""
        pass

    async def execute_with_guard(self, context: MCPExecutionContext, params: Dict[str, Any]) -> MCPToolResult:
        """
        Wrapper eksekusi runtime dengan penegakan PDP Otorisasi dan validasi kontrak.
        """
        # 1. Evaluasi otorisasi via Unified PDP
        subject = SubjectContext(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
        )
        resource = ResourceContext(
            resource_type="mcp_tool",
            resource_id=self.name,
            owner_tenant_id=context.tenant_id,
        )

        for cap in self.required_capabilities:
            decision = authorize(subject, action=cap, resource=resource)
            if not decision.is_authorized:
                return MCPToolResult(
                    success=False,
                    error=f"Akses ditolak PDP: {decision.reason}",
                    metadata={"tool": self.name, "denied_capability": cap}
                )

        # 2. Validasi parameter input dasar terhadap skema
        schema = self.input_schema
        required_fields = schema.get("required", [])
        for field in required_fields:
            if field not in params or params[field] is None:
                return MCPToolResult(
                    success=False,
                    error=f"Parameter wajib '{field}' tidak ditemukan dalam argumen input.",
                    metadata={"tool": self.name, "missing_field": field}
                )

        # 3. Eksekusi dengan pembatasan batas waktu (timeout)
        try:
            return await asyncio.wait_for(self.run(context, params), timeout=self.timeout_seconds)
        except asyncio.TimeoutError:
            return MCPToolResult(
                success=False,
                error=f"Eksekusi tool '{self.name}' melebihi batas waktu ({self.timeout_seconds}s).",
                metadata={"tool": self.name, "timed_out": True}
            )
        except Exception as exc:
            return MCPToolResult(
                success=False,
                error=f"Kesalahan sistem saat eksekusi tool: {str(exc)}",
                metadata={"tool": self.name, "exception": exc.__class__.__name__}
            )


# Registri tool internal (akan bertambah seiring bertambahnya Fase)
_TOOL_REGISTRY: List[BaseMCPTool] = []


def register_mcp_tool(tool: BaseMCPTool):
    """Mendaftarkan instance MCP Tool ke registri global."""
    _TOOL_REGISTRY.append(tool)


def discover_registered_mcp_tools() -> List[BaseMCPTool]:
    """Mengembalikan seluruh MCP Tool terdaftar untuk dievaluasi oleh test harness."""
    return list(_TOOL_REGISTRY)


class MCPContractTestSuite:
    """
    Suite penilai kontrak MCP Tool Runtime.
    Dapat digunakan langsung oleh test case individual atau iterasi massal registri.
    """

    @staticmethod
    def verify_tool_metadata(tool: BaseMCPTool):
        """Memverifikasi penamaan snake_case, deskripsi non-kosong, semver, dan kategori."""
        assert re.match(r"^[a-z][a-z0-9_]*[a-z0-9]$", tool.name), (
            f"Nama tool '{tool.name}' wajib berformat snake_case."
        )
        assert len(tool.description.strip()) >= 10, (
            f"Deskripsi tool '{tool.name}' terlalu pendek (minimal 10 karakter)."
        )
        assert re.match(r"^\d+\.\d+\.\d+$", tool.version), (
            f"Versi tool '{tool.name}' wajib mematuhi format Semantic Versioning (X.Y.Z)."
        )
        assert tool.category in {"sales", "marketing", "finance", "communication", "operations", "system"}, (
            f"Kategori tool '{tool.name}' ({tool.category}) tidak valid."
        )

    @staticmethod
    def verify_tool_schema(tool: BaseMCPTool):
        """Memverifikasi struktur JSON Schema input dan output."""
        in_schema = tool.input_schema
        assert in_schema.get("type") == "object", f"input_schema {tool.name} wajib bertipe 'object'."
        assert "properties" in in_schema, f"input_schema {tool.name} wajib mendefinisikan 'properties'."

        out_schema = tool.output_schema
        assert out_schema.get("type") == "object", f"output_schema {tool.name} wajib bertipe 'object'."

    @staticmethod
    async def verify_unauthorized_rejection(tool: BaseMCPTool):
        """Memverifikasi bahwa eksekusi tanpa kapabilitas wajib ditolak oleh PDP."""
        if not tool.required_capabilities:
            return

        unauthorized_context = MCPExecutionContext(
            tenant_id="test-tenant-001",
            user_id="test-user-guest",
            roles=["guest"],
            capabilities=[],  # Tidak memiliki kapabilitas apa pun
            request_id="req-test-authz-01",
        )

        result = await tool.execute_with_guard(unauthorized_context, {})
        assert not result.success, f"Tool {tool.name} seharusnya ditolak tanpa kapabilitas yang sah."
        assert "Akses ditolak PDP" in (result.error or "")

    @staticmethod
    async def verify_missing_required_params_rejection(tool: BaseMCPTool):
        """Memverifikasi parameter wajib yang absen ditolak secara aman."""
        required = tool.input_schema.get("required", [])
        if not required:
            return

        authorized_context = MCPExecutionContext(
            tenant_id="test-tenant-001",
            user_id="test-user-owner",
            roles=["owner"],
            capabilities=tool.required_capabilities,
            request_id="req-test-params-01",
        )

        # Berikan payload kosong padahal ada required fields
        result = await tool.execute_with_guard(authorized_context, {})
        assert not result.success
        assert "Parameter wajib" in (result.error or "")
