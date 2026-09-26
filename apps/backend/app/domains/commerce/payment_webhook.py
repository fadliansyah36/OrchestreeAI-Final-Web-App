"""
OrchestreeAI Payment Webhook Handler (PRD v2.2 Bagian 12.5)
SATU-SATUNYA sumber kebenaran status 'paid' adalah webhook resmi yang tervalidasi signature kriptografis.
AI Agent Closer DILARANG KERAS menandai pesanan 'paid' secara manual.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Dict, Any, Tuple, Optional

try:
    import sqlalchemy as sa
    from sqlalchemy.orm import Session
except ImportError:  # allowlist: sqlalchemy shim
    class _SafeSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _SafeSA()
    Session = Any  # type: ignore

from app.core.config import settings
from app.core.database import get_engine

logger = logging.getLogger("orchestree.commerce.payment_webhook")


def verify_midtrans_signature(
    order_id: str,
    status_code: str,
    gross_amount: str,
    server_key: str,
    received_signature: str,
) -> bool:
    """
    Validasi signature Midtrans SHA512:
    SHA512(order_id + status_code + gross_amount + ServerKey)
    """
    if not server_key or not received_signature:
        return False
    raw_str = f"{order_id}{status_code}{gross_amount}{server_key}"
    computed = hashlib.sha512(raw_str.encode("utf-8")).hexdigest()
    return hmac.compare_digest(computed.lower(), received_signature.lower())


def verify_xendit_webhook_token(
    callback_token: str,
    server_token: str,
) -> bool:
    """
    Validasi callback token Xendit header (x-callback-token).
    """
    if not server_token or not callback_token:
        return False
    return hmac.compare_digest(callback_token, server_token)


async def handle_payment_webhook(
    db_session: Optional[Session] = None,
    gateway_provider: str = "midtrans",
    payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    server_key: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Memproses webhook pembayaran resmi dan memvalidasi integritas signature kriptografis.
    Bila signature valid dan status pembayaran sukses, pesanan (orders) diperbarui menjadi 'PAID'
    atau faktur (invoices) diselesaikan dengan alur Entitlement penuh via process_invoice_settlement().
    Bila signature tidak valid, webhook dicatat sebagai SIGNATURE_INVALID dan status tidak berubah.
    """
    # Dukungan pemanggilan fleksibel jika db_session berupa string gateway_provider
    if isinstance(db_session, str):
        actual_gateway = db_session
        actual_payload = gateway_provider if isinstance(gateway_provider, dict) else (payload or {})
        actual_headers = payload if isinstance(payload, dict) else (headers or {})
        actual_server_key = headers if isinstance(headers, str) else (server_key or "")
        return await _execute_payment_webhook_pipeline(
            db_session=None,
            gateway_provider=actual_gateway,
            payload=actual_payload,
            headers=actual_headers,
            server_key=actual_server_key,
            tenant_id=tenant_id,
        )

    return await _execute_payment_webhook_pipeline(
        db_session=db_session,
        gateway_provider=gateway_provider,
        payload=payload or {},
        headers=headers or {},
        server_key=server_key,
        tenant_id=tenant_id,
    )


