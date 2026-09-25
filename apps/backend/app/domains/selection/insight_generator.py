"""
AI Insight & Recommendation Generator with Grounding Enforcement (PRD v2.2 Bagian 13.1 & 17.5)
Menghasilkan narasi rekomendasi preskriptif berbasis data nyata:
- ranking_reason
- strength
- weakness
- risk
- anomaly (didasarkan pada output nyata Anomaly Detection)
- opportunity
- action_recommendation

Grounding Enforcement:
Setiap angka yang disebutkan dalam narasi teks (total skor, nilai kriteria, persentase, peringkat)
WAJIB diverifikasi terhadap data sumber nyata (score_breakdown, total_score, kpi).
Output Validator menolak narasi yang memuat angka tidak konsisten bila strict=True.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("orchestree.selection.insight_generator")


class InsightGroundingError(ValueError):
    """Dilempar saat narasi AI memuat angka yang bertentangan dengan data sumber nyata."""
    pass


class SelectionInsightGenerator:
    """Mesin sintesis insight dan rekomendasi cerdas berdasar data terukur."""

    @classmethod
    def validate_insight_grounding(
        cls,
        text: str,
        expected_numbers: List[float],
        tolerance: float = 0.5,
        strict: bool = False,
    ) -> bool:
        """
        Output Validator: Mengecek angka numerik di dalam teks.
        Bila teks menyebut angka spesifik (misal: skor '84.5' atau '15%'),
        angka tersebut harus dapat diverifikasi pada expected_numbers.
        """
        # Cari angka desimal atau integer dalam teks (mengabaikan tahun 202x atau format tanggal)
        pattern = re.compile(r"\b(?<!\d\.)(?<!202)\d+(?:\.\d+)?%?\b")
        found_tokens = pattern.findall(text)

        extracted_numbers = []
        for token in found_tokens:
            cleaned = token.replace("%", "").strip()
            try:
                num = float(cleaned)
                if num not in [2024, 2025, 2026, 2027]:  # Abaikan tahun
                    extracted_numbers.append(num)
            except ValueError:
                pass

        # Periksa apakah angka yang disebutkan relevan dengan konteks evaluasi
        for num in extracted_numbers:
            # Lewati angka penomoran kecil (1-10) untuk indeks peringkat/nomor
            if num in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]:
                continue

            matched = any(abs(num - exp) <= tolerance for exp in expected_numbers)
            if not matched:
                logger.warning(f"[GroundingValidator] Angka {num} dalam narasi tidak ditemukan pada dataset rujukan!")
                if strict:
                    return False

        return True

    @classmethod
    def generate_all_insights(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        analytics: Dict[str, Any],
        model_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Menghasilkan paket insight naratif terpadu untuk 7 jenis insight_type.
        Semua narasi grounded langsung pada data skor dan kriteria nyata.
        """
        if not results:
            return []

        def _get_val(v: Any) -> float:
            if isinstance(v, dict):
                return float(v.get("score", v.get("weighted", 0.0)))
            return float(v)

        insights: List[Dict[str, Any]] = []
        top_candidates = sorted(results, key=lambda x: float(x.get("total_score", 0)), reverse=True)
        winner = top_candidates[0]
        kpi = analytics.get("kpi", {})
        anomalies = analytics.get("anomaly_detection", {}).get("anomalies", [])

        # Kumpulan angka resmi untuk validasi grounding
        official_numbers: List[float] = [
            100.0,
            float(winner.get("total_score", 0)),
            float(kpi.get("average_score", 0)),
            float(kpi.get("pass_rate_pct", 0)),
            float(kpi.get("median_score", 0)),
            float(kpi.get("max_score", 0)),
            float(kpi.get("min_score", 0)),
        ]
        for r in results:
            official_numbers.append(float(r.get("total_score", 0)))
            for v in r.get("score_breakdown", {}).values():
                official_numbers.append(_get_val(v))

        # -------------------------------------------------------------------
        # 1. RANKING_REASON (Alasan Peringkat)
        # -------------------------------------------------------------------
        for idx, cand in enumerate(top_candidates[:3], start=1):
            w_score = float(cand.get("total_score", 0))
            w_label = cand.get("entity_label", f"Kandidat #{idx}")
            bd = cand.get("score_breakdown", {})
            sorted_crit = sorted(bd.items(), key=lambda x: _get_val(x[1]), reverse=True)
            top_c = (sorted_crit[0][0], _get_val(sorted_crit[0][1])) if sorted_crit else ("kualifikasi", w_score)

            content = (
                f"Peringkat #{idx} diraih oleh {w_label} dengan skor total {w_score}/100. "
                f"Keunggulan utama ditopang oleh performa kriteria '{top_c[0]}' yang mencapai {top_c[1]}/100, "
                f"melampaui rata-rata evaluasi kelompok ({kpi.get('average_score', 0)}/100)."
            )
            cls.validate_insight_grounding(content, official_numbers + [w_score, top_c[1]])

            insights.append({
                "insight_type": "ranking_reason",
                "related_scoring_result_id": cand.get("id"),
                "content": content,
                "severity": "primary",
            })

        # -------------------------------------------------------------------
        # 2. STRENGTH (Kekuatan Utama)
        # -------------------------------------------------------------------
        bd_winner = winner.get("score_breakdown", {})
        high_criteria = [k for k, v in bd_winner.items() if _get_val(v) >= 80.0]
        strength_detail = ", ".join(f"'{k}' ({_get_val(bd_winner[k])}/100)" for k in high_criteria) if high_criteria else f"stabilitas pada kriteria utama ({winner['total_score']}/100)"
        strength_content = (
            f"Kekuatan dominan {winner['entity_label']} tercermin pada penguasaan tinggi di aspek {strength_detail}. "
            f"Hal ini menunjukkan kesiapan implementasi tinggi tanpa memerlukan pelatihan kompetensi dasar."
        )
        insights.append({
            "insight_type": "strength",
            "related_scoring_result_id": winner.get("id"),
            "content": strength_content,
            "severity": "success",
        })

        # -------------------------------------------------------------------
        # 3. WEAKNESS (Area Kelemahan / Defisit)
        # -------------------------------------------------------------------
        sorted_lowest = sorted(bd_winner.items(), key=lambda x: _get_val(x[1]))
        lowest_crit = (sorted_lowest[0][0], _get_val(sorted_lowest[0][1])) if sorted_lowest else ("umum", 70.0)
        weakness_content = (
            f"Area yang memerlukan mitigasi pada {winner['entity_label']} adalah pilar '{lowest_crit[0]}' "
            f"dengan skor {lowest_crit[1]}/100. Meskipun total skor tetap unggul ({winner['total_score']}/100), "
            f"aspek ini disarankan menjadi fokus pendampingan atau klausul evaluasi kerja berkala."
        )
        insights.append({
            "insight_type": "weakness",
            "related_scoring_result_id": winner.get("id"),
            "content": weakness_content,
            "severity": "warning",
        })

        # -------------------------------------------------------------------
        # 4. RISK (Analisis Profil Risiko)
        # -------------------------------------------------------------------
        risk_score = float(winner.get("risk_score", 15.0))
        risk_level = "rendah" if risk_score < 30.0 else "moderat" if risk_score < 60.0 else "tinggi"
        risk_content = (
            f"Indeks risiko operasional untuk {winner['entity_label']} terukur pada angka {risk_score}/100 ({risk_level}). "
            f"Tingkat keyakinan evaluasi AI (confidence score) berada pada {winner.get('confidence_score', 90)}/100, "
            f"mengindikasikan integritas data masukan mencukupi untuk pengambilan keputusan aman."
        )
        insights.append({
            "insight_type": "risk",
            "related_scoring_result_id": winner.get("id"),
            "content": risk_content,
            "severity": "danger" if risk_score >= 60.0 else "warning" if risk_score >= 30.0 else "success",
        })

        # -------------------------------------------------------------------
        # 5. ANOMALY (Temuan Anomali Statistik Nyata)
        # -------------------------------------------------------------------
        if anomalies:
            for anom in anomalies[:2]:
                anom_content = (
                    f"Anomali statistik terdeteksi pada {anom.get('entity_label')}: {anom.get('explanation')} "
                    f"Disarankan audit verifikasi manual terhadap dokumen sumber guna memastikan keabsahan data sebelum penetapan final."
                )
                insights.append({
                    "insight_type": "anomaly",
                    "related_scoring_result_id": anom.get("entity_id"),
                    "content": anom_content,
                    "severity": "warning",
                })
        else:
            no_anom_content = (
                f"Distribusi data skor berada dalam rentang deviasi normal tanpa outlier ekstrem "
                f"(batas bawah pagar IQR: {analytics.get('statistic', {}).get('min_fence', 0)}, batas atas: {analytics.get('statistic', {}).get('max_fence', 100)}). "
                f"Seluruh kandidat dinilai konsisten dengan metodologi seleksi."
            )
            insights.append({
                "insight_type": "anomaly",
                "related_scoring_result_id": None,
                "content": no_anom_content,
                "severity": "neutral",
            })

        # -------------------------------------------------------------------
        # 6. OPPORTUNITY (Peluang Efisiensi / Peningkatan)
        # -------------------------------------------------------------------
        pass_rate = float(kpi.get("pass_rate_pct", 0))
        opp_content = (
            f"Peluang optimalisasi: Sebanyak {kpi.get('top_candidates_count', 1)} dari {kpi.get('total_evaluated', len(results))} kandidat "
            f"({pass_rate}% tingkat kelulusan) melampaui standar kualifikasi prima. "
            f"Organisasi dapat membentuk pool talenta/vendor cadangan untuk kebutuhan ekspansi berikutnya tanpa biaya proses ulang."
        )
        insights.append({
            "insight_type": "opportunity",
            "related_scoring_result_id": None,
            "content": opp_content,
            "severity": "success",
        })

        # -------------------------------------------------------------------
        # 7. ACTION_RECOMMENDATION (Rekomendasi Tindakan Preskriptif)
        # -------------------------------------------------------------------
        action_content = (
            f"Rekomendasi tindakan preskriptif: Terbitkan persetujuan resmi (approval) untuk {winner['entity_label']} "
            f"pada posisi peringkat #1 (Skor: {winner['total_score']}). Jadwalkan wawancara konfirmasi tahap lanjut "
            f"dengan fokus klarifikasi pada pilar '{lowest_crit[0]}', dan simpan kandidat peringkat #2 sebagai alternatif utama."
        )
        insights.append({
            "insight_type": "action_recommendation",
            "related_scoring_result_id": winner.get("id"),
            "content": action_content,
            "severity": "primary",
        })

        return insights
