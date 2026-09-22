"""
Abandoned Cart Recovery Engine (PRD v2.2 Bagian 11.9, 14, 16)

Menyediakan:
- schedule_abandoned_cart_recovery(): Menjadwalkan pengingat pemulihan keranjang nyata.
- process_due_abandoned_cart_recoveries(): Memproses jadwal jatuh tempo pengiriman pesan recovery.
- mark_cart_recovered(): Menandai konversi berhasil saat checkout diselesaikan.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging
from ..service import ServiceRequestStatus
from ...skills.f01_humanize_id import F01HumanizeIdSkill

try:
    import sqlalchemy as sa
    from sqlalchemy.sql import text
except ImportError:
    class _SafeSA:
        def __getattr__(self, name):
            return lambda *args, **kwargs: None
    sa = _SafeSA()
    def text(query):
        return query

logger = logging.getLogger("orchestree.commerce.abandoned_cart")


def schedule_abandoned_cart_recovery(
    tenant_id: str,
    cart_id: str,
    customer_id: Optional[str] = None,
    cart_value: float = 0.0,
    customer_name: Optional[str] = None,
    channel: str = "WHATSAPP",
    delay_minutes: int = 30,
    discount_code: str = "PULIH10",
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Menjadwalkan pesan recovery keranjang ditinggalkan (misal 30 menit pasca inaktivitas).
    """
    recovery_id = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)
    scheduled_dt = now_dt + timedelta(minutes=delay_minutes)

    recovery_job = {
        "id": recovery_id,
        "tenant_id": tenant_id,
        "cart_id": cart_id,
        "customer_id": customer_id,
        "channel": channel,
        "status": "SCHEDULED",
        "cart_value": float(cart_value),
        "discount_code": discount_code,
        "scheduled_at": scheduled_dt.isoformat(),
        "created_at": now_dt.isoformat(),
    }

    if db_session:
        try:
            db_session.execute(
                text("""
                INSERT INTO abandoned_cart_recoveries (
                    id, tenant_id, cart_id, customer_id, channel,
                    status, scheduled_at, discount_code, cart_value,
                    created_at, updated_at
                ) VALUES (
                    :id, :tid, :cid, :cust_id, :chan,
                    'SCHEDULED', :sched_at, :disc, :c_val,
                    now(), now()
                )
                """),
                {
                    "id": recovery_id,
                    "tid": tenant_id,
                    "cid": cart_id,
                    "cust_id": customer_id,
                    "chan": channel,
                    "sched_at": scheduled_dt,
                    "disc": discount_code,
                    "c_val": cart_value,
                }
            )
            db_session.commit()
        except Exception as e:
            logger.error(f"Gagal menjadwalkan abandoned cart recovery: {e}")

    return recovery_job


def process_due_abandoned_cart_recoveries(
    tenant_id: str,
    db_session: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """
    Memeriksa dan mengeksekusi pesan pemulihan keranjang yang sudah jatuh tempo.
    Menerapkan F.01-HUMANIZE-ID pada pesan WhatsApp/Email yang dikirim.
    """
    dispatched_items: List[Dict[str, Any]] = []
    humanizer = F01HumanizeIdSkill(default_honorific="Kak")
    now_iso = datetime.now(timezone.utc).isoformat()

    if not db_session:
        # Fallback demonstrasi struktur jika db_session tidak disediakan
        return []

    try:
        query = """
        SELECT r.id, r.cart_id, r.customer_id, r.channel, r.cart_value, r.discount_code,
               c.name as customer_name, c.phone as customer_phone
        FROM abandoned_cart_recoveries r
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE r.tenant_id = :tid 
          AND r.status = 'SCHEDULED' 
          AND r.scheduled_at <= now()
        ORDER BY r.scheduled_at ASC
        LIMIT 50
        """
        rows = db_session.execute(text(query), {"tid": tenant_id}).fetchall()

        for row in rows:
            name = row.customer_name or "Pelanggan"
            cart_val = float(row.cart_value or 0.0)
            disc = row.discount_code or "HEMAT10"

            raw_msg = (
                f"Halo Kak {name}, keranjang belanja senilai Rp {cart_val:,.2f} "
                f"masih menunggu untuk diproses. Gunakan kode promo {disc} hari ini untuk mendapatkan "
                f"potongan spesial saat checkout. Apakah ada yang perlu dibantu untuk proses pesanannya?"
            )

            # Humanisasi gaya bahasa via F.01-HUMANIZE-ID
            humanized_res = humanizer.humanize(raw_msg, customer_name=name)
            final_msg = humanized_res["humanized_text"]

            # Tandai status 'DISPATCHED'
            db_session.execute(
                text("""
                UPDATE abandoned_cart_recoveries
                SET status = 'DISPATCHED',
                    sent_at = now(),
                    message_sent = :msg,
                    updated_at = now()
                WHERE id = :id AND tenant_id = :tid
                """),
                {
                    "id": str(row.id),
                    "tid": tenant_id,
                    "msg": final_msg,
                }
            )

            dispatched_items.append({
                "recovery_id": str(row.id),
                "cart_id": str(row.cart_id),
                "customer_name": name,
                "phone": row.customer_phone,
                "channel": row.channel,
                "cart_value": cart_val,
                "discount_code": disc,
                "message_dispatched": final_msg,
                "dispatched_at": now_iso,
            })

        db_session.commit()
    except Exception as e:
        logger.error(f"Gagal memproses abandoned cart recoveries: {e}")

    return dispatched_items


def mark_cart_recovered(
    tenant_id: str,
    cart_id: str,
    order_id: Optional[str] = None,
    db_session: Optional[Any] = None,
) -> bool:
    """Menandai recovery keranjang berhasil (CONVERTED)."""
    if db_session:
        try:
            db_session.execute(
                text("""
                UPDATE abandoned_cart_recoveries
                SET status = 'CONVERTED',
                    updated_at = now()
                WHERE cart_id = :cid AND tenant_id = :tid
                """),
                {"cid": cart_id, "tid": tenant_id}
            )
            db_session.commit()
            return True
        except Exception as e:
            logger.error(f"Gagal menandai cart recovered: {e}")
    return False