async def _execute_payment_webhook_pipeline(
    db_session: Optional[Session],
    gateway_provider: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    server_key: Optional[str],
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    effective_server_key = (
        server_key
        or settings.MIDTRANS_SERVER_KEY
        or settings.PAYMENT_GATEWAY_SERVER_KEY
        or ""
    )
    gateway_lower = gateway_provider.lower()
    order_number = ""
    external_tx_id = ""
    is_valid_sig = False
    received_sig = ""
    target_payment_status = "PENDING"
    amount = 0.0

    if gateway_lower == "midtrans":
        order_number = payload.get("order_id", "")
        status_code = payload.get("status_code", "")
        gross_amount = payload.get("gross_amount", "")
        external_tx_id = payload.get("transaction_id", "")
        received_sig = payload.get("signature_key", "")
        amount = float(gross_amount or 0)

        is_valid_sig = verify_midtrans_signature(
            order_id=order_number,
            status_code=status_code,
            gross_amount=gross_amount,
            server_key=effective_server_key,
            received_signature=received_sig,
        )

        tx_status = payload.get("transaction_status", "")
        fraud_status = payload.get("fraud_status", "accept")

        if tx_status in ("capture", "settlement") and fraud_status == "accept":
            target_payment_status = "PAID"
        elif tx_status == "pending":
            target_payment_status = "PENDING"
        elif tx_status in ("deny", "cancel", "expire", "failure"):
            target_payment_status = "FAILED"
        elif tx_status == "refund":
            target_payment_status = "REFUNDED"

    elif gateway_lower == "xendit":
        order_number = payload.get("external_id", "")
        external_tx_id = payload.get("id", "")
        received_sig = headers.get("x-callback-token", "")
        is_valid_sig = verify_xendit_webhook_token(received_sig, effective_server_key)
        amount = float(payload.get("amount", 0))

        status_xendit = payload.get("status", "").upper()
        if status_xendit in ("PAID", "SETTLED", "COMPLETED"):
            target_payment_status = "PAID"
        elif status_xendit == "PENDING":
            target_payment_status = "PENDING"
        elif status_xendit in ("EXPIRED", "FAILED"):
            target_payment_status = "FAILED"
    else:
        logger.warning(f"Gateway {gateway_provider} tidak didukung untuk verifikasi webhook.")
        return {
            "success": False,
            "status": "UNSUPPORTED_GATEWAY",
            "message": f"Gateway {gateway_provider} tidak didukung.",
        }

    processing_status = "PROCESSED" if is_valid_sig else "SIGNATURE_INVALID"
    error_msg = None if is_valid_sig else "Signature kriptografis webhook tidak cocok dengan Server Key resmi."

    engine = get_engine()

    # Eksekusi dengan engine async begin
    async with engine.begin() as conn:
        # 1. Catat log ke payment_webhooks_log
        log_query = sa.text("""
            INSERT INTO payment_webhooks_log (
                tenant_id, gateway_provider, external_transaction_id, order_number,
                event_type, payload, signature_received, is_signature_valid,
                processing_status, error_message, received_at
            ) VALUES (
                :tenant_id, :gateway_provider, :external_tx_id, :order_number,
                :event_type, :payload, :received_sig, :is_valid_sig,
                :processing_status, :error_msg, now()
            ) RETURNING id;
        """)
        await conn.execute(
            log_query,
            {
                "tenant_id": tenant_id,
                "gateway_provider": gateway_provider.upper(),
                "external_tx_id": external_tx_id,
                "order_number": order_number,
                "event_type": payload.get("transaction_status") or payload.get("status", "unknown"),
                "payload": json.dumps(payload),
                "received_sig": received_sig,
                "is_valid_sig": is_valid_sig,
                "processing_status": processing_status,
                "error_msg": error_msg,
            },
        )

        if not is_valid_sig:
            logger.error(f"Peringatan: Webhook signature tidak valid diterima untuk {order_number}.")
            return {
                "success": False,
                "status": "SIGNATURE_INVALID",
                "order_number": order_number,
                "message": "Signature verifikasi webhook tidak valid.",
            }

        # 2. Temukan pesanan terkait di tabel orders
        order_query = sa.text("""
            SELECT id, tenant_id, order_number, total_amount, payment_status, conversation_id
            FROM orders
            WHERE order_number = :order_number
            LIMIT 1;
        """)
        order_res = await conn.execute(order_query, {"order_number": order_number})
        order_row = order_res.mappings().first()

        # 3. Jika bukan di orders, cari di tabel invoices (Billing & Entitlement)
        invoice_row = None
        if not order_row:
            inv_query = sa.text("""
                SELECT id, tenant_id, invoice_number, amount, status
                FROM invoices
                WHERE invoice_number = :order_number
                LIMIT 1;
            """)
            inv_res = await conn.execute(inv_query, {"order_number": order_number})
            invoice_row = inv_res.mappings().first()

        if not order_row and not invoice_row:
            logger.warning(f"Nomor referensi {order_number} tidak ditemukan di orders maupun invoices.")
            return {
                "success": False,
                "status": "REFERENCE_NOT_FOUND",
                "order_number": order_number,
                "message": f"Transaksi referensi {order_number} tidak ditemukan di database.",
            }

        # Penanganan Kasus Orders (Commerce)
        if order_row:
            resolved_tenant_id = order_row["tenant_id"]
            order_id = order_row["id"]
            conversation_id = order_row["conversation_id"]

            if target_payment_status == "PAID":
                await conn.execute(
                    sa.text("""
                        UPDATE orders
                        SET payment_status = 'PAID',
                            status = 'CONFIRMED',
                            updated_at = now()
                        WHERE id = :order_id;
                    """),
                    {"order_id": order_id},
                )

                await conn.execute(
                    sa.text("""
                        INSERT INTO payments (
                            tenant_id, order_id, payment_reference, gateway_provider,
                            payment_method, amount, currency, status, gateway_response,
                            signature_hash, paid_at, created_at, updated_at
                        ) VALUES (
                            :tenant_id, :order_id, :ref, :provider,
                            :method, :amount, 'IDR', 'PAID', :resp,
                            :sig_hash, now(), now(), now()
                        )
                        ON CONFLICT (tenant_id, payment_reference) DO UPDATE
                        SET status = 'PAID',
                            paid_at = now(),
                            gateway_response = EXCLUDED.gateway_response,
                            updated_at = now();
                    """),
                    {
                        "tenant_id": resolved_tenant_id,
                        "order_id": order_id,
                        "ref": external_tx_id or f"PAY_{order_number}",
                        "provider": gateway_provider.upper(),
                        "method": payload.get("payment_type") or payload.get("payment_method", "GATEWAY"),
                        "amount": amount or float(order_row["total_amount"]),
                        "resp": json.dumps(payload),
                        "sig_hash": received_sig,
                    },
                )

                if conversation_id:
                    await conn.execute(
                        sa.text("""
                            UPDATE conversations
                            SET sales_stage = 'ORDER_CONFIRMED',
                                updated_at = now()
                            WHERE id = :conv_id;
                        """),
                        {"conv_id": conversation_id},
                    )

                # Update matching payment_reconciliation_cases
                await conn.execute(
                    sa.text("""
                        UPDATE payment_reconciliation_cases
                        SET resolution_status = 'verified_matched',
                            gateway_status_latest = :gw_status,
                            resolved_at = now(),
                            resolution_notes = 'Pesanan terkonfirmasi dan berhasil diselesaikan melalui rekonsiliasi resmi.'
                        WHERE (order_id = :order_id OR gateway_reference_id = :order_number)
                          AND resolution_status IN ('open', 'verified_mismatch_escalated');
                    """),
                    {
                        "order_id": order_id,
                        "order_number": order_number,
                        "gw_status": payload.get("transaction_status", "settlement"),
                    },
                )

            elif target_payment_status in ("FAILED", "EXPIRED"):
                await conn.execute(
                    sa.text("""
                        UPDATE orders
                        SET payment_status = :status,
                            updated_at = now()
                        WHERE id = :order_id;
                    """),
                    {"status": target_payment_status, "order_id": order_id},
                )

            logger.info(f"Webhook berhasil diproses untuk pesanan {order_number}, payment_status: {target_payment_status}")
            return {
                "success": True,
                "status": target_payment_status,
                "order_number": order_number,
                "order_id": str(order_id),
                "verified_signature": True,
            }

        # Penanganan Kasus Invoices (Billing & Entitlement Alokasi Kredit)
        if invoice_row:
            inv_id = invoice_row["id"]
            inv_tenant_id = invoice_row["tenant_id"]
            inv_status = invoice_row["status"]

            if target_payment_status == "PAID" and inv_status != "paid":
                await conn.execute(
                    sa.text("""
                        UPDATE invoices
                        SET status = 'paid',
                            paid_at = now(),
                            payment_reference = :ref,
                            updated_at = now()
                        WHERE id = :inv_id;
                    """),
                    {"inv_id": inv_id, "ref": external_tx_id or order_number},
                )

                # Jalankan Entitlement + Credit Allocation melalui alur resmi
                from app.domains.billing.lifecycle import process_invoice_settlement
                settle_res = await process_invoice_settlement(
                    invoice_number=order_number,
                    payment_reference=external_tx_id or order_number,
                    payment_gateway=gateway_provider.lower(),
                    raw_payload=payload,
                )

                # Update matching payment_reconciliation_cases
                await conn.execute(
                    sa.text("""
                        UPDATE payment_reconciliation_cases
                        SET resolution_status = 'verified_matched',
                            gateway_status_latest = :gw_status,
                            resolved_at = now(),
                            resolution_notes = 'Faktur lunas. Entitlement paket & alokasi kredit berhasil diaktifkan otomatis.'
                        WHERE (invoice_id = :inv_id OR gateway_reference_id = :order_number)
                          AND resolution_status IN ('open', 'verified_mismatch_escalated');
                    """),
                    {
                        "inv_id": inv_id,
                        "order_number": order_number,
                        "gw_status": payload.get("transaction_status", "settlement"),
                    },
                )

                logger.info(f"Webhook faktur {order_number} lunas: {settle_res}")

            elif target_payment_status in ("FAILED", "EXPIRED"):
                await conn.execute(
                    sa.text("""
                        UPDATE invoices
                        SET status = 'failed',
                            updated_at = now()
                        WHERE id = :inv_id;
                    """),
                    {"inv_id": inv_id},
                )

            return {
                "success": True,
                "status": target_payment_status,
                "invoice_number": order_number,
                "invoice_id": str(inv_id),
                "verified_signature": True,
            }
