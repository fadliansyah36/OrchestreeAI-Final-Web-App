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
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine
from app.domains.billing.credits import topup_credit

logger = logging.getLogger("orchestree.api.webhooks")

router = APIRouter(prefix="/api/v1/webhooks/payment", tags=["Payment Webhooks"])


@router.post("/midtrans")
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


@router.post("/xendit")
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
