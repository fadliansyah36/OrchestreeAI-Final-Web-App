"""
OrchestreeAI Lead Scoring & Funnel Stage Engine (PRD v2.2 Bagian 12.4 & 15.1)

Menyediakan:
- determine_funnel_stage(): Menentukan tahap funnel pelanggan secara deterministik dan dinamis.
- calculate_lead_score(): Menghitung skor lead (0.00-100.00) dan suhu (COLD, WARM, HOT).
- Evaluasi otomatis pada SETIAP event interaksi (pesan baru, jawaban kualifikasi BANT, perubahan tahap).
- Notifikasi Sales via Notification Center saat lead mencapai HOT (skor >= 70).
"""

from typing import Dict, Any, List, Optional, Tuple
import logging
from datetime import datetime, timezone
import uuid
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

logger = logging.getLogger("orchestree.sales.lead_scoring")

# Tahap Funnel Standar
FUNNEL_STAGES = ["AWARENESS", "INTEREST", "DECISION", "ACTION", "RETENTION"]
LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFYING", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]
TEMPERATURES = ["COLD", "WARM", "HOT"]


def determine_funnel_stage(
    current_stage: Optional[str] = "AWARENESS",
    qualification_answers: Optional[List[Dict[str, Any]]] = None,
    messages_count: int = 0,
    lead_stage: str = "NEW",
    deal_value: float = 0.0,
    lifecycle_stage: str = "LEAD",
    intent_signals: Optional[List[str]] = None,
) -> str:
    """
    Menentukan tahap funnel pelanggan (PRD v2.2 Bagian 12.4) secara deterministik:
    - AWARENESS: Default interaksi awal, kontak pertama.
    - INTEREST: Menunjukkan ketertarikan (pesan > 1, pertanyaan produk/fitur).
    - DECISION: Masuk evaluasi spesifik, telah menjawab kualifikasi BANT, minta proposal / demo.
    - ACTION: Komitmen beli (negosiasi, request faktur/kontrak, tahap WON).
    - RETENTION: Lifecycle stage customer aktif atau pasca-penjualan.
    """
    answers = qualification_answers or []
    intents = [it.lower() for it in (intent_signals or [])]

    # 1. Jika lifecycle adalah CUSTOMER atau pasca pembelian
    if lifecycle_stage == "CUSTOMER" or lead_stage == "WON":
        return "RETENTION" if lifecycle_stage == "CUSTOMER" and lead_stage != "WON" else "ACTION"

    # 2. Jika tahap lead di NEGOTIATION atau ada intent beli konkret
    if lead_stage in ("NEGOTIATION", "WON") or any("buy" in it or "order" in it or "invoice" in it for it in intents):
        return "ACTION"

    # 3. Jika sudah ada jawaban kualifikasi (misal Budget / Timeline / Authority) atau tahap PROPOSAL / QUALIFIED
    has_budget_or_timeline = any(a.get("question_key") in ("budget", "timeline", "authority") for a in answers)
    if lead_stage in ("QUALIFIED", "PROPOSAL") or (len(answers) >= 2 and has_budget_or_timeline):
        return "DECISION"

    # 4. Jika customer sudah aktif berinteraksi atau tahap CONTACTED / QUALIFYING
    if messages_count >= 2 or lead_stage in ("CONTACTED", "QUALIFYING") or any("pricing" in it or "demo" in it for it in intents):
        return "INTEREST"

    return "AWARENESS"


