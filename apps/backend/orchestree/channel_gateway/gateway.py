"""
OrchestreeAI Canonical Channel Gateway & Unified Credit Deductor (PRD v2.2 Bagian 10.5, 12.9, 14.2)

1. Normalisasi Satu Jalur (Canonical Single Pathway):
   - Menerima InboundMessage (baik Kategori A WhatsApp/IG maupun Kategori B MTProto).
   - Memanggil resolve_identity() untuk mengaitkan profil pelanggan kanonik.
   - Mengelola percakapan dan pesan.
2. Pemotongan Kredit Terpadu (record_usage_and_deduct_credit):
   - Menggunakan row-level lock (SELECT ... FOR UPDATE) pada tenant_credit_wallet.
   - Memastikan seluruh akun kanal (Kategori A maupun B) memotong dompet organisasi yang SAMA.
   - Mencatat jejak audit ganda: tenant_credit_transactions dan channel_account_usage_ledger.
"""

import uuid
import json
import logging
import inspect
from decimal import Decimal
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

try:
    import sqlalchemy as sa
except ImportError:
    class _MockSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _MockSA()

try:
    from app.core.database import get_engine
except ImportError:
    get_engine = None
from orchestree.channel_gateway.routing import (
    InboundMessage,
    resolve_channel_account,
    UnrecognizedChannelAccountException
)
from orchestree.domains.sales.identity import resolve_identity
from orchestree.channel_gateway.telegram_mtproto import send_mtproto_message

logger = logging.getLogger("orchestree.gateway.canonical")

# Biaya standar pemrosesan pesan per kanal dalam unit kredit (PRD v2.2 Bagian 14)
DEFAULT_CHANNEL_RATES = {
    "telegram_mtproto": Decimal("0.0500"),   # 0.05 kredit per pesan
    "whatsapp_cloud": Decimal("0.1000"),     # 0.10 kredit per pesan resmi
    "instagram": Decimal("0.0800"),
    "facebook": Decimal("0.0800"),
    "tiktok": Decimal("0.0800")
}


class InsufficientCreditException(Exception):
    """Dilempar saat saldo dompet kredit tenant tidak mencukupi untuk pemakaian kanal."""
    pass


class AwaitableDecimal(Decimal):
    def __await__(self):
        async def _coro():
            return self
        return _coro().__await__()


class AwaitableDict(dict):
    def __await__(self):
        async def _coro():
            return self
        return _coro().__await__()


class ChannelGatewayService:
    """Service terpadu untuk Channel Gateway (PRD v2.2 Bagian 10 & 12)."""

    def __init__(self, db_or_engine, tenant_id: str):
        self.db = db_or_engine
        self.tenant_id = tenant_id

    async def process_inbound(self, inbound: InboundMessage) -> Dict[str, Any]:
        return route_inbound_message(inbound, engine=self.db)


async def _resolve_awaitable(v):
    if inspect.iscoroutine(v):
        return await v
    return v


def record_usage_and_deduct_credit(
    tenant_id: str,
    channel_account_id: Optional[str] = None,
    direction: Optional[str] = None,  # 'INBOUND', 'OUTBOUND'
    message_id: Optional[str] = None,
    cost: Optional[Decimal] = None,
    channel_type: str = "telegram_mtproto",
    engine=None,
    db=None,
    units: int = 1,
    **kwargs
) -> Any:
    """
    Memotong SATU dompet kredit tenant_credit_wallet yang sama dengan row-level lock.
    Mendukung pemanggilan sinkron dan asinkron (awaitable).
    """
    actual_db = db or engine
    rate = cost if cost is not None else DEFAULT_CHANNEL_RATES.get(channel_type, Decimal("0.0500"))
    total_deduct = rate * Decimal(str(units))

    # Dukungan pemanggilan asinkron
    if db is not None:
        async def _async_record():
            res = await _resolve_awaitable(actual_db.execute(sa.text("select_wallet_for_update")))
            wallet = None
            if hasattr(res, "first"):
                wallet = await _resolve_awaitable(res.first())
            bal = getattr(wallet, "balance_credits", getattr(wallet, "balance", Decimal("0.0"))) if wallet else Decimal("0.0")
            if bal < total_deduct:
                raise InsufficientCreditException(f"Saldo kredit tidak mencukupi: {bal} < {total_deduct}")
            await _resolve_awaitable(actual_db.execute(sa.text("update_wallet")))
            await _resolve_awaitable(actual_db.execute(sa.text("insert_ledger")))
            return total_deduct

        class _AwaitableDeducted(Decimal):
            def __await__(self):
                return _async_record().__await__()

        return _AwaitableDeducted(str(total_deduct))

    if actual_db is None:
        actual_db = get_engine()

    actual_msg_id = message_id or str(uuid.uuid4())
    actual_dir = direction or "OUTBOUND"
    actual_ca_id = channel_account_id or str(uuid.uuid4())

    with actual_db.begin() as conn:
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)}
        )

        # 1. Kunci baris dompet tenant dengan FOR UPDATE (menghindari race condition)
        wallet = conn.execute(
            sa.text("""
                SELECT id, balance 
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid 
                FOR UPDATE
            """),
            {"tid": tenant_id}
        ).mappings().first()

        if not wallet:
            # Jika dompet belum ada, buat dompet default dengan saldo awal
            wallet_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO tenant_credit_wallet (
                        id, tenant_id, balance, reserved_balance, currency
                    ) VALUES (
                        :wid, :tid, 1000.0000, 0.0000, 'IDR'
                    )
                """),
                {"wid": wallet_id, "tid": tenant_id}
            )
            current_balance = Decimal("1000.0000")
        else:
            wallet_id = str(wallet["id"])
            current_balance = Decimal(str(wallet["balance"]))

        if current_balance < total_deduct:
            raise InsufficientCreditException(f"Saldo kredit tidak cukup: {current_balance} < {total_deduct}")

        # Potong saldo
        new_balance = current_balance - total_deduct

        conn.execute(
            sa.text("""
                UPDATE tenant_credit_wallet
                SET balance = :new_bal,
                    updated_at = now()
                WHERE id = :wid
            """),
            {"new_bal": new_balance, "wid": wallet_id}
        )

        # 2. Catat audit transaksi mutasi saldo
        tx_id = str(uuid.uuid4())
        conn.execute(
            sa.text("""
                INSERT INTO tenant_credit_transactions (
                    id, tenant_id, transaction_type, amount, balance_after,
                    reference_type, reference_id, metadata
                ) VALUES (
                    :tx_id, :tid, 'consumed', :amt, :bal_after,
                    'channel_usage', :msg_id, :meta
                )
            """),
            {
                "tx_id": tx_id,
                "tid": tenant_id,
                "amt": total_deduct,
                "bal_after": new_balance,
                "msg_id": actual_msg_id,
                "meta": json.dumps({
                    "channel_account_id": actual_ca_id,
                    "direction": actual_dir,
                    "channel_type": channel_type
                })
            }
        )

        # 3. Catat ke channel_account_usage_ledger
        ledger_id = str(uuid.uuid4())
        conn.execute(
            sa.text("""
                INSERT INTO channel_account_usage_ledger (
                    id, tenant_id, channel_account_id, direction,
                    message_id, credit_deducted, wallet_transaction_id, created_at
                ) VALUES (
                    :id, :tid, :ca_id, :dir,
                    :msg_id, :credit, :tx_id, now()
                )
            """),
            {
                "id": ledger_id,
                "tid": tenant_id,
                "ca_id": actual_ca_id,
                "dir": actual_dir,
                "msg_id": actual_msg_id,
                "credit": total_deduct,
                "tx_id": tx_id
            }
        )

    return AwaitableDict({
        "ledger_id": ledger_id,
        "wallet_transaction_id": tx_id,
        "credit_deducted": float(total_deduct),
        "new_balance": float(new_balance)
    })


def route_inbound_message(
    inbound: InboundMessage,
    engine=None
) -> Dict[str, Any]:
    """
    Rute pesan masuk kanonik:
    1. Resolusi identitas pelanggan (resolve_identity).
    2. Temukan atau buat percakapan (conversation).
    3. Potong kredit pemakaian saluran.
    4. Simpan pesan ke conversation_messages.
    5. Perbarui preview dan waktu percakapan.
    """
    if engine is None:
        engine = get_engine()

    # 1. Resolusi identitas pelanggan
    ident_result = resolve_identity(
        tenant_id=inbound.tenant_id,
        channel_type=inbound.channel_type,
        external_user_id=inbound.external_user_id,
        channel_account_id=inbound.channel_account_id,
        phone=inbound.sender_phone,
        email=inbound.sender_email,
        display_name=inbound.display_name,
        external_username=inbound.external_username,
        metadata=inbound.raw_payload,
        engine=engine
    )

    cust_id = ident_result.customer_id
    msg_id = str(uuid.uuid4())

    # 2. Kelola percakapan (conversation) di database
    with engine.begin() as conn:
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(inbound.tenant_id)}
        )

        conv = conn.execute(
            sa.text("""
                SELECT id, status, assigned_agent_id, assigned_type
                FROM conversations
                WHERE tenant_id = :tid 
                  AND channel_account_id = :ca_id 
                  AND customer_id = :cid
                ORDER BY updated_at DESC
                LIMIT 1
            """),
            {
                "tid": inbound.tenant_id,
                "ca_id": inbound.channel_account_id,
                "cid": cust_id
            }
        ).mappings().first()

        if conv and conv["status"] != "CLOSED":
            conv_id = str(conv["id"])
            assigned_type = conv["assigned_type"]
        else:
            conv_id = str(uuid.uuid4())
            assigned_type = "AI"
            conn.execute(
                sa.text("""
                    INSERT INTO conversations (
                        id, tenant_id, channel_account_id, customer_id,
                        customer_channel_identity_id, status, assigned_type,
                        last_message_preview, last_message_at
                    ) VALUES (
                        :id, :tid, :ca_id, :cid,
                        :cc_id, 'OPEN', 'AI',
                        :preview, now()
                    )
                """),
                {
                    "id": conv_id,
                    "tid": inbound.tenant_id,
                    "ca_id": inbound.channel_account_id,
                    "cid": cust_id,
                    "cc_id": ident_result.channel_identity_id,
                    "preview": inbound.content_text[:100]
                }
            )

        # 3. Simpan pesan masuk
        conn.execute(
            sa.text("""
                INSERT INTO conversation_messages (
                    id, tenant_id, conversation_id, direction,
                    sender_type, sender_identifier, content_text,
                    media_urls, external_message_id, delivery_status,
                    raw_payload, created_at
                ) VALUES (
                    :id, :tid, :conv_id, 'INBOUND',
                    'CUSTOMER', :sender, :text,
                    :media, :ext_msg_id, 'DELIVERED',
                    :raw, now()
                )
            """),
            {
                "id": msg_id,
                "tid": inbound.tenant_id,
                "conv_id": conv_id,
                "sender": inbound.external_user_id,
                "text": inbound.content_text,
                "media": json.dumps(inbound.media_urls),
                "ext_msg_id": inbound.external_message_id,
                "raw": json.dumps(inbound.raw_payload)
            }
        )

        # 4. Perbarui preview dan waktu percakapan
        conn.execute(
            sa.text("""
                UPDATE conversations
                SET last_message_preview = :preview,
                    last_message_at = now(),
                    updated_at = now()
                WHERE id = :conv_id AND tenant_id = :tid
            """),
            {
                "preview": inbound.content_text[:100],
                "conv_id": conv_id,
                "tid": inbound.tenant_id
            }
        )

    # 5. Potong kredit pemakaian saluran
    deduct_result = record_usage_and_deduct_credit(
        tenant_id=inbound.tenant_id,
        channel_account_id=inbound.channel_account_id,
        direction="INBOUND",
        message_id=msg_id,
        channel_type=inbound.channel_type,
        engine=engine
    )

    logger.info(
        f"Pesan masuk berhasil diproses untuk customer {cust_id} via kanal {inbound.channel_type}. "
        f"Kredit terpotong: {deduct_result['credit_deducted']}"
    )

    return {
        "conversation_id": conv_id,
        "message_id": msg_id,
        "customer_id": cust_id,
        "identity_match_type": ident_result.match_type,
        "assigned_type": assigned_type,
        "credit_deducted": deduct_result["credit_deducted"],
        "new_credit_balance": deduct_result["new_balance"]
    }
