"""
OrchestreeAI Proactive Communication & Notification API (PRD v2.2 Bagian 10.3, 10.6 & 16)
Endpoints:
- POST  /api/v1/proactive/channels/whatsapp/request-otp
- POST  /api/v1/proactive/channels/whatsapp/verify-otp
- POST  /api/v1/proactive/channels/telegram/deeplink
- GET   /api/v1/proactive/subscriptions
- PATCH /api/v1/proactive/subscriptions/{channel}
- GET   /api/v1/proactive/logs
- GET   /api/v1/proactive/notifications
- PATCH /api/v1/proactive/notifications/{notification_id}/read
- POST  /api/v1/proactive/notifications/read-all
- POST  /api/v1/proactive/push/subscribe
- POST  /api/v1/proactive/scheduler/trigger (Pemicu siklus pengiriman Celery Beat)
"""

import uuid
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field

from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability
from app.domains.proactive.service import (
    request_whatsapp_otp,
    verify_whatsapp_otp,
    generate_telegram_deeplink,
    update_subscription_preferences,
    get_subscriptions,
    get_message_logs,
    get_notifications,
    mark_notification_read,
    mark_all_notifications_read,
    register_push_subscription,
)
from app.domains.proactive.scheduler import execute_proactive_dispatch_cycle

logger = logging.getLogger("orchestree.api.proactive")

router = APIRouter(
    prefix="/api/v1/proactive",
    tags=["Proactive Channels & Notifications"],
    dependencies=[Depends(require_capability("proactive.messages.manage"))]
)


class WhatsAppOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Nomor telepon dalam format E.164 (mis. +628123456789)")
    tenant_id: str = Field(..., description="ID Tenant/Organisasi")
    membership_id: str = Field(..., description="ID Membership staf")


class WhatsAppOTPVerify(BaseModel):
    verification_code: str = Field(..., min_length=6, max_length=6, description="6 digit kode OTP")
    tenant_id: str = Field(..., description="ID Tenant/Organisasi")
    membership_id: str = Field(..., description="ID Membership staf")


class TelegramDeeplinkRequest(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant/Organisasi")
    membership_id: str = Field(..., description="ID Membership staf")


class UpdateSubscriptionPreferencesRequest(BaseModel):
    tenant_id: str
    membership_id: str
    notif_types: Optional[List[str]] = None
    send_times: Optional[List[str]] = None
    timezone: Optional[str] = None
    status: Optional[str] = None  # 'active', 'paused', 'unsubscribed'


class WebPushSubscribeRequest(BaseModel):
    tenant_id: str
    membership_id: str
    endpoint: str
    p256dh: str
    auth_token: str
    user_agent: Optional[str] = None


@router.post("/channels/whatsapp/request-otp")
async def api_request_whatsapp_otp(
    payload: WhatsAppOTPRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Menerbitkan dan mengirimkan OTP verifikasi nomor WhatsApp via Meta Cloud API."""
    try:
        res = await request_whatsapp_otp(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
            phone_number=payload.phone_number,
        )
        return {"success": True, "data": res}
    except Exception as e:
        logger.error(f"Gagal request WhatsApp OTP: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/channels/whatsapp/verify-otp")
async def api_verify_whatsapp_otp(
    payload: WhatsAppOTPVerify,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Memverifikasi OTP WhatsApp staf dan mengaktifkan preferensi proaktif."""
    try:
        res = await verify_whatsapp_otp(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
            verification_code=payload.verification_code,
        )
        return {"success": True, "data": res}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Gagal verifikasi WhatsApp OTP: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/channels/telegram/deeplink")
async def api_generate_telegram_deeplink(
    payload: TelegramDeeplinkRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Membuat tautan deep-link verifikasi resmi Telegram Bot: t.me/{bot}?start=verify_{code}."""
    try:
        res = await generate_telegram_deeplink(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
        )
        return {"success": True, "data": res}
    except Exception as e:
        logger.error(f"Gagal generate Telegram deep-link: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions")
async def api_get_subscriptions(
    tenant_id: str,
    membership_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengambil status langganan kanal proaktif staf (WhatsApp & Telegram)."""
    try:
        subs = await get_subscriptions(tenant_id=tenant_id, membership_id=membership_id)
        return {"success": True, "data": subs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/subscriptions/{channel}")
async def api_update_subscription(
    channel: str,
    payload: UpdateSubscriptionPreferencesRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Memperbarui preferensi jadwal pengiriman dan jenis notifikasi kanal."""
    if channel not in ("whatsapp", "telegram"):
        raise HTTPException(status_code=400, detail="Channel tidak valid")
    try:
        res = await update_subscription_preferences(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
            channel=channel,
            notif_types=payload.notif_types,
            send_times=payload.send_times,
            timezone=payload.timezone,
            status=payload.status,
        )
        return {"success": True, "data": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/logs")
async def api_get_logs(
    tenant_id: str,
    membership_id: Optional[str] = None,
    limit: int = 50,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengambil riwayat log audit pengiriman pesan proaktif."""
    try:
        logs = await get_message_logs(tenant_id=tenant_id, membership_id=membership_id, limit=limit)
        return {"success": True, "data": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications")
async def api_get_notifications(
    tenant_id: str,
    membership_id: str,
    unread_only: bool = False,
    limit: int = 50,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengambil pesan dari In-App Notification Center."""
    try:
        notifs = await get_notifications(
            tenant_id=tenant_id,
            membership_id=membership_id,
            unread_only=unread_only,
            limit=limit,
        )
        return {"success": True, "data": notifs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/notifications/{notification_id}/read")
async def api_mark_notification_read(
    notification_id: str,
    tenant_id: str,
    membership_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Menandai satu notifikasi telah dibaca."""
    try:
        ok = await mark_notification_read(
            tenant_id=tenant_id,
            membership_id=membership_id,
            notification_id=notification_id,
        )
        return {"success": ok}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/read-all")
async def api_mark_all_read(
    tenant_id: str,
    membership_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Menandai seluruh notifikasi in-app telah dibaca."""
    try:
        cnt = await mark_all_notifications_read(tenant_id=tenant_id, membership_id=membership_id)
        return {"success": True, "marked_count": cnt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/push/subscribe")
async def api_register_web_push(
    payload: WebPushSubscribeRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mendaftarkan langganan Web Push VAPID peramban."""
    try:
        sub = await register_push_subscription(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth_token=payload.auth_token,
            user_agent=payload.user_agent,
        )
        return {"success": True, "data": sub}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scheduler/trigger")
async def api_trigger_scheduler(
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Memicu siklus pengiriman pesan proaktif (Celery Beat task runner)."""
    try:
        res = await execute_proactive_dispatch_cycle()
        return {"success": True, "data": res}
    except Exception as e:
        logger.error(f"Gagal memicu scheduler proaktif: {e}")
        raise HTTPException(status_code=500, detail=str(e))