def calculate_lead_score(
    lead_data: Dict[str, Any],
    qualification_answers: Optional[List[Dict[str, Any]]] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
    stage: Optional[str] = None,
) -> Tuple[float, str, Dict[str, Any]]:
    """
    Menghitung skor lead (0.00 - 100.00) dan menentukan suhu (COLD, WARM, HOT).
    
    Komponen Skor:
    1. Base Score: 10.00
    2. BANT Qualification (hingga 50 pts):
       - Budget terverifikasi: +15.00
       - Authority (Decision Maker): +15.00, Manager: +8.00
       - Need spesifik: +10.00
       - Timeline (< 1 bulan: +15.00, 1-3 bulan: +8.00)
    3. Stage Progress (hingga 25 pts):
       - NEW: +0, CONTACTED: +5, QUALIFYING: +10, QUALIFIED: +18, PROPOSAL: +22, NEGOTIATION: +25, WON: +35, LOST: 0
    4. Engagement Signals (hingga 15 pts):
       - Volume pesan customer (2 pts per pesan, max 10 pts)
       - Deal value signifikan (> 10jt: +5 pts)
    
    Returns:
        (score, temperature, breakdown_dict)
    """
    answers = qualification_answers or []
    msg_list = messages or []
    current_stage = (stage or lead_data.get("stage", "NEW")).upper()

    score = 10.00  # Baseline
    breakdown: Dict[str, Any] = {
        "base_score": 10.00,
        "qualification_score": 0.00,
        "stage_score": 0.00,
        "engagement_score": 0.00,
        "deal_value_score": 0.00,
        "details": []
    }

    # 1. Kualifikasi BANT
    qual_score = 0.00
    for ans in answers:
        q_key = (ans.get("question_key") or "").lower()
        val = str(ans.get("answer_text") or "").lower()
        weight = float(ans.get("score_weight") or 10.0)

        if q_key == "budget":
            # Ada angka atau konfirmasi dana
            if any(num in val for num in ["jt", "juta", "rb", "ribu", "000", "rp", "dollar", "$", "budget", "ada"]):
                qual_score += 15.00
                breakdown["details"].append({"component": "BANT - Budget", "points": 15.00, "reason": "Anggaran terkonfirmasi"})
            else:
                qual_score += 5.00
                breakdown["details"].append({"component": "BANT - Budget", "points": 5.00, "reason": "Anggaran belum pasti"})
        elif q_key == "authority":
            if any(role in val for role in ["owner", "founder", "ceo", "direktur", "c-level", "pengambil keputusan", "pemilik"]):
                qual_score += 15.00
                breakdown["details"].append({"component": "BANT - Authority", "points": 15.00, "reason": "Pengambil Keputusan Utama (C-Level/Owner)"})
            elif any(role in val for role in ["manager", "lead", "kepala", "kabid"]):
                qual_score += 8.00
                breakdown["details"].append({"component": "BANT - Authority", "points": 8.00, "reason": "Manajer / Evaluator Teknis"})
            else:
                qual_score += 4.00
                breakdown["details"].append({"component": "BANT - Authority", "points": 4.00, "reason": "Staf Pengusul"})
        elif q_key == "need":
            if len(val) >= 10:
                qual_score += 10.00
                breakdown["details"].append({"component": "BANT - Need", "points": 10.00, "reason": "Kebutuhan bisnis terdeskripsi jelas"})
            else:
                qual_score += 5.00
                breakdown["details"].append({"component": "BANT - Need", "points": 5.00, "reason": "Kebutuhan umum"})
        elif q_key == "timeline":
            if any(t in val for val in ["minggu", "segera", "bulan ini", "urgent", "cepat", "< 1 bulan"]):
                qual_score += 15.00
                breakdown["details"].append({"component": "BANT - Timeline", "points": 15.00, "reason": "Implementasi mendesak (< 1 bulan)"})
            elif any(t in val for val in ["1-3", "kuartal", "q1", "q2", "q3", "q4"]):
                qual_score += 8.00
                breakdown["details"].append({"component": "BANT - Timeline", "points": 8.00, "reason": "Implementasi jangka menengah (1-3 bulan)"})
            else:
                qual_score += 3.00
                breakdown["details"].append({"component": "BANT - Timeline", "points": 3.00, "reason": "Timeline belum ditentukan"})
        else:
            # Pertanyaan kualifikasi lainnya (ukuran perusahaan, industri, dsb)
            qual_score += min(weight, 5.00)
            breakdown["details"].append({"component": f"Kualifikasi - {q_key}", "points": min(weight, 5.00), "reason": "Kualifikasi tambahan"})

    qual_score = min(qual_score, 50.00)
    score += qual_score
    breakdown["qualification_score"] = round(qual_score, 2)

    # 2. Stage Progress Score
    stage_weights = {
        "NEW": 0.00,
        "CONTACTED": 5.00,
        "QUALIFYING": 10.00,
        "QUALIFIED": 18.00,
        "PROPOSAL": 22.00,
        "NEGOTIATION": 25.00,
        "WON": 35.00,
        "LOST": -10.00,
    }
    stage_pt = stage_weights.get(current_stage, 0.00)
    score += stage_pt
    breakdown["stage_score"] = stage_pt
    breakdown["details"].append({"component": "Tahap Pipeline", "points": stage_pt, "reason": f"Tahap saat ini: {current_stage}"})

    # 3. Engagement Score dari Pesan Customer
    cust_msgs = [m for m in msg_list if m.get("sender_type") == "CUSTOMER" or m.get("direction") == "INBOUND"]
    engagement_pts = min(len(cust_msgs) * 2.0, 10.00)
    score += engagement_pts
    breakdown["engagement_score"] = engagement_pts
    if engagement_pts > 0:
        breakdown["details"].append({"component": "Interaksi Customer", "points": engagement_pts, "reason": f"{len(cust_msgs)} pesan masuk dari customer"})

    # 4. Deal Value Score
    deal_val = float(lead_data.get("deal_value") or 0.0)
    if deal_val >= 25000000:
        score += 5.00
        breakdown["deal_value_score"] = 5.00
        breakdown["details"].append({"component": "Nilai Peluang (Deal Value)", "points": 5.00, "reason": "Peluang enterprise >= Rp 25.000.000"})
    elif deal_val >= 5000000:
        score += 2.50
        breakdown["deal_value_score"] = 2.50
        breakdown["details"].append({"component": "Nilai Peluang (Deal Value)", "points": 2.50, "reason": "Peluang menengah >= Rp 5.000.000"})

    # Clamp skor ke 0.00 - 100.00
    final_score = round(max(0.00, min(100.00, score)), 2)

    # Tentukan Suhu (Temperature)
    if final_score >= 70.00:
        temperature = "HOT"
    elif final_score >= 40.00:
        temperature = "WARM"
    else:
        temperature = "COLD"

    return final_score, temperature, breakdown


