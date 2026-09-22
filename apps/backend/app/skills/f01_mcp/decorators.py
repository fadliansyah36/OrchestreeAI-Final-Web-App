"""
OrchestreeAI F.01-MCP Decorator & Registry Engine (PRD v2.2 Bagian 11.2)
Menyediakan dekorator registrasi perkakas asinkron, validasi skema Pydantic,
enforcement PDP authorize() pada setiap pemanggilan perkakas, dan pencatatan audit ke tool_invocations.
"""

import functools
import inspect
import time
import json
import logging
from typing import Callable, Dict, Any, Optional, Type
from pydantic import BaseModel
import sqlalchemy as sa

from app.core.database import get_engine
from app.authz.pdp import authorize, SubjectContext, ResourceContext

logger = logging.getLogger("orchestree.mcp_registry")


class ToolExecutionContext(BaseModel):
    """Konteks eksekusi yang wajib disertakan pada pemanggilan tool."""
    tenant_id: str
    actor_id: Optional[str] = None
    actor_type: str = "ai_agent"
    roles: list[str] = ["STAFF_AI"]
    capabilities: list[str] = ["mcp.tool.invoke"]
    is_mfa_verified: bool = False
    workflow_execution_id: Optional[str] = None


class MCPToolMetadata(BaseModel):
    name: str
    description: str
    risk_tier: str  # low, medium, high, critical
    category: str
    is_idempotent: bool
    timeout_seconds: float
    input_model: Optional[Type[BaseModel]] = None
    output_model: Optional[Type[BaseModel]] = None
    handler: Optional[Callable] = None


