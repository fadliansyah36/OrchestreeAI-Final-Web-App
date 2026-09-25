"""
Dynamic Analytics Engine (PRD v2.2 Bagian 13.1 & 17.5)
Menghitung analitik matematis dan statistik NYATA dari hasil evaluasi seleksi:
1. KPI Ringkas (total evaluasi, rata-rata, median, rasio kelulusan, skor tertinggi/terendah)
2. Distribusi Skor (histogram frekuensi, persentase rentang kualifikasi)
3. Perbandingan Antar Kelompok (berdasarkan kanal sumber data / kategori kriteria)
4. Analisis Tren Waktu (distribusi temporal bila data memiliki dimensi waktu)
5. Matriks Korelasi Pearson antar Kriteria (r koefisien bivariat nyata)
6. Analisis Sebaran Performa (Kuartil Q1, Q2, Q3, Interquartile Range, Varians, Deviasi Standar)
7. Deteksi Outlier Statistik Nyata (Metode Z-Score & Pagar Tukey IQR - bukan tebakan narasi)
"""

import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


class SelectionAnalyticsEngine:
    """Mesin komputasi analitik dinamis dan evaluasi statistik deterministik."""

    @staticmethod
    def compute_summary_kpis(
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Menghitung metrik KPI ringkasan eksekutif."""
        if not results:
            return {
                "total_evaluated": 0,
                "average_score": 0.0,
                "median_score": 0.0,
                "max_score": 0.0,
                "min_score": 0.0,
                "pass_rate_pct": 0.0,
                "top_candidates_count": 0,
                "total_criteria": len(criteria),
            }

        scores = [float(r["total_score"]) for r in results]
        total_count = len(scores)
        avg_score = round(sum(scores) / total_count, 2)
        sorted_scores = sorted(scores)
        mid = total_count // 2
        median_score = (
            sorted_scores[mid]
            if total_count % 2 != 0
            else round((sorted_scores[mid - 1] + sorted_scores[mid]) / 2.0, 2)
        )

        passed = len([s for s in scores if s >= 70.0])
        top_candidates = len([s for s in scores if s >= 80.0])

        return {
            "total_evaluated": total_count,
            "average_score": avg_score,
            "median_score": median_score,
            "max_score": round(max(scores), 2),
            "min_score": round(min(scores), 2),
            "pass_rate_pct": round((passed / total_count) * 100.0, 1),
            "top_candidates_count": top_candidates,
            "total_criteria": len(criteria),
        }

    @staticmethod
    def compute_score_distribution(
        results: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Menghitung distribusi skor ke dalam rentang kualifikasi baku."""
        if not results:
            return {"score_ranges": []}

        scores = [float(r["total_score"]) for r in results]
        total = len(scores)

        ranges = [
            {"range": "86-100", "min": 86.0, "max": 100.0, "label": "Sangat Unggul", "color": "#1FA35A"},
            {"range": "71-85", "min": 71.0, "max": 85.99, "label": "Memenuhi Kualifikasi", "color": "#1E6FE0"},
            {"range": "56-70", "min": 56.0, "max": 70.99, "label": "Perlu Pertimbangan", "color": "#F5A623"},
            {"range": "0-55", "min": 0.0, "max": 55.99, "label": "Di Bawah Ambang", "color": "#E2483D"},
        ]

        output = []
        for r in ranges:
            count = len([s for s in scores if r["min"] <= s <= r["max"]])
            pct = round((count / total) * 100.0, 1) if total > 0 else 0.0
            output.append({
                "range": r["range"],
                "label": r["label"],
                "count": count,
                "percentage": pct,
                "color": r["color"],
            })

        return {"score_ranges": output, "total_entities": total}

    @staticmethod
    def compute_group_comparisons(
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        documents: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Membandingkan performa rata-rata antar kriteria dan antar saluran sumber."""
        # 1. Performa per kriteria
        crit_performance: Dict[str, Any] = {}
        for c in criteria:
            k = c.get("key")
            label = c.get("label", k)
            weight = float(c.get("weight", 0.0))
            crit_scores = [
                float(r["score_breakdown"].get(k, 0.0))
                for r in results
                if isinstance(r.get("score_breakdown"), dict)
            ]
            if crit_scores:
                c_avg = round(sum(crit_scores) / len(crit_scores), 2)
                c_max = round(max(crit_scores), 2)
                c_min = round(min(crit_scores), 2)
            else:
                c_avg = c_max = c_min = 0.0

            crit_performance[k] = {
                "key": k,
                "label": label,
                "average": c_avg,
                "max": c_max,
                "min": c_min,
                "weight": weight,
            }

        # 2. Performa antar saluran masukan (bila data dokumen tersedia)
        channel_performance: Dict[str, Any] = {}
        doc_channel_map = {d.get("id"): d.get("source_channel", "file_upload") for d in (documents or [])}
        for r in results:
            doc_id = r.get("source_document_id")
            chan = doc_channel_map.get(doc_id, "file_upload")
            if chan not in channel_performance:
                channel_performance[chan] = []
            channel_performance[chan].append(float(r["total_score"]))

        channel_summary = {}
        for ch, s_list in channel_performance.items():
            channel_summary[ch] = {
                "channel": ch,
                "count": len(s_list),
                "average_score": round(sum(s_list) / len(s_list), 2) if s_list else 0.0,
            }

        return {
            "criteria_performance": crit_performance,
            "channel_performance": channel_summary,
        }

    @staticmethod
    def compute_trends(
        results: List[Dict[str, Any]],
        documents: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Menghitung tren waktu bila terdapat dimensi waktu nyata (ingested_at / created_at).
        Mengelompokkan data berdasarkan tanggal untuk visualisasi kronologis.
        """
        timeline_buckets: Dict[str, List[float]] = {}
        doc_time_map = {}
        for d in (documents or []):
            t_str = d.get("ingested_at") or d.get("created_at")
            if t_str:
                try:
                    dt = datetime.fromisoformat(str(t_str).replace("Z", "+00:00"))
                    doc_time_map[d.get("id")] = dt.strftime("%Y-%m-%d")
                except Exception:
                    pass

        for r in results:
            doc_id = r.get("source_document_id")
            date_key = doc_time_map.get(doc_id)
            if not date_key and r.get("created_at"):
                try:
                    dt = datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00"))
                    date_key = dt.strftime("%Y-%m-%d")
                except Exception:
                    pass

            if not date_key:
                date_key = "Periode Saat Ini"

            if date_key not in timeline_buckets:
                timeline_buckets[date_key] = []
            timeline_buckets[date_key].append(float(r["total_score"]))

        trend_points = []
        for d_key in sorted(timeline_buckets.keys()):
            pts = timeline_buckets[d_key]
            trend_points.append({
                "date": d_key,
                "count": len(pts),
                "average_score": round(sum(pts) / len(pts), 2),
                "max_score": round(max(pts), 2),
                "min_score": round(min(pts), 2),
            })

        has_temporal_dimension = len(trend_points) > 1
        return {
            "has_time_series": has_temporal_dimension,
            "trend_points": trend_points,
        }

    @staticmethod
    def compute_criteria_correlation(
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Menghitung matriks korelasi Pearson antar kriteria evaluasi:
        r = sum((x - mean_x) * (y - mean_y)) / sqrt(sum((x - mean_x)^2) * sum((y - mean_y)^2))
        """
        crit_keys = [c.get("key") for c in criteria if c.get("key")]
        if len(crit_keys) < 2 or len(results) < 2:
            return {"matrix": {}, "pairs": []}

        # Ekstrak data kolom
        columns: Dict[str, List[float]] = {k: [] for k in crit_keys}
        for r in results:
            bd = r.get("score_breakdown", {})
            for k in crit_keys:
                columns[k].append(float(bd.get(k, 0.0)))

        # Hitung mean & std_dev
        means: Dict[str, float] = {}
        for k, vals in columns.items():
            means[k] = sum(vals) / len(vals)

        matrix: Dict[str, Dict[str, float]] = {k1: {} for k1 in crit_keys}
        pairs = []

        for i, k1 in enumerate(crit_keys):
            for j, k2 in enumerate(crit_keys):
                if k1 == k2:
                    matrix[k1][k2] = 1.0
                    continue

                v1 = columns[k1]
                v2 = columns[k2]
                m1 = means[k1]
                m2 = means[k2]

                numerator = sum((x - m1) * (y - m2) for x, y in zip(v1, v2))
                denom_x = sum((x - m1) ** 2 for x in v1)
                denom_y = sum((y - m2) ** 2 for y in v2)
                denominator = math.sqrt(denom_x * denom_y)

                r_val = round(numerator / denominator, 3) if denominator > 0 else 0.0
                matrix[k1][k2] = r_val

                if i < j:
                    pairs.append({
                        "criterion_a": k1,
                        "criterion_b": k2,
                        "correlation": r_val,
                        "relationship": (
                            "Kuat Positif" if r_val >= 0.7 else
                            "Moderat Positif" if r_val >= 0.4 else
                            "Lemah / Netral" if r_val >= -0.4 else
                            "Moderat Negatif" if r_val >= -0.7 else
                            "Kuat Negatif"
                        ),
                    })

        return {"matrix": matrix, "pairs": pairs}

    @staticmethod
    def compute_performance_analysis(
        results: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Menghitung sebaran performa statistik kuartil, IQR, varians, dan deviasi standar.
        """
        if not results:
            return {
                "mean": 0.0,
                "median": 0.0,
                "std_dev": 0.0,
                "variance": 0.0,
                "q1": 0.0,
                "q3": 0.0,
                "iqr": 0.0,
                "min_fence": 0.0,
                "max_fence": 0.0,
            }

        scores = sorted([float(r["total_score"]) for r in results])
        n = len(scores)
        mean_val = round(sum(scores) / n, 2)
        variance = sum((s - mean_val) ** 2 for s in scores) / n
        std_dev = round(math.sqrt(variance), 2)

        # Median
        mid = n // 2
        median_val = scores[mid] if n % 2 != 0 else round((scores[mid - 1] + scores[mid]) / 2.0, 2)

        # Kuartil Q1 & Q3
        def get_percentile(data: List[float], p: float) -> float:
            idx = p * (len(data) - 1)
            lower = math.floor(idx)
            upper = math.ceil(idx)
            weight = idx - lower
            return round(data[lower] * (1.0 - weight) + data[upper] * weight, 2)

        q1 = get_percentile(scores, 0.25)
        q3 = get_percentile(scores, 0.75)
        iqr = round(q3 - q1, 2)

        # Tukey Fences (Pagar IQR untuk batas outlier)
        min_fence = round(max(0.0, q1 - (1.5 * iqr)), 2)
        max_fence = round(min(100.0, q3 + (1.5 * iqr)), 2)

        return {
            "mean": mean_val,
            "median": median_val,
            "variance": round(variance, 2),
            "std_dev": std_dev,
            "q1": q1,
            "q3": q3,
            "iqr": iqr,
            "min_fence": min_fence,
            "max_fence": max_fence,
        }

    @classmethod
    def compute_anomaly_detection(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Deteksi Outlier Statistik Nyata (Bukan tebakan LLM):
        1. Z-Score (|z| >= 1.96) pada total_score.
        2. Tukey's IQR Fences (< Q1 - 1.5*IQR atau > Q3 + 1.5*IQR).
        3. Disparitas Kriteria Ekstrem (deviasi skor intra-entitas > 35 poin).
        """
        if len(results) < 3:
            return {"anomalies": [], "total_detected": 0}

        stats = cls.compute_performance_analysis(results)
        mean_val = stats["mean"]
        std_dev = stats["std_dev"]
        min_fence = stats["min_fence"]
        max_fence = stats["max_fence"]

        anomalies = []

        for r in results:
            label = r.get("entity_label", "Entitas")
            score = float(r["total_score"])
            breakdown = r.get("score_breakdown", {})

            # 1. Hitung Z-Score
            z_score = round((score - mean_val) / std_dev, 2) if std_dev > 0 else 0.0

            # 2. Cek Ambang Batas IQR
            is_iqr_outlier = score < min_fence or score > max_fence

            # 3. Cek Disparitas Antar-Kriteria (Kekuatan vs Kelemahan Ekstrem)
            crit_vals = [float(v) for v in breakdown.values() if isinstance(v, (int, float))]
            intra_spread = round(max(crit_vals) - min(crit_vals), 2) if len(crit_vals) >= 2 else 0.0

            outlier_type = None
            explanation = ""

            if z_score >= 1.96 or score > max_fence:
                outlier_type = "high_outlier"
                explanation = f"{label} memiliki total skor {score} yang secara statistik menyimpang signifikan ke atas (Z-Score: +{z_score}, melampaui batas atas IQR {max_fence})."
            elif z_score <= -1.96 or score < min_fence:
                outlier_type = "low_outlier"
                explanation = f"{label} memiliki total skor {score} yang berada di bawah pagar batas bawah IQR ({min_fence}) dengan Z-Score {z_score}."
            elif intra_spread >= 35.0:
                outlier_type = "disparity_outlier"
                max_c = max(breakdown.items(), key=lambda x: x[1])
                min_c = min(breakdown.items(), key=lambda x: x[1])
                explanation = f"{label} memiliki disparitas kriteria tinggi sebesar {intra_spread} poin (Nilai '{max_c[0]}': {max_c[1]} vs '{min_c[0]}': {min_c[1]})."

            if outlier_type:
                anomalies.append({
                    "entity_id": r.get("id"),
                    "entity_label": label,
                    "total_score": score,
                    "z_score": z_score,
                    "outlier_type": outlier_type,
                    "iqr_min_fence": min_fence,
                    "iqr_max_fence": max_fence,
                    "intra_spread": intra_spread,
                    "explanation": explanation,
                })

        return {
            "anomalies": anomalies,
            "total_detected": len(anomalies),
            "methodology": "Z-Score (|z| >= 1.96), Tukey IQR 1.5x Fences, Intra-Criteria Disparity (>= 35)",
        }
