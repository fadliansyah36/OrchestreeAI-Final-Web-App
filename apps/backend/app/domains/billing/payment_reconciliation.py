"""
OrchestreeAI Payment Reconciliation Domain Engine (PRD v2.2 Bagian 2, 3.5, 12.5, 14.3)
Sistem rekonsiliasi pembayaran untuk menangani kasus:
- Tenant telah membayar di gateway Midtrans, namun webhook gagal/terlambat diterima backend.
- Memverifikasi kebenaran secara nyata ke API Get Transaction Status Midtrans (bukan asumsi).
- Entitlement (aktivasi paket + alokasi kredit) HANYA dieksekusi lewat handle_payment_webhook().
- Deteksi otomatis transaksi pending yang sudah lunas di gateway.
"""

import base64
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List

import httpx
import sqlalchemy as sa
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_engine
from app.domains.commerce.payment_webhook import (
    handle_payment_webhook,
    verify_midtrans_signature,
)

logger = logging.getLogger("orchestree.billing.reconciliation")


class MidtransStatusResult(BaseModel):
    status_code: str
    status: str  # settlement, capture, pending, expire, deny, cancel, not_found, error
    fraud_status: str = "accept"
    gross_amount: str = "0"
    transaction_id: Optional[str] = None
    order_id: str
    payment_type: str = "bank_transfer"
    raw_response: Dict[str, Any] = Field(default_factory=dict)
    is_success: bool = False


class ReconciliationResult(BaseModel):
    case_id: str
    gateway_status: str
    resolution_status: str
    message: Optional[str] = None


class MidtransClient:
    """
    Klien HTTP resmi untuk interaksi langsung ke API Midtrans.
    Sumber kebenaran transaksi status resmi gateway.
    """
    def __init__(self, server_key: Optional[str] = None, is_production: Optional[bool] = None):
        self.server_key = (
            server_key
            or settings.MIDTRANS_SERVER_KEY
            or settings.PAYMENT_GATEWAY_SERVER_KEY
            or "SB-Mid-server-sandbox-test-key"
        )
        self.is_production = is_production if is_production is not None else settings.MIDTRANS_IS_PRODUCTION
        self.base_url = "https://api.midtrans.com" if self.is_production else "https://api.sandbox.midtrans.com"

    def _get_auth_header(self) -> str:
        encoded = base64.b64encode(f"{self.server_key}:".encode("utf-8")).decode("utf-8")
        return f"Basic {encoded}"

    async def get_transaction_status(self, order_id_or_ref: str) -> MidtransStatusResult:
        """
        Panggil Midtrans Get Transaction Status API:
        GET /v2/{order_id}/status
        """
        url = f"{self.base_url}/v2/{order_id_or_ref}/status"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": self._get_auth_header(),
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    tx_status = data.get("transaction_status", "pending")
                    fraud_status = data.get("fraud_status", "accept")
                    return MidtransStatusResult(
                        status_code=str(data.get("status_code", "200")),
                        status=tx_status,
                        fraud_status=fraud_status,
                        gross_amount=str(data.get("gross_amount", "0")),
                        transaction_id=data.get("transaction_id"),
                        order_id=order_id_or_ref,
                        payment_type=data.get("payment_type", "bank_transfer"),
                        raw_response=data,
                        is_success=tx_status in ("settlement", "capture") and fraud_status == "accept",
                    )
                elif resp.status_code == 404:
                    return MidtransStatusResult(
                        status_code="404",
                        status="not_found",
                        order_id=order_id_or_ref,
                        raw_response={"message": "Transaksi tidak ditemukan di gateway"},
                        is_success=False,
                    )
                else:
                    return MidtransStatusResult(
                        status_code=str(resp.status_code),
                        status="error",
                        order_id=order_id_or_ref,
                        raw_response={"error": resp.text},
                        is_success=False,
                    )
        except Exception as exc:
            logger.warning(f"Koneksi ke Midtrans API menghasilkan galat untuk {order_id_or_ref}: {exc}")
            return MidtransStatusResult(
                status_code="500",
                status="network_error",
                order_id=order_id_or_ref,
                raw_response={"error": str(exc)},
                is_success=False,
            )


