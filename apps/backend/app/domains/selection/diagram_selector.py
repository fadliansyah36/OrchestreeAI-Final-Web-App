"""
Automatic Diagram Selection Engine (PRD v2.2 Bagian 13.1 & 17.5)
Memilih jenis visualisasi diagram optimal berdasarkan BENTUK DATA nyata (Data Shape Heuristics):
1. Urutan skor tertinggi-terendah -> Ranking Chart ('ranking_chart')
2. Komposisi bagian dari keseluruhan -> Donut / Pie ('donut' / 'pie')
3. Kategori vs kategori (perbandingan kriteria / kelompok) -> Bar / Column ('bar')
4. Time-series (dimensi kronologis temporal) -> Line / Area ('line' / 'area')
5. Dua variabel numerik kontinu bivariat -> Scatter Plot ('scatter')
6. Tahapan alur seleksi berurutan dengan penyusutan konversi -> Funnel ('funnel')
7. Matriks 2 dimensi dengan intensitas korelasi -> Heatmap ('heatmap')

Setiap chart yang dipilih WAJIB memuat 'selection_reason' yang menjelaskan
alasan metodologis pemilihan jenis bagan tersebut.
"""

from typing import Any, Dict, List, Optional


class DiagramSelector:
    """Mesin seleksi diagram otomatis berbasis karakteristik dan bentuk data."""

    @classmethod
    def select_optimal_visualizations(
        cls,
        results: List[Dict[str, Any]],
        criteria: List[Dict[str, Any]],
        analytics_snapshots: Dict[str, Any],
        has_time_series: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Menganalisis seluruh dataset hasil seleksi dan memilih representasi visual optimal.
        Menghasilkan konfigurasi chart untuk Recharts di frontend.
        """
        visualizations: List[Dict[str, Any]] = []

        # -------------------------------------------------------------------
        # 1. BENTUK DATA: Urutan Skor Tertinggi-Terendah -> Ranking Chart
        # -------------------------------------------------------------------
        if results:
            top_ranked = sorted(results, key=lambda x: float(x.get("total_score", 0)), reverse=True)[:10]
            ranking_config = {
                "title": "Peringkat Skor Kelayakan Kandidat",
                "xAxisKey": "entity_label",
                "yAxisTitle": "Skor Akhir (0-100)",
                "data": [
                    {
                        "entity_label": r.get("entity_label", f"Entitas {i+1}"),
                        "total_score": float(r.get("total_score", 0)),
                        "rank": r.get("rank_position", i + 1),
                        "priority": r.get("priority_level", "medium"),
                        "recommendation": r.get("recommendation_classification", "review"),
                    }
                    for i, r in enumerate(top_ranked)
                ],
            }
            visualizations.append({
                "chart_type": "ranking_chart",
                "chart_config": ranking_config,
                "selection_reason": "Bentuk data berupa urutan skor hierarkis tertinggi-ke-terendah; diagram ranking dipilih untuk memberikan visibilitas perbandingan instan antar kandidat teratas.",
                "analytics_type": "kpi",
            })

        # -------------------------------------------------------------------
        # 2. BENTUK DATA: Komposisi Bagian dari Keseluruhan -> Donut / Pie
        # -------------------------------------------------------------------
        if results:
            select_count = len([r for r in results if r.get("recommendation_classification") == "select"])
            review_count = len([r for r in results if r.get("recommendation_classification") == "review"])
            reject_count = len([r for r in results if r.get("recommendation_classification") == "reject"])
            total_n = max(1, len(results))

            composition_data = [
                {"name": "Rekomendasi Lolos (Select)", "value": select_count, "color": "#1FA35A", "percentage": round((select_count / total_n) * 100, 1)},
                {"name": "Perlu Pertimbangan (Review)", "value": review_count, "color": "#F5A623", "percentage": round((review_count / total_n) * 100, 1)},
                {"name": "Tidak Memenuhi (Reject)", "value": reject_count, "color": "#E2483D", "percentage": round((reject_count / total_n) * 100, 1)},
            ]
            composition_data = [item for item in composition_data if item["value"] > 0]

            donut_config = {
                "title": "Distribusi Komposisi Rekomendasi Keputusan",
                "nameKey": "name",
                "dataKey": "value",
                "data": composition_data,
            }
            visualizations.append({
                "chart_type": "donut",
                "chart_config": donut_config,
                "selection_reason": "Bentuk data berupa proporsi bagian terhadap keseluruhan (100%); diagram donat dipilih untuk menyajikan rasio kelulusan dan segmentasi keputusan secara proporsional.",
                "analytics_type": "distribution",
            })

        # -------------------------------------------------------------------
        # 3. BENTUK DATA: Kategori vs Kategori (Perbandingan Kriteria) -> Bar
        # -------------------------------------------------------------------
        if criteria and results:
            comp_data = analytics_snapshots.get("comparison", {}).get("criteria_performance", {})
            bar_items = []
            for c in criteria:
                k = c.get("key")
                info = comp_data.get(k, {})
                avg_val = info.get("average")
                if avg_val is None:
                    vals = [float(r["score_breakdown"].get(k, 0.0)) for r in results if isinstance(r.get("score_breakdown"), dict)]
                    avg_val = round(sum(vals) / len(vals), 2) if vals else 0.0

                bar_items.append({
                    "criterion": c.get("label", k),
                    "average_score": avg_val,
                    "weight_pct": round(float(c.get("weight", 0.25)) * 100, 1),
                })

            bar_config = {
                "title": "Perbandingan Rata-Rata Performa Berdasarkan Kriteria",
                "xAxisKey": "criterion",
                "yAxisTitle": "Rerata Nilai (0-100)",
                "data": bar_items,
            }
            visualizations.append({
                "chart_type": "bar",
                "chart_config": bar_config,
                "selection_reason": "Bentuk data berupa metrik kategori diskrit yang dibandingkan satu sama lain; diagram batang tegak dipilih untuk memudahkan komparasi performa rata-rata antar pilar kriteria.",
                "analytics_type": "comparison",
            })

        # -------------------------------------------------------------------
        # 4. BENTUK DATA: Dua Variabel Numerik Kontinu -> Scatter Plot
        # -------------------------------------------------------------------
        if len(results) >= 3:
            # Hubungan antara Total Skor dan Risk Score (atau Quality Score)
            scatter_points = []
            for r in results:
                t_score = float(r.get("total_score", 0))
                r_score = float(r.get("risk_score", 0))
                conf_score = float(r.get("confidence_score", 85))
                scatter_points.append({
                    "entity_label": r.get("entity_label", "Entitas"),
                    "total_score": t_score,
                    "risk_score": r_score,
                    "confidence_score": conf_score,
                })

            scatter_config = {
                "title": "Sebaran Bivariat: Total Skor vs Profil Risiko",
                "xAxisKey": "total_score",
                "xAxisTitle": "Total Skor Kualifikasi (X)",
                "yAxisKey": "risk_score",
                "yAxisTitle": "Tingkat Risiko (Y)",
                "data": scatter_points,
            }
            visualizations.append({
                "chart_type": "scatter",
                "chart_config": scatter_config,
                "selection_reason": "Bentuk data berupa dua variabel numerik kontinu bivariat (Skor Kelayakan vs Indeks Risiko); scatter plot dipilih untuk memetakan klaster kandidat berpotensi tinggi dengan risiko terkontrol.",
                "analytics_type": "correlation",
            })

        # -------------------------------------------------------------------
        # 5. BENTUK DATA: Tahapan Alur Berurutan dengan Penyusutan -> Funnel
        # -------------------------------------------------------------------
        if results:
            total_in = len(results)
            valid_in = len([r for r in results if r.get("total_score", 0) > 0])
            thresh_passed = len([r for r in results if float(r.get("total_score", 0)) >= 60.0])
            recommended = len([r for r in results if r.get("recommendation_classification") == "select"])
            approved = len([r for r in results if r.get("decision_status") == "approved"])

            funnel_steps = [
                {"stage": "1. Dokumen Masuk", "count": total_in, "pct": 100.0, "color": "#1E6FE0"},
                {"stage": "2. Lolos Validasi Kualitas", "count": valid_in, "pct": round((valid_in / total_in) * 100, 1)},
                {"stage": "3. Melampaui Ambang Kelayakan", "count": thresh_passed, "pct": round((thresh_passed / total_in) * 100, 1)},
                {"stage": "4. Rekomendasi Terpilih (Select)", "count": recommended, "pct": round((recommended / total_in) * 100, 1)},
                {"stage": "5. Disetujui Tinjauan Manajemen", "count": approved, "pct": round((approved / total_in) * 100, 1)},
            ]

            funnel_config = {
                "title": "Funnel Konversi Tahapan Seleksi Cerdas",
                "data": funnel_steps,
            }
            visualizations.append({
                "chart_type": "funnel",
                "chart_config": funnel_config,
                "selection_reason": "Bentuk data berupa tahapan proses sekuensial dengan tingkat konversi yang menyusut secara berjenjang; diagram funnel dipilih untuk memvisualisasikan tingkat lolos saringan di setiap tahap alur.",
                "analytics_type": "performance",
            })

        # -------------------------------------------------------------------
        # 6. BENTUK DATA: Time-Series (Bila Ada Dimensi Waktu) -> Line / Area
        # -------------------------------------------------------------------
        trend_info = analytics_snapshots.get("trend", {})
        if has_time_series or trend_info.get("has_time_series"):
            points = trend_info.get("trend_points", [])
            if len(points) >= 2:
                line_config = {
                    "title": "Tren Skor Evaluasi Sepanjang Waktu",
                    "xAxisKey": "date",
                    "yAxisTitle": "Rerata Skor",
                    "data": points,
                }
                visualizations.append({
                    "chart_type": "line",
                    "chart_config": line_config,
                    "selection_reason": "Bentuk data memiliki dimensi kronologis berurutan (time-series); diagram garis dipilih untuk menggambarkan tren dinamika dan fluktuasi skor dari waktu ke waktu.",
                    "analytics_type": "trend",
                })

        # -------------------------------------------------------------------
        # 7. BENTUK DATA: Matriks 2 Dimensi dengan Intensitas -> Heatmap
        # -------------------------------------------------------------------
        corr_info = analytics_snapshots.get("correlation", {})
        matrix = corr_info.get("matrix", {})
        if matrix and len(matrix) >= 2:
            heatmap_cells = []
            keys = list(matrix.keys())
            for row_k in keys:
                for col_k in keys:
                    heatmap_cells.append({
                        "row": row_k,
                        "col": col_k,
                        "value": matrix[row_k].get(col_k, 0.0),
                    })

            heatmap_config = {
                "title": "Matriks Korelasi Antar Kriteria Evaluasi",
                "rows": keys,
                "cols": keys,
                "data": heatmap_cells,
            }
            visualizations.append({
                "chart_type": "heatmap",
                "chart_config": heatmap_config,
                "selection_reason": "Bentuk data berupa matriks 2 dimensi yang memetakan relasi intensitas koefisien korelasi; diagram heatmap dipilih untuk mengevaluasi interaksi dan independensi antar kriteria seleksi.",
                "analytics_type": "correlation",
            })

        return visualizations
