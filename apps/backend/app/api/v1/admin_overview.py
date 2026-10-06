"""Admin Overview & Platform Hub API router.

FastAPI owns transport, authentication and PDP decisions. Platform data access
is delegated to the admin domain service.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.authz.pdp import ResourceContext, SubjectContext, authorize
from app.core.model_router.router import get_model_router
from app.skills.f01_mcp.decorators import get_tool_registry
from app.core.security import AuthenticatedTenantContext, require_platform_admin
from app.domains.admin.platform_overview import (
    get_platform_overview_data,
    get_financial_command_center_data,
    list_platform_tenants,
)

logger = logging.getLogger("orchestree.admin.overview")

router = APIRouter(prefix="/admin", tags=["Super Admin Platform Hub"])
root_alias_router = APIRouter(tags=["Super Admin Aliases"])


class TenantMetrics(BaseModel):
    total: int = 0
    active: int = 0
    trial: int = 0


class ProspectMetrics(BaseModel):
    total: int = 0
    selected: int = 0
    active_trials: int = 0
    scheduled_meetings: int = 0


class TrialSlotMetrics(BaseModel):
    capacity: int = 0
    available: int = 0
    reserved: int = 0
    allocated: int = 0
    duration_days: int = 0


class LlmMetrics(BaseModel):
    providers_healthy: int = 0
    providers_total: int = 0


class McpMetrics(BaseModel):
    tools_total: int = 0


class AdminHubOverviewResponse(BaseModel):
    tenants: TenantMetrics
    prospects: ProspectMetrics
    trial_slots: TrialSlotMetrics
    llm: LlmMetrics
    mcp: McpMetrics
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FinancialCommandCenterResponse(BaseModel):
    wallet_balance: float = 0.0
    currency: str = "IDR"
    total_revenue: float = 0.0
    circulating_credits: float = 0.0
    reserved_credits: float = 0.0
    total_invoices_paid: int = 0
    status: str = "operational"
    ledger_active: bool = True
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.get("/hub-overview", response_model=AdminHubOverviewResponse)
@root_alias_router.get("/api/v1/admin/hub-overview", response_model=AdminHubOverviewResponse, include_in_schema=False)
async def get_admin_hub_overview(context: AuthenticatedTenantContext = Depends(require_platform_admin)):
    decision = authorize(
        subject=SubjectContext(roles=context.roles, capabilities=context.capabilities, tenant_id="global",
                              actor_type="user", is_mfa_verified=context.is_mfa_verified),
        action="admin.hub.view",
        resource=ResourceContext(resource_type="admin_hub_overview", resource_id="global", owner_tenant_id="global"),
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Akses ditolak: {decision.reason}")
    try:
        health = await get_model_router().get_all_providers_health()
        data = await _platform_overview_with_health(health)
        return AdminHubOverviewResponse(**data)
    except Exception as exc:
        logger.exception("Admin hub overview failed.")
        raise HTTPException(status_code=503, detail={"code":"ADMIN_HUB_DATA_UNAVAILABLE","state":"UNAVAILABLE","message":"Platform overview data is temporarily unavailable."}) from exc


async def _platform_overview_with_health(health: List[Dict[str, Any]]) -> Dict[str, Any]:
    data = await __import__("asyncio").to_thread(
        get_platform_overview_data,
        health,
        get_tool_registry(),
    )
    return data


@root_alias_router.get("/api/v1/financial-command-center", response_model=FinancialCommandCenterResponse)
@root_alias_router.get("/financial-command-center", response_model=FinancialCommandCenterResponse, include_in_schema=False)
async def get_financial_command_center_overview(context: AuthenticatedTenantContext = Depends(require_platform_admin)):
    decision = authorize(
        subject=SubjectContext(roles=context.roles, capabilities=context.capabilities, tenant_id="global",
                              actor_type="user", is_mfa_verified=context.is_mfa_verified),
        action="admin.financial.view",
        resource=ResourceContext(resource_type="financial_command_center", resource_id="global", owner_tenant_id="global"),
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Akses ditolak: {decision.reason}")
    try:
        return FinancialCommandCenterResponse(**await __import__("asyncio").to_thread(get_financial_command_center_data))
    except Exception as exc:
        logger.exception("Financial command center failed.")
        raise HTTPException(status_code=503, detail={"code":"FINANCIAL_COMMAND_CENTER_UNAVAILABLE","state":"UNAVAILABLE","message":"Financial ledger data is temporarily unavailable."}) from exc


@router.get("/tenants")
@root_alias_router.get("/api/v1/admin/tenants", include_in_schema=False)
async def list_admin_tenants(context: AuthenticatedTenantContext = Depends(require_platform_admin)):
    decision = authorize(
        subject=SubjectContext(roles=context.roles, capabilities=context.capabilities, tenant_id="global",
                              actor_type="user", is_mfa_verified=context.is_mfa_verified),
        action="platform.admin.manage",
        resource=ResourceContext(resource_type="tenants", resource_id="global", owner_tenant_id="global"),
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Akses ditolak: {decision.reason}")
    try:
        return await __import__("asyncio").to_thread(list_platform_tenants)
    except Exception as exc:
        logger.exception("Admin tenant listing failed.")
        raise HTTPException(status_code=503, detail={"code":"ADMIN_TENANTS_UNAVAILABLE","state":"UNAVAILABLE","message":"Tenant directory data is temporarily unavailable."}) from exc


@router.get(
    "/process-integrity",
    summary="Pemeriksaan Integritas Proses Sistem (PRD v2.2 Bagian C.2)",
)
async def get_process_integrity(context: AuthenticatedTenantContext = Depends(require_platform_admin)):
    """
    Memeriksa kepatuhan seluruh proses sistem yang berjalan terhadap whitelist deployment.
    Memverifikasi Uvicorn aktif dan zero rogue runner tidak sah.
    """

    roles = context.roles
    capabilities = context.capabilities
    is_mfa = context.is_mfa_verified

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="process_integrity_monitor",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="platform.admin.manage", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    from app.core.security.process_integrity import evaluate_process_integrity
    report = evaluate_process_integrity(trigger_alert=False)
    return report


@router.post(
    "/process-integrity/test-alert",
    summary="Uji Coba Pemicuan Alert Integritas Proses (DoD C.2)",
)
async def test_process_integrity_alert(
    simulate_scenario: str = Query(
        default="rogue_process",
        pattern="^(rogue_process|missing_service)$",
        description="Controlled test scenario for the process-integrity alert path.",
    ),
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    """
    Mensimulasikan deteksi proses terlarang atau servis resmi terhenti
    untuk membuktikan alert audit_logs & notifikasi terpicu (DoD Bagian C.2).
    """

    roles = context.roles
    capabilities = context.capabilities
    is_mfa = context.is_mfa_verified

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="process_integrity_monitor",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="platform.admin.manage", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    from app.core.security.process_integrity import evaluate_process_integrity, scan_system_processes
    real_procs = scan_system_processes()
    simulated_procs = list(real_procs)  # allowlist: DoD C.2 test override

    if simulate_scenario == "rogue_process":
        # Simulasikan proses tak dikenal / rogue server
        simulated_procs.append({  # allowlist: DoD C.2 test override
            "pid": 99999,
            "command": "node server.js --unauthorized-shadow-stack",
        })
    elif simulate_scenario == "missing_service":
        # Hilangkan servis uvicorn resmi dari daftar proses
        simulated_procs = [p for p in simulated_procs if "uvicorn" not in p.get("command", "")]  # allowlist: DoD C.2 test override

    report = evaluate_process_integrity(processes_override=simulated_procs, trigger_alert=True)
    return {
        "simulation_scenario": simulate_scenario,  # allowlist: DoD C.2 test output
        "result": report,
        "alert_triggered": report["alert_dispatched"],
    }

