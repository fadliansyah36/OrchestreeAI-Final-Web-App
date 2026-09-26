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
    get_verification_status,
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


class RegisterVerifiedSenderRequest(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant")
    membership_id: str = Field(..., description="ID Membership staf")
    proactive_official_channel_id: str = Field(..., description="ID Kanal Resmi Proaktif")
    external_identifier: str = Field(..., description="Nomor telepon WhatsApp atau username/chat_id Telegram")


class ProactiveInboundMessageRequest(BaseModel):
    channel_identifier: str = Field(..., description="Phone number ID atau bot username kanal resmi")
    sender_identifier: str = Field(..., description="Nomor pengirim atau ID pengirim masuk")
    content_text: str = Field(..., description="Teks pesan masuk")
    tenant_id: Optional[str] = Field(None, description="Opsional ID tenant")


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
    except HTTPException:
        raise
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
    except HTTPException:
        raise
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
    """Membuat tautan deep-link verifikasi resmi Telegram Bot: t.me/{bot}?start={verify_token}."""
    try:
        res = await generate_telegram_deeplink(
            tenant_id=payload.tenant_id,
            membership_id=payload.membership_id,
        )
        return {
            "success": True,
            "data": res,
            "deeplink": res.get("deeplink_url"),
            "deeplink_url": res.get("deeplink_url"),
            "verification_id": res.get("verification_id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gagal generate Telegram deep-link: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/verification/{verification_id}/status")
async def api_get_verification_status(
    verification_id: str,
    tenant_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """
    Polling status verifikasi tiket kanal (pending, verified, expired).
    Hanya mengembalikan status dan masked destination untuk privasi.
    """
    try:
        res = await get_verification_status(tenant_id=tenant_id, verification_id=verification_id)
        return {"success": True, "data": res, "status": res.get("status")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gagal mengambil status verifikasi: {e}")
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
        return {"success": True, "data": subs, "subscriptions": subs}
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
        return {"success": True, "data": logs, "logs": logs}
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
        return {"success": True, "data": notifs, "notifications": notifs}
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


@router.post("/verified-senders", summary="Registrasi Pengirim Terverifikasi Kanal Proaktif")
async def api_register_verified_sender(
    payload: RegisterVerifiedSenderRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """
    Mendaftarkan nomor atau identifier staf ke allow-list pengirim resmi kanal proaktif.
    PENEGAKAN BATAS KETAT:
    Nomor yang terdaftar akan dapat berinteraksi dengan asisten internal proaktif.
    """
    import sqlalchemy as sa
    from app.core.database import get_database_engine
    from app.domains.boundary.service import hash_identifier

    engine = get_database_engine()
    hashed = hash_identifier(payload.external_identifier)
    sender_id = str(uuid.uuid4())

    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": payload.tenant_id}
            )

            # Validasi bukti konfirmasi verifikasi nyata dari channel_verification
            verif_proof = conn.execute(
                sa.text("""
                    SELECT id FROM channel_verification
                    WHERE tenant_id = :tid
                      AND membership_id = :mid
                      AND status = 'verified'
                      AND (destination_target = :ident OR chat_id = :ident)
                    LIMIT 1
                """),
                {"tid": payload.tenant_id, "mid": payload.membership_id, "ident": payload.external_identifier}
            ).mappings().first()

            if not verif_proof:
                raise HTTPException(
                    status_code=400,
                    detail="Pengirim belum diverifikasi resmi. Silakan selesaikan alur verifikasi OTP WhatsApp resmi atau webhook Telegram Bot."
                )

            conn.execute(
                sa.text("""
                    INSERT INTO proactive_verified_senders (
                        id, proactive_official_channel_id, tenant_id,
                        tenant_membership_id, external_identifier_hash, verified_at
                    ) VALUES (
                        :id, :cid, :tid, :mid, :hash, now()
                    )
                    ON CONFLICT (proactive_official_channel_id, external_identifier_hash)
                    DO UPDATE SET verified_at = now()
                """),
                {
                    "id": sender_id,
                    "cid": payload.proactive_official_channel_id,
                    "tid": payload.tenant_id,
                    "mid": payload.membership_id,
                    "hash": hashed,
                }
            )
        return {
            "success": True,
            "id": sender_id,
            "proactive_official_channel_id": payload.proactive_official_channel_id,
            "tenant_id": payload.tenant_id,
            "membership_id": payload.membership_id,
            "status": "VERIFIED"
        }
    except Exception as e:
        logger.error(f"Gagal registrasi pengirim terverifikasi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/verified-senders", summary="Daftar Pengirim Terverifikasi Kanal Proaktif")
async def api_list_verified_senders(
    tenant_id: str,
    channel_id: Optional[str] = None,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengembalikan daftar hash pengirim staf yang terverifikasi pada kanal proaktif."""
    import sqlalchemy as sa
    from app.core.database import get_database_engine

    engine = get_database_engine()
    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": tenant_id}
            )
            query = """
                SELECT id, proactive_official_channel_id, tenant_id,
                       tenant_membership_id, external_identifier_hash, verified_at
                FROM proactive_verified_senders
                WHERE tenant_id = :tid::uuid
            """
            params = {"tid": tenant_id}
            if channel_id:
                query += " AND proactive_official_channel_id = :cid::uuid"
                params["cid"] = channel_id
            query += " ORDER BY verified_at DESC"

            rows = conn.execute(sa.text(query), params).mappings().all()
            return {"success": True, "data": [dict(r) for r in rows]}
    except Exception as e:
        logger.error(f"Gagal mengambil daftar pengirim terverifikasi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inbound", summary="Rute Pesan Masuk Kanal Proaktif Resmi (Strict Boundary)")
async def api_proactive_inbound(
    payload: ProactiveInboundMessageRequest,
):
    """
    Rute pesan masuk khusus untuk kanal proactive_official_channels.
    PENEGAKAN BATAS KETAT:
    Bila sender_allowlist_enforced aktif dan pengirim belum terverifikasi:
    Pesan DIABAIKAN, dicatat ke cross_boundary_violation_log, dan TIDAK memicu Orchestration Engine.
    """
    from app.domains.boundary.service import route_proactive_inbound
    res = await route_proactive_inbound(
        channel_identifier=payload.channel_identifier,
        sender_identifier=payload.sender_identifier,
        content_text=payload.content_text,
        tenant_id=payload.tenant_id,
    )
    if res is None:
        return {
            "status": "DROPPED",
            "reason": "UNVERIFIED_SENDER_BLOCKED",
            "detail": "Pengirim tidak terdaftar dalam allow-list kanal resmi. Pesan diabaikan."
        }
    return {
        "status": "PROCESSED",
        "data": res
    }


class TriggerProactiveJobRequest(BaseModel):
    tenant_id: str = Field(..., description="ID Organisasi")
    ai_agent_id: str = Field(..., description="ID AI Agent pelaksana")
    ai_agent_display_name: str = Field(..., description="Nama tampilan agen AI")
    activity_label: str = Field(..., description="Label aktivitas pemantauan proaktif")
    job_type: str = Field(default="monitoring", description="Tipe tugas proaktif")
    target_resource: Optional[str] = Field(None, description="Sumber daya / integrasi target")


@router.post("/jobs/trigger-with-task-tracking", summary="Eksekusi Job Proaktif dengan Pelacakan Tugas Kanban (BAGIAN C)")
async def api_trigger_proactive_job_with_task_tracking(
    payload: TriggerProactiveJobRequest,
):
    """
    Mengeksekusi Proactive Job berdurasi/bertahap dengan membuat kartu task nyata di board departemen,
    memperbarui progress dan status_line live, memindahkan kolom otomatis sampai Done,
    dan menyiarkan event realtime ke klien.
    """
    from app.domains.proactive.service import run_proactive_job_with_task_tracking, ProactiveJobDefinition
    job_def = ProactiveJobDefinition(
        tenant_id=payload.tenant_id,
        ai_agent_id=payload.ai_agent_id,
        ai_agent_display_name=payload.ai_agent_display_name,
        activity_label=payload.activity_label,
        job_type=payload.job_type,
        target_resource=payload.target_resource,
    )
    res = await run_proactive_job_with_task_tracking(job_def)
    return res


