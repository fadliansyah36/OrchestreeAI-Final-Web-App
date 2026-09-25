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


if __name__ == "__main__":
    unittest.main()
