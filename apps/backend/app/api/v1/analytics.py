"""
Admin Platform Analytics Endpoints (PRD v2.2 Bagian 3.5, 14 & 18.2).
Menyediakan REST endpoint dan WebSocket untuk PlatformAnalyticsHubScreen:
- GET /api/v1/admin/analytics/overview
- GET /api/v1/admin/analytics/tenants
- GET /api/v1/admin/analytics/tenants/{id}/detail
- GET /api/v1/admin/analytics/llm-usage
- POST /api/v1/admin/analytics/rollup/refresh
- WS /ws/v1/admin/analytics/live
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.domains.analytics.rollup_service import (
    compute_daily_rollup,
    get_platform_analytics_overview,
    get_tenant_rankings,
    get_tenant_analytics_detail,
    get_llm_usage_breakdown,
)

logger = logging.getLogger("orchestree.admin.analytics")

router = APIRouter(prefix="/admin/analytics", tags=["Super Admin Platform Analytics"])
websocket_router = APIRouter(tags=["Super Admin Analytics Realtime"])


class AnalyticsRefreshRequest(BaseModel):
    target_date: Optional[str] = None


@router.get(
    "/overview",
    summary="Ringkasan Time-Series & KPI Analisis Platform",
)
async def get_overview(
    range: str = Query("30d", pattern="^(7d|30d|90d|custom)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengembalikan data time-series dan metrik agregasi platform harian untuk visualisasi chart interaktif.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.analytics.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="platform_analytics",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.analytics.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        data = get_platform_analytics_overview(
            range_str=range,
            start_str=start_date,
            end_str=end_date,
        )
        return data
    except Exception as exc:
        logger.warning(f"Gagal memuat analitik overview: {exc}")
        return {
            "range": range,
            "start_date": start_date or "",
            "end_date": end_date or "",
            "kpi": {
                "total_transactions": 0,
                "total_revenue_idr": 0.0,
                "total_repeat_orders": 0,
                "total_llm_cost_usd": 0.0,
                "total_credit_consumed": 0.0,
                "tenants": {"total": 0, "active": 0, "trial": 0},
                "total_human_staff": 0,
                "total_ai_agents_active": 0,
            },
            "sparklines": {},
            "time_series": [],
            "data_points_count": 0,
        }


@router.get(
    "/tenants",
    summary="Tabel Ranking Organisasi Tenant",
)
async def list_tenants_ranking(
    sort_by: str = Query("revenue", pattern="^(revenue|credit_usage|staff_count|ai_agent_count|transaction_count)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengembalikan ranking tenant dari tenant_analytics_daily_rollup untuk tabel sortable dan drill-down.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.analytics.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="tenant_analytics",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.analytics.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        rankings = get_tenant_rankings(sort_by=sort_by, order=order, limit=limit)
        return {"tenants": rankings, "total": len(rankings)}
    except Exception as exc:
        logger.warning(f"Gagal memuat ranking tenant: {exc}")
        return {"tenants": [], "total": 0}


@router.get(
    "/tenants/{id}/detail",
    summary="Detail Analitik Satu Organisasi Tenant (Drill-Down)",
)
async def get_tenant_detail(
    id: str,
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengembalikan histori transaksi, pemakaian kredit harian, komposisi AI Agent per Jabatan Utama,
    dan staf manusia per departemen untuk satu organisasi tenant.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.analytics.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="tenant_analytics_detail",
        resource_id=id,
        owner_tenant_id=id,
    )

    decision = authorize(subject=subject, action="admin.analytics.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        detail = get_tenant_analytics_detail(id)
        if "error" in detail:
            raise HTTPException(status_code=404, detail=detail["error"])
        return detail
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Gagal memuat detail tenant {id}: {exc}")
        return {
            "tenant": {"id": id, "display_name": "Organisasi", "legal_name": "Organisasi", "status": "unknown"},
            "transactions": [],
            "daily_credit_history": [],
            "ai_agent_breakdown": [],
            "human_staff_breakdown": [],
        }


@router.get(
    "/llm-usage",
    summary="Rincian Penggunaan dan Biaya Komputasi Model AI",
)
async def get_llm_usage(
    groupBy: str = Query("provider", pattern="^(provider|model|tenant)$"),
    range: str = Query("30d", pattern="^(7d|30d|90d|custom)$"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengembalikan rincian biaya komputasi model AI nyata dari llm_usage_logs.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.analytics.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="llm_usage_analytics",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.analytics.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        breakdown = get_llm_usage_breakdown(group_by=groupBy, range_str=range)
        return breakdown
    except Exception as exc:
        logger.warning(f"Gagal memuat breakdown LLM: {exc}")
        return {
            "group_by": groupBy,
            "range": range,
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "total_calls": 0,
            "avg_latency_ms": 0.0,
            "breakdown": [],
        }


@router.post(
    "/rollup/refresh",
    summary="Pemicu Komputasi Ulang Rollup Agregasi Harian",
)
async def refresh_rollup(
    payload: Optional[AnalyticsRefreshRequest] = None,
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Memicu kalkulasi ulang data rollup harian secara on-demand terhadap data mentah operasional.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.analytics.manage,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="platform_analytics_rollup",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.analytics.manage", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        target_d = None
        if payload and payload.target_date:
            target_d = datetime.strptime(payload.target_date, "%Y-%m-%d").date()

        res = compute_daily_rollup(target_date=target_d)
        return {
            "status": "success",
            "message": "Komputasi rollup berhasil diperbarui.",
            "data": res,
        }
    except Exception as exc:
        logger.error(f"Gagal menjalankan komputasi rollup: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memperbarui rollup: {str(exc)}",
        )


# WebSocket untuk streaming analitik KPI secara langsung
@websocket_router.websocket("/ws/v1/admin/analytics/live")
async def websocket_analytics_live(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Kirim heartbeat dan cuplikan KPI terkini
            overview_data = get_platform_analytics_overview(range_str="7d")
            payload = {
                "type": "analytics_heartbeat",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "kpi": overview_data.get("kpi", {}),
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        logger.info("Koneksi websocket live analitik terputus.")
    except Exception as exc:
        logger.warning(f"Error pada websocket analitik: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass
