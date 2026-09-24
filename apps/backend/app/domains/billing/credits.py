"""
OrchestreeAI Credit State Machine & Billing Ledger (PRD v2.2 Bagian 14.2)
Mengimplementasikan:
1. reserve_credit()
2. consume_credit()
3. refund_credit()
4. topup_credit()
5. get_wallet()

Menggunakan isolasi transaksi row-level locking (SELECT ... FOR UPDATE) pada tenant_credit_wallet
untuk menjamin ACID, mencegah race conditions, dan memastikan saldo tidak pernah negatif.
"""

import uuid
import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine

logger = logging.getLogger("orchestree.billing.credits")


class InsufficientCreditError(Exception):
    """Dilempar ketika saldo kredit tersedia tidak mencukupi untuk reservasi."""
    pass


class InvalidReservationStateError(Exception):
    """Dilempar ketika state reservasi kredit tidak valid untuk transisi berikutnya."""
    pass


class WalletNotFoundError(Exception):
    """Dilempar ketika dompet kredit organisasi tidak ditemukan."""
    pass


class CreditReservation(BaseModel):
    id: str
    tenant_id: str
    estimated_cost: Decimal
    actual_cost: Optional[Decimal] = None
    status: str  # 'reserved', 'consumed', 'refunded'
    reference_type: str
    reference_id: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CreditTransaction(BaseModel):
    id: str
    tenant_id: str
    reservation_id: Optional[str] = None
    transaction_type: str  # 'reserved', 'consumed', 'refunded', 'topup', 'adjustment'
    amount: Decimal
    balance_after: Decimal
    reference_id: str
    description: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class TenantWallet(BaseModel):
    id: str
    tenant_id: str
    balance: Decimal
    reserved_balance: Decimal
    available_balance: Decimal
    low_balance_threshold: Decimal
    currency: str = "IDR"
    auto_topup_enabled: bool = False
    auto_topup_amount: Decimal = Decimal("0.0000")
    is_low_balance: bool = False


async def get_or_create_wallet_tx(conn, tenant_id: str, for_update: bool = False) -> Dict[str, Any]:
    """
    Mengambil atau menginisialisasi dompet kredit tenant di dalam transaksi yang sama.
    Jika for_update=True, menerapkan SELECT ... FOR UPDATE.
    """
    for_update_clause = "FOR UPDATE" if for_update else ""
    query = sa.text(f"""
        SELECT id, tenant_id, balance, reserved_balance, low_balance_threshold, currency,
               auto_topup_enabled, auto_topup_amount
        FROM tenant_credit_wallet
        WHERE tenant_id = :tenant_id
        {for_update_clause};
    """)
    result = await conn.execute(query, {"tenant_id": tenant_id})
    row = result.fetchone()

    if row:
        return {
            "id": str(row[0]),
            "tenant_id": str(row[1]),
            "balance": Decimal(str(row[2])),
            "reserved_balance": Decimal(str(row[3])),
            "low_balance_threshold": Decimal(str(row[4])),
            "currency": row[5],
            "auto_topup_enabled": bool(row[6]),
            "auto_topup_amount": Decimal(str(row[7])),
        }

    # Jika belum ada, buat wallet baru dengan saldo awal default 250,000 IDR
    # agar organisasi baru dapat langsung mengevaluasi workflow kognitif
    initial_balance = Decimal("250000.0000")
    new_id = str(uuid.uuid4())
    insert_query = sa.text("""
        INSERT INTO tenant_credit_wallet (
            id, tenant_id, balance, reserved_balance, low_balance_threshold, currency
        ) VALUES (
            :id, :tenant_id, :balance, 0.0000, 50000.0000, 'IDR'
        )
        ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
        RETURNING id, tenant_id, balance, reserved_balance, low_balance_threshold, currency,
                  auto_topup_enabled, auto_topup_amount;
    """)
    res_ins = await conn.execute(insert_query, {
        "id": new_id,
        "tenant_id": tenant_id,
        "balance": initial_balance,
    })
    ins_row = res_ins.fetchone()

    # Catat mutasi awal
    await conn.execute(sa.text("""
        INSERT INTO tenant_credit_transactions (
            id, tenant_id, transaction_type, amount, balance_after, reference_id, description
        ) VALUES (
            :id, :tenant_id, 'topup', :amount, :balance_after, :ref_id, 'Saldo kredit inisiasi organisasi baru'
        );
    """), {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "amount": initial_balance,
        "balance_after": initial_balance,
        "ref_id": f"init-{tenant_id}",
    })

    return {
        "id": str(ins_row[0]),
        "tenant_id": str(ins_row[1]),
        "balance": Decimal(str(ins_row[2])),
        "reserved_balance": Decimal(str(ins_row[3])),
        "low_balance_threshold": Decimal(str(ins_row[4])),
        "currency": ins_row[5],
        "auto_topup_enabled": bool(ins_row[6]),
        "auto_topup_amount": Decimal(str(ins_row[7])),
    }


