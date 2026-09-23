"""
OrchestreeAI Payment Gateway Webhook Handlers (PRD v2.2 Bagian 14.3)
Menyediakan endpoint penerimaan webhook resmi untuk:
- POST /api/v1/webhooks/payment/midtrans
- POST /api/v1/webhooks/payment/xendit

Dilengkapi verifikasi tanda tangan kriptografis HMAC / SHA512, audit pencatatan
ke payment_reconciliation_log, serta penambahan kredit otomatis ke tenant_credit_wallet.
"""

import uuid
import json
import hashlib
import logging
from decimal import Decimal
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Request, Query, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine
from app.authz.pdp import webhook_endpoint
from app.domains.billing.credits import topup_credit
from app.domains.proactive.service import (
    handle_opt_out,
    handle_opt_in,
    verify_telegram_start,
    send_whatsapp_message,
    send_telegram_message,
)

logger = logging.getLogger("orchestree.api.webhooks")

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])


@router.post("/payment/midtrans", dependencies=[Depends(webhook_endpoint("midtrans"))])
async def handle_midtrans_webhook(request: Request):
    """
    Webhook handler resmi untuk notifikasi transaksi Midtrans Snap/Core API.
    Memverifikasi tanda tangan SHA512(order_id + status_code + gross_amount + ServerKey).
    """
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Gagal mem-parse JSON payload Midtrans: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    order_id = payload.get("order_id")
    status_code = payload.get("status_code")
    gross_amount = payload.get("gross_amount")
    signature_key = payload.get("signature_key")
    transaction_status = payload.get("transaction_status")
    transaction_id = payload.get("transaction_id")
    fraud_status = payload.get("fraud_status", "accept")

    if not order_id or not status_code or not gross_amount or not signature_key:
        logger.warning("Payload webhook Midtrans tidak lengkap.")
        raise HTTPException(status_code=400, detail="Payload tidak lengkap.")

    # Verifikasi SHA512 signature key
    server_key = settings.MIDTRANS_SERVER_KEY or settings.PAYMENT_GATEWAY_SERVER_KEY or ""
    expected_raw = f"{order_id}{status_code}{gross_amount}{server_key}"
    expected_signature = hashlib.sha512(expected_raw.encode("utf-8")).hexdigest()

    signature_verified = (signature_key.lower() == expected_signature.lower())

    engine = get_engine()
    log_id = str(uuid.uuid4())

    if not signature_verified:
        logger.error(f"Midtrans signature mismatch untuk order {order_id}!")
        # Catat log kegagalan verifikasi tanda tangan
        async with engine.begin() as conn:
            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, payment_gateway, event_type, raw_payload, signature_verified, status
                ) VALUES (
                    :id, 'midtrans', :event_type, :raw_payload, false, 'invalid_signature'
                );
            """), {
                "id": log_id,
                "event_type": f"midtrans.{transaction_status}",
                "raw_payload": json.dumps(payload),
            })
        raise HTTPException(status_code=400, detail="Verifikasi tanda tangan Midtrans gagal.")

    # Cari faktur yang sesuai di database
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, tenant_id, amount, status
            FROM invoices
            WHERE invoice_number = :inv
            FOR UPDATE;
        """), {"inv": order_id})
        inv_row = res.fetchone()

        if not inv_row:
            logger.warning(f"Faktur {order_id} tidak ditemukan di database.")
            # Tetap catat log rekonsiliasi
            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, payment_gateway, event_type, raw_payload, signature_verified, status
                ) VALUES (
                    :id, 'midtrans', :event_type, :raw_payload, true, 'invoice_not_found'
                );
            """), {
                "id": log_id,
                "event_type": f"midtrans.{transaction_status}",
                "raw_payload": json.dumps(payload),
            })
            return {"status": "ignored", "reason": "Invoice not found"}

        inv_id, tenant_id, inv_amount, inv_status = inv_row
        tenant_id = str(tenant_id)
        inv_amount = Decimal(str(inv_amount))

        # Evaluasi status transaksi Midtrans
        is_paid = (
            transaction_status in ("capture", "settlement")
            and fraud_status == "accept"
        )
        is_failed = transaction_status in ("deny", "cancel", "expire")

        if is_paid and inv_status != "paid":
            # Perbarui status faktur menjadi lunas
            await conn.execute(sa.text("""
                UPDATE invoices
                SET status = 'paid',
                    paid_at = now(),
                    payment_reference = :trans_id,
                    updated_at = now()
                WHERE id = :id;
            """), {
                "id": inv_id,
                "trans_id": transaction_id or order_id,
            })

            # Catat log rekonsiliasi sukses
            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, tenant_id, invoice_id, payment_gateway, event_type,
                    raw_payload, signature_verified, status
                ) VALUES (
                    :id, :tenant_id, :invoice_id, 'midtrans', :event_type,
                    :raw_payload, true, 'settled'
                );
            """), {
                "id": log_id,
                "tenant_id": tenant_id,
                "invoice_id": inv_id,
                "event_type": f"midtrans.{transaction_status}",
                "raw_payload": json.dumps(payload),
            })
        elif is_failed:
            await conn.execute(sa.text("""
                UPDATE invoices
                SET status = 'failed',
                    updated_at = now()
                WHERE id = :id;
            """), {"id": inv_id})

            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, tenant_id, invoice_id, payment_gateway, event_type,
                    raw_payload, signature_verified, status
                ) VALUES (
                    :id, :tenant_id, :invoice_id, 'midtrans', :event_type,
                    :raw_payload, true, 'failed'
                );
            """), {
                "id": log_id,
                "tenant_id": tenant_id,
                "invoice_id": inv_id,
                "event_type": f"midtrans.{transaction_status}",
                "raw_payload": json.dumps(payload),
            })

    # Jika lunas dan belum diproses sebelumnya, tambahkan kredit ke dompet tenant
    if is_paid and inv_status != "paid":
        tx = await topup_credit(
            tenant_id=tenant_id,
            amount=inv_amount,
            reference_id=order_id,
            description=f"Top up via Midtrans ({order_id})",
            metadata={"transaction_id": transaction_id, "gateway": "midtrans"},
        )
        logger.info(
            f"Faktur Midtrans {order_id} lunas! Saldo tenant {tenant_id} bertambah {inv_amount} (TxID: {tx.id})"
        )

    return {"status": "ok", "order_id": order_id, "transaction_status": transaction_status}


@router.post("/payment/xendit", dependencies=[Depends(webhook_endpoint("xendit"))])
async def handle_xendit_webhook(
    request: Request,
    x_callback_token: Optional[str] = Header(None, alias="x-callback-token"),
):
    """
    Webhook handler resmi untuk notifikasi transaksi Xendit Invoice.
    Memverifikasi x-callback-token sesuai standar keamanan Xendit.
    """
    expected_token = settings.XENDIT_CALLBACK_TOKEN or settings.PAYMENT_GATEWAY_CLIENT_KEY or ""
    if expected_token and x_callback_token != expected_token:
        logger.error("Xendit callback token mismatch!")
        raise HTTPException(status_code=403, detail="Invalid Xendit callback token")

    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Gagal mem-parse JSON payload Xendit: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    external_id = payload.get("external_id")
    status = payload.get("status")
    paid_amount = payload.get("paid_amount") or payload.get("amount")
    payment_id = payload.get("id")

    if not external_id or not status:
        raise HTTPException(status_code=400, detail="Payload Xendit tidak lengkap.")

    engine = get_engine()
    log_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, tenant_id, amount, status
            FROM invoices
            WHERE invoice_number = :inv
            FOR UPDATE;
        """), {"inv": external_id})
        inv_row = res.fetchone()

        if not inv_row:
            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, payment_gateway, event_type, raw_payload, signature_verified, status
                ) VALUES (
                    :id, 'xendit', :event_type, :raw_payload, true, 'invoice_not_found'
                );
            """), {
                "id": log_id,
                "event_type": f"xendit.{status.lower()}",
                "raw_payload": json.dumps(payload),
            })
            return {"status": "ignored", "reason": "Invoice not found"}

        inv_id, tenant_id, inv_amount, inv_status = inv_row
        tenant_id = str(tenant_id)
        inv_amount = Decimal(str(inv_amount))

        is_paid = status in ("PAID", "SETTLED")
        is_failed = status in ("EXPIRED", "FAILED")

        if is_paid and inv_status != "paid":
            await conn.execute(sa.text("""
                UPDATE invoices
                SET status = 'paid',
                    paid_at = now(),
                    payment_reference = :payment_id,
                    updated_at = now()
                WHERE id = :id;
            """), {
                "id": inv_id,
                "payment_id": payment_id or external_id,
            })

            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, tenant_id, invoice_id, payment_gateway, event_type,
                    raw_payload, signature_verified, status
                ) VALUES (
                    :id, :tenant_id, :invoice_id, 'xendit', :event_type,
                    :raw_payload, true, 'settled'
                );
            """), {
                "id": log_id,
                "tenant_id": tenant_id,
                "invoice_id": inv_id,
                "event_type": f"xendit.{status.lower()}",
                "raw_payload": json.dumps(payload),
            })
        elif is_failed:
            await conn.execute(sa.text("""
                UPDATE invoices
                SET status = 'failed',
                    updated_at = now()
                WHERE id = :id;
            """), {"id": inv_id})

            await conn.execute(sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, tenant_id, invoice_id, payment_gateway, event_type,
                    raw_payload, signature_verified, status
                ) VALUES (
                    :id, :tenant_id, :invoice_id, 'xendit', :event_type,
                    :raw_payload, true, 'failed'
                );
            """), {
                "id": log_id,
                "tenant_id": tenant_id,
                "invoice_id": inv_id,
                "event_type": f"xendit.{status.lower()}",
                "raw_payload": json.dumps(payload),
            })

    if is_paid and inv_status != "paid":
        tx = await topup_credit(
            tenant_id=tenant_id,
            amount=inv_amount,
            reference_id=external_id,
            description=f"Top up via Xendit ({external_id})",
            metadata={"payment_id": payment_id, "gateway": "xendit"},
        )
        logger.info(
            f"Faktur Xendit {external_id} lunas! Saldo tenant {tenant_id} bertambah {inv_amount} (TxID: {tx.id})"
        )

    return {"status": "ok", "external_id": external_id, "status": status}


# ============================================================================
# META WHATSAPP WEBHOOK HANDLERS (PRD v2.2 Bagian 10.3 & 10.6)
# ============================================================================

@router.get("/whatsapp", dependencies=[Depends(webhook_endpoint("whatsapp_challenge"))])
async def verify_meta_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """
    Verifikasi handshake webhook resmi Meta WhatsApp Business Cloud API.
    Memeriksa kesesuaian hub.verify_token dengan konfigurasi META_WEBHOOK_VERIFY_TOKEN.
    """
    expected_token = settings.META_WEBHOOK_VERIFY_TOKEN or "orchestre_meta_secure_verify_token_2026"
    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        logger.info("Meta WhatsApp Webhook subscription verified successfully.")
        return PlainTextResponse(content=hub_challenge or "")
    logger.warning("Meta WhatsApp Webhook subscription failed verification.")
    raise HTTPException(status_code=403, detail="Forbidden: Verify token mismatch")


@router.post("/whatsapp", dependencies=[Depends(webhook_endpoint("whatsapp"))])
async def handle_whatsapp_webhook(request: Request):
    """
    Menerima incoming message webhook dari Meta WhatsApp Cloud API:
    1. Membedakan pesan Proaktif vs Omnichannel berdasarkan phone_number_id
    2. Mendeteksi perintah Opt-Out (STOP / BERHENTI) & Opt-In (START / LANJUT)
    3. Mengirimkan balasan resmi konfirmasi ke pengguna
    """
    try:
        body = await request.json()
    except Exception as e:
        logger.warning(f"Invalid JSON in WhatsApp webhook: {e}")
        return {"status": "ignored", "reason": "invalid_json"}

    entry = body.get("entry", [])
    if not entry:
        return {"status": "ok"}

    for ent in entry:
        for change in ent.get("changes", []):
            val = change.get("value", {})
            metadata = val.get("metadata", {})
            incoming_phone_id = metadata.get("phone_number_id")
            messages = val.get("messages", [])

            for msg in messages:
                sender_raw = msg.get("from", "")
                formatted_sender = "+" + sender_raw if not sender_raw.startswith("+") else sender_raw
                msg_type = msg.get("type")

                if msg_type == "text":
                    body_text = msg.get("text", {}).get("body", "").strip()
                    upper_text = body_text.upper()

                    # Cek apakah nomor penerima adalah nomor Proaktif resmi platform
                    proactive_phone_id = settings.WA_PROACTIVE_PHONE_NUMBER_ID
                    is_proactive_channel = (incoming_phone_id == proactive_phone_id)

                    # Tangani perintah Opt-Out (STOP / BERHENTI / UNSUBSCRIBE)
                    if upper_text in ("STOP", "BERHENTI", "UNSUBSCRIBE"):
                        opt_res = await handle_opt_out(
                            channel="whatsapp",
                            destination_target=formatted_sender,
                            keyword=upper_text,
                        )
                        reply_text = (
                            "Pesan notifikasi proaktif OrchestreeAI telah dijeda. "
                            "Anda tidak akan menerima pesan operasional terjadwal sampai Anda mengaktifkannya kembali.\n\n"
                            "Ketik START atau LANJUT untuk mengaktifkan kembali."
                        )
                        if incoming_phone_id and settings.WA_PROACTIVE_ACCESS_TOKEN:
                            await send_whatsapp_message(
                                phone_number_id=incoming_phone_id,
                                access_token=settings.WA_PROACTIVE_ACCESS_TOKEN,
                                recipient_phone=formatted_sender,
                                message_text=reply_text,
                            )
                        logger.info(f"WhatsApp opt-out processed for {formatted_sender}: {opt_res}")

                    # Tangani perintah Opt-In (START / LANJUT / MULAI / RESUME)
                    elif upper_text in ("START", "LANJUT", "MULAI", "RESUME"):
                        opt_res = await handle_opt_in(
                            channel="whatsapp",
                            destination_target=formatted_sender,
                            keyword=upper_text,
                        )
                        reply_text = (
                            "🎉 Layanan notifikasi proaktif OrchestreeAI Anda telah aktif kembali. "
                            "Anda akan menerima ringkasan kerja terjadwal sesuai preferensi organisasi."
                        )
                        if incoming_phone_id and settings.WA_PROACTIVE_ACCESS_TOKEN:
                            await send_whatsapp_message(
                                phone_number_id=incoming_phone_id,
                                access_token=settings.WA_PROACTIVE_ACCESS_TOKEN,
                                recipient_phone=formatted_sender,
                                message_text=reply_text,
                            )
                        logger.info(f"WhatsApp opt-in processed for {formatted_sender}: {opt_res}")

                    else:
                        # Pesan teks lain: Jika dikirim ke kanal proaktif resmi, kirim panduan navigasi
                        if is_proactive_channel and incoming_phone_id and settings.WA_PROACTIVE_ACCESS_TOKEN:
                            guidance_text = (
                                "Terima kasih telah menghubungi Kanal Notifikasi Proaktif OrchestreeAI.\n\n"
                                "Nomor ini difungsikan khusus untuk pengiriman laporan operasional dan peringatan resmi sistem.\n"
                                "• Ketik BERHENTI atau STOP untuk menjeda pesan.\n"
                                "• Gunakan antarmuka web OrchestreeAI untuk berinteraksi dengan AI Workforce Anda."
                            )
                            await send_whatsapp_message(
                                phone_number_id=incoming_phone_id,
                                access_token=settings.WA_PROACTIVE_ACCESS_TOKEN,
                                recipient_phone=formatted_sender,
                                message_text=guidance_text,
                            )

    return {"status": "ok"}


# ============================================================================
# TELEGRAM BOT WEBHOOK HANDLER (PRD v2.2 Bagian 10.3 & 10.6)
# ============================================================================

@router.post("/telegram-bot", dependencies=[Depends(webhook_endpoint("telegram"))])
async def handle_telegram_bot_webhook(request: Request):
    """
    Webhook resmi Telegram Bot platform:
    1. Memverifikasi deep-link command: /start verify_{verification_code}
    2. Memproses protokol Opt-Out (STOP / BERHENTI / /stop) & Opt-In (START / /start)
    3. Memberikan panduan perintah resmi platform
    """
    try:
        update = await request.json()
    except Exception as e:
        logger.warning(f"Invalid JSON in Telegram webhook: {e}")
        return {"status": "ignored"}

    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"status": "ok"}

    chat_id = msg.get("chat", {}).get("id")
    text = (msg.get("text") or "").strip()
    from_user = msg.get("from", {})

    if not chat_id or not text:
        return {"status": "ok"}

    bot_token = settings.TELEGRAM_BOT_TOKEN or settings.TELEGRAM_OFFICIAL_BOT_TOKEN or ""

    # 1. Penanganan Deep-Link Verifikasi: /start verify_{code}
    if text.startswith("/start verify_"):
        code_part = text.split("verify_")[1].strip().split()[0]
        res = await verify_telegram_start(
            chat_id=chat_id,
            verification_code=code_part,
            telegram_user_meta=from_user,
        )
        if not res.get("success"):
            err_msg = (
                f"❌ <b>Verifikasi Tautan Gagal:</b>\n"
                f"{res.get('error', 'Kode verifikasi tidak valid atau telah kedaluwarsa.')}\n\n"
                f"Silakan buat tautan baru melalui dashboard OrchestreeAI Anda."
            )
            await send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=err_msg)
        return {"status": "ok", "action": "verify_telegram", "result": res}

    # 2. Penanganan Opt-Out (STOP / BERHENTI / /stop)
    upper_text = text.upper()
    if upper_text in ("STOP", "BERHENTI", "/STOP", "UNSUBSCRIBE"):
        opt_res = await handle_opt_out(
            channel="telegram",
            destination_target=str(chat_id),
            keyword=upper_text,
        )
        reply = (
            "<b>Pengiriman Notifikasi Dijeda</b>\n"
            "Anda telah menjeda pengiriman pesan proaktif ke akun Telegram ini.\n\n"
            "Ketik <b>START</b> atau <b>LANJUT</b> kapan saja untuk mengaktifkannya kembali."
        )
        await send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=reply)
        return {"status": "ok", "action": "opt_out", "result": opt_res}

    # 3. Penanganan Opt-In (START / LANJUT / /start)
    if upper_text in ("START", "LANJUT", "MULAI", "RESUME") or text == "/start":
        opt_res = await handle_opt_in(
            channel="telegram",
            destination_target=str(chat_id),
            keyword=upper_text,
        )
        reply = (
            "<b>🎉 Kanal Telegram Aktif</b>\n"
            "Notifikasi proaktif dan ringkasan kerja harian Anda aktif kembali."
        )
        await send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=reply)
        return {"status": "ok", "action": "opt_in", "result": opt_res}

    # 4. Command bantuan umum
    help_reply = (
        "<b>Bot Resmi Proaktif OrchestreeAI</b>\n\n"
        "Bot ini digunakan untuk mengirimkan pembaruan operasional, jadwal, dan peringatan kritis platform.\n\n"
        "<i>Perintah Tersedia:</i>\n"
        "• <b>STOP</b> / <b>BERHENTI</b>: Jeda notifikasi Telegram\n"
        "• <b>START</b> / <b>LANJUT</b>: Aktifkan notifikasi kembali"
    )
    await send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=help_reply)
    return {"status": "ok"}

