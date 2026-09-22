"""
OrchestreeAI Orchestration & Cognitive Core Endpoints (PRD v2.2 Bagian 8 & 11)
Endpoints:
- POST /api/v1/orchestration/workflows/dispatch
- GET /api/v1/admin/llm-providers
- GET /api/v1/admin/mcp-tools
"""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel, Field

from app.core.orchestration.engine import get_orchestration_engine, WorkflowDispatchRequest, WorkflowDispatchResult
from app.core.model_router.router import get_model_router
from app.skills.f01_mcp.decorators import get_tool_registry
from app.authz.pdp import authorize, SubjectContext, ResourceContext

router = APIRouter(prefix="/api/v1", tags=["Cognitive Core & Orchestration"])


class WorkflowDispatchIn(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant pemilik alur kerja")
    intent_text: str = Field(..., description="Teks intent / instruksi kerja bisnis")
    workflow_definition_id: Optional[str] = Field(None, description="Opsional ID definisi alur kerja spesifik")
    actor_id: Optional[str] = Field(None, description="ID aktor pemicu")
    actor_type: str = Field("ai_agent", description="ai_agent, user, atau system")
    context_data: Optional[Dict[str, Any]] = Field(default_factory=dict)


@router.post("/orchestration/workflows/dispatch", response_model=WorkflowDispatchResult)
async def dispatch_workflow(
    payload: WorkflowDispatchIn,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("STAFF_AI", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("workflow.dispatch,workflow.node.execute,mcp.tool.invoke", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Memicu eksekusi alur kerja kognitif otonom dari intent.
    Titik Evaluasi PDP ke-1: Endpoint REST.
    """
    tenant_id = payload.tenant_id or x_tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "STAFF_AI").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    # --- TITIK EVALUASI PDP KE-1: REST API Dispatch ---
    subject = SubjectContext(
        user_id=payload.actor_id or x_user_id,
        tenant_id=tenant_id,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        actor_type=payload.actor_type,
    )

    resource = ResourceContext(
        resource_type="workflow_execution",
        owner_tenant_id=tenant_id,
        attributes={"intent_length": len(payload.intent_text)},
    )

    decision = authorize(
        subject=subject,
        action="workflow.dispatch",
        resource=resource,
        context={"intent": payload.intent_text},
        log_audit=True,
    )

    if not decision.is_authorized:
        raise HTTPException(
            status_code=403,
            detail=f"Otorisasi ditolak oleh PDP untuk memicu alur kerja: {decision.reason}",
        )

    engine = get_orchestration_engine()
    dispatch_req = WorkflowDispatchRequest(
        tenant_id=tenant_id,
        intent_text=payload.intent_text,
        workflow_definition_id=payload.workflow_definition_id,
        actor_id=payload.actor_id or x_user_id,
        actor_type=payload.actor_type,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        context_data=payload.context_data or {},
    )

    result = await engine.dispatch(dispatch_req)
    return result


@router.get("/admin/llm-providers")
async def get_admin_llm_providers(
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_mfa_verified: Optional[str] = Header("true", alias="X-MFA-Verified"),
):
    """
    Monitoring kesehatan dan status real-time 4 adapter provider LLM:
    NVIDIA NIM, OpenRouter, GPT-Image-2, Gemini.
    """
    model_router = get_model_router()
    providers_health = await model_router.get_all_providers_health()
    return {
        "status": "success",
        "providers": providers_health,
        "total_active": len([p for p in providers_health if p["health_status"] == "healthy"]),
    }


@router.get("/admin/mcp-tools")
async def get_admin_mcp_tools():
    """
    Katalog dan tata kelola perkakas F.01-MCP terdaftar.
    """
    tool_registry = get_tool_registry()
    tools = tool_registry.list_tools()

    results = []
    for t in tools:
        input_schema = {}
        output_schema = {}
        if t.input_model:
            try:
                input_schema = t.input_model.model_json_schema()
            except Exception:
                pass
        if t.output_model:
            try:
                output_schema = t.output_model.model_json_schema()
            except Exception:
                pass

        results.append({
            "name": t.name,
            "description": t.description,
            "risk_tier": t.risk_tier,
            "category": t.category,
            "is_idempotent": t.is_idempotent,
            "timeout_seconds": t.timeout_seconds,
            "input_schema": input_schema,
            "output_schema": output_schema,
            "is_active": True,
        })

    return {
        "status": "success",
        "total": len(results),
        "tools": results,
    }
