"""
Router Pemantauan Kognitif Live Agen AI Lintas Tenant (PRD v2.2 Bagian 25.2, 8.1, 3.5, 14 & 18).
Menyediakan REST endpoint dan WebSocket streaming untuk Live AI Cognitive Monitoring Panel di Konsol Super Admin.
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
from app.domains.cognitive_monitoring.live_state_service import (
    get_live_states,
    get_live_state_summary,
    get_agent_recent_nodes,
    cleanup_stale_records,
    touch_heartbeat,
)
from app.domains.cognitive_monitoring.realtime_broadcaster import get_realtime_broadcaster

logger = logging.getLogger("orchestree.admin.cognitive_monitoring")

router = APIRouter(prefix="/admin/ai-agent-live-state", tags=["Super Admin Live AI Cognitive Monitoring"])
websocket_router = APIRouter(tags=["Super Admin Cognitive Monitoring Realtime"])


class CleanupResponse(BaseModel):
    status: str
    marked_stale_errors: int
    deleted_stale_completed: int
    timestamp: str


@router.get(
    "",
    summary="Snapshot State Live Agen AI Seluruh Organisasi",
)
async def get_all_live_states(
    tenant_id: Optional[str] = Query(None, description="Filter berdasarkan ID organisasi"),
    department_category: Optional[str] = Query(None, description="Filter kategori departemen"),
    job_title_id: Optional[str] = Query(None, description="Filter ID Jabatan Utama"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter status kerja aktif/idle/thinking"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengembalikan snapshot real-time aktivitas agen AI lintas seluruh penyewa.
    Dilindungi Unified PDP dengan hak akses 'admin.cognitive_monitoring.view' dan verifikasi Super Admin.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.cognitive_monitoring.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="cognitive_monitoring",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.cognitive_monitoring.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        states = get_live_states(
            tenant_id=tenant_id,
            department_category=department_category,
            job_title_id=job_title_id,
            status=status_filter,
        )
        return {"data": states, "count": len(states), "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.error(f"Gagal memuat snapshot live state: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memuat live state agen AI: {str(exc)}",
        )


@router.get(
    "/summary",
    summary="Ringkasan Metrik Platform Live AI Monitoring",
)
async def get_summary(
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Menghasilkan ringkasan agregat aktivitas real-time:
    - Total AI Agent aktif sekarang
    - Breakdown per status operasional
    - Breakdown per Jabatan Utama
    - Top 10 organisasi paling aktif
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.cognitive_monitoring.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="cognitive_monitoring_summary",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.cognitive_monitoring.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        summary_data = get_live_state_summary()
        return summary_data
    except Exception as exc:
        logger.error(f"Gagal memuat ringkasan live state: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memuat ringkasan aktivitas live: {str(exc)}",
        )


@router.get(
    "/{agent_id}/recent-nodes",
    summary="Riwayat Node Terakhir untuk Panel Fokus Agent",
)
async def get_agent_nodes(
    agent_id: str,
    limit: int = Query(6, ge=1, le=20),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Mengambil mini-timeline riwayat langkah terakhir tanpa bocoran konten bisnis / prompt.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.cognitive_monitoring.view,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="agent_recent_nodes",
        resource_id=agent_id,
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.cognitive_monitoring.view", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    try:
        nodes = get_agent_recent_nodes(agent_id=agent_id, limit=limit)
        return {"agent_id": agent_id, "nodes": nodes, "count": len(nodes)}
    except Exception as exc:
        logger.error(f"Gagal memuat recent nodes: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memuat detail tahapan agen: {str(exc)}",
        )


@router.post(
    "/cleanup",
    summary="Pemicu Pembersihan State Stale (>90 detik)",
    response_model=CleanupResponse,
)
async def trigger_cleanup(
    threshold_seconds: int = Query(90, ge=30, le=300),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Membersihkan eksekusi yang berhenti mendadak atau melebihi batas waktu toleransi detak.
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.cognitive_monitoring.manage,platform.admin.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="user",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="cognitive_monitoring_cleanup",
        resource_id="global",
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="admin.cognitive_monitoring.manage", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    res = await cleanup_stale_records(stale_threshold_seconds=threshold_seconds)
    return CleanupResponse(
        status="success",
        marked_stale_errors=res.get("marked_stale_errors", 0),
        deleted_stale_completed=res.get("deleted_stale_completed", 0),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/heartbeat/{execution_id}",
    summary="Pembaruan Detak Live Heartbeat Eksekusi",
)
async def post_heartbeat(
    execution_id: str,
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header(None, alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Endpoint pembaruan heartbeat dari tool eksekusi eksternal / loop berdurasi panjang.
    """
    roles = [r.strip() for r in (x_user_roles or "STAFF_AI").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "ai_agent.live_state.manage,workflow.node.execute").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        tenant_id="global",
        actor_type="ai_agent",
        is_mfa_verified=is_mfa,
    )
    resource = ResourceContext(
        resource_type="workflow_execution",
        resource_id=execution_id,
        owner_tenant_id="global",
    )

    decision = authorize(subject=subject, action="ai_agent.live_state.manage", resource=resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: {decision.reason}",
        )

    success = await touch_heartbeat(workflow_execution_id=execution_id)
    if not success:
        return {"status": "not_found", "message": "Eksekusi tidak ditemukan atau telah selesai"}
    return {"status": "ok", "workflow_execution_id": execution_id}


# WebSocket endpoints untuk streaming live state ke Super Admin UI
@websocket_router.websocket("/ws/v1/admin/ai-agent-live-state")
@websocket_router.websocket("/ws/v1/admin/cognitive-monitoring/live")
async def websocket_cognitive_monitoring(websocket: WebSocket):
    await websocket.accept()
    broadcaster = get_realtime_broadcaster()
    await broadcaster.connect(websocket)

    try:
        # Kirim snapshot awal saat koneksi berhasil terjalin
        summary = get_live_state_summary()
        states = get_live_states()
        initial_payload = {
            "channel": "platform:ai-agent-live",
            "event": "initial_snapshot",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "states": states,
        }
        await websocket.send_text(json.dumps(initial_payload))

        while True:
            # Tetap jaga koneksi dan kirim heartbeat ringkasan tiap 8 detik
            try:
                # Baca pesan dari client jika ada (misal filter ping)
                try:
                    client_msg = await asyncio.wait_for(websocket.receive_text(), timeout=8.0)
                    if client_msg:
                        data = json.loads(client_msg)
                        if data.get("type") == "ping":
                            await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}))
                except asyncio.TimeoutError:
                    pass

                # Kirim pulse update
                current_summary = get_live_state_summary()
                await websocket.send_text(json.dumps({
                    "channel": "platform:ai-agent-live",
                    "event": "pulse_summary",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "summary": current_summary,
                }))
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        logger.info("Client WebSocket monitoring kognitif terputus.")
    except Exception as exc:
        logger.warning(f"Error pada WebSocket monitoring kognitif: {exc}")
    finally:
        await broadcaster.disconnect(websocket)
