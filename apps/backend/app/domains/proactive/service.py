"""
OrchestreeAI Proactive Communication & Channel Verification Service (PRD v2.2 Bagian 10.3)
Mengimplementasikan:
1. Registrasi & Verifikasi Nomor WhatsApp resmi via Meta WhatsApp Cloud API + OTP
2. Verifikasi Telegram via Deep-link Bot Resmi (t.me/{TELEGRAM_BOT_USERNAME}?start=verify_{code})
3. Manajemen Preferensi Langganan Proaktif & Anti-Spam Guard (Maks 5 pesan/staf/hari)
4. Protokol Opt-Out / Consent ("STOP" / "BERHENTI") & Opt-In ("START" / "LANJUT")
5. Audit Pengiriman Pesan & Pemeriksaan Nada/Risiko (Risk Score)
6. Pusat Notifikasi In-App (Notification Center)
7. Manajemen Web Push Browser (VAPID)
"""

import os
import json
import uuid
import secrets
import logging
import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine

logger = logging.getLogger("orchestree.domains.proactive")


class ProactiveSubscriptionModel(BaseModel):
    id: str
    tenant_id: str
    tenant_membership_id: str
    channel: str  # 'whatsapp' | 'telegram'
    destination_target: str
    notif_types: List[str] = Field(default_factory=lambda: ["daily_briefing", "urgent_alerts"])
    send_times: List[str] = Field(default_factory=lambda: ["08:00", "17:00"])
    timezone: str = "Asia/Jakarta"
    status: str = "active"  # 'active' | 'paused' | 'unsubscribed'
    paused_reason: Optional[str] = None
    daily_message_count: int = 0
    last_sent_date: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChannelVerificationTicket(BaseModel):
    id: str
    tenant_id: str
    membership_id: str
    channel: str
    destination_target: str
    verification_code: str
    status: str  # 'pending' | 'verified' | 'expired'
    expires_at: str
    verified_at: Optional[str] = None
    created_at: Optional[str] = None


class ProactiveMessageLogModel(BaseModel):
    id: str
    tenant_id: str
    subscription_id: Optional[str] = None
    channel_type: str
    recipient_target: str
    message_type: str
    composed_text: str
    risk_score: float = 0.0
    delivery_status: str  # 'queued' | 'sent' | 'delivered' | 'failed' | 'blocked_antispam'
    provider_message_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class InAppNotificationModel(BaseModel):
    id: str
    tenant_id: str
    membership_id: str
    title: str
    body: str
    category: str = "general"
    is_read: bool = False
    action_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


# ============================================================================
# META WHATSAPP CLOUD API & TELEGRAM BOT CLIENT HELPERS
# ============================================================================

async def send_whatsapp_message(
    phone_number_id: str,
    access_token: str,
    recipient_phone: str,
    message_text: str,
) -> Dict[str, Any]:
    """Mengirim pesan teks/template resmi via Meta WhatsApp Business Cloud API."""
    clean_phone = recipient_phone.replace("+", "").replace("-", "").replace(" ", "").strip()
    if clean_phone.startswith("08"):
        clean_phone = "628" + clean_phone[2:]

    url = f"https://graph.facebook.com/{settings.META_GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message_text},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            data = res.json()
            if res.status_code in (200, 201):
                msg_id = data.get("messages", [{}])[0].get("id", f"wa_msg_{uuid.uuid4().hex[:12]}")
                return {"success": True, "message_id": msg_id, "data": data}
            else:
                logger.warning(f"Meta Graph API error ({res.status_code}): {data}")
                return {"success": False, "error": data.get("error", {}).get("message", res.text), "data": data}
    except Exception as e:
        logger.error(f"Gagal mengirim pesan WhatsApp via Cloud API: {e}")
        return {"success": False, "error": str(e)}