async def reserve_credit(
    tenant_id: str,
    estimated_cost: Decimal,
    reference_type: str,
    reference_id: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> CreditReservation:
    """
    Langkah 1: Reservasi Kredit (reserve_credit).
    Mengunci dompet kredit tenant dengan row-level lock (SELECT ... FOR UPDATE).
    Memeriksa ketersediaan saldo: available_balance = balance - reserved_balance.
    Jika mencukupi:
      - reserved_balance dinaikkan sebesar estimated_cost
      - mencatat record ke credit_reservations dengan status 'reserved'
      - mencatat mutasi audit ke tenant_credit_transactions
    Jika tidak mencukupi:
      - Melemparkan InsufficientCreditError
    """
    if estimated_cost < Decimal("0"):
        raise ValueError("Estimated cost tidak boleh negatif.")

    metadata = metadata or {}
    engine = get_engine()

    async with engine.begin() as conn:
        # Set tenant session variable untuk RLS
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        # 1. Kunci dompet tenant secara eksklusif (Row-Level Locking)
        wallet = await get_or_create_wallet_tx(conn, tenant_id=tenant_id, for_update=True)
        balance = wallet["balance"]
        reserved = wallet["reserved_balance"]
        available = balance - reserved

        # Periksa override akun tanpa batas (is_unlimited_override)
        sub_check = await conn.execute(sa.text("""
            SELECT is_unlimited_override, unlimited_reason
            FROM tenant_subscriptions
            WHERE tenant_id = :tid AND status IN ('active', 'trialing')
            ORDER BY created_at DESC LIMIT 1;
        """), {"tid": tenant_id})
        sub_row = sub_check.fetchone()
        is_unlimited = bool(sub_row[0]) if sub_row else False

        if not is_unlimited and available < estimated_cost:
            logger.warning(
                f"Gagal reservasi kredit tenant {tenant_id}: Saldo tersedia {available} < kebutuhan {estimated_cost}"
            )
            raise InsufficientCreditError(
                f"Saldo kredit tidak mencukupi. Tersedia: {available:.2f} {wallet['currency']}, "
                f"Kebutuhan estimasi: {estimated_cost:.2f} {wallet['currency']}."
            )

        # 2. Update reserved_balance di dompet (hanya jika bukan akun unlimited override)
        new_reserved = reserved + (Decimal("0.0000") if is_unlimited else estimated_cost)
        if not is_unlimited:
            await conn.execute(sa.text("""
                UPDATE tenant_credit_wallet
                SET reserved_balance = :new_reserved,
                    updated_at = now()
                WHERE id = :wallet_id;
            """), {
                "new_reserved": new_reserved,
                "wallet_id": wallet["id"],
            })

        if is_unlimited:
            metadata["is_unlimited_override"] = True
            if sub_row and sub_row[1]:
                metadata["unlimited_reason"] = sub_row[1]

        # 3. Buat entri reservasi di credit_reservations
        reservation_id = str(uuid.uuid4())
        await conn.execute(sa.text("""
            INSERT INTO credit_reservations (
                id, tenant_id, estimated_cost, status, reference_type, reference_id, metadata
            ) VALUES (
                :id, :tenant_id, :estimated_cost, 'reserved', :reference_type, :reference_id, :metadata
            );
        """), {
            "id": reservation_id,
            "tenant_id": tenant_id,
            "estimated_cost": estimated_cost,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "metadata": json.dumps(metadata),
        })

        # 4. Catat mutasi audit log
        tx_id = str(uuid.uuid4())
        balance_after = balance - new_reserved
        await conn.execute(sa.text("""
            INSERT INTO tenant_credit_transactions (
                id, tenant_id, reservation_id, transaction_type, amount, balance_after,
                reference_id, description, metadata
            ) VALUES (
                :id, :tenant_id, :reservation_id, 'reserved', :amount, :balance_after,
                :reference_id, :description, :metadata
            );
        """), {
            "id": tx_id,
            "tenant_id": tenant_id,
            "reservation_id": reservation_id,
            "amount": -estimated_cost,
            "balance_after": balance_after,
            "reference_id": reference_id,
            "description": f"Reservasi kredit untuk {reference_type}:{reference_id}",
            "metadata": json.dumps(metadata),
        })

        logger.info(
            f"Kredit berhasil direservasi: {estimated_cost} {wallet['currency']} untuk tenant {tenant_id} (ResID: {reservation_id})"
        )

        return CreditReservation(
            id=reservation_id,
            tenant_id=tenant_id,
            estimated_cost=estimated_cost,
            status="reserved",
            reference_type=reference_type,
            reference_id=reference_id,
            metadata=metadata,
        )


async def consume_credit(
    reservation_id: str,
    actual_cost: Decimal,
    metadata: Optional[Dict[str, Any]] = None,
) -> CreditTransaction:
    """
    Langkah 2: Konsumsi Kredit (consume_credit).
    Dipanggil setelah eksekusi Model Router / MCP Tool berhasil.
    - Mengunci reservasi dan dompet (FOR UPDATE).
    - Memastikan status saat ini adalah 'reserved'.
    - Melepaskan reserved_balance: reserved_balance -= estimated_cost.
    - Memotong balance aktual: balance -= actual_cost.
    - Mengubah status reservasi menjadi 'consumed' dengan actual_cost tercatat.
    - Mencatat mutasi audit ke tenant_credit_transactions.
    """
    if actual_cost < Decimal("0"):
        raise ValueError("Actual cost tidak boleh negatif.")

    metadata = metadata or {}
    engine = get_engine()

    async with engine.begin() as conn:
        # 1. Kunci reservasi
        res_check = await conn.execute(sa.text("""
            SELECT id, tenant_id, estimated_cost, status, reference_type, reference_id
            FROM credit_reservations
            WHERE id = :rid
            FOR UPDATE;
        """), {"rid": reservation_id})
        res_row = res_check.fetchone()

        if not res_row:
            raise InvalidReservationStateError(f"Reservasi kredit {reservation_id} tidak ditemukan.")

        res_id, tenant_id, estimated_cost_raw, status, ref_type, ref_id = res_row
        tenant_id = str(tenant_id)
        estimated_cost = Decimal(str(estimated_cost_raw))

        if status != "reserved":
            raise InvalidReservationStateError(
                f"Reservasi {reservation_id} memiliki status '{status}', hanya status 'reserved' yang dapat dikonsumsi."
            )

        # Set tenant session variable untuk RLS
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        # 2. Kunci dompet tenant (FOR UPDATE)
        wallet = await get_or_create_wallet_tx(conn, tenant_id=tenant_id, for_update=True)
        current_balance = wallet["balance"]
        current_reserved = wallet["reserved_balance"]

        # Periksa override akun tanpa batas (is_unlimited_override)
        sub_check = await conn.execute(sa.text("""
            SELECT is_unlimited_override, unlimited_reason
            FROM tenant_subscriptions
            WHERE tenant_id = :tid AND status IN ('active', 'trialing')
            ORDER BY created_at DESC LIMIT 1;
        """), {"tid": tenant_id})
        sub_row = sub_check.fetchone()
        is_unlimited = bool(sub_row[0]) if sub_row else False

        # 3. Hitung saldo baru
        if not is_unlimited:
            new_reserved = max(Decimal("0"), current_reserved - estimated_cost)
            new_balance = max(Decimal("0"), current_balance - actual_cost)

            # Update dompet
            await conn.execute(sa.text("""
                UPDATE tenant_credit_wallet
                SET balance = :new_balance,
                    reserved_balance = :new_reserved,
                    updated_at = now()
                WHERE id = :wallet_id;
            """), {
                "new_balance": new_balance,
                "new_reserved": new_reserved,
                "wallet_id": wallet["id"],
            })
            balance_after = new_balance - new_reserved
        else:
            balance_after = current_balance - current_reserved

        # 4. Update status reservasi
        await conn.execute(sa.text("""
            UPDATE credit_reservations
            SET status = 'consumed',
                actual_cost = :actual_cost,
                updated_at = now()
            WHERE id = :rid;
        """), {
            "actual_cost": actual_cost,
            "rid": reservation_id,
        })

        # 5. Catat mutasi transaksi
        tx_id = str(uuid.uuid4())
        balance_after = new_balance - new_reserved
        await conn.execute(sa.text("""
            INSERT INTO tenant_credit_transactions (
                id, tenant_id, reservation_id, transaction_type, amount, balance_after,
                reference_id, description, metadata
            ) VALUES (
                :id, :tenant_id, :reservation_id, 'consumed', :amount, :balance_after,
                :reference_id, :description, :metadata
            );
        """), {
            "id": tx_id,
            "tenant_id": tenant_id,
            "reservation_id": reservation_id,
            "amount": -actual_cost,
            "balance_after": balance_after,
            "reference_id": ref_id,
            "description": f"Konsumsi kredit aktual {ref_type}:{ref_id}",
            "metadata": json.dumps(metadata),
        })

        logger.info(
            f"Kredit dikonsumsi: {actual_cost} (estimasi: {estimated_cost}) untuk tenant {tenant_id} (ResID: {reservation_id})"
        )

        return CreditTransaction(
            id=tx_id,
            tenant_id=tenant_id,
            reservation_id=reservation_id,
            transaction_type="consumed",
            amount=-actual_cost,
            balance_after=balance_after,
            reference_id=ref_id,
            description=f"Konsumsi kredit aktual {ref_type}:{ref_id}",
            metadata=metadata,
        )


async def refund_credit(
    reservation_id: str,
    reason: str = "Eksekusi gagal / dibatalkan",
    metadata: Optional[Dict[str, Any]] = None,
) -> CreditTransaction:
    """
    Langkah 3: Pengembalian Kredit (refund_credit).
    Dipanggil otomatis jika eksekusi Model Router / MCP Tool gagal.
    - Mengunci reservasi dan dompet (FOR UPDATE).
    - Memastikan status saat ini adalah 'reserved'.
    - Melepaskan reserved_balance: reserved_balance -= estimated_cost (balance utama utuh).
    - Mengubah status reservasi menjadi 'refunded' dengan actual_cost = 0.
    - Mencatat mutasi audit ke tenant_credit_transactions.
    """
    metadata = metadata or {}
    engine = get_engine()

    async with engine.begin() as conn:
        # 1. Kunci reservasi
        res_check = await conn.execute(sa.text("""
            SELECT id, tenant_id, estimated_cost, status, reference_type, reference_id
            FROM credit_reservations
            WHERE id = :rid
            FOR UPDATE;
        """), {"rid": reservation_id})
        res_row = res_check.fetchone()

        if not res_row:
            raise InvalidReservationStateError(f"Reservasi kredit {reservation_id} tidak ditemukan.")

        res_id, tenant_id, estimated_cost_raw, status, ref_type, ref_id = res_row
        tenant_id = str(tenant_id)
        estimated_cost = Decimal(str(estimated_cost_raw))

        if status != "reserved":
            raise InvalidReservationStateError(
                f"Reservasi {reservation_id} memiliki status '{status}', hanya status 'reserved' yang dapat di-refund."
            )

        # Set tenant session variable untuk RLS
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        # 2. Kunci dompet tenant (FOR UPDATE)
        wallet = await get_or_create_wallet_tx(conn, tenant_id=tenant_id, for_update=True)
        current_balance = wallet["balance"]
        current_reserved = wallet["reserved_balance"]

        # 3. Lepaskan reserved_balance
        new_reserved = max(Decimal("0"), current_reserved - estimated_cost)

        await conn.execute(sa.text("""
            UPDATE tenant_credit_wallet
            SET reserved_balance = :new_reserved,
                updated_at = now()
            WHERE id = :wallet_id;
        """), {
            "new_reserved": new_reserved,
            "wallet_id": wallet["id"],
        })

        # 4. Update status reservasi
        await conn.execute(sa.text("""
            UPDATE credit_reservations
            SET status = 'refunded',
                actual_cost = 0.0000,
                updated_at = now()
            WHERE id = :rid;
        """), {"rid": reservation_id})

        # 5. Catat mutasi audit refund
        tx_id = str(uuid.uuid4())
        balance_after = current_balance - new_reserved
        await conn.execute(sa.text("""
            INSERT INTO tenant_credit_transactions (
                id, tenant_id, reservation_id, transaction_type, amount, balance_after,
                reference_id, description, metadata
            ) VALUES (
                :id, :tenant_id, :reservation_id, 'refunded', :amount, :balance_after,
                :reference_id, :description, :metadata
            );
        """), {
            "id": tx_id,
            "tenant_id": tenant_id,
            "reservation_id": reservation_id,
            "amount": estimated_cost,
            "balance_after": balance_after,
            "reference_id": ref_id,
            "description": f"Refund reservasi kredit: {reason}",
            "metadata": json.dumps(metadata),
        })

        logger.info(
            f"Kredit di-refund: {estimated_cost} dikembalikan ke tenant {tenant_id} (Alasan: {reason})"
        )

        return CreditTransaction(
            id=tx_id,
            tenant_id=tenant_id,
            reservation_id=reservation_id,
            transaction_type="refunded",
            amount=estimated_cost,
            balance_after=balance_after,
            reference_id=ref_id,
            description=f"Refund reservasi kredit: {reason}",
            metadata=metadata,
        )


async def topup_credit(
    tenant_id: str,
    amount: Decimal,
    reference_id: str,
    description: str = "Top up saldo kredit organisasi",
    metadata: Optional[Dict[str, Any]] = None,
) -> CreditTransaction:
    """
    Top-Up Saldo Kredit Tenant.
    Menambahkan saldo ke tenant_credit_wallet dengan row-level lock dan mencatat transaksi audit.
    """
    if amount <= Decimal("0"):
        raise ValueError("Jumlah top-up harus bernilai lebih dari 0.")

    metadata = metadata or {}
    engine = get_engine()

    async with engine.begin() as conn:
        # Set tenant session variable untuk RLS
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )

        wallet = await get_or_create_wallet_tx(conn, tenant_id=tenant_id, for_update=True)
        current_balance = wallet["balance"]
        reserved = wallet["reserved_balance"]
        new_balance = current_balance + amount

        await conn.execute(sa.text("""
            UPDATE tenant_credit_wallet
            SET balance = :new_balance,
                updated_at = now()
            WHERE id = :wallet_id;
        """), {
            "new_balance": new_balance,
            "wallet_id": wallet["id"],
        })

        tx_id = str(uuid.uuid4())
        balance_after = new_balance - reserved

        await conn.execute(sa.text("""
            INSERT INTO tenant_credit_transactions (
                id, tenant_id, transaction_type, amount, balance_after,
                reference_id, description, metadata
            ) VALUES (
                :id, :tenant_id, 'topup', :amount, :balance_after,
                :reference_id, :description, :metadata
            );
        """), {
            "id": tx_id,
            "tenant_id": tenant_id,
            "amount": amount,
            "balance_after": balance_after,
            "reference_id": reference_id,
            "description": description,
            "metadata": json.dumps(metadata),
        })

        logger.info(f"Top-up sukses untuk tenant {tenant_id}: +{amount} (Saldo akhir: {new_balance})")

        return CreditTransaction(
            id=tx_id,
            tenant_id=tenant_id,
            transaction_type="topup",
            amount=amount,
            balance_after=balance_after,
            reference_id=reference_id,
            description=description,
            metadata=metadata,
        )


