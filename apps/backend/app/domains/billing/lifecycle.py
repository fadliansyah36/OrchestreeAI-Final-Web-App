"""
OrchestreeAI Billing Engine & Subscription Lifecycle (PRD v2.2 Bagian 14 & Billing Specification)
Mengimplementasikan:
1. Otomasi Siklus Langganan (Subscription Renewal Invoice Generation)
2. Pemrosesan Faktur Lunas (Entitlement & AI Credit Allocation)
   - subscription_cycle: update status langganan, perpanjang siklus, alokasi kredit siklus
   - topup_purchase: alokasi kredit top-up dengan masa berlaku (validity_days)
3. Job Kedaluwarsa Kredit Top-Up (Celery Beat scheduled task):
   Kredit yang melewati expires_at dikurangi dari balance dengan catatan mutasi audit eksplisit (topup_expired).
"""

import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List
import sqlalchemy as sa

from app.core.database import get_engine
from app.domains.billing.credits import topup_credit

logger = logging.getLogger("orchestree.billing.lifecycle")

# Optional Celery Task decorator
try:
    from celery import shared_task
except ImportError:
    def shared_task(*d_args, **d_kwargs):
        def decorator(func):
            return func
        return decorator


async def process_invoice_settlement(
    invoice_number: str,
    payment_reference: str,
    payment_gateway: str = "midtrans",
    raw_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Eksekusi Entitlement + AI Credit Allocation saat faktur dinyatakan lunas (Settled).
    Alur:
    Faktur Lunas -> Entitlement (tenant_subscriptions status 'active')
                 -> AI Credit Allocation (credit_allocations)
                 -> Penambahan Saldo ke tenant_credit_wallet
    """
    engine = get_engine()
    now_dt = datetime.now(timezone.utc)

    async with engine.begin() as conn:
        res_inv = await conn.execute(
            sa.text("""
                SELECT id, tenant_id, amount, status, items
                FROM invoices
                WHERE invoice_number = :inv
                FOR UPDATE;
            """),
            {"inv": invoice_number},
        )
        inv_row = res_inv.fetchone()
        if not inv_row:
            logger.warning(f"Faktur {invoice_number} tidak ditemukan saat proses settlement.")
            return {"status": "error", "message": "Invoice not found"}

        inv_id, tenant_id, amount, status, items_json = inv_row
        tenant_id = str(tenant_id)
        amount = Decimal(str(amount))

        items = items_json if isinstance(items_json, list) else []
        item_data = items[0] if items else {}
        item_type = item_data.get("type", "topup_purchase")
        package_id = item_data.get("package_id")
        plan_id = item_data.get("plan_id")

        credit_amount = Decimal("0.0000")
        allocation_source = "topup_purchase"
        expires_at: Optional[datetime] = None

        if item_type == "subscription_cycle":
            allocation_source = "subscription_cycle"
            # Cari informasi plan
            plan_res = await conn.execute(
                sa.text("""
                    SELECT id, ai_credit_allowance, trial_duration_days
                    FROM subscription_plans
                    WHERE id = :pid OR plan_code = :pcode
                    LIMIT 1;
                """),
                {"pid": plan_id or str(uuid.uuid4()), "pcode": str(item_data.get("plan_code", ""))},
            )
            p_row = plan_res.fetchone()
            if p_row and p_row[1] is not None:
                credit_amount = Decimal(str(p_row[1]))
            else:
                # Default kuota kredit berdasar amount
                credit_amount = Decimal(str(amount))

            cycle_start = now_dt
            cycle_end = now_dt + timedelta(days=30)

            # Perbarui status langganan tenant (Entitlement)
            await conn.execute(
                sa.text("""
                    INSERT INTO tenant_subscriptions (
                        id, tenant_id, plan_id, billing_cycle_start, billing_cycle_end, status
                    ) VALUES (
                        :id, :tid, :pid, :cstart, :cend, 'active'
                    )
                    ON CONFLICT DO NOTHING;
                """),
                {
                    "id": str(uuid.uuid4()),
                    "tid": tenant_id,
                    "pid": p_row[0] if p_row else plan_id,
                    "cstart": cycle_start,
                    "cend": cycle_end,
                },
            )

            # Update tenant status di tabel tenants
            await conn.execute(
                sa.text("""
                    UPDATE tenants
                    SET status = 'active',
                        subscription_plan_id = :pid,
                        updated_at = now()
                    WHERE id = :tid;
                """),
                {"pid": p_row[0] if p_row else plan_id, "tid": tenant_id},
            )

        else:
            # Top-up purchase
            allocation_source = "topup_purchase"
            validity_days = 60
            if package_id:
                pkg_res = await conn.execute(
                    sa.text("""
                        SELECT credit_amount, validity_days
                        FROM credit_topup_packages
                        WHERE id = :pkg_id
                        LIMIT 1;
                    """),
                    {"pkg_id": package_id},
                )
                pkg_row = pkg_res.fetchone()
                if pkg_row:
                    credit_amount = Decimal(str(pkg_row[0]))
                    validity_days = int(pkg_row[1])
            if credit_amount <= Decimal("0"):
                credit_amount = Decimal(str(amount))

            expires_at = now_dt + timedelta(days=validity_days)

        # Catat alokasi kredit di credit_allocations
        alloc_id = str(uuid.uuid4())
        await conn.execute(
            sa.text("""
                INSERT INTO credit_allocations (
                    id, tenant_id, source_type, source_reference_id, credit_amount, expires_at
                ) VALUES (
                    :id, :tid, :stype, :sref, :amount, :exp
                );
            """),
            {
                "id": alloc_id,
                "tid": tenant_id,
                "stype": allocation_source,
                "sref": inv_id,
                "amount": credit_amount,
                "exp": expires_at,
            },
        )

        # Update faktur menjadi paid
        await conn.execute(
            sa.text("""
                UPDATE invoices
                SET status = 'paid',
                    paid_at = now(),
                    payment_reference = :pref,
                    updated_at = now()
                WHERE id = :id;
            """),
            {"id": inv_id, "pref": payment_reference},
        )

        # Catat rekonsiliasi log
        await conn.execute(
            sa.text("""
                INSERT INTO payment_reconciliation_log (
                    id, tenant_id, invoice_id, payment_gateway, event_type,
                    raw_payload, signature_verified, status
                ) VALUES (
                    :id, :tid, :inv_id, :gw, 'payment.settled',
                    :payload, true, 'settled'
                );
            """),
            {
                "id": str(uuid.uuid4()),
                "tid": tenant_id,
                "inv_id": inv_id,
                "gw": payment_gateway,
                "payload": json.dumps(raw_payload or {"invoice_number": invoice_number, "amount": float(amount)}),
            },
        )

    # Tambahkan saldo ke dompet tenant
    tx = await topup_credit(
        tenant_id=tenant_id,
        amount=credit_amount,
        reference_id=invoice_number,
        description=f"Alokasi kredit {allocation_source} ({invoice_number})",
        metadata={
            "invoice_id": str(inv_id),
            "allocation_id": alloc_id,
            "source_type": allocation_source,
            "expires_at": expires_at.isoformat() if expires_at else None,
        },
    )

    logger.info(
        f"Settlement berhasil untuk faktur {invoice_number}: "
        f"Tenant {tenant_id} dialokasikan {credit_amount} AI Credits (Alokasi: {alloc_id})"
    )

    return {
        "status": "success",
        "invoice_number": invoice_number,
        "tenant_id": tenant_id,
        "allocated_credits": float(credit_amount),
        "source_type": allocation_source,
        "allocation_id": alloc_id,
        "new_balance": float(tx.balance_after),
    }


async def generate_subscription_renewal_invoices() -> int:
    """
    Pekerjaan berkala (Celery task):
    Menemukan tenant_subscriptions yang akan habis masa berlakunya (<= 3 hari)
    dan menerbitkan faktur perpanjangan otomatis di tabel invoices.
    """
    engine = get_engine()
    generated_count = 0
    now_dt = datetime.now(timezone.utc)
    cutoff = now_dt + timedelta(days=3)

    async with engine.begin() as conn:
        res = await conn.execute(
            sa.text("""
                SELECT ts.id, ts.tenant_id, ts.plan_id, sp.monthly_price_idr, sp.plan_code, sp.display_name
                FROM tenant_subscriptions ts
                JOIN subscription_plans sp ON sp.id = ts.plan_id
                JOIN tenants t ON t.id = ts.tenant_id
                WHERE ts.status = 'active'
                  AND COALESCE(t.is_founder_account, false) = false
                  AND COALESCE(ts.is_unlimited_override, false) = false
                  AND ts.billing_cycle_end <= :cutoff
                  AND sp.is_trial = false
                  AND sp.is_custom_quote = false
                  AND NOT EXISTS (
                      SELECT 1 FROM invoices inv
                      WHERE inv.tenant_id = ts.tenant_id
                        AND inv.status = 'pending'
                        AND inv.created_at >= now() - interval '7 days'
                  );
            """),
            {"cutoff": cutoff},
        )
        rows = res.fetchall()

        for row in rows:
            sub_id, tenant_id, plan_id, price, plan_code, plan_name = row
            if price is None or price <= Decimal("0"):
                continue

            inv_id = str(uuid.uuid4())
            short_id = uuid.uuid4().hex[:6].upper()
            inv_number = f"INV-REN-{short_id}-{int(price)}"

            await conn.execute(
                sa.text("""
                    INSERT INTO invoices (
                        id, tenant_id, invoice_number, amount, currency, status,
                        payment_gateway, payment_reference, payment_url, items
                    ) VALUES (
                        :id, :tid, :num, :amount, 'IDR', 'pending',
                        'midtrans', :num, :purl, :items
                    );
                """),
                {
                    "id": inv_id,
                    "tid": str(tenant_id),
                    "num": inv_number,
                    "amount": price,
                    "purl": f"https://simulator.sandbox.midtrans.com/snap/v2/vtweb/{inv_number}",
                    "items": json.dumps([{
                        "type": "subscription_cycle",
                        "plan_id": str(plan_id),
                        "plan_code": plan_code,
                        "name": f"Perpanjangan Langganan {plan_name}",
                        "amount": float(price),
                        "qty": 1,
                    }]),
                },
            )
            generated_count += 1

    logger.info(f"Berhasil menerbitkan {generated_count} faktur perpanjangan langganan otomatis.")
    return generated_count


async def expire_stale_topup_credits() -> int:
    """
    Pekerjaan terjadwal (Celery Beat):
    Kredit top-up yang telah melewati masa berlaku (expires_at) dikurangi
    dari balance secara eksplisit dan dicatat di buku besar transaksi
    dengan transaction_type='adjustment' dan alasan 'topup_expired'.
    """
    engine = get_engine()
    now_dt = datetime.now(timezone.utc)
    expired_count = 0

    async with engine.begin() as conn:
        # Cari alokasi topup yang sudah kadaluarsa (kecuali akun founder / unlimited override)
        res = await conn.execute(
            sa.text("""
                SELECT ca.id, ca.tenant_id, ca.credit_amount, ca.expires_at
                FROM credit_allocations ca
                JOIN tenants t ON t.id = ca.tenant_id
                LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = ca.tenant_id AND ts.status IN ('active', 'trialing')
                WHERE ca.source_type = 'topup_purchase'
                  AND COALESCE(t.is_founder_account, false) = false
                  AND COALESCE(ts.is_unlimited_override, false) = false
                  AND ca.expires_at IS NOT NULL
                  AND ca.expires_at <= :now
                  AND NOT EXISTS (
                      SELECT 1 FROM tenant_credit_transactions tct
                      WHERE tct.reference_id = ca.id::text
                        AND tct.transaction_type = 'adjustment'
                  )
                LIMIT 100;
            """),
            {"now": now_dt},
        )
        allocations = res.fetchall()

        for alloc in allocations:
            alloc_id, tenant_id, credit_amount, exp_time = alloc
            tenant_id = str(tenant_id)
            amount_to_deduct = Decimal(str(credit_amount))

            # Row lock dompet tenant
            w_res = await conn.execute(
                sa.text("""
                    SELECT id, balance, reserved_balance
                    FROM tenant_credit_wallet
                    WHERE tenant_id = :tid
                    FOR UPDATE;
                """),
                {"tid": tenant_id},
            )
            w_row = w_res.fetchone()
            if not w_row:
                continue

            wallet_id, balance, reserved = w_row[0], Decimal(str(w_row[1])), Decimal(str(w_row[2]))
            available = max(Decimal("0.0000"), balance - reserved)
            actual_deduction = min(available, amount_to_deduct)

            if actual_deduction > Decimal("0.0000"):
                new_balance = balance - actual_deduction
                await conn.execute(
                    sa.text("""
                        UPDATE tenant_credit_wallet
                        SET balance = :bal, updated_at = now()
                        WHERE id = :wid;
                    """),
                    {"bal": new_balance, "wid": wallet_id},
                )
                balance_after = new_balance - reserved

                # Catat mutasi audit penyesuaian kadaluarsa
                await conn.execute(
                    sa.text("""
                        INSERT INTO tenant_credit_transactions (
                            id, tenant_id, transaction_type, amount, balance_after,
                            reference_id, description, metadata
                        ) VALUES (
                            :id, :tid, 'adjustment', :amount, :bal_after,
                            :ref_id, 'Kredit top-up telah melewati batas masa berlaku (topup_expired)', :meta
                        );
                    """),
                    {
                        "id": str(uuid.uuid4()),
                        "tid": tenant_id,
                        "amount": -actual_deduction,
                        "bal_after": max(Decimal("0.0000"), balance_after),
                        "ref_id": str(alloc_id),
                        "meta": json.dumps({
                            "allocation_id": str(alloc_id),
                            "reason": "topup_expired",
                            "original_credit": float(amount_to_deduct),
                            "expired_at": exp_time.isoformat() if exp_time else None,
                        }),
                    },
                )
                expired_count += 1

    logger.info(f"Berhasil memproses {expired_count} alokasi kredit top-up yang kadaluarsa.")
    return expired_count


# ---------------------------------------------------------------------------
# Celery Shared Tasks Declarations
# ---------------------------------------------------------------------------

@shared_task(name="billing.generate_subscription_renewal_invoices")
def task_generate_subscription_renewal_invoices():
    import asyncio
    return asyncio.run(generate_subscription_renewal_invoices())


@shared_task(name="billing.expire_stale_topup_credits")
def task_expire_stale_topup_credits():
    import asyncio
    return asyncio.run(expire_stale_topup_credits())