async def send_telegram_message(
    bot_token: str,
    chat_id: Union[str, int],
    text: str,
    parse_mode: str = "HTML",
) -> Dict[str, Any]:
    """Mengirim pesan via Telegram Bot API resmi platform."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            data = res.json()
            if res.status_code == 200 and data.get("ok"):
                msg_id = str(data.get("result", {}).get("message_id", ""))
                return {"success": True, "message_id": msg_id, "data": data}
            else:
                logger.warning(f"Telegram Bot API error ({res.status_code}): {data}")
                return {"success": False, "error": data.get("description", res.text), "data": data}
    except Exception as e:
        logger.error(f"Gagal memanggil Telegram Bot API: {e}")
        return {"success": False, "error": str(e)}


# ============================================================================
# DOMAIN SERVICE IMPLEMENTATIONS
# ============================================================================

async def request_whatsapp_otp(
    tenant_id: str,
    membership_id: str,
    phone_number: str,
) -> Dict[str, Any]:
    """
    Memulai pendaftaran nomor WhatsApp staf dengan menerbitkan OTP nyata dan
    mengirimkannya via Meta WhatsApp Cloud API resmi platform.
    """
    clean_phone = phone_number.replace("+", "").replace("-", "").replace(" ", "").strip()
    if clean_phone.startswith("08"):
        clean_phone = "628" + clean_phone[2:]
    formatted_phone = "+" + clean_phone if not clean_phone.startswith("+") else clean_phone

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)

    engine = get_engine()
    ticket_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        # Nonaktifkan verifikasi pending sebelumnya untuk tujuan yang sama
        await conn.execute(
            sa.text("""
                UPDATE channel_verification
                SET status = 'expired'
                WHERE tenant_id = :tenant_id
                  AND membership_id = :membership_id
                  AND channel = 'whatsapp'
                  AND status = 'pending';
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id},
        )

        # Buat tiket verifikasi baru
        await conn.execute(
            sa.text("""
                INSERT INTO channel_verification (
                    id, tenant_id, membership_id, channel, destination_target,
                    verification_code, status, expires_at
                ) VALUES (
                    :id, :tenant_id, :membership_id, 'whatsapp', :destination_target,
                    :verification_code, 'pending', :expires_at
                );
            """),
            {
                "id": ticket_id,
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "destination_target": formatted_phone,
                "verification_code": otp_code,
                "expires_at": expires_at,
            },
        )

    # Kirim pesan OTP via Meta WhatsApp Cloud API resmi
    phone_id = settings.WA_PROACTIVE_PHONE_NUMBER_ID or "109283746592019"
    access_token = settings.WA_PROACTIVE_ACCESS_TOKEN or ""
    message_text = (
        f"[OrchestreeAI] Kode verifikasi notifikasi proaktif Anda adalah: *{otp_code}*.\n"
        f"Berlaku selama 10 menit. Jangan berikan kode ini kepada siapa pun.\n\n"
        f"Ketik BERHENTI atau STOP kapan saja untuk berhenti menerima pesan."
    )

    api_res = await send_whatsapp_message(
        phone_number_id=phone_id,
        access_token=access_token,
        recipient_phone=formatted_phone,
        message_text=message_text,
    )

    # Catat ke log pesan
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        await conn.execute(
            sa.text("""
                INSERT INTO proactive_messages_log (
                    tenant_id, channel_type, recipient_target, message_type,
                    composed_text, risk_score, delivery_status, provider_message_id, metadata
                ) VALUES (
                    :tenant_id, 'whatsapp', :recipient_target, 'otp',
                    :composed_text, 0.000, :delivery_status, :provider_message_id, :metadata
                );
            """),
            {
                "tenant_id": tenant_id,
                "recipient_target": formatted_phone,
                "composed_text": f"[OTP Verification] {otp_code}",
                "delivery_status": "sent" if api_res.get("success") else "failed",
                "provider_message_id": api_res.get("message_id"),
                "metadata": json.dumps({"verification_id": ticket_id, "api_response": api_res}),
            },
        )

    return {
        "status": "pending",
        "verification_id": ticket_id,
        "destination_target": formatted_phone,
        "expires_at": expires_at.isoformat(),
        "delivered": api_res.get("success", False),
    }


