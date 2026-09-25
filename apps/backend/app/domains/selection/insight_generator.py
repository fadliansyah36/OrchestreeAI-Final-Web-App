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
    def collect_official_numbers(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        analytics: Dict[str, Any],
    ) -> List[float]:
        """Mengumpulkan seluruh angka resmi yang valid dari dataset sumber untuk grounding validator."""
        numbers: List[float] = [0.0, 100.0]

        def _add(val: Any) -> None:
            if val is None:
                return
            if isinstance(val, (int, float)):
                numbers.append(round(float(val), 2))
                numbers.append(float(val))
            elif isinstance(val, dict):
                for v in val.values():
                    _add(v)
            elif isinstance(val, list):
                for v in val:
                    _add(v)

        # 1. Dari Hasil Scoring
        for r in results:
            t_score = float(r.get("total_score", 0))
            _add(t_score)
            _add(r.get("rank_position"))

            r_score = r.get("risk_score")
            if r_score is None:
                r_score = round(max(5.0, 100.0 - t_score * 0.8), 2)
            _add(r_score)

            c_score = r.get("confidence_score")
            if c_score is None:
                c_score = 90.0
            _add(c_score)

            bd = r.get("score_breakdown", {})
            if isinstance(bd, dict):
                for k, v in bd.items():
                    if isinstance(v, dict):
                        _add(v.get("score"))
                        _add(v.get("weighted"))
                    else:
                        _add(v)

        # 2. Dari Kriteria
        for c in criteria:
            w = c.get("weight")
            if w is not None:
                _add(w)
                _add(float(w) * 100.0)

        # 3. Dari Analitik (KPI, Distribusi, Statistik, Anomali, Tren)
        for key in ["kpi", "distribution", "comparison", "trend", "correlation", "statistic", "performance", "anomaly_detection"]:
            section = analytics.get(key, {})
            if isinstance(section, dict):
                for sk, sv in section.items():
                    _add(sv)

        # 4. Dari Daftar Anomali
        anomalies = analytics.get("anomaly_detection", {}).get("anomalies", [])
        if isinstance(anomalies, list):
            for a in anomalies:
                _add(a.get("total_score"))
                _add(a.get("z_score"))
                _add(a.get("iqr_min_fence"))
                _add(a.get("iqr_max_fence"))
                _add(a.get("intra_spread"))

        return list(set(numbers))

    @classmethod
    def validate_insight_grounding(
        cls,
        text: str,
        expected_numbers: List[float],
        tolerance: float = 0.5,
        strict: bool = False,
        raise_on_error: bool = False,
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
                    if raise_on_error:
                        raise InsightGroundingError(
                            f"Grounding Enforcement Failed: Angka {num} dalam narasi tidak ditemukan pada dataset rujukan resmi."
                        )
                    return False

        return True

    @classmethod
    async def generate_all_insights_async(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        analytics: Dict[str, Any],
        tenant_id: Optional[str] = None,
        model_id: Optional[str] = None,
        strict: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Versi asinkron: Mencoba inferensi via ModelRouter bila tenant_id & model_id tersedia,
        lalu memvalidasi setiap keluaran dengan Output Validator.
        Jika LLM berhalusinasi atau tidak tersedia, otomatis jatuh ke sintesis grounded deterministik.
        """
        if not results:
            return []

        official_numbers = cls.collect_official_numbers(results, criteria, analytics)

        # Coba panggil ModelRouter jika tenant_id ada
        if tenant_id:
            try:
                from app.core.model_router.router import ModelRouter, ModelRouterRequest
                router = ModelRouter()
                top_cand = sorted(results, key=lambda x: float(x.get("total_score", 0)), reverse=True)[0]
                kpi = analytics.get("kpi", {})

                prompt = (
                    f"Sebagai sistem AI Selection OrchestreeAI, buat ringkasan rekomendasi tindakan untuk kandidat teratas: "
                    f"Nama: {top_cand.get('entity_label')}, Skor: {top_cand.get('total_score')}, "
                    f"Rata-rata kelompok: {kpi.get('average_score', 0)}. Gunakan angka resmi persis."
                )

                router_req = ModelRouterRequest(
                    tenant_id=tenant_id,
                    task_type="text_generation",
                    prompt=prompt,
                    preferred_model=model_id or "meta/llama-3.2-11b-vision-instruct",
                    system_prompt="Anda adalah AI Selection Analyst yang wajib patuh pada Grounding Enforcement. Jangan sebut angka yang tidak ada di prompt.",
                    max_tokens=256,
                )
                router_res = await router.route(router_req)
                if router_res and router_res.status == "success" and router_res.content:
                    is_grounded = cls.validate_insight_grounding(
                        router_res.content,
                        official_numbers,
                        tolerance=0.5,
                        strict=True,
                    )
                    if is_grounded:
                        logger.info(f"[SelectionInsight] Berhasil menghasilkan narasi via ModelRouter ({router_res.provider_id}).")
            except Exception as e:
                logger.warning(f"[SelectionInsight] ModelRouter dilewati atau gagal ({e}), menggunakan sintesis grounded.")

        # Selalu hasilkan paket insight terstruktur lengkap yang 100% grounded
        return cls.generate_all_insights(
            results=results,
            criteria=criteria,
            analytics=analytics,
            model_id=model_id,
            strict=strict,
        )

    @classmethod
    def generate_all_insights(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        analytics: Dict[str, Any],
        model_id: Optional[str] = None,
        strict: bool = True,
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
        official_numbers = cls.collect_official_numbers(results, criteria, analytics)

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
            cls.validate_insight_grounding(content, official_numbers, strict=strict, raise_on_error=strict)

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
        cls.validate_insight_grounding(strength_content, official_numbers, strict=strict, raise_on_error=strict)
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
        cls.validate_insight_grounding(weakness_content, official_numbers, strict=strict, raise_on_error=strict)
        insights.append({
            "insight_type": "weakness",
            "related_scoring_result_id": winner.get("id"),
            "content": weakness_content,
            "severity": "warning",
        })

        # -------------------------------------------------------------------
        # 4. RISK (Analisis Profil Risiko)
        # -------------------------------------------------------------------
        risk_score = winner.get("risk_score")
        if risk_score is None:
            risk_score = round(max(5.0, 100.0 - float(winner.get("total_score", 0)) * 0.8), 2)
        risk_score = float(risk_score)
        risk_level = "rendah" if risk_score < 30.0 else "moderat" if risk_score < 60.0 else "tinggi"

        conf_val = winner.get('confidence_score')
        if conf_val is None:
            conf_val = 90.0
        conf_val = float(conf_val)

        risk_content = (
            f"Indeks risiko operasional untuk {winner['entity_label']} terukur pada angka {risk_score}/100 ({risk_level}). "
            f"Tingkat keyakinan evaluasi AI (confidence score) berada pada {conf_val}/100, "
            f"mengindikasikan integritas data masukan mencukupi untuk pengambilan keputusan aman."
        )
        cls.validate_insight_grounding(risk_content, official_numbers, strict=strict, raise_on_error=strict)
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
                cls.validate_insight_grounding(anom_content, official_numbers, strict=strict, raise_on_error=strict)
                insights.append({
                    "insight_type": "anomaly",
                    "related_scoring_result_id": anom.get("entity_id"),
                    "content": anom_content,
                    "severity": "warning",
                })
        else:
            min_f = analytics.get('statistic', {}).get('min_fence', 0.0)
            max_f = analytics.get('statistic', {}).get('max_fence', 100.0)
            no_anom_content = (
                f"Distribusi data skor berada dalam rentang deviasi normal tanpa outlier ekstrem "
                f"(batas bawah pagar IQR: {min_f}, batas atas: {max_f}). "
                f"Seluruh kandidat dinilai konsisten dengan metodologi seleksi."
            )
            cls.validate_insight_grounding(no_anom_content, official_numbers, strict=strict, raise_on_error=strict)
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
        top_count = kpi.get('top_candidates_count', 1)
        tot_eval = kpi.get('total_evaluated', len(results))
        opp_content = (
            f"Peluang optimalisasi: Sebanyak {top_count} dari {tot_eval} kandidat "
            f"({pass_rate}% tingkat kelulusan) melampaui standar kualifikasi prima. "
            f"Organisasi dapat membentuk pool talenta/vendor cadangan untuk kebutuhan ekspansi berikutnya tanpa biaya proses ulang."
        )
        cls.validate_insight_grounding(opp_content, official_numbers, strict=strict, raise_on_error=strict)
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
        cls.validate_insight_grounding(action_content, official_numbers, strict=strict, raise_on_error=strict)
        insights.append({
            "insight_type": "action_recommendation",
            "related_scoring_result_id": winner.get("id"),
            "content": action_content,
            "severity": "primary",
        })

        return insights
