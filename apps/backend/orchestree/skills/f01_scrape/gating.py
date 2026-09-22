"""
OrchestreeAI F.01-SCRAPE Gating & Change Detection Engine (PRD v2.2 Bagian 7.1)

Algoritma:
1. detectChange(): Membandingkan snapshot sebelumnya dengan snapshot saat ini secara struktural
   (perubahan harga, produk baru, kampanye baru, pergeseran positioning, perubahan stok).
2. calculateGatingScore(): Menghitung skor 4 dimensi berbobot:
   - Novelty Score (bobot 0.20)
   - Relevance Score (bobot 0.25)
   - Urgency Score (bobot 0.25)
   - Business Impact Score (bobot 0.30)
   Final Score = (0.20 * novelty) + (0.25 * relevance) + (0.25 * urgency) + (0.30 * impact)
3. Thresholding Aksi:
   - final_score >= 0.75 ATAU urgency >= 0.85 -> SEND_IMMEDIATE
   - final_score >= 0.45 -> INCLUDE_DIGEST
   - final_score < 0.45 -> DISCARD
4. Rekomendasi Strategis dan Kontra-Strategi
5. Idempotency Key unik untuk mencegah pengiriman ganda ke Proactive Agent.
"""

import hashlib
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from decimal import Decimal

logger = logging.getLogger("orchestree.skills.f01_scrape.gating")


class DetectedChange:
    def __init__(
        self,
        change_type: str,
        title: str,
        description: str,
        diff_payload: Dict[str, Any],
        severity: str = "medium"
    ):
        self.change_type = change_type
        self.title = title
        self.description = description
        self.diff_payload = diff_payload
        self.severity = severity


class ScoredInsightResult:
    def __init__(
        self,
        title: str,
        summary: str,
        category: str,
        novelty_score: float,
        relevance_score: float,
        urgency_score: float,
        business_impact_score: float,
        final_score: float,
        dispatch_action: str,
        strategic_recommendation: str,
        counter_strategy: Dict[str, Any],
        idempotency_key: str,
    ):
        self.title = title
        self.summary = summary
        self.category = category
        self.novelty_score = novelty_score
        self.relevance_score = relevance_score
        self.urgency_score = urgency_score
        self.business_impact_score = business_impact_score
        self.final_score = final_score
        self.dispatch_action = dispatch_action
        self.strategic_recommendation = strategic_recommendation
        self.counter_strategy = counter_strategy
        self.idempotency_key = idempotency_key