async def record_score_update_and_notify(
    session,
    tenant_id: str,
    lead_id: str,
    previous_score: float,
    new_score: float,
    trigger_event: str,
    trigger_details: Dict[str, Any],
    lead_info: Dict[str, Any],
    qualification_answers: Optional[List[Dict[str, Any]]] = None,
) -> bool:
    """
    Mencatat pembaruan skor ke lead_score_history dan membuat notifikasi Sales
    jika skor mencapai atau melampaui batas HOT (>= 70).
    """
    delta = round(new_score - previous_score, 2)

    # 1. Catat ke lead_score_history
    history_query = sa.text("""
        INSERT INTO lead_score_history (
            id, tenant_id, lead_id, previous_score, new_score, delta, 
            trigger_event, trigger_details, calculated_by, created_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :lead_id, :prev_score, :new_score, :delta,
            :trigger_event, :trigger_details, 'LEAD_SCORING_ENGINE', now()
        )
    """)
    await session.execute(
        history_query,
        {
            "tenant_id": tenant_id,
            "lead_id": lead_id,
            "prev_score": previous_score,
            "new_score": new_score,
            "delta": delta,
            "trigger_event": trigger_event,
            "trigger_details": sa.dialects.postgresql.json.dumps(trigger_details),
        },
    )

    # 2. Evaluasi Notifikasi Hot Lead
    # Syarat: Skor mencapai HOT (>= 70) dan ada peningkatan signifikan atau baru melewati threshold
    if new_score >= 70.00 and (previous_score < 70.00 or trigger_event in ("QUALIFICATION_ANSWER", "MANUAL_RECALC")):
        contact_name = lead_info.get("contact_name") or "Prospek"
        company_name = lead_info.get("company_name") or "Perusahaan"
        title = lead_info.get("title") or "Peluang Penjualan"
        deal_value = float(lead_info.get("deal_value") or 0.0)

        # Ringkasan jawaban kualifikasi nyata
        answers = qualification_answers or []
        ans_map = {a.get("question_key"): a.get("answer_text") for a in answers}
        bant_summary = (
            f"• Kebutuhan: {ans_map.get('need', 'Belum dijawab')}\n"
            f"• Budget: {ans_map.get('budget', 'Belum dijawab')}\n"
            f"• Wewenang: {ans_map.get('authority', 'Belum dijawab')}\n"
            f"• Timeline: {ans_map.get('timeline', 'Belum dijawab')}"
        )

        formatted_val = f"Rp {deal_value:,.0f}".replace(",", ".")
        notif_msg = (
            f"Lead '{title}' mencapai skor {new_score:.1f} (HOT) dengan estimasi deal {formatted_val}.\n\n"
            f"Ringkasan Kualifikasi Nyata:\n{bant_summary}\n\n"
            f"Riwayat Skor: {previous_score:.1f} ➔ {new_score:.1f} ({'+' if delta >= 0 else ''}{delta:.1f}) "
            f"[Trigger: {trigger_event}]. Segera hubungi customer untuk penjadwalan demo!"
        )

        notif_query = sa.text("""
            INSERT INTO notifications (
                id, tenant_id, user_id, title, message, type, severity, is_read, metadata, created_at
            ) VALUES (
                gen_random_uuid(), :tenant_id, :user_id, :title, :message, 'SALES_HOT_LEAD', 'HIGH', false, :metadata, now()
            )
        """)
        await session.execute(
            notif_query,
            {
                "tenant_id": tenant_id,
                "user_id": lead_info.get("assigned_user_id"),
                "title": f"🔥 Hot Lead: {contact_name} ({company_name}) - Skor {new_score:.1f}",
                "message": notif_msg,
                "metadata": sa.dialects.postgresql.json.dumps({
                    "lead_id": lead_id,
                    "previous_score": previous_score,
                    "new_score": new_score,
                    "temperature": "HOT",
                    "trigger_event": trigger_event,
                }),
            },
        )
        logger.info(f"[LeadScoring] Hot Lead notifikasi diterbitkan untuk lead '{lead_id}' (Skor {new_score})")

    return True
