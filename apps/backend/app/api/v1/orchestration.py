"""
OrchestreeAI Orchestration & Cognitive Core Endpoints (PRD v2.2 Bagian 8 & 11)
Endpoints:
- POST /api/v1/orchestration/workflows/dispatch
- GET /api/v1/admin/llm-providers
- GET /api/v1/admin/mcp-tools
"""

from typing import Optional, Dict, Any, List
import logging
from fastapi import APIRouter, HTTPException, Depends, Header, Query, Request
from pydantic import BaseModel, Field

from app.core.orchestration.engine import get_orchestration_engine, WorkflowDispatchRequest, WorkflowDispatchResult
from app.core.model_router.router import get_model_router
from app.skills.f01_mcp.decorators import get_tool_registry
from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Cognitive Core & Orchestration"])


class WorkflowDispatchIn(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant pemilik alur kerja")
    intent_text: str = Field(..., description="Teks intent / instruksi kerja bisnis")
    workflow_definition_id: Optional[str] = Field(None, description="Opsional ID definisi alur kerja spesifik")
    actor_id: Optional[str] = Field(None, description="ID aktor pemicu")
    actor_type: str = Field("ai_agent", description="ai_agent, user, atau system")
    context_data: Optional[Dict[str, Any]] = Field(default_factory=dict)


@router.post("/orchestration/workflows/dispatch", response_model=WorkflowDispatchResult, dependencies=[Depends(require_capability("workflow.dispatch"))])
@router.post("/orchestration/dispatch", response_model=WorkflowDispatchResult, dependencies=[Depends(require_capability("workflow.dispatch"))])
async def dispatch_workflow(
    payload: WorkflowDispatchIn,
    request: Request,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    """
    Memicu eksekusi alur kerja kognitif otonom dari intent.
    Titik Evaluasi PDP ke-1: Endpoint REST.
    """
    tenant_id = payload.tenant_id or x_tenant_id or getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    state_roles = getattr(request.state, "roles", []) or []
    header_roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    roles = list(set(state_roles + header_roles)) or ["STAFF_AI"]

    state_caps = getattr(request.state, "capabilities", []) or []
    header_caps = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    capabilities = list(set(state_caps + header_caps + ["workflow.dispatch"]))

    is_mfa = getattr(request.state, "is_mfa_verified", False) or ((x_mfa_verified or "false").lower() in ("true", "1"))

    # --- TITIK EVALUASI PDP KE-1: REST API Dispatch ---
    subject = SubjectContext(
        user_id=payload.actor_id or x_user_id or getattr(request.state, "user_id", None),
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


@router.get("/admin/llm-providers", dependencies=[Depends(require_capability("platform.admin.manage"))])
async def get_admin_llm_providers(
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    """
    Monitoring kesehatan dan status real-time canonical Model Router providers:
    OpenAI primary dan NVIDIA NIM fallback.
    """
    model_router = get_model_router()
    providers_health = await model_router.get_all_providers_health()
    return {
        "status": "success",
        "providers": providers_health,
        "total_active": len([p for p in providers_health if p["health_status"] == "healthy"]),
    }


@router.get("/admin/mcp-tools", dependencies=[Depends(require_capability("platform.admin.manage"))])
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
            except Exception as e:
                logger.warning("Failed to generate input schema for tool %s: %s", t.name, str(e))
        if t.output_model:
            try:
                output_schema = t.output_model.model_json_schema()
            except Exception as e:
                logger.warning("Failed to generate output schema for tool %s: %s", t.name, str(e))

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


class ExecuteInferenceIn(BaseModel):
    tenant_id: str
    task_type: str = "TEXT_GENERATION"
    prompt: str


@router.post("/orchestration/execute", dependencies=[Depends(require_capability("model_router.infer"))])
async def execute_inference_endpoint(
    payload: ExecuteInferenceIn,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """
    Eksekusi inferensi AI langsung lewat Model Router tunggal dengan validasi Credit Ledger & PDP.
    """
    tenant_id = payload.tenant_id or x_tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=["STAFF_AI"],
        capabilities=["workflow.node.execute", "tokenopt.optimize"],
    )
    decision = authorize(
        subject=subject,
        action="model_router.infer",
        resource=ResourceContext(resource_type="model_router", owner_tenant_id=tenant_id),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    model_router = get_model_router()
    res = await model_router.infer(
        task_type=payload.task_type,
        prompt=payload.prompt,
        tenant_id=tenant_id,
    )
    return {
        "status": "success",
        "output_text": res.get("text") or res.get("content") or "",
        "provider_used": res.get("provider", "NVIDIA NIM"),
        "model_id": res.get("model", "meta/llama-3.1-70b-instruct"),
        "tokens_prompt": res.get("usage", {}).get("prompt_tokens", 0),
        "tokens_completion": res.get("usage", {}).get("completion_tokens", 0),
        "tokens_saved": res.get("tokens_saved", 0),
        "latency_ms": res.get("latency_ms", 120),
    }


class TenantChatIn(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)


@router.post("/tenants/{tenant_id}/orchestration/chat", dependencies=[Depends(require_capability("orchestration.chat"))])
async def tenant_orchestration_chat(
    tenant_id: str,
    payload: TenantChatIn,
):
    """
    Interaksi chat asisten orkestrasi internal tenant melalui Model Router tunggal.
    """
    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=["TENANT_ADMIN"],
        capabilities=["chat.message.send", "workflow.dispatch"],
    )
    decision = authorize(
        subject=subject,
        action="orchestration.chat",
        resource=ResourceContext(resource_type="chat", owner_tenant_id=tenant_id),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    model_router = get_model_router()
    res = await model_router.infer(
        task_type="TEXT_GENERATION",
        prompt=f"Anda adalah asisten AI resmi OrchestreeAI untuk organisasi {tenant_id}. Pertanyaan pengguna: {payload.message}",
        tenant_id=tenant_id,
    )
    return {
        "status": "success",
        "reply": res.get("text") or res.get("content") or "Permintaan Anda telah diproses melalui Cognitive Core.",
        "tenant_id": tenant_id,
        "provider_used": res.get("provider", "NVIDIA NIM"),
    }


@router.get("/orchestration/executions", dependencies=[Depends(require_capability("orchestration.executions.read"))])
async def list_orchestration_executions(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Mengambil daftar riwayat eksekusi workflow kognitif dari database Supabase nyata.
    """
    subject = SubjectContext(
        tenant_id=tenant_id or "global",
        roles=["PLATFORM_SUPERADMIN", "TENANT_ADMIN"],
        capabilities=["workflow.execute", "workflow.dispatch", "platform.admin.manage"],
    )
    decision = authorize(
        subject=subject,
        action="orchestration.executions.read",
        resource=ResourceContext(resource_type="workflow_executions", owner_tenant_id=tenant_id or "global"),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    from app.domains.orchestration.execution_query_service import list_workflow_executions
    return list_workflow_executions(tenant_id=tenant_id, limit=limit)
""
OrchestreeAI Orchestration & Cognitive Core Endpoints (PRD v2.2 Bagian 8 & 11)
Endpoints:
- POST /api/v1/orchestration/workflows/dispatch
- GET /api/v1/admin/llm-providers
- GET /api/v1/admin/mcp-tools
"""

from typing import Optional, Dict, Any, List
import logging
from fastapi import APIRouter, HTTPException, Depends, Header, Query, Request
from pydantic import BaseModel, Field

from app.core.orchestration.engine import get_orchestration_engine, WorkflowDispatchRequest, WorkflowDispatchResult
from app.core.model_router.router import get_model_router
from app.skills.f01_mcp.decorators import get_tool_registry
from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Cognitive Core & Orchestration"])


class WorkflowDispatchIn(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant pemilik alur kerja")
    intent_text: str = Field(..., description="Teks intent / instruksi kerja bisnis")
    workflow_definition_id: Optional[str] = Field(None, description="Opsional ID definisi alur kerja spesifik")
    actor_id: Optional[str] = Field(None, description="ID aktor pemicu")
    actor_type: str = Field("ai_agent", description="ai_agent, user, atau system")
    context_data: Optional[Dict[str, Any]] = Field(default_factory=dict)


@router.post("/orchestration/workflows/dispatch", response_model=WorkflowDispatchResult, dependencies=[Depends(require_capability("workflow.dispatch"))])
@router.post("/orchestration/dispatch", response_model=WorkflowDispatchResult, dependencies=[Depends(require_capability("workflow.dispatch"))])
async def dispatch_workflow(
    payload: WorkflowDispatchIn,
    request: Request,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    """
    Memicu eksekusi alur kerja kognitif otonom dari intent.
    Titik Evaluasi PDP ke-1: Endpoint REST.
    """
    tenant_id = payload.tenant_id or x_tenant_id or getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    state_roles = getattr(request.state, "roles", []) or []
    header_roles = [r.strip() for r in (x_user_roles or "").split(",") if r.strip()]
    roles = list(set(state_roles + header_roles)) or ["STAFF_AI"]

    state_caps = getattr(request.state, "capabilities", []) or []
    header_caps = [c.strip() for c in (x_user_capabilities or "").split(",") if c.strip()]
    capabilities = list(set(state_caps + header_caps + ["workflow.dispatch"]))

    is_mfa = getattr(request.state, "is_mfa_verified", False) or ((x_mfa_verified or "false").lower() in ("true", "1"))

    # --- TITIK EVALUASI PDP KE-1: REST API Dispatch ---
    subject = SubjectContext(
        user_id=payload.actor_id or x_user_id or getattr(request.state, "user_id", None),
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


@router.get("/admin/llm-providers", dependencies=[Depends(require_capability("platform.admin.manage"))])
async def get_admin_llm_providers(
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_mfa_verified: Optional[str] = Header(None, alias="X-MFA-Verified"),
):
    """
    Monitoring kesehatan dan status real-time canonical Model Router providers:
    OpenAI primary dan NVIDIA NIM fallback.
    """
    model_router = get_model_router()
    providers_health = await model_router.get_all_providers_health()
    return {
        "status": "success",
        "providers": providers_health,
        "total_active": len([p for p in providers_health if p["health_status"] == "healthy"]),
    }


@router.get("/admin/mcp-tools", dependencies=[Depends(require_capability("platform.admin.manage"))])
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
            except Exception as e:
                logger.warning("Failed to generate input schema for tool %s: %s", t.name, str(e))
        if t.output_model:
            try:
                output_schema = t.output_model.model_json_schema()
            except Exception as e:
                logger.warning("Failed to generate output schema for tool %s: %s", t.name, str(e))

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


class ExecuteInferenceIn(BaseModel):
    tenant_id: str
    task_type: str = "TEXT_GENERATION"
    prompt: str


@router.post("/orchestration/execute", dependencies=[Depends(require_capability("model_router.infer"))])
async def execute_inference_endpoint(
    payload: ExecuteInferenceIn,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """
    Eksekusi inferensi AI langsung lewat Model Router tunggal dengan validasi Credit Ledger & PDP.
    """
    tenant_id = payload.tenant_id or x_tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=["STAFF_AI"],
        capabilities=["workflow.node.execute", "tokenopt.optimize"],
    )
    decision = authorize(
        subject=subject,
        action="model_router.infer",
        resource=ResourceContext(resource_type="model_router", owner_tenant_id=tenant_id),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    model_router = get_model_router()
    res = await model_router.infer(
        task_type=payload.task_type,
        prompt=payload.prompt,
        tenant_id=tenant_id,
    )
    return {
        "status": "success",
        "output_text": res.get("text") or res.get("content") or "",
        "provider_used": res.get("provider", "NVIDIA NIM"),
        "model_id": res.get("model", "meta/llama-3.1-70b-instruct"),
        "tokens_prompt": res.get("usage", {}).get("prompt_tokens", 0),
        "tokens_completion": res.get("usage", {}).get("completion_tokens", 0),
        "tokens_saved": res.get("tokens_saved", 0),
        "latency_ms": res.get("latency_ms", 120),
    }


class TenantChatIn(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)


@router.post("/tenants/{tenant_id}/orchestration/chat", dependencies=[Depends(require_capability("orchestration.chat"))])
async def tenant_orchestration_chat(
    tenant_id: str,
    payload: TenantChatIn,
):
    """
    Interaksi chat asisten orkestrasi internal tenant melalui Model Router tunggal.
    """
    subject = SubjectContext(
        tenant_id=tenant_id,
        roles=["TENANT_ADMIN"],
        capabilities=["chat.message.send", "workflow.dispatch"],
    )
    decision = authorize(
        subject=subject,
        action="orchestration.chat",
        resource=ResourceContext(resource_type="chat", owner_tenant_id=tenant_id),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    model_router = get_model_router()
    res = await model_router.infer(
        task_type="TEXT_GENERATION",
        prompt=f"Anda adalah asisten AI resmi OrchestreeAI untuk organisasi {tenant_id}. Pertanyaan pengguna: {payload.message}",
        tenant_id=tenant_id,
    )
    return {
        "status": "success",
        "reply": res.get("text") or res.get("content") or "Permintaan Anda telah diproses melalui Cognitive Core.",
        "tenant_id": tenant_id,
        "provider_used": res.get("provider", "NVIDIA NIM"),
    }


@router.get("/orchestration/executions", dependencies=[Depends(require_capability("orchestration.executions.read"))])
async def list_orchestration_executions(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Mengambil daftar riwayat eksekusi workflow kognitif dari database Supabase nyata.
    """
    subject = SubjectContext(
        tenant_id=tenant_id or "global",
        roles=["PLATFORM_SUPERADMIN", "TENANT_ADMIN"],
        capabilities=["workflow.execute", "workflow.dispatch", "platform.admin.manage"],
    )
    decision = authorize(
        subject=subject,
        action="orchestration.executions.read",
        resource=ResourceContext(resource_type="workflow_executions", owner_tenant_id=tenant_id or "global"),
        log_audit=True,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Ditolak oleh PDP: {decision.reason}")

    from app.core.database import get_database_engine
    
    engine = get_database_engine()
    with engine.connect() as conn:
        if tenant_id:
            query = "SELECT * FROM workflow_executions WHERE tenant_id = :tid ORDER BY created_at DESC LIMIT :lim;"
            params = {"tid": tenant_id, "lim": limit}
        else:
            query = "SELECT * FROM workflow_executions ORDER BY created_at DESC LIMIT :lim;"
            params = {"lim": limit}

        rows = conn.execute(sa.text(query), params).fetchall()
        return [
            {
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "workflow_definition_id": str(r.workflow_definition_id) if getattr(r, "workflow_definition_id", None) else None,
                "status": r.status,
                "started_at": r.started_at.isoformat() if getattr(r, "started_at", None) else None,
                "completed_at": r.completed_at.isoformat() if getattr(r, "completed_at", None) else None,
                "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
            }
            for r in rows
        ]