def detect_changes(
    target_name: str,
    previous_data: Optional[Dict[str, Any]],
    current_data: Dict[str, Any],
) -> List[DetectedChange]:
    """
    Membandingkan data berstruktur JSON antara dua snapshot.
    Mendeteksi perbedaan harga, katalog produk, kampanye promosi, dan positioning.
    """
    changes: List[DetectedChange] = []

    if not previous_data:
        # Snapshot perdana: catat inisiasi baseline kompetitor
        changes.append(
            DetectedChange(
                change_type="other",
                title=f"Inisiasi Baseline Intelijen: {target_name}",
                description=f"Snapshot awal berhasil diambil untuk pemantauan kompetitif {target_name}.",
                diff_payload={"status": "initial_baseline_established", "items_count": len(current_data.get("products", []))},
                severity="low",
            )
        )
        return changes

    # 1. Deteksi Perubahan Produk & Harga
    prev_products = {p.get("name", "").strip().lower(): p for p in previous_data.get("products", []) if p.get("name")}
    curr_products = {p.get("name", "").strip().lower(): p for p in current_data.get("products", []) if p.get("name")}

    # Cek produk baru
    for name, curr_p in curr_products.items():
        if name not in prev_products:
            changes.append(
                DetectedChange(
                    change_type="new_product",
                    title=f"Produk Baru Diluncurkan: {curr_p.get('name')}",
                    description=f"{target_name} meluncurkan produk/layanan baru '{curr_p.get('name')}' dengan estimasi harga {curr_p.get('price', 'N/A')}.",
                    diff_payload={"product": curr_p},
                    severity="high" if curr_p.get("is_flagship") else "medium",
                )
            )
        else:
            prev_p = prev_products[name]
            # Bandingkan harga jika tersedia
            prev_price_str = str(prev_p.get("price", "")).replace(".", "").replace(",", "")
            curr_price_str = str(curr_p.get("price", "")).replace(".", "").replace(",", "")
            
            # Ekstrak angka numerik
            prev_digits = "".join(filter(str.isdigit, prev_price_str))
            curr_digits = "".join(filter(str.isdigit, curr_price_str))

            if prev_digits and curr_digits and prev_digits != curr_digits:
                prev_val = float(prev_digits)
                curr_val = float(curr_digits)
                if prev_val > 0:
                    diff_pct = round(((curr_val - prev_val) / prev_val) * 100, 2)
                    if diff_pct < 0:
                        changes.append(
                            DetectedChange(
                                change_type="price_drop",
                                title=f"Penurunan Harga {abs(diff_pct)}%: {curr_p.get('name')}",
                                description=f"{target_name} memangkas harga '{curr_p.get('name')}' dari {prev_p.get('price')} menjadi {curr_p.get('price')}.",
                                diff_payload={"previous_price": prev_p.get("price"), "current_price": curr_p.get("price"), "change_percent": diff_pct},
                                severity="critical" if abs(diff_pct) >= 20 else "high",
                            )
                        )
                    else:
                        changes.append(
                            DetectedChange(
                                change_type="price_increase",
                                title=f"Kenaikan Harga {diff_pct}%: {curr_p.get('name')}",
                                description=f"{target_name} menaikkan harga '{curr_p.get('name')}' dari {prev_p.get('price')} ke {curr_p.get('price')}.",
                                diff_payload={"previous_price": prev_p.get("price"), "current_price": curr_p.get("price"), "change_percent": diff_pct},
                                severity="medium",
                            )
                        )

    # Cek produk diskontinu
    for name, prev_p in prev_products.items():
        if name not in curr_products:
            changes.append(
                DetectedChange(
                    change_type="product_discontinued",
                    title=f"Produk Tidak Lagi Ditampilkan: {prev_p.get('name')}",
                    description=f"{target_name} menghapus produk '{prev_p.get('name')}' dari katalog publik.",
                    diff_payload={"discontinued_product": prev_p},
                    severity="low",
                )
            )

    # 2. Deteksi Kampanye Baru
    prev_campaigns = {c.get("title", "").strip().lower() for c in previous_data.get("campaigns", []) if c.get("title")}
    for curr_c in current_data.get("campaigns", []):
        c_title = curr_c.get("title", "").strip()
        if c_title and c_title.lower() not in prev_campaigns:
            changes.append(
                DetectedChange(
                    change_type="campaign_launch",
                    title=f"Kampanye Baru Terdeteksi: {c_title}",
                    description=f"{target_name} meluncurkan kampanye baru '{c_title}'. Detail: {curr_c.get('banner_copy', '')}",
                    diff_payload={"campaign": curr_c},
                    severity="high" if "promo" in c_title.lower() or "diskon" in c_title.lower() else "medium",
                )
            )

    # 3. Deteksi Pergeseran Positioning
    prev_positioning = previous_data.get("positioning_statement", "")
    curr_positioning = current_data.get("positioning_statement", "")
    if prev_positioning and curr_positioning and prev_positioning != curr_positioning:
        changes.append(
            DetectedChange(
                change_type="positioning_shift",
                title=f"Pergeseran Narasi Nilai & Positioning {target_name}",
                description=f"Pernyataan positioning berubah dari '{prev_positioning}' menjadi '{curr_positioning}'.",
                diff_payload={"previous": prev_positioning, "current": curr_positioning},
                severity="medium",
            )
        )

    return changes


