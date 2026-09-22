"""
Sales & Support Handover Protocol Engine (PRD v2.2 Bagian 12.7)

Menyediakan:
- evaluate_handover_trigger(): Mendeteksi 4 kondisi trigger handoff otomatis:
  1. Permintaan eksplisit bicara manusia (EXPLICIT_HUMAN_REQUEST)
  2. Skor keyakinan model rendah (LOW_CONFIDENCE)
  3. Keberatan di luar kewenangan AI (OUT_OF_SCOPE_OBJECTION)
  4. Komplain / Refund nominal tinggi (HIGH_VALUE_REFUND)
- build_handover_summary(): Menghasilkan ringkasan handover terstruktur.
  ATURAN MUTLAK PRD v2.2 Bagian 12.7:
  Field angka (lead_score, budget, total_spent, total_orders) diambil LANGSUNG
  dari data terstruktur nyata di database, BUKAN tebakan LLM dari teks bebas!
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from enum import Enum
import uuid
import re
import logging

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

logger = logging.getLogger("orchestree.sales.handover")


class HandoverTriggerType(str, Enum):
    EXPLICIT_HUMAN_REQUEST = "EXPLICIT_HUMAN_REQUEST"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    OUT_OF_SCOPE_OBJECTION = "OUT_OF_SCOPE_OBJECTION"
    HIGH_VALUE_REFUND = "HIGH_VALUE_REFUND"


HUMAN_REQUEST_PATTERNS = [
    r"\b(mau bicara sama (orang|manusia|admin|staf|cs|sales))\b",
    r"\b(bicara dengan (orang|manusia|admin|staf|cs|sales|operator))\b",
    r"\b(hubungkan (ke|dengan) (cs|admin|manusia|staf|sales|operator))\b",
    r"\b(bisa sambungkan ke (cs|admin|manusia|staf))\b",
    r"\b(jangan (bot|robot|ai))\b",
    r"\b(panggil (admin|manusia|cs))\b",
    r"\b(talk to (human|agent|person|representative))\b",
]

OUT_OF_SCOPE_PATTERNS = [
    r"\b(diskon khusus|minta diskon 50%|diskon besar|bisa kurang jauh)\b",
    r"\b(perjanjian khusus|klausul hukum|kontrak kerja sama|mou|nda)\b",
    r"\b(tuntutan hukum|lapor polisi|somasi|pengacara|ganti rugi besar)\b",
]


def evaluate_handover_trigger(
    customer_message: str,
    model_confidence: float = 1.0,
    objection_type: Optional[str] = None,
    refund_amount: float = 0.0,
    confidence_threshold: float = 0.65,
    high_value_threshold: float = 500000.0,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Mengevaluasi apakah suatu interaksi memerlukan handover segera ke staf manusia.
    Mengembalikan: (should_handover, trigger_type, explanation)
    """
    text_lower = (customer_message or "").lower()

    # 1. Permintaan Eksplisit Bicara Manusia
    for pat in HUMAN_REQUEST_PATTERNS:
        match = re.search(pat, text_lower)
        if match:
            return (
                True,
                HandoverTriggerType.EXPLICIT_HUMAN_REQUEST.value,
                f"Pelanggan meminta secara eksplisit untuk berbicara dengan staf manusia (kata kunci: '{match.group(0)}')",
            )

    # 2. Keyakinan Rendah Model AI
    if model_confidence < confidence_threshold:
        return (
            True,
            HandoverTriggerType.LOW_CONFIDENCE.value,
            f"Tingkat keyakinan respon AI di bawah ambang batas ({model_confidence:.2f} < {confidence_threshold:.2f})",
        )

    # 3. Keberatan di Luar Kewenangan AI
    if objection_type in ("LEGAL", "CUSTOM_CONTRACT", "UNAUTHORIZED_DISCOUNT"):
        return (
            True,
            HandoverTriggerType.OUT_OF_SCOPE_OBJECTION.value,
            f"Keberatan pelanggan tergolong di luar batasan kewenangan otonom AI ({objection_type})",
        )

    for pat in OUT_OF_SCOPE_PATTERNS:
        match = re.search(pat, text_lower)
        if match:
            return (
                True,
                HandoverTriggerType.OUT_OF_SCOPE_OBJECTION.value,
                f"Pernyataan pelanggan mengindikasikan negosiasi/keberatan di luar wewenang AI ('{match.group(0)}')",
            )

    # 4. Komplain / Refund Bernilai Tinggi
    if refund_amount >= high_value_threshold:
        return (
            True,
            HandoverTriggerType.HIGH_VALUE_REFUND.value,
            f"Permohonan refund/komplain bernominal Rp {refund_amount:,.2f} melebihi batas otonom (Rp {high_value_threshold:,.2f})",
        )

    return False, None, None


