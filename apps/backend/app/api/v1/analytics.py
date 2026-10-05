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
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.core.security import AuthenticatedTenantContext, require_platform_admin

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
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    return get_platform_analytics_overview(
        range_str=range, start_str=start_date, end_str=end_date
    )

async def list_tenants_ranking(
    sort_by: str = Query("revenue", pattern="^(revenue|credit_usage|staff_count|ai_agent_count|transaction_count)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    rankings = get_tenant_rankings(sort_by=sort_by, order=order, limit=limit)
    return {"tenants": rankings, "total": len(rankings)}

async def get_tenant_detail(
    id: str,
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    detail = get_tenant_analytics_detail(id)
    if "error" in detail:
        raise HTTPException(status_code=404, detail=detail["error"])
    return detail

async def get_llm_usage(
    groupBy: str = Query("provider", pattern="^(provider|model|tenant)$"),
    range: str = Query("30d", pattern="^(7d|30d|90d|custom)$"),
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    return get_llm_usage_breakdown(group_by=groupBy, range_str=range)

async def refresh_rollup(
    payload: Optional[AnalyticsRefreshRequest] = None,
    context: AuthenticatedTenantContext = Depends(require_platform_admin),
):
    target_d = None
    if payload and payload.target_date:
        target_d = datetime.strptime(payload.target_date, "%Y-%m-%d").date()
    res = compute_daily_rollup(target_date=target_d)
    return {
        "status": "success",
        "message": "Komputasi rollup berhasil diperbarui.",
        "data": res,
    }

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