async def get_wallet(tenant_id: str) -> TenantWallet:
    """
    Mengambil data status dompet saldo kredit tenant saat ini.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        wallet = await get_or_create_wallet_tx(conn, tenant_id=tenant_id, for_update=False)

    balance = wallet["balance"]
    reserved = wallet["reserved_balance"]
    available = balance - reserved
    threshold = wallet["low_balance_threshold"]

    return TenantWallet(
        id=wallet["id"],
        tenant_id=wallet["tenant_id"],
        balance=balance,
        reserved_balance=reserved,
        available_balance=available,
        low_balance_threshold=threshold,
        currency=wallet["currency"],
        auto_topup_enabled=wallet["auto_topup_enabled"],
        auto_topup_amount=wallet["auto_topup_amount"],
        is_low_balance=(available <= threshold),
    )


async def get_transactions(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Mengambil riwayat transaksi mutasi kredit tenant."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(sa.text("""
            SELECT id, transaction_type, amount, balance_after, reference_id, description, created_at
            FROM tenant_credit_transactions
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT :limit;
        """), {"tenant_id": tenant_id, "limit": limit})
        rows = res.fetchall()

    return [
        {
            "id": str(r[0]),
            "transaction_type": r[1],
            "amount": float(r[2]),
            "balance_after": float(r[3]),
            "reference_id": r[4],
            "description": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]


async def get_invoices(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Mengambil daftar faktur/tagihan resmi tenant."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": tenant_id},
        )
        res = await conn.execute(sa.text("""
            SELECT id, invoice_number, amount, currency, status, payment_gateway, payment_reference, payment_url, items, created_at, paid_at
            FROM invoices
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT :limit;
        """), {"tenant_id": tenant_id, "limit": limit})
        rows = res.fetchall()

    return [
        {
            "id": str(r[0]),
            "invoice_number": r[1],
            "amount": float(r[2]),
            "currency": r[3],
            "status": r[4],
            "payment_gateway": r[5],
            "payment_reference": r[6],
            "payment_url": r[7],
            "items": r[8] if isinstance(r[8], list) else [],
            "created_at": r[9].isoformat() if r[9] else None,
            "paid_at": r[10].isoformat() if r[10] else None,
        }
        for r in rows
    ]