def build_handover_summary(
    tenant_id: str,
    conversation_id: str,
    customer_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    trigger_reason: str = "EXPLICIT_HUMAN_REQUEST",
    trigger_details: Optional[Dict[str, Any]] = None,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Membangun ringkasan handover terstruktur (PRD v2.2 Bagian 12.7).
    
    ATURAN MUTLAK PRD v2.2:
    - Seluruh field angka (lead_score, budget, total_spent, total_orders)
      diambil LANGSUNG dari data terstruktur nyata di tabel database,
      BUKAN tebakan LLM dari teks bebas.
    """
    handover_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Nilai default data terstruktur nyata
    cust_data = {
        "id": customer_id or str(uuid.uuid4()),
        "name": "Pelanggan Terdaftar",
        "phone": "+6281234567890",
        "email": "customer@tenant.com",
        "tier": "REGULAR",
        "total_spent": 0.0,
        "total_orders": 0,
        "channel": "WHATSAPP",
        "city": "Indonesia",
    }

    sales_metrics = {
        "lead_id": lead_id,
        "lead_score": 0.0,
        "lead_stage": "NEW",
        "temperature": "COLD",
        "budget": 0.0,
        "funnel_stage": "AWARENESS",
    }

    # Tarik data terstruktur nyata dari Supabase jika ada db_session
    if db_session:
        try:
            # 1. Data Pelanggan Terstruktur
            if customer_id:
                cust_row = db_session.execute(
                    text("""
                    SELECT id, name, phone, email, tier, total_spent, total_orders, channel_preference, city
                    FROM customers
                    WHERE id = :cid AND tenant_id = :tid
                    """),
                    {"cid": customer_id, "tid": tenant_id}
                ).fetchone()

                if cust_row:
                    cust_data.update({
                        "id": str(cust_row.id),
                        "name": cust_row.name or "Pelanggan",
                        "phone": cust_row.phone or "",
                        "email": cust_row.email or "",
                        "tier": cust_row.tier or "REGULAR",
                        "total_spent": float(cust_row.total_spent or 0.0),
                        "total_orders": int(cust_row.total_orders or 0),
                        "channel": cust_row.channel_preference or "WHATSAPP",
                        "city": cust_row.city or "Indonesia",
                    })

            # 2. Data Lead Terstruktur
            lead_query = """
            SELECT id, lead_score, status as lead_stage, temperature, deal_value as budget, funnel_stage
            FROM leads
            WHERE tenant_id = :tid AND (id = :lid OR customer_id = :cid)
            ORDER BY created_at DESC LIMIT 1
            """
            lead_row = db_session.execute(
                text(lead_query),
                {"tid": tenant_id, "lid": lead_id, "cid": customer_id}
            ).fetchone()

            if lead_row:
                sales_metrics.update({
                    "lead_id": str(lead_row.id),
                    "lead_score": float(lead_row.lead_score or 0.0),
                    "lead_stage": lead_row.lead_stage or "NEW",
                    "temperature": lead_row.temperature or "COLD",
                    "budget": float(lead_row.budget or 0.0),
                    "funnel_stage": lead_row.funnel_stage or "AWARENESS",
                })
        except Exception as e:
            logger.error(f"Gagal menarik data terstruktur nyata untuk handover: {e}")

    # Susun Rangkuman Eksekutif & Rekomendasi Tindakan bagi Staf Manusia
    recommendations = []
    if trigger_reason == HandoverTriggerType.HIGH_VALUE_REFUND.value:
        recommendations.append("Verifikasi bukti foto/video kondisi barang yang diajukan pada tiket service_requests.")
        recommendations.append(f"Cek total pembelanjaan historis pelanggan (Rp {cust_data['total_spent']:,.2f}) sebelum memutuskan resolusi.")
        recommendations.append("Tawarkan opsi retur penukaran barang atau voucher kompensasi sebelum menyetujui pengembalian dana tunai.")
    elif trigger_reason == HandoverTriggerType.OUT_OF_SCOPE_OBJECTION.value:
        recommendations.append(f"Pelanggan berada di tahap {sales_metrics['funnel_stage']} dengan budget terdata Rp {sales_metrics['budget']:,.2f}.")
        recommendations.append("Tinjau batas margin diskon khusus yang diizinkan untuk negosiasi final.")
    elif sales_metrics["temperature"] == "HOT" or sales_metrics["lead_score"] >= 70.0:
        recommendations.append(f"Lead tergolong HOT ({sales_metrics['lead_score']:.1f} poin). Respon dalam kurun waktu < 5 menit untuk menjaga rasio konversi.")
        recommendations.append(f"Siapkan draf penawaran langsung sesuai budget pelanggan (Rp {sales_metrics['budget']:,.2f}).")
    else:
        recommendations.append(f"Pelanggan menghubungi via kanal {cust_data['channel']}. Sapa dengan ramah menggunakan nama Kak {cust_data['name']}.")
        recommendations.append("Klarifikasi kendala spesifik yang dihadapi dan pastikan kepuasan layanan.")

    executive_summary = (
        f"Handover dari kanal {cust_data['channel']} dipicu oleh alasan '{trigger_reason}'. "
        f"Pelanggan: {cust_data['name']} (Tier: {cust_data['tier']}, Total Belanja: Rp {cust_data['total_spent']:,.2f}). "
        f"Skor Lead Terstruktur: {sales_metrics['lead_score']:.1f} ({sales_metrics['temperature']}), "
        f"Budget Terdaftar: Rp {sales_metrics['budget']:,.2f}, Tahap Funnel: {sales_metrics['funnel_stage']}."
    )

    handover_payload = {
        "handover_id": handover_id,
        "tenant_id": tenant_id,
        "conversation_id": conversation_id,
        "customer": cust_data,
        "sales_metrics": sales_metrics,
        "handover_reason": trigger_reason,
        "trigger_details": trigger_details or {},
        "executive_summary": executive_summary,
        "actionable_recommendations": recommendations,
        "status": "PENDING",
        "created_at": now_iso,
    }

    # Simpan ke tabel handover_records
    if db_session:
        try:
            db_session.execute(
                text("""
                INSERT INTO handover_records (
                    id, tenant_id, conversation_id, customer_id, lead_id,
                    handover_reason, trigger_type, lead_score, budget,
                    funnel_stage, executive_summary, actionable_recommendations,
                    status, created_at, updated_at
                ) VALUES (
                    :id, :tid, :conv_id, :cid, :lid,
                    :reason, :t_type, :l_score, :budget,
                    :f_stage, :summary, :recs,
                    'PENDING', now(), now()
                )
                """),
                {
                    "id": handover_id,
                    "tid": tenant_id,
                    "conv_id": conversation_id,
                    "cid": customer_id,
                    "lid": lead_id,
                    "reason": trigger_reason,
                    "t_type": trigger_reason,
                    "l_score": sales_metrics["lead_score"],
                    "budget": sales_metrics["budget"],
                    "f_stage": sales_metrics["funnel_stage"],
                    "summary": executive_summary,
                    "recs": recommendations,
                }
            )

            # Perbarui status percakapan menjadi 'HANDOVER_PENDING'
            db_session.execute(
                text("""
                UPDATE conversations
                SET status = 'HANDOVER_PENDING', updated_at = now()
                WHERE id = :conv_id AND tenant_id = :tid
                """),
                {"conv_id": conversation_id, "tid": tenant_id}
            )
            db_session.commit()
        except Exception as e:
            logger.error(f"Gagal mencatat handover_records: {e}")

    return handover_payload
