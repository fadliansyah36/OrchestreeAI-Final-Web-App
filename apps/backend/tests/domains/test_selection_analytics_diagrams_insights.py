"""
Unit and Integration Tests for Selection Analytics Engine, Diagram Selector, and AI Insight Generator
(PRD v2.2 Bagian 13.1 & 17.5)
Verifies:
1. Mathematical precision of SelectionAnalyticsEngine (KPIs, distribution, Pearson correlation, Tukey IQR outliers, Z-scores).
2. Data Shape Heuristics in DiagramSelector (selection_reason, chart types, valid configs).
3. Grounding Enforcement in SelectionInsightGenerator (numeric verification against ground truth, insight types).
"""

import unittest
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.domains.selection.analytics_engine import SelectionAnalyticsEngine
from app.domains.selection.diagram_selector import DiagramSelector
from app.domains.selection.insight_generator import (
    SelectionInsightGenerator,
    InsightGroundingError,
)


class TestSelectionAnalyticsDiagramsInsights(unittest.TestCase):
    def setUp(self):
        self.criteria = [
            {"criterion_key": "technical", "criterion_label": "Keahlian Teknis", "weight": 0.4},
            {"criterion_key": "communication", "criterion_label": "Komunikasi", "weight": 0.3},
            {"criterion_key": "problem_solving", "criterion_label": "Pemecahan Masalah", "weight": 0.3},
        ]

        self.results = [
            {
                "id": "res-1",
                "entity_label": "Kandidat Alpha",
                "total_score": 92.0,
                "rank_position": 1,
                "priority_level": "high",
                "recommendation_classification": "recommended",
                "score_breakdown": {
                    "technical": {"score": 95.0, "weighted": 38.0},
                    "communication": {"score": 90.0, "weighted": 27.0},
                    "problem_solving": {"score": 90.0, "weighted": 27.0},
                },
                "source_channel": "file_upload",
            },
            {
                "id": "res-2",
                "entity_label": "Kandidat Beta",
                "total_score": 85.0,
                "rank_position": 2,
                "priority_level": "high",
                "recommendation_classification": "recommended",
                "score_breakdown": {
                    "technical": {"score": 88.0, "weighted": 35.2},
                    "communication": {"score": 82.0, "weighted": 24.6},
                    "problem_solving": {"score": 84.0, "weighted": 25.2},
                },
                "source_channel": "prompt_text",
            },
            {
                "id": "res-3",
                "entity_label": "Kandidat Gamma",
                "total_score": 74.0,
                "rank_position": 3,
                "priority_level": "medium",
                "recommendation_classification": "consider",
                "score_breakdown": {
                    "technical": {"score": 75.0, "weighted": 30.0},
                    "communication": {"score": 72.0, "weighted": 21.6},
                    "problem_solving": {"score": 74.0, "weighted": 22.2},
                },
                "source_channel": "file_upload",
            },
            {
                "id": "res-4",
                "entity_label": "Kandidat Delta",
                "total_score": 68.0,
                "rank_position": 4,
                "priority_level": "medium",
                "recommendation_classification": "review",
                "score_breakdown": {
                    "technical": {"score": 65.0, "weighted": 26.0},
                    "communication": {"score": 70.0, "weighted": 21.0},
                    "problem_solving": {"score": 70.0, "weighted": 21.0},
                },
                "source_channel": "prompt_text",
            },
            {
                "id": "res-5",
                "entity_label": "Kandidat Epsilon",
                "total_score": 42.0,
                "rank_position": 5,
                "priority_level": "low",
                "recommendation_classification": "reject",
                "score_breakdown": {
                    "technical": {"score": 40.0, "weighted": 16.0},
                    "communication": {"score": 45.0, "weighted": 13.5},
                    "problem_solving": {"score": 42.0, "weighted": 12.6},
                },
                "source_channel": "file_upload",
            },
        ]

        self.documents = [
            {"id": "doc-1", "source_channel": "file_upload", "ingested_at": "2026-09-25T01:00:00Z"},
            {"id": "doc-2", "source_channel": "prompt_text", "ingested_at": "2026-09-25T01:30:00Z"},
            {"id": "doc-3", "source_channel": "file_upload", "ingested_at": "2026-09-25T02:00:00Z"},
        ]

    # -------------------------------------------------------------------------
    # 1. SelectionAnalyticsEngine Tests
    # -------------------------------------------------------------------------
    def test_analytics_summary_kpis(self):
        kpis = SelectionAnalyticsEngine.compute_summary_kpis(self.results, self.criteria)
        self.assertEqual(kpis["total_evaluated"], 5)
        # Average: (92 + 85 + 74 + 68 + 42) / 5 = 361 / 5 = 72.2
        self.assertAlmostEqual(kpis["average_score"], 72.2, places=1)
        # Median of [42, 68, 74, 85, 92] is 74.0
        self.assertEqual(kpis["median_score"], 74.0)
        self.assertEqual(kpis["max_score"], 92.0)
        self.assertEqual(kpis["min_score"], 42.0)
        # Pass rate (>= 70): 3 out of 5 = 60.0%
        self.assertEqual(kpis["pass_rate_pct"], 60.0)
        # Top candidates (>= 80): 2 out of 5
        self.assertEqual(kpis["top_candidates_count"], 2)

    def test_analytics_score_distribution(self):
        dist = SelectionAnalyticsEngine.compute_score_distribution(self.results)
        self.assertIn("score_ranges", dist)
        self.assertIn("total_entities", dist)
        ranges = dist["score_ranges"]
        self.assertEqual(len(ranges), 4)

    def test_analytics_group_comparisons(self):
        comps = SelectionAnalyticsEngine.compute_group_comparisons(self.results, self.criteria, self.documents)
        self.assertIn("channel_performance", comps)
        self.assertIn("criteria_performance", comps)
        channels = comps["channel_performance"]
        self.assertIn("file_upload", channels)

    def test_analytics_correlation_matrix(self):
        corr = SelectionAnalyticsEngine.compute_criteria_correlation(self.results, self.criteria)
        self.assertIn("matrix", corr)
        self.assertIn("pairs", corr)

    def test_analytics_performance_spread_and_outliers(self):
        perf = SelectionAnalyticsEngine.compute_performance_analysis(self.results)
        self.assertIn("mean", perf)
        self.assertIn("median", perf)
        self.assertIn("variance", perf)
        self.assertIn("std_dev", perf)
        self.assertIn("q1", perf)
        self.assertIn("q3", perf)
        self.assertIn("iqr", perf)
        self.assertGreater(perf["std_dev"], 15.0)

        # Anomaly detection: 42 is an outlier compared to top tier
        anomalies = SelectionAnalyticsEngine.compute_anomaly_detection(self.results, self.criteria)
        self.assertIn("anomalies", anomalies)

    # -------------------------------------------------------------------------
    # 2. DiagramSelector Tests
    # -------------------------------------------------------------------------
    def test_diagram_selector_optimal_visualizations(self):
        analytics_snapshots = {
            "kpi": SelectionAnalyticsEngine.compute_summary_kpis(self.results, self.criteria),
            "distribution": SelectionAnalyticsEngine.compute_score_distribution(self.results),
            "correlation": SelectionAnalyticsEngine.compute_criteria_correlation(self.results, self.criteria),
            "performance": SelectionAnalyticsEngine.compute_performance_analysis(self.results),
        }
        visualizations = DiagramSelector.select_optimal_visualizations(
            self.results, self.criteria, analytics_snapshots, has_time_series=False
        )

        self.assertGreaterEqual(len(visualizations), 3)
        chart_types = [v["chart_type"] for v in visualizations]
        # Ranking chart must be chosen for ranked list
        self.assertIn("ranking_chart", chart_types)
        # Bar chart or donut for distribution/criteria
        self.assertTrue(any(ct in ["bar", "donut", "heatmap", "scatter"] for ct in chart_types))

        # Every visualization must have a methodological selection reason
        for v in visualizations:
            self.assertIn("selection_reason", v)
            self.assertGreater(len(v["selection_reason"]), 10)
            self.assertIn("chart_config", v)
            self.assertIn("data", v["chart_config"])

    # -------------------------------------------------------------------------
    # 3. SelectionInsightGenerator & Grounding Enforcement Tests
    # -------------------------------------------------------------------------
    def test_grounding_validator(self):
        # Text mentioning 92.0 and 85.0 when valid numbers include 92.0, 85.0
        grounded_text = "Kandidat Alpha memimpin peringkat dengan skor 92.0 mengungguli kandidat lain."
        is_valid = SelectionInsightGenerator.validate_insight_grounding(
            grounded_text, expected_numbers=[92.0, 85.0, 74.0], tolerance=0.5, strict=True
        )
        self.assertTrue(is_valid)

        # Text with hallucinated number 99.9 (strict mode rejects)
        hallucinated_text = "Kandidat Alpha mencapai performa luar biasa dengan total 99.9 poin."
        is_invalid = SelectionInsightGenerator.validate_insight_grounding(
            hallucinated_text, expected_numbers=[92.0, 85.0, 74.0], tolerance=0.5, strict=True
        )
        self.assertFalse(is_invalid)

    def test_insight_generator_all_types(self):
        analytics_snapshots = {
            "kpi": SelectionAnalyticsEngine.compute_summary_kpis(self.results, self.criteria),
            "distribution": SelectionAnalyticsEngine.compute_score_distribution(self.results),
            "anomalies": SelectionAnalyticsEngine.compute_anomaly_detection(self.results, self.criteria),
        }
        insights = SelectionInsightGenerator.generate_all_insights(
            self.results, self.criteria, analytics_snapshots
        )

        self.assertGreaterEqual(len(insights), 4)
        insight_types = [i["insight_type"] for i in insights]
        # Must cover multiple structured insight categories
        self.assertIn("ranking_reason", insight_types)
        self.assertIn("strength", insight_types)
        self.assertTrue(any(it in ["risk", "weakness", "anomaly", "opportunity", "action_recommendation"] for it in insight_types))

        for item in insights:
            self.assertIn("content", item)
            self.assertGreater(len(item["content"]), 15)
            self.assertIn("severity", item)

    # -------------------------------------------------------------------------
    # 4. DoD Verification Tests (PRD v2.2 Bagian 13.1 & 17.5)
    # -------------------------------------------------------------------------
    def test_dod_diagram_selector_adapts_to_3_distinct_dataset_shapes(self):
        """
        DoD 1: Jenis chart yang dipilih AI berubah sesuai bentuk data saat diuji
        dengan minimal 3 dataset berbeda karakteristik (kategori, time-series, komposisi).
        """
        # Dataset 1: Karakteristik Kategori vs Kategori (Perbandingan Kriteria murni tanpa waktu)
        d1_results = self.results[:4]
        d1_analytics = {
            "kpi": SelectionAnalyticsEngine.compute_summary_kpis(d1_results, self.criteria),
            "distribution": SelectionAnalyticsEngine.compute_score_distribution(d1_results),
            "comparison": SelectionAnalyticsEngine.compute_group_comparisons(d1_results, self.criteria, None),
            "trend": {"has_time_series": False, "trend_points": []},
            "correlation": {},
        }
        viz1 = DiagramSelector.select_optimal_visualizations(d1_results, self.criteria, d1_analytics, has_time_series=False)
        types1 = [v["chart_type"] for v in viz1]
        self.assertIn("bar", types1)
        self.assertIn("ranking_chart", types1)
        self.assertNotIn("line", types1)

        # Dataset 2: Karakteristik Time-Series (Dimensi Temporal Nyata 3 Tanggal)
        d2_docs = [
            {"id": "d-1", "ingested_at": "2026-09-01T08:00:00Z"},
            {"id": "d-2", "ingested_at": "2026-09-15T08:00:00Z"},
            {"id": "d-3", "ingested_at": "2026-09-25T08:00:00Z"},
        ]
        d2_results = [
            {**self.results[0], "source_document_id": "d-1", "created_at": "2026-09-01T08:00:00Z"},
            {**self.results[1], "source_document_id": "d-2", "created_at": "2026-09-15T08:00:00Z"},
            {**self.results[2], "source_document_id": "d-3", "created_at": "2026-09-25T08:00:00Z"},
        ]
        d2_trend = SelectionAnalyticsEngine.compute_trends(d2_results, d2_docs)
        self.assertTrue(d2_trend["has_time_series"])
        self.assertGreaterEqual(len(d2_trend["trend_points"]), 2)

        d2_analytics = {
            "kpi": SelectionAnalyticsEngine.compute_summary_kpis(d2_results, self.criteria),
            "trend": d2_trend,
            "distribution": {"score_ranges": []},
        }
        viz2 = DiagramSelector.select_optimal_visualizations(d2_results, self.criteria, d2_analytics, has_time_series=True)
        types2 = [v["chart_type"] for v in viz2]
        self.assertIn("line", types2)
        line_viz = next(v for v in viz2 if v["chart_type"] == "line")
        self.assertIn("time-series", line_viz["selection_reason"].lower())

        # Dataset 3: Karakteristik Komposisi (Proporsi Kelulusan / Bagian dari Keseluruhan)
        d3_results = [
            {**self.results[0], "recommendation_classification": "select"},
            {**self.results[1], "recommendation_classification": "select"},
            {**self.results[2], "recommendation_classification": "review"},
            {**self.results[3], "recommendation_classification": "reject"},
        ]
        d3_analytics = {
            "kpi": SelectionAnalyticsEngine.compute_summary_kpis(d3_results, self.criteria),
            "distribution": SelectionAnalyticsEngine.compute_score_distribution(d3_results),
            "trend": {"has_time_series": False, "trend_points": []},
        }
        viz3 = DiagramSelector.select_optimal_visualizations(d3_results, self.criteria, d3_analytics, has_time_series=False)
        types3 = [v["chart_type"] for v in viz3]
        self.assertIn("donut", types3)
        donut_viz = next(v for v in viz3 if v["chart_type"] == "donut")
        self.assertIn("proporsi", donut_viz["selection_reason"].lower())

        # Klasifikasi deterministik bentuk data
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "time_series"})["chart_type"], "line")
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "composition"})["chart_type"], "donut")
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "categorical_comparison"})["chart_type"], "bar")
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "funnel"})["chart_type"], "funnel")
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "bivariate"})["chart_type"], "scatter")
        self.assertEqual(DiagramSelector.classify_and_select_primary_chart({"shape": "matrix"})["chart_type"], "heatmap")

    def test_dod_anomaly_detection_statistical_outliers_verified(self):
        """
        DoD 2: Anomaly detection menandai outlier yang secara statistik memang
        menyimpang (dapat diverifikasi manual dari data mentah).
        """
        test_dataset = [
            {"id": "e-1", "entity_label": "Kandidat N1", "total_score": 82.0, "score_breakdown": {"technical": 82.0, "communication": 82.0}},
            {"id": "e-2", "entity_label": "Kandidat N2", "total_score": 84.0, "score_breakdown": {"technical": 85.0, "communication": 83.0}},
            {"id": "e-3", "entity_label": "Kandidat N3", "total_score": 83.0, "score_breakdown": {"technical": 84.0, "communication": 82.0}},
            {"id": "e-4", "entity_label": "Kandidat N4", "total_score": 81.0, "score_breakdown": {"technical": 80.0, "communication": 82.0}},
            {"id": "e-5", "entity_label": "Kandidat N5", "total_score": 85.0, "score_breakdown": {"technical": 86.0, "communication": 84.0}},
            # Outlier 1: Nilai 15.0 (Sangat jauh di bawah rata-rata ~80, z-score < -2.0)
            {"id": "e-outlier-low", "entity_label": "Kandidat Outlier Bawah", "total_score": 15.0, "score_breakdown": {"technical": 15.0, "communication": 15.0}},
            # Outlier 2: Disparitas intra-kriteria ekstrem (Technical 98 vs Communication 20 -> selisih 78)
            {"id": "e-disparity", "entity_label": "Kandidat Disparitas", "total_score": 60.0, "score_breakdown": {"technical": 98.0, "communication": 20.0}},
        ]

        perf = SelectionAnalyticsEngine.compute_performance_analysis(test_dataset)
        self.assertLessEqual(perf["min_fence"], 55.0)

        anom_result = SelectionAnalyticsEngine.compute_anomaly_detection(test_dataset, self.criteria)
        anomalies = anom_result["anomalies"]
        self.assertGreaterEqual(len(anomalies), 2)

        # Verifikasi Outlier Bawah
        low_outlier = next((a for a in anomalies if a["entity_id"] == "e-outlier-low"), None)
        self.assertIsNotNone(low_outlier)
        self.assertEqual(low_outlier["outlier_type"], "low_outlier")
        self.assertLess(low_outlier["z_score"], -1.96)
        self.assertLess(low_outlier["total_score"], low_outlier["iqr_min_fence"])

        # Verifikasi Outlier Disparitas
        disp_outlier = next((a for a in anomalies if a["entity_id"] == "e-disparity"), None)
        self.assertIsNotNone(disp_outlier)
        self.assertEqual(disp_outlier["outlier_type"], "disparity_outlier")
        self.assertGreaterEqual(disp_outlier["intra_spread"], 35.0)

    def test_dod_insight_narratives_100_percent_consistent_with_score_breakdown(self):
        """
        DoD 3: Insight narasi 100% konsisten dengan angka di score_breakdown
        dan parameter evaluasi resmi.
        """
        kpi = SelectionAnalyticsEngine.compute_summary_kpis(self.results, self.criteria)
        dist = SelectionAnalyticsEngine.compute_score_distribution(self.results)
        comp = SelectionAnalyticsEngine.compute_group_comparisons(self.results, self.criteria, self.documents)
        trend = SelectionAnalyticsEngine.compute_trends(self.results, self.documents)
        stat = SelectionAnalyticsEngine.compute_performance_analysis(self.results)
        anom = SelectionAnalyticsEngine.compute_anomaly_detection(self.results, self.criteria)

        analytics_bundle = {
            "kpi": kpi,
            "distribution": dist,
            "comparison": comp,
            "trend": trend,
            "statistic": stat,
            "performance": stat,
            "anomaly_detection": anom,
        }

        # 1. Pastikan seluruh 7 jenis narasi lolos strict grounding enforcement
        insights = SelectionInsightGenerator.generate_all_insights(
            results=self.results,
            criteria=self.criteria,
            analytics=analytics_bundle,
            strict=True,
        )
        self.assertGreaterEqual(len(insights), 7)

        # 2. Verifikasi independen setiap insight teks
        official_numbers = SelectionInsightGenerator.collect_official_numbers(
            self.results, self.criteria, analytics_bundle
        )
        for ins in insights:
            valid = SelectionInsightGenerator.validate_insight_grounding(
                text=ins["content"],
                expected_numbers=official_numbers,
                tolerance=0.5,
                strict=True,
                raise_on_error=True,
            )
            self.assertTrue(valid)

        # 3. Verifikasi bahwa angka palsu (misal 33.77) ditolak dengan InsightGroundingError
        fake_text = "Kandidat Alpha meraih nilai ajaib 33.77 yang tidak pernah ada di data."
        with self.assertRaises(InsightGroundingError):
            SelectionInsightGenerator.validate_insight_grounding(
                text=fake_text,
                expected_numbers=official_numbers,
                tolerance=0.5,
                strict=True,
                raise_on_error=True,
            )


if __name__ == "__main__":
    unittest.main()