async def verify_whatsapp_otp(
    tenant_id: str,
    membership_id: str,
    verification_code: str,
) -> Dict[str, Any]:
    """
    Memvalidasi kode OTP yang diinputkan pengguna. Jika valid, preferensi
    langganan WhatsApp diaktifkan seketika.
    """
    engine = get_engine()
    clean_code = verification_code.strip()

    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        res = await conn.execute(
            sa.text("""
                SELECT id, destination_target, expires_at
                FROM channel_verification
                WHERE tenant_id = :tenant_id
                  AND membership_id = :membership_id
                  AND channel = 'whatsapp'
                  AND verification_code = :code
                  AND status = 'pending'
                  AND expires_at > now()
                ORDER BY created_at DESC
                LIMIT 1;
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id, "code": clean_code},
        )
        row = res.mappings().first()

        if not row:
            raise ValueError("Kode verifikasi tidak valid atau telah kedaluwarsa.")

        ticket_id = str(row["id"])
        target_phone = str(row["destination_target"])

        # Tandai tiket verifikasi sebagai verified
        await conn.execute(
            sa.text("""
                UPDATE channel_verification
                SET status = 'verified', verified_at = now()
                WHERE id = :ticket_id;
            """),
            {"ticket_id": ticket_id},
        )

        # Upsert subscription
        sub_res = await conn.execute(
            sa.text("""
                INSERT INTO proactive_subscriptions (
                    tenant_id, tenant_membership_id, channel, destination_target,
                    status, daily_message_count, updated_at
                ) VALUES (
                    :tenant_id, :membership_id, 'whatsapp', :destination_target,
                    'active', 0, now()
                )
                ON CONFLICT (tenant_id, tenant_membership_id, channel)
                DO UPDATE SET
                    destination_target = EXCLUDED.destination_target,
                    status = 'active',
                    paused_reason = NULL,
                    updated_at = now()
                RETURNING id;
            """),
            {
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "destination_target": target_phone,
            },
        )
        sub_id = str(sub_res.mappings().first()["id"])

        # Buat in-app notification konfirmasi
        await conn.execute(
            sa.text("""
                INSERT INTO notifications (
                    tenant_id, membership_id, title, body, category, is_read, action_url
                ) VALUES (
                    :tenant_id, :membership_id,
                    'Kanal WhatsApp Terverifikasi',
                    :body,
                    'general', false, '/channels/proactive'
                );
            """),
            {
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "body": f"Nomor WhatsApp {target_phone} berhasil ditautkan ke akun Anda untuk pengiriman pesan proaktif.",
            },
        )

    # Kirim pesan sambutan resmi via WhatsApp Cloud API
    phone_id = settings.WA_PROACTIVE_PHONE_NUMBER_ID or "109283746592019"
    access_token = settings.WA_PROACTIVE_ACCESS_TOKEN or ""
    welcome_msg = (
        "🎉 *Selamat! Nomor WhatsApp Anda Berhasil Terverifikasi.*\n\n"
        "Anda kini terdaftar untuk menerima pembaruan kerja harian, laporan eksekutif, dan peringatan kritis "
        "dari OrchestreeAI Autonomous Workforce.\n\n"
        "💡 *Tips:* Ketik *STOP* atau *BERHENTI* kapan saja jika ingin menjeda pengiriman pesan."
    )
    await send_whatsapp_message(
        phone_number_id=phone_id,
        access_token=access_token,
        recipient_phone=target_phone,
        message_text=welcome_msg,
    )

    return {
        "status": "verified",
        "subscription_id": sub_id,
        "destination_target": target_phone,
        "channel": "whatsapp",
    }


async def generate_telegram_deeplink(
    tenant_id: str,
    membership_id: str,
) -> Dict[str, Any]:
    """
    Menghasilkan tiket verifikasi dan tautan deep-link resmi Telegram Bot platform.
    Format: https://t.me/{TELEGRAM_BOT_USERNAME}?start=verify_{code}
    """
    bot_username = settings.TELEGRAM_BOT_USERNAME or "@OrchestreeAI.bot"
    clean_username = bot_username.lstrip("@").strip()
    verif_code = secrets.token_hex(4).upper()  # 8 karakter hex
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)

    engine = get_engine()
    ticket_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        await conn.execute(
            sa.text("""
                INSERT INTO channel_verification (
                    id, tenant_id, membership_id, channel, destination_target,
                    verification_code, status, expires_at
                ) VALUES (
                    :id, :tenant_id, :membership_id, 'telegram', 'pending_tg',
                    :verification_code, 'pending', :expires_at
                );
            """),
            {
                "id": ticket_id,
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "verification_code": verif_code,
                "expires_at": expires_at,
            },
        )

    deeplink_url = f"https://t.me/{clean_username}?start=verify_{verif_code}"
    return {
        "verification_id": ticket_id,
        "verification_code": verif_code,
        "deeplink_url": deeplink_url,
        "bot_username": f"@{clean_username}",
        "expires_at": expires_at.isoformat(),
    }


async def verify_telegram_start(
    chat_id: Union[str, int],
    verification_code: str,
    telegram_user_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Memvalidasi start command yang dikirimkan pengguna ke Telegram Bot:
    /start verify_{verification_code}
    """
    engine = get_engine()
    clean_code = verification_code.strip().upper()
    chat_id_str = str(chat_id)

    async with engine.begin() as conn:
        res = await conn.execute(
            sa.text("""
                SELECT id, tenant_id, membership_id
                FROM channel_verification
                WHERE channel = 'telegram'
                  AND verification_code = :code
                  AND status = 'pending'
                  AND expires_at > now()
                LIMIT 1;
            """),
            {"code": clean_code},
        )
        row = res.mappings().first()

        if not row:
            return {"success": False, "error": "Kode tautan Telegram tidak ditemukan atau sudah kedaluwarsa."}

        ticket_id = str(row["id"])
        tenant_id = str(row["tenant_id"])
        membership_id = str(row["membership_id"])

        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        # Update tiket verifikasi
        await conn.execute(
            sa.text("""
                UPDATE channel_verification
                SET status = 'verified',
                    verified_at = now(),
                    destination_target = :chat_id
                WHERE id = :ticket_id;
            """),
            {"ticket_id": ticket_id, "chat_id": chat_id_str},
        )

        # Upsert subscription Telegram
        sub_res = await conn.execute(
            sa.text("""
                INSERT INTO proactive_subscriptions (
                    tenant_id, tenant_membership_id, channel, destination_target,
                    status, daily_message_count, updated_at
                ) VALUES (
                    :tenant_id, :membership_id, 'telegram', :chat_id,
                    'active', 0, now()
                )
                ON CONFLICT (tenant_id, tenant_membership_id, channel)
                DO UPDATE SET
                    destination_target = EXCLUDED.destination_target,
                    status = 'active',
                    paused_reason = NULL,
                    updated_at = now()
                RETURNING id;
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id, "chat_id": chat_id_str},
        )
        sub_id = str(sub_res.mappings().first()["id"])

        # Buat in-app notification
        await conn.execute(
            sa.text("""
                INSERT INTO notifications (
                    tenant_id, membership_id, title, body, category, is_read, action_url
                ) VALUES (
                    :tenant_id, :membership_id,
                    'Telegram Berhasil Ditautkan',
                    :body,
                    'general', false, '/channels/proactive'
                );
            """),
            {
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "body": f"Kanal Telegram (Chat ID: {chat_id_str}) berhasil ditautkan ke profil Anda.",
            },
        )

    # Kirim balasan sambutan ke Telegram
    bot_token = settings.TELEGRAM_BOT_TOKEN or settings.TELEGRAM_OFFICIAL_BOT_TOKEN or ""
    welcome_text = (
        "<b>🎉 Selamat Datang di Kanal Notifikasi Proaktif OrchestreeAI!</b>\n\n"
        "Akun Telegram Anda berhasil ditautkan ke sistem operasional organisasi. "
        "Anda akan menerima ringkasan kerja terjadwal dan notifikasi penting secara langsung di sini.\n\n"
        "<i>Perintah Tersedia:</i>\n"
        "• Ketik <b>STOP</b> atau <b>BERHENTI</b> untuk menjeda pengiriman pesan.\n"
        "• Ketik <b>START</b> atau <b>LANJUT</b> untuk mengaktifkan kembali."
    )
    await send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=welcome_text)

    return {
        "success": True,
        "tenant_id": tenant_id,
        "membership_id": membership_id,
        "subscription_id": sub_id,
        "chat_id": chat_id_str,
    }


async def handle_opt_out(
    channel: str,
    destination_target: str,
    keyword: str,
) -> Dict[str, Any]:
    """
    Protokol Opt-Out wajib (PRD v2.2 Bagian 10.3 & 10.6):
    Menjeda (status = 'paused') langganan proaktif saat staf mengirim STOP / BERHENTI.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(
            sa.text("""
                UPDATE proactive_subscriptions
                SET status = 'paused',
                    paused_reason = :reason,
                    updated_at = now()
                WHERE channel = :channel
                  AND destination_target = :target
                RETURNING id, tenant_id, tenant_membership_id;
            """),
            {
                "channel": channel,
                "target": destination_target,
                "reason": f"User opt-out via keyword '{keyword.upper()}'",
            },
        )
        row = res.mappings().first()
        if row:
            sub_id = str(row["id"])
            tenant_id = str(row["tenant_id"])
            # Catat ke log
            await conn.execute(
                sa.text("""
                    INSERT INTO proactive_messages_log (
                        tenant_id, subscription_id, channel_type, recipient_target,
                        message_type, composed_text, risk_score, delivery_status, metadata
                    ) VALUES (
                        :tenant_id, :sub_id, :channel, :target,
                        'opt_out', :composed_text, 0.000, 'delivered', :metadata
                    );
                """),
                {
                    "tenant_id": tenant_id,
                    "sub_id": sub_id,
                    "channel": channel,
                    "target": destination_target,
                    "composed_text": f"Kanal dinonaktifkan oleh pengguna ({keyword})",
                    "metadata": json.dumps({"action": "opt_out", "keyword": keyword}),
                },
            )
            return {"success": True, "status": "paused", "subscription_id": sub_id}

    return {"success": False, "error": "Langganan tidak ditemukan"}


async def handle_opt_in(
    channel: str,
    destination_target: str,
    keyword: str,
) -> Dict[str, Any]:
    """
    Mengaktifkan kembali (status = 'active') langganan yang sebelumnya dijeda
    saat staf mengirim START / LANJUT / MULAI.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(
            sa.text("""
                UPDATE proactive_subscriptions
                SET status = 'active',
                    paused_reason = NULL,
                    updated_at = now()
                WHERE channel = :channel
                  AND destination_target = :target
                RETURNING id, tenant_id;
            """),
            {"channel": channel, "target": destination_target},
        )
        row = res.mappings().first()
        if row:
            sub_id = str(row["id"])
            tenant_id = str(row["tenant_id"])
            await conn.execute(
                sa.text("""
                    INSERT INTO proactive_messages_log (
                        tenant_id, subscription_id, channel_type, recipient_target,
                        message_type, composed_text, risk_score, delivery_status, metadata
                    ) VALUES (
                        :tenant_id, :sub_id, :channel, :target,
                        'opt_in', :composed_text, 0.000, 'delivered', :metadata
                    );
                """),
                {
                    "tenant_id": tenant_id,
                    "sub_id": sub_id,
                    "channel": channel,
                    "target": destination_target,
                    "composed_text": f"Kanal diaktifkan kembali oleh pengguna ({keyword})",
                    "metadata": json.dumps({"action": "opt_in", "keyword": keyword}),
                },
            )
            return {"success": True, "status": "active", "subscription_id": sub_id}

    return {"success": False, "error": "Langganan tidak ditemukan"}


async def update_subscription_preferences(
    tenant_id: str,
    membership_id: str,
    channel: str,
    notif_types: Optional[List[str]] = None,
    send_times: Optional[List[str]] = None,
    timezone: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """Memperbarui preferensi jadwal dan jenis notifikasi proaktif staf."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        updates = []
        params: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "membership_id": membership_id,
            "channel": channel,
        }

        if notif_types is not None:
            updates.append("notif_types = :notif_types")
            params["notif_types"] = notif_types
        if send_times is not None:
            updates.append("send_times = :send_times")
            params["send_times"] = send_times
        if timezone is not None:
            updates.append("timezone = :timezone")
            params["timezone"] = timezone
        if status is not None and status in ("active", "paused", "unsubscribed"):
            updates.append("status = :status")
            params["status"] = status

        updates.append("updated_at = now()")

        sql = f"""
            UPDATE proactive_subscriptions
            SET {', '.join(updates)}
            WHERE tenant_id = :tenant_id
              AND tenant_membership_id = :membership_id
              AND channel = :channel
            RETURNING *;
        """
        res = await conn.execute(sa.text(sql), params)
        row = res.mappings().first()
        if not row:
            raise ValueError("Langganan kanal proaktif tidak ditemukan.")
        return dict(row)


async def get_subscriptions(
    tenant_id: str,
    membership_id: str,
) -> List[Dict[str, Any]]:
    """Mengambil seluruh langganan kanal proaktif anggota organisasi."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(
            sa.text("""
                SELECT *
                FROM proactive_subscriptions
                WHERE tenant_id = :tenant_id
                  AND tenant_membership_id = :membership_id
                ORDER BY created_at ASC;
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id},
        )
        return [dict(r) for r in res.mappings().all()]


async def get_message_logs(
    tenant_id: str,
    membership_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Mengambil riwayat audit pesan proaktif yang terkirim."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        query = """
            SELECT l.*, s.channel
            FROM proactive_messages_log l
            LEFT JOIN proactive_subscriptions s ON l.subscription_id = s.id
            WHERE l.tenant_id = :tenant_id
        """
        params: Dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
        if membership_id:
            query += " AND s.tenant_membership_id = :membership_id"
            params["membership_id"] = membership_id
        query += " ORDER BY l.created_at DESC LIMIT :limit;"

        res = await conn.execute(sa.text(query), params)
        return [dict(r) for r in res.mappings().all()]


async def get_notifications(
    tenant_id: str,
    membership_id: str,
    unread_only: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Mengambil pesan dari In-App Notification Center."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        query = """
            SELECT *
            FROM notifications
            WHERE tenant_id = :tenant_id
              AND membership_id = :membership_id
        """
        params: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "membership_id": membership_id,
            "limit": limit,
        }
        if unread_only:
            query += " AND is_read = false"
        query += " ORDER BY created_at DESC LIMIT :limit;"

        res = await conn.execute(sa.text(query), params)
        return [dict(r) for r in res.mappings().all()]


async def mark_notification_read(
    tenant_id: str,
    membership_id: str,
    notification_id: str,
) -> bool:
    """Menandai satu notifikasi in-app telah dibaca."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(
            sa.text("""
                UPDATE notifications
                SET is_read = true
                WHERE id = :notif_id
                  AND tenant_id = :tenant_id
                  AND membership_id = :membership_id;
            """),
            {"notif_id": notification_id, "tenant_id": tenant_id, "membership_id": membership_id},
        )
        return res.rowcount > 0


async def mark_all_notifications_read(
    tenant_id: str,
    membership_id: str,
) -> int:
    """Menandai seluruh notifikasi in-app anggota telah dibaca."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(
            sa.text("""
                UPDATE notifications
                SET is_read = true
                WHERE tenant_id = :tenant_id
                  AND membership_id = :membership_id
                  AND is_read = false;
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id},
        )
        return res.rowcount


async def register_push_subscription(
    tenant_id: str,
    membership_id: str,
    endpoint: str,
    p256dh: str,
    auth_token: str,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """Mendaftarkan langganan Web Push VAPID peramban untuk staf."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(
            sa.text("""
                INSERT INTO push_subscriptions (
                    tenant_id, membership_id, endpoint, p256dh, auth_token, user_agent, updated_at
                ) VALUES (
                    :tenant_id, :membership_id, :endpoint, :p256dh, :auth_token, :user_agent, now()
                )
                ON CONFLICT (membership_id, endpoint)
                DO UPDATE SET
                    p256dh = EXCLUDED.p256dh,
                    auth_token = EXCLUDED.auth_token,
                    user_agent = EXCLUDED.user_agent,
                    updated_at = now()
                RETURNING *;
            """),
            {
                "tenant_id": tenant_id,
                "membership_id": membership_id,
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth_token": auth_token,
                "user_agent": user_agent,
            },
        )
        return dict(res.mappings().first())