def build_synthetic_webhook_payload(
    gateway_result: MidtransStatusResult,
    server_key: str,
) -> Dict[str, Any]:
    """
    Menyusun payload webhook sintesis berdasar data terverifikasi dari Midtrans Status API.
    Signature SHA512 dihitung secara valid agar verifikasi kriptografis lolos pada handle_payment_webhook.
    """
    order_id = gateway_result.order_id
    status_code = gateway_result.status_code or "200"
    gross_amount = gateway_result.gross_amount or "0"
    raw_sig = f"{order_id}{status_code}{gross_amount}{server_key}"
    sig = hashlib.sha512(raw_sig.encode("utf-8")).hexdigest()

    return {
        "order_id": order_id,
        "status_code": status_code,
        "gross_amount": gross_amount,
        "transaction_id": gateway_result.transaction_id or f"TX-{order_id}",
        "transaction_status": gateway_result.status,
        "fraud_status": gateway_result.fraud_status,
        "payment_type": gateway_result.payment_type,
        "signature_key": sig,
        "is_reconciliation_synthetic": True,
    }


class PaymentReconciliationRepository:
    """Akses data langsung ke tabel payment_reconciliation_cases dengan Session / Connection."""

    @staticmethod
    async def get(case_id: str) -> Optional[Dict[str, Any]]:
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT c.id, c.tenant_id, c.order_id, c.invoice_id, c.payment_id,
                           c.gateway_reference_id, c.detected_status, c.internal_status_before,
                           c.gateway_status_latest, c.resolution_status, c.resolved_by,
                           c.resolution_notes, c.created_at, c.resolved_at,
                           t.display_name as tenant_name, t.legal_name as tenant_legal_name,
                           inv.invoice_number, inv.amount as invoice_amount,
                           ord.order_number, ord.total_amount as order_amount
                    FROM payment_reconciliation_cases c
                    JOIN tenants t ON t.id = c.tenant_id
                    LEFT JOIN invoices inv ON inv.id = c.invoice_id
                    LEFT JOIN orders ord ON ord.id = c.order_id
                    WHERE c.id = :id
                    LIMIT 1;
                """),
                {"id": case_id},
            )
            row = res.mappings().first()
            return dict(row) if row else None

    @staticmethod
    async def get_by_gateway_ref(ref_id: str) -> Optional[Dict[str, Any]]:
        engine = get_engine()
        async with engine.begin() as conn:
            res = await conn.execute(
                sa.text("""
                    SELECT id, tenant_id, order_id, invoice_id, payment_id,
                           gateway_reference_id, detected_status, internal_status_before,
                           gateway_status_latest, resolution_status, resolved_by,
                           resolution_notes, created_at, resolved_at
                    FROM payment_reconciliation_cases
                    WHERE gateway_reference_id = :ref
                    ORDER BY created_at DESC
                    LIMIT 1;
                """),
                {"ref": ref_id},
            )
            row = res.mappings().first()
            return dict(row) if row else None

    @staticmethod
    async def list_cases(
        tab: str = "error_confirm",
        tenant_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        engine = get_engine()
        async with engine.begin() as conn:
            where_clauses = []
            params: Dict[str, Any] = {"limit": limit, "offset": offset}

            if tenant_id:
                where_clauses.append("c.tenant_id = :tenant_id")
                params["tenant_id"] = tenant_id

            if tab == "success":
                where_clauses.append("c.resolution_status IN ('verified_matched', 'resolved')")
            elif tab == "pending":
                where_clauses.append("c.resolution_status = 'open' AND c.detected_status = 'pending'")
            elif tab == "error_confirm":
                where_clauses.append("c.resolution_status IN ('open', 'verified_mismatch_escalated') AND (c.detected_status = 'error_confirm' OR c.resolution_status = 'verified_mismatch_escalated')")

            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

            query = sa.text(f"""
                SELECT c.id, c.tenant_id, c.order_id, c.invoice_id, c.payment_id,
                       c.gateway_reference_id, c.detected_status, c.internal_status_before,
                       c.gateway_status_latest, c.resolution_status, c.resolved_by,
                       c.resolution_notes, c.created_at, c.resolved_at,
                       t.display_name as tenant_name, t.legal_name as tenant_legal_name,
                       inv.invoice_number, inv.amount as invoice_amount,
                       ord.order_number, ord.total_amount as order_amount
                FROM payment_reconciliation_cases c
                JOIN tenants t ON t.id = c.tenant_id
                LEFT JOIN invoices inv ON inv.id = c.invoice_id
                LEFT JOIN orders ord ON ord.id = c.order_id
                {where_sql}
                ORDER BY c.created_at DESC
                LIMIT :limit OFFSET :offset;
            """)
            res = await conn.execute(query, params)
            return [dict(r) for r in res.mappings().all()]

    @staticmethod
    async def get_counts(tenant_id: Optional[str] = None) -> Dict[str, int]:
        """
        Menghitung transaksi nyata untuk tiga tab monitoring:
        - success: total transaksi paid (dari orders dan invoices)
        - pending: transaksi pending_payment usia di bawah threshold
        - error_confirm: kasus rekonsiliasi aktif yang memerlukan tindak lanjut
        """
        engine = get_engine()
        async with engine.begin() as conn:
            t_filter = "WHERE tenant_id = :t" if tenant_id else ""
            t_params = {"t": tenant_id} if tenant_id else {}

            # 1. Hitung total paid
            q_paid_inv = sa.text(f"SELECT count(*) FROM invoices {t_filter} {'AND' if tenant_id else 'WHERE'} status = 'paid';")
            paid_inv = (await conn.execute(q_paid_inv, t_params)).scalar() or 0

            q_paid_ord = sa.text(f"SELECT count(*) FROM orders {t_filter} {'AND' if tenant_id else 'WHERE'} payment_status = 'PAID';")
            paid_ord = (await conn.execute(q_paid_ord, t_params)).scalar() or 0
            success_count = int(paid_inv + paid_ord)

            # 2. Hitung pending aktual
            q_pend_inv = sa.text(f"SELECT count(*) FROM invoices {t_filter} {'AND' if tenant_id else 'WHERE'} status = 'pending';")
            pend_inv = (await conn.execute(q_pend_inv, t_params)).scalar() or 0

            q_pend_ord = sa.text(f"SELECT count(*) FROM orders {t_filter} {'AND' if tenant_id else 'WHERE'} payment_status IN ('PENDING', 'PAYMENT_PENDING');")
            pend_ord = (await conn.execute(q_pend_ord, t_params)).scalar() or 0
            pending_count = int(pend_inv + pend_ord)

            # 3. Hitung kasus error konfirmasi aktif
            q_cases = sa.text(f"""
                SELECT count(*) FROM payment_reconciliation_cases
                {t_filter}
                {'AND' if tenant_id else 'WHERE'} resolution_status IN ('open', 'verified_mismatch_escalated');
            """)
            error_confirm_count = (await conn.execute(q_cases, t_params)).scalar() or 0

            return {
                "success": success_count,
                "pending": pending_count,
                "error_confirm": int(error_confirm_count),
            }

    @staticmethod
    async def create_case(
        tenant_id: str,
        gateway_reference_id: str,
        detected_status: str,
        internal_status_before: str,
        order_id: Optional[str] = None,
        invoice_id: Optional[str] = None,
        payment_id: Optional[str] = None,
        gateway_status_latest: Optional[str] = None,
        resolution_status: str = "open",
        resolution_notes: Optional[str] = None,
    ) -> str:
        engine = get_engine()
        case_id = str(uuid.uuid4())
        async with engine.begin() as conn:
            await conn.execute(
                sa.text("""
                    INSERT INTO payment_reconciliation_cases (
                        id, tenant_id, order_id, invoice_id, payment_id,
                        gateway_reference_id, detected_status, internal_status_before,
                        gateway_status_latest, resolution_status, resolution_notes,
                        created_at
                    ) VALUES (
                        :id, :tenant_id, :order_id, :invoice_id, :payment_id,
                        :gateway_ref, :detected_status, :internal_before,
                        :gw_latest, :res_status, :notes, now()
                    )
                    ON CONFLICT (id) DO NOTHING;
                """),
                {
                    "id": case_id,
                    "tenant_id": tenant_id,
                    "order_id": order_id,
                    "invoice_id": invoice_id,
                    "payment_id": payment_id,
                    "gateway_ref": gateway_reference_id,
                    "detected_status": detected_status,
                    "internal_before": internal_status_before,
                    "gw_latest": gateway_status_latest,
                    "res_status": resolution_status,
                    "notes": resolution_notes,
                },
            )
        return case_id

    @staticmethod
    async def update_gateway_status(case_id: str, gateway_status: str):
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                sa.text("""
                    UPDATE payment_reconciliation_cases
                    SET gateway_status_latest = :gw_status
                    WHERE id = :id;
                """),
                {"id": case_id, "gw_status": gateway_status},
            )

    @staticmethod
    async def mark_status(case_id: str, status: str, notes: Optional[str] = None):
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                sa.text("""
                    UPDATE payment_reconciliation_cases
                    SET resolution_status = :status,
                        resolution_notes = COALESCE(:notes, resolution_notes)
                    WHERE id = :id;
                """),
                {"id": case_id, "status": status, "notes": notes},
            )

    @staticmethod
    async def mark_resolved(
        case_id: str,
        resolution_status: str,
        actor: str = "system_recheck",
        notes: Optional[str] = None,
        resolved_by: Optional[str] = None,
    ):
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(
                sa.text("""
                    UPDATE payment_reconciliation_cases
                    SET resolution_status = :status,
                        resolution_notes = :notes,
                        resolved_by = :resolved_by,
                        resolved_at = now()
                    WHERE id = :id;
                """),
                {
                    "id": case_id,
                    "status": resolution_status,
                    "notes": notes,
                    "resolved_by": resolved_by,
                },
            )


# Instansiasi repo dan klien Midtrans
payment_reconciliation_repo = PaymentReconciliationRepository()
midtrans_client = MidtransClient()


async def recheck_payment_status(reconciliation_case_id: str) -> ReconciliationResult:
    """
    BAGIAN B — LOGIC RE-CHECK KE MIDTRANS (Wajib Verifikasi Nyata, Bukan Percaya Klaim)
    Memeriksa status mutakhir langsung ke API Midtrans.
    Jika settlement/capture: memanggil handle_payment_webhook() dengan payload sintesis resmi.
    """
    case = await payment_reconciliation_repo.get(reconciliation_case_id)
    if not case:
        raise ValueError(f"Kasus rekonsiliasi {reconciliation_case_id} tidak ditemukan.")

    gateway_result = await midtrans_client.get_transaction_status(case["gateway_reference_id"])
    await payment_reconciliation_repo.update_gateway_status(case["id"], gateway_result.status)

    if gateway_result.status in ("settlement", "capture"):
        # Gateway KONFIRMASI sudah bayar, tapi internal masih pending —
        # ini skenario webhook hilang. Jalankan ulang alur entitlement
        # PERSIS seperti handle_payment_webhook() — REUSE
        # fungsi yang sama, JANGAN buat logic entitlement duplikat baru.
        synthetic_payload = build_synthetic_webhook_payload(
            gateway_result, midtrans_client.server_key
        )
        await handle_payment_webhook(
            gateway_provider="midtrans",
            payload=synthetic_payload,
            headers={"x-source": "recheck_payment_status"},
            server_key=midtrans_client.server_key,
            tenant_id=str(case["tenant_id"]),
        )
        await payment_reconciliation_repo.mark_resolved(
            case["id"],
            "verified_matched",
            actor="system_recheck",
            notes="Gateway mengonfirmasi transaksi berstatus settlement/capture. Entitlement berhasil diaktifkan otomatis.",
        )
        res_status = "verified_matched"
    elif gateway_result.status in ("pending",):
        await payment_reconciliation_repo.mark_status(case["id"], "open")
        res_status = "open"
    elif gateway_result.status in ("expire", "deny", "cancel"):
        await payment_reconciliation_repo.mark_status(
            case["id"],
            "verified_mismatch_escalated",
            notes="Gateway melaporkan status transaksi gagal atau kedaluwarsa. Memerlukan investigasi manual Super Admin.",
        )
        res_status = "verified_mismatch_escalated"
    else:
        await payment_reconciliation_repo.mark_status(
            case["id"],
            "open",
            notes=f"Gateway melaporkan status '{gateway_result.status}'. Menunggu konfirmasi lanjutan.",
        )
        res_status = "open"

    return ReconciliationResult(
        case_id=case["id"],
        gateway_status=gateway_result.status,
        resolution_status=res_status,
        message=f"Verifikasi status ke gateway selesai dengan status: {gateway_result.status}",
    )


async def manual_resolve_case(
    case_id: str,
    resolution_status: str,
    resolution_notes: str,
    admin_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Penyelesaian manual oleh Super Admin untuk kasus 'verified_mismatch_escalated'.
    Wajib mengisi resolution_notes dan dicatat ke Audit Ledger dengan risk tier HIGH.
    Bila ditandai 'resolved', entitlement dieksekusi melalui handle_payment_webhook().
    """
    if resolution_status not in ("resolved", "rejected"):
        raise ValueError("Status penyelesaian manual harus 'resolved' atau 'rejected'.")

    if not resolution_notes or len(resolution_notes.strip()) < 5:
        raise ValueError("Catatan penyelesaian (resolution_notes) wajib diisi dengan bukti verifikasi manual.")

    case = await payment_reconciliation_repo.get(case_id)
    if not case:
        raise ValueError(f"Kasus {case_id} tidak ditemukan.")

    engine = get_engine()

    # Catat audit log dengan risk tier HIGH
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("""
                INSERT INTO audit_logs (
                    id, tenant_id, actor_type, actor_id, action,
                    resource_type, resource_id, payload_before, payload_after,
                    created_at
                ) VALUES (
                    gen_random_uuid(), :tenant_id, 'human_user', :actor_id,
                    'commercial.payment_reconciliation.manual_resolve',
                    'payment_reconciliation_cases', :case_id,
                    :before_payload, :after_payload, now()
                );
            """),
            {
                "tenant_id": case["tenant_id"],
                "actor_id": admin_user_id,
                "case_id": case["id"],
                "before_payload": json.dumps({
                    "resolution_status": case["resolution_status"],
                    "gateway_status_latest": case["gateway_status_latest"],
                }),
                "after_payload": json.dumps({
                    "resolution_status": resolution_status,
                    "resolution_notes": resolution_notes,
                    "risk_tier": "HIGH",
                    "resolved_by": admin_user_id,
                }),
            },
        )

    # Bila disetujui secara manual (resolved), jalankan entitlement melalui handle_payment_webhook()
    if resolution_status == "resolved":
        synthetic_result = MidtransStatusResult(
            status_code="200",
            status="settlement",
            fraud_status="accept",
            gross_amount=str(case.get("invoice_amount") or case.get("order_amount") or "0"),
            transaction_id=f"MANUAL-{case['gateway_reference_id']}",
            order_id=case["gateway_reference_id"],
            payment_type="manual_bank_transfer_verified",
            is_success=True,
        )
        synthetic_payload = build_synthetic_webhook_payload(synthetic_result, midtrans_client.server_key)
        await handle_payment_webhook(
            gateway_provider="midtrans",
            payload=synthetic_payload,
            headers={"x-source": "manual_reconciliation_resolve"},
            server_key=midtrans_client.server_key,
            tenant_id=str(case["tenant_id"]),
        )

    await payment_reconciliation_repo.mark_resolved(
        case_id=case_id,
        resolution_status=resolution_status,
        actor="super_admin",
        notes=resolution_notes,
        resolved_by=admin_user_id,
    )

    return {
        "case_id": case_id,
        "resolution_status": resolution_status,
        "resolved_by": admin_user_id,
        "notes": resolution_notes,
    }