class ToolRegistry:
    """Registry perkakas MCP global."""

    def __init__(self):
        self._tools: Dict[str, MCPToolMetadata] = {}

    def register(self, metadata: MCPToolMetadata):
        self._tools[metadata.name] = metadata
        logger.info(f"Registered MCP tool: {metadata.name} (risk: {metadata.risk_tier})")

    def get_tool(self, name: str) -> Optional[MCPToolMetadata]:
        return self._tools.get(name)

    def list_tools(self) -> list[MCPToolMetadata]:
        return list(self._tools.values())

    async def invoke_tool(
        self,
        name: str,
        context: ToolExecutionContext,
        input_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Eksekusi tool dengan:
        1. PDP authorize() check (Evaluasi Titik 3 - PRD v2.2 Bagian 3.5)
        2. Validasi input Pydantic
        3. Eksekusi async handler
        4. Validasi output Pydantic
        5. Pencatatan durasi dan status ke tabel database tool_invocations
        """
        tool = self.get_tool(name)
        if not tool or not tool.handler:
            raise ValueError(f"MCP Tool '{name}' tidak terdaftar pada registry.")

        # --- TITIK EVALUASI PDP KE-3: Awal Setiap Pemanggilan MCP Tool ---
        subject = SubjectContext(
            user_id=context.actor_id,
            tenant_id=context.tenant_id,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
            actor_type=context.actor_type,
        )

        resource = ResourceContext(
            resource_type="mcp_tool",
            resource_id=tool.name,
            owner_tenant_id=context.tenant_id,
            attributes={"risk_tier": tool.risk_tier, "tool_name": tool.name},
        )

        decision = authorize(
            subject=subject,
            action="mcp.tool.invoke",
            resource=resource,
            context={"input": input_data},
            log_audit=True,
        )

        if not decision.is_authorized:
            await self._record_invocation(
                context=context,
                tool_name=name,
                input_data=input_data,
                output_data={},
                status="denied",
                error_message=f"Akses ditolak PDP: {decision.reason}",
                duration_ms=0,
            )
            raise PermissionError(f"Akses ditolak PDP untuk tool '{name}': {decision.reason}")

        # Validasi input schema jika model tersedia
        validated_input = input_data
        if tool.input_model:
            try:
                parsed = tool.input_model.model_validate(input_data)
                validated_input = parsed.model_dump()
            except Exception as e:
                raise ValueError(f"Validasi input schema gagal untuk tool '{name}': {e}")

        start_time = time.perf_counter()
        try:
            # Eksekusi handler
            if inspect.iscoroutinefunction(tool.handler):
                result = await tool.handler(context, validated_input)
            else:
                result = tool.handler(context, validated_input)

            # Validasi output schema jika model tersedia
            if tool.output_model and isinstance(result, dict):
                result = tool.output_model.model_validate(result).model_dump()

            duration_ms = int((time.perf_counter() - start_time) * 1000)

            await self._record_invocation(
                context=context,
                tool_name=name,
                input_data=input_data,
                output_data=result if isinstance(result, dict) else {"result": result},
                status="success",
                error_message=None,
                duration_ms=duration_ms,
            )

            return result if isinstance(result, dict) else {"result": result}
        except Exception as e:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            await self._record_invocation(
                context=context,
                tool_name=name,
                input_data=input_data,
                output_data={},
                status="failed",
                error_message=str(e),
                duration_ms=duration_ms,
            )
            raise e

    async def _record_invocation(
        self,
        context: ToolExecutionContext,
        tool_name: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        status: str,
        error_message: Optional[str],
        duration_ms: int,
    ):
        """Catat log pemanggilan ke tabel tool_invocations dengan isolasi RLS."""
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                if context.tenant_id:
                    await conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                        {"val": context.tenant_id},
                    )

                actor_id_val = None
                if context.actor_id:
                    try:
                        import uuid
                        actor_id_val = str(uuid.UUID(context.actor_id))
                    except Exception:
                        actor_id_val = None

                wf_id_val = None
                if context.workflow_execution_id:
                    try:
                        import uuid
                        wf_id_val = str(uuid.UUID(context.workflow_execution_id))
                    except Exception:
                        wf_id_val = None

                await conn.execute(
                    sa.text("""
                        INSERT INTO tool_invocations (
                            tenant_id,
                            workflow_execution_id,
                            tool_name,
                            input_payload,
                            output_payload,
                            status,
                            duration_ms,
                            invoked_by
                        ) VALUES (
                            :tenant_id,
                            :workflow_execution_id,
                            :tool_name,
                            :input_payload,
                            :output_payload,
                            :status,
                            :duration_ms,
                            :invoked_by
                        );
                    """),
                    {
                        "tenant_id": context.tenant_id,
                        "workflow_execution_id": wf_id_val,
                        "tool_name": tool_name,
                        "input_payload": json.dumps(input_data),
                        "output_payload": json.dumps(output_data),
                        "status": status,
                        "duration_ms": duration_ms,
                        "invoked_by": actor_id_val,
                    },
                )
        except Exception as e:
            logger.warning(f"Gagal mencatat audit log tool_invocations: {e}")


_global_registry = ToolRegistry()


def get_tool_registry() -> ToolRegistry:
    return _global_registry


def mcp_tool(
    name: str,
    description: str,
    risk_tier: str = "low",
    category: str = "general",
    is_idempotent: bool = True,
    timeout_seconds: float = 30.0,
    input_model: Optional[Type[BaseModel]] = None,
    output_model: Optional[Type[BaseModel]] = None,
):
    """
    Dekorator untuk mendaftarkan fungsi async sebagai perkakas MCP OrchestreeAI.
    """
    def decorator(func: Callable):
        metadata = MCPToolMetadata(
            name=name,
            description=description,
            risk_tier=risk_tier,
            category=category,
            is_idempotent=is_idempotent,
            timeout_seconds=timeout_seconds,
            input_model=input_model,
            output_model=output_model,
            handler=func,
        )
        _global_registry.register(metadata)

        @functools.wraps(func)
        async def wrapper(context: ToolExecutionContext, input_data: Dict[str, Any]):
            return await _global_registry.invoke_tool(name, context, input_data)

        wrapper.metadata = metadata  # type: ignore
        return wrapper

    return decorator