def evaluate_scoring_gating(
    tenant_id: str,
    target_id: str,
    target_name: str,
    change: DetectedChange,
    tenant_industry: str = "technology",
) -> ScoredInsightResult:
    """
    Menghitung skor gating 4 dimensi dan memetakan aksi dispatch.
    Rumus: final_score = (0.20 * novelty) + (0.25 * relevance) + (0.25 * urgency) + (0.30 * impact)
    Threshold:
    - final_score >= 0.75 ATAU urgency >= 0.85 -> SEND_IMMEDIATE
    - final_score >= 0.45 -> INCLUDE_DIGEST
    - < 0.45 -> DISCARD
    """
    # Hitung Novelty (0.0 - 1.0)
    if change.change_type in ["new_product", "campaign_launch"]:
        novelty = 0.85
    elif change.change_type in ["price_drop", "positioning_shift"]:
        novelty = 0.75
    elif change.change_type in ["price_increase", "product_discontinued"]:
        novelty = 0.50
    else:
        novelty = 0.30

    # Hitung Relevance (0.0 - 1.0)
    relevance = 0.80  # Default relevansi langsung dari target kompetitor yang sengaja dipantau

    # Hitung Urgency (0.0 - 1.0)
    if change.change_type == "price_drop" and change.severity == "critical":
        urgency = 0.95
    elif change.change_type in ["price_drop", "campaign_launch"]:
        urgency = 0.80
    elif change.change_type == "new_product":
        urgency = 0.75
    elif change.change_type == "positioning_shift":
        urgency = 0.50
    else:
        urgency = 0.35

    # Hitung Business Impact (0.0 - 1.0)
    if change.severity == "critical":
        impact = 0.90
    elif change.severity == "high":
        impact = 0.75
    elif change.severity == "medium":
        impact = 0.55
    else:
        impact = 0.25

    # Kalkulasi Final Score berbobot persis PRD v2.2 Bagian 7.1
    final_score = round(
        (0.20 * novelty) + (0.25 * relevance) + (0.25 * urgency) + (0.30 * impact),
        3
    )

    # Tentukan Dispatch Action
    if final_score >= 0.75 or urgency >= 0.85:
        dispatch_action = "SEND_IMMEDIATE"
    elif final_score >= 0.45:
        dispatch_action = "INCLUDE_DIGEST"
    else:
        dispatch_action = "DISCARD"

    # Rekomendasi Strategis dan Kontra-Strategi
    if change.change_type == "price_drop":
        category = "pricing"
        rec = f"Segera tinjau elastisitas harga dan tawarkan bundling nilai tambah atau program loyalitas untuk menangkal agresi diskon {target_name} tanpa merusak margin kotor."
        counter = {
            "primary_action": "Value Bundling & Loyalty Incentive",
            "target_departments": ["Sales", "Marketing", "Finance"],
            "urgency": "immediate",
            "tactics": [
                "Luncurkan paket bundling fitur unggulan yang tidak dimiliki kompetitor.",
                "Aktifkan penawaran retensi untuk klien berisiko churn tinggi.",
                "Siapkan battle card komparasi fitur bagi tim account executive."
            ]
        }
    elif change.change_type == "new_product":
        category = "product"
        rec = f"Analisis diferensiasi fitur produk baru {target_name}. Tingkatkan komunikasi unique selling proposition (USP) dan percepat roadmap fitur pelengkap."
        counter = {
            "primary_action": "Product Differentiation & Feature Highlighting",
            "target_departments": ["Product", "Marketing"],
            "urgency": "high",
            "tactics": [
                "Publikasikan matriks perbandingan fitur objektif di basis pengetahuan.",
                "Brief tim sales mengenai celah keterbatasan arsitektur produk lawan.",
                "Review umpan balik pengguna atas celah kebutuhan yang belum terlayani."
            ]
        }
    elif change.change_type == "campaign_launch":
        category = "marketing"
        rec = f"Pantau jangkauan kampanye baru {target_name}. Alokasikan kampanye tandingan berfokus pada ROI dan keandalan operasional enterprise."
        counter = {
            "primary_action": "Counter Messaging & Thought Leadership",
            "target_departments": ["Marketing", "Sales"],
            "urgency": "high",
            "tactics": [
                "Optimalkan kata kunci kampanye penelusuran berbayar pada brand lawan.",
                "Sebarkan studi kasus pembuktian efisiensi nyata tenaga kerja AI."
            ]
        }
    else:
        category = "market_shift"
        rec = f"Dokumentasikan pergeseran ini ke dalam laporan lanskap mingguan sebagai bahan evaluasi komite strategis."
        counter = {
            "primary_action": "Trend Logging & Strategic Digest",
            "target_departments": ["Strategy", "Executive"],
            "urgency": "routine",
            "tactics": ["Masukkan ke dalam rangkuman intelijen mingguan."]
        }

    # Idempotency Key unik yang deterministik berdasarkan isi perubahan
    idemp_raw = f"{tenant_id}:{target_id}:{change.change_type}:{change.title}:{final_score}"
    idempotency_key = "idemp_insight_" + hashlib.sha256(idemp_raw.encode("utf-8")).hexdigest()[:32]

    return ScoredInsightResult(
        title=f"[{dispatch_action}] {change.title}",
        summary=change.description,
        category=category,
        novelty_score=novelty,
        relevance_score=relevance,
        urgency_score=urgency,
        business_impact_score=impact,
        final_score=final_score,
        dispatch_action=dispatch_action,
        strategic_recommendation=rec,
        counter_strategy=counter,
        idempotency_key=idempotency_key,
    )