async def detect_payment_reconciliation_cases(
    threshold_minutes: int = 15,
) -> Dict[str, Any]:
    """
    BAGIAN C — DETEKSI OTOMATIS KASUS 'SUDAH BAYAR TAPI ERROR'
    Job berkala (Celery Beat):
    Mencari orders / invoices berstatus pending_payment yang usianya > threshold_minutes.
    Untuk setiap transaksi, memverifikasi status ke Midtrans secara otomatis.
    Jika settlement/capture: buat kasus rekonsiliasi dan jalankan entitlement via handle_payment_webhook().
    """
    engine = get_engine()
    now_dt = datetime.now(timezone.utc)
    cutoff_time = now_dt - timedelta(minutes=threshold_minutes)

    detected_count = 0
    resolved_count = 0
    escalated_count = 0

    # 1. Pindai invoices berstatus pending yang melewati batas waktu
    async with engine.begin() as conn:
        res_inv = await conn.execute(
            sa.text("""
                SELECT id, tenant_id, invoice_number, amount, created_at, status
                FROM invoices
                WHERE status = 'pending'
                  AND created_at <= :cutoff
                ORDER BY created_at ASC
                LIMIT 50;
            """),
            {"cutoff": cutoff_time},
        )
        pending_invoices = [dict(r) for r in res_inv.mappings().all()]

        res_ord = await conn.execute(
            sa.text("""
                SELECT id, tenant_id, order_number, total_amount, created_at, payment_status
                FROM orders
                WHERE payment_status IN ('PENDING', 'PAYMENT_PENDING')
                  AND created_at <= :cutoff
                ORDER BY created_at ASC
                LIMIT 50;
            """),
            {"cutoff": cutoff_time},
        )
        pending_orders = [dict(r) for r in res_ord.mappings().all()]

    # Evaluasi invoices
    for inv in pending_invoices:
        ref_id = inv["invoice_number"]
        # Cek apakah sudah ada case terbuka untuk referensi ini
        existing_case = await payment_reconciliation_repo.get_by_gateway_ref(ref_id)
        if existing_case and existing_case["resolution_status"] in ("verified_matched", "resolved", "rejected"):
            continue

        gateway_result = await midtrans_client.get_transaction_status(ref_id)

        if gateway_result.status in ("settlement", "capture"):
            # Webhook hilang terdeteksi! Buat kasus dan selesaikan
            case_id = existing_case["id"] if existing_case else await payment_reconciliation_repo.create_case(
                tenant_id=str(inv["tenant_id"]),
                gateway_reference_id=ref_id,
                detected_status="error_confirm",
                internal_status_before="pending_payment",
                invoice_id=str(inv["id"]),
                gateway_status_latest=gateway_result.status,
                resolution_status="open",
                resolution_notes="Deteksi otomatis: Pembayaran terkonfirmasi lunas di gateway namun status internal masih tertunda.",
            )
            detected_count += 1

            # Selesaikan melalui recheck kanonik
            await recheck_payment_status(case_id)
            resolved_count += 1

        elif gateway_result.status in ("expire", "deny", "cancel"):
            if not existing_case:
                await payment_reconciliation_repo.create_case(
                    tenant_id=str(inv["tenant_id"]),
                    gateway_reference_id=ref_id,
                    detected_status="error_confirm",
                    internal_status_before="pending_payment",
                    invoice_id=str(inv["id"]),
                    gateway_status_latest=gateway_result.status,
                    resolution_status="verified_mismatch_escalated",
                    resolution_notes="Deteksi otomatis: Transaksi telah dibatalkan atau kedaluwarsa di gateway.",
                )
                detected_count += 1
                escalated_count += 1

    # Evaluasi orders
    for ord_item in pending_orders:
        ref_id = ord_item["order_number"]
        existing_case = await payment_reconciliation_repo.get_by_gateway_ref(ref_id)
        if existing_case and existing_case["resolution_status"] in ("verified_matched", "resolved", "rejected"):
            continue

        gateway_result = await midtrans_client.get_transaction_status(ref_id)

        if gateway_result.status in ("settlement", "capture"):
            case_id = existing_case["id"] if existing_case else await payment_reconciliation_repo.create_case(
                tenant_id=str(ord_item["tenant_id"]),
                gateway_reference_id=ref_id,
                detected_status="error_confirm",
                internal_status_before="pending_payment",
                order_id=str(ord_item["id"]),
                gateway_status_latest=gateway_result.status,
                resolution_status="open",
                resolution_notes="Deteksi otomatis: Pesanan telah dibayar di gateway namun webhook belum diterima.",
            )
            detected_count += 1
            await recheck_payment_status(case_id)
            resolved_count += 1

        elif gateway_result.status in ("expire", "deny", "cancel"):
            if not existing_case:
                await payment_reconciliation_repo.create_case(
                    tenant_id=str(ord_item["tenant_id"]),
                    gateway_reference_id=ref_id,
                    detected_status="error_confirm",
                    internal_status_before="pending_payment",
                    order_id=str(ord_item["id"]),
                    gateway_status_latest=gateway_result.status,
                    resolution_status="verified_mismatch_escalated",
                    resolution_notes="Deteksi otomatis: Pesanan berstatus gagal di gateway.",
                )
                detected_count += 1
                escalated_count += 1

    logger.info(
        f"Deteksi otomatis rekonsiliasi selesai: {detected_count} kasus terdeteksi, "
        f"{resolved_count} diselesaikan otomatis via entitlement, {escalated_count} dieskalasi."
    )
    return {
        "status": "completed",
        "scanned_invoices": len(pending_invoices),
        "scanned_orders": len(pending_orders),
        "detected_cases": detected_count,
        "auto_resolved_cases": resolved_count,
        "escalated_cases": escalated_count,
        "threshold_minutes": threshold_minutes,
    }


try:
    from celery import shared_task
except ImportError:
    def shared_task(*args, **kwargs):
        def decorator(func):
            return func
        return decorator


@shared_task(name="detect_payment_reconciliation_cases")
def celery_detect_payment_reconciliation_cases(threshold_minutes: int = 15) -> Dict[str, Any]:
    """
    Entry point Celery Beat berkala setiap 15 menit (PRD v2.2 Bagian 14.3).
    Mendeteksi dan menyelesaikan transaksi lunas di gateway yang terlewat oleh webhook.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(detect_payment_reconciliation_cases(threshold_minutes=threshold_minutes))

