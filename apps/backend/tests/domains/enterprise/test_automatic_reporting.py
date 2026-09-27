"""
Uji Otomatis Automatic Reporting & Management Conversational Query (PRD v2.2 Bagian 3.4, 3.5, 8.6, 12)
Definition of Done (DoD):
1. Setiap angka pada narasi laporan otomatis cocok persis dengan report_data_points (verifikasi deterministik 100%).
2. Management Conversational Query mendukung drill-down multi-turn.
3. Jawaban difilter ABAC sebelum sampai ke penanya (redaksi data rahasia untuk staf, akses penuh untuk direksi).
"""

import unittest
import uuid
import datetime
from orchestree.domains.enterprise.automatic_reporting import (
    ReportDataPoint,
    AutomatedReportItem,
    NarrativeVerificationResult,
    build_deterministic_narrative,
    verify_narrative_against_data_points,
    format_currency_idr,
)
from orchestree.domains.enterprise.conversational_query import (
    evaluate_abac_for_data_point,
    process_conversational_query,
    ROLE_PERMITTED_SENSITIVITIES,
    ConversationalTurnResult,
)


def create_sample_data_points(tenant_id: str, report_id: str):
    """Menyiapkan kumpulan data titik metrik sampel SSOT."""
    now = datetime.datetime.now(datetime.timezone.utc)
    p_start = (now - datetime.timedelta(days=7)).isoformat()
    p_end = now.isoformat()

    return [
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="total_revenue",
            metric_label="Total Pendapatan Operasional",
            metric_value=750000000.0,
            unit="IDR",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="orders",
            source_query="SELECT SUM(total_amount) FROM orders WHERE tenant_id = $1",
            source_dimension="FINANCIALS_AND_BUDGET",
            sensitivity_level="RESTRICTED_MANAGEMENT",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="order_count",
            metric_label="Volume Transaksi Komersial",
            metric_value=142.0,
            unit="transaksi",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="orders",
            source_query="SELECT COUNT(*) FROM orders WHERE tenant_id = $1",
            source_dimension="FINANCIALS_AND_BUDGET",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="gross_profit_margin",
            metric_label="Margin Laba Kotor",
            metric_value=32.4,
            unit="%",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="orders",
            source_query="Derived gross profit margin",
            source_dimension="FINANCIALS_AND_BUDGET",
            sensitivity_level="FINANCIAL_EXECUTIVE",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="active_leads_count",
            metric_label="Jumlah Prospek Aktif",
            metric_value=28.0,
            unit="prospek",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="leads",
            source_query="SELECT COUNT(*) FROM leads WHERE tenant_id = $1",
            source_dimension="CUSTOMER_AND_MARKET",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="pipeline_value",
            metric_label="Nilai Pipeline Penjualan",
            metric_value=1250000000.0,
            unit="IDR",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="leads",
            source_query="SELECT SUM(estimated_value) FROM leads WHERE tenant_id = $1",
            source_dimension="CUSTOMER_AND_MARKET",
            sensitivity_level="RESTRICTED_MANAGEMENT",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="completed_tasks",
            metric_label="Tugas Selesai",
            metric_value=85.0,
            unit="tugas",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="tasks",
            source_query="SELECT COUNT(*) FROM tasks WHERE tenant_id = $1 AND status = 'DONE'",
            source_dimension="PROCESSES_AND_SOPS",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="total_active_tasks",
            metric_label="Total Tugas Berjalan",
            metric_value=96.0,
            unit="tugas",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="tasks",
            source_query="SELECT COUNT(*) FROM tasks WHERE tenant_id = $1",
            source_dimension="PROCESSES_AND_SOPS",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="credits_consumed",
            metric_label="Konsumsi Kredit",
            metric_value=450.75,
            unit="kredit",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="tenant_credit_transactions",
            source_query="SELECT SUM(credits_amount) FROM tenant_credit_transactions WHERE tenant_id = $1",
            source_dimension="FINANCIALS_AND_BUDGET",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="ai_tokens_consumed",
            metric_label="Konsumsi Token AI",
            metric_value=185000.0,
            unit="tokens",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="llm_usage_logs",
            source_query="SELECT SUM(total_tokens) FROM llm_usage_logs WHERE tenant_id = $1",
            source_dimension="PROCESSES_AND_SOPS",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="ai_agent_count",
            metric_label="Jumlah Agen AI Aktif",
            metric_value=8.0,
            unit="agen",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="ai_agents",
            source_query="SELECT COUNT(*) FROM ai_agents WHERE tenant_id = $1 AND status = 'active'",
            source_dimension="ORGANIZATIONAL_STRUCTURE",
            sensitivity_level="INTERNAL",
        ),
        ReportDataPoint(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            report_id=report_id,
            metric_key="average_performance_score",
            metric_label="Indeks Kinerja Rata-rata",
            metric_value=91.4,
            unit="poin",
            period_type="WEEKLY",
            period_start=p_start,
            period_end=p_end,
            source_table="performance_scores_monthly",
            source_query="SELECT AVG(score) FROM performance_scores_monthly WHERE tenant_id = $1",
            source_dimension="ORGANIZATIONAL_STRUCTURE",
            sensitivity_level="INTERNAL",
        ),
    ]


class TestAutomaticReportingDeterministic(unittest.TestCase):
    """Pengujian verifikasi deterministik narasi terhadap data poin SSOT."""

    def setUp(self):
        self.tenant_id = str(uuid.uuid4())
        self.report_id = str(uuid.uuid4())
        self.data_points = create_sample_data_points(self.tenant_id, self.report_id)

    def test_deterministic_narrative_generation(self):
        """Memverifikasi narasi terbuat lengkap dengan ringkasan eksekutif dan format IDR yang presisi."""
        exec_summary, narrative = build_deterministic_narrative(
            tenant_name="PT Inovasi Cipta Mandiri",
            period_type="WEEKLY",
            period_start="2026-09-14",
            period_end="2026-09-21",
            data_points=self.data_points,
        )

        self.assertIn("PT Inovasi Cipta Mandiri", exec_summary)
        self.assertIn("750.000.000", narrative)
        self.assertIn("1.250.000.000", narrative)
        self.assertIn("32.4%", narrative)
        self.assertIn("142", narrative)
        self.assertIn("85", narrative)

    def test_verify_narrative_against_data_points_success(self):
        """DoD 1: Memverifikasi deterministik bahwa 100% data poin cocok persis dengan narasi."""
        _, narrative = build_deterministic_narrative(
            tenant_name="PT Inovasi Cipta Mandiri",
            period_type="WEEKLY",
            period_start="2026-09-14",
            period_end="2026-09-21",
            data_points=self.data_points,
        )

        result: NarrativeVerificationResult = verify_narrative_against_data_points(
            narrative=narrative,
            data_points=self.data_points,
        )

        self.assertTrue(result.is_valid, f"Verifikasi gagal dengan selisih: {result.discrepancies}")
        self.assertEqual(len(result.missing_metrics), 0)
        self.assertEqual(len(result.matched_metrics), len(self.data_points))
        self.assertEqual(result.total_data_points_checked, len(self.data_points))

    def test_verify_narrative_detects_tampered_numbers(self):
        """Memverifikasi sistem menolak bila ada angka narasi yang diubah (anti-halusinasi)."""
        _, narrative = build_deterministic_narrative(
            tenant_name="PT Inovasi Cipta Mandiri",
            period_type="WEEKLY",
            period_start="2026-09-14",
            period_end="2026-09-21",
            data_points=self.data_points,
        )

        # Ubah angka pendapatan menjadi angka palsu
        tampered_narrative = narrative.replace("750.000.000", "999.999.999")

        result: NarrativeVerificationResult = verify_narrative_against_data_points(
            narrative=tampered_narrative,
            data_points=self.data_points,
        )

        self.assertFalse(result.is_valid)
        self.assertIn("total_revenue", result.missing_metrics)
        self.assertTrue(any(d["metric_key"] == "total_revenue" for d in result.discrepancies))


class TestManagementConversationalQueryABAC(unittest.TestCase):
    """Pengujian Management Conversational Query dan penegakan ABAC filtering."""

    def setUp(self):
        self.tenant_id = str(uuid.uuid4())
        self.session_id = str(uuid.uuid4())
        self.data_points = create_sample_data_points(self.tenant_id, str(uuid.uuid4()))

    def test_abac_matrix_permissions(self):
        """Memverifikasi matriks sensitivitas ABAC untuk berbagai peran."""
        # SUPER_ADMIN berhak atas seluruh sensitivitas
        for sens in ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED_MANAGEMENT", "FINANCIAL_EXECUTIVE"]:
            allowed, _ = evaluate_abac_for_data_point("SUPER_ADMIN", sens)
            self.assertTrue(allowed)

        # DIRECTOR berhak atas seluruh sensitivitas
        for sens in ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED_MANAGEMENT", "FINANCIAL_EXECUTIVE"]:
            allowed, _ = evaluate_abac_for_data_point("DIRECTOR", sens)
            self.assertTrue(allowed)

        # MANAGER berhak sampai CONFIDENTIAL, ditolak untuk RESTRICTED_MANAGEMENT & FINANCIAL_EXECUTIVE
        self.assertTrue(evaluate_abac_for_data_point("MANAGER", "CONFIDENTIAL")[0])
        self.assertFalse(evaluate_abac_for_data_point("MANAGER", "RESTRICTED_MANAGEMENT")[0])
        self.assertFalse(evaluate_abac_for_data_point("MANAGER", "FINANCIAL_EXECUTIVE")[0])

        # STAFF hanya PUBLIC dan INTERNAL
        self.assertTrue(evaluate_abac_for_data_point("STAFF", "INTERNAL")[0])
        self.assertFalse(evaluate_abac_for_data_point("STAFF", "CONFIDENTIAL")[0])
        self.assertFalse(evaluate_abac_for_data_point("STAFF", "RESTRICTED_MANAGEMENT")[0])
        self.assertFalse(evaluate_abac_for_data_point("STAFF", "FINANCIAL_EXECUTIVE")[0])

    def test_conversational_query_staff_redaction(self):
        """DoD 3: Jawaban untuk STAFF disaring oleh ABAC — metrik pendapatan & laba disamarkan/dibatasi."""
        result: ConversationalTurnResult = process_conversational_query(
            tenant_id=self.tenant_id,
            session_id=self.session_id,
            turn_number=1,
            user_id=str(uuid.uuid4()),
            user_role="STAFF",
            user_department_id=None,
            query_text="Berapa total pendapatan dan margin laba kotor perusahaan saat ini?",
            data_points=self.data_points,
        )

        # Raw answer memuat informasi asli
        self.assertIn("750.000.000", result.raw_answer)
        self.assertIn("32.4%", result.raw_answer)

        # Filtered answer untuk STAFF WAJIB memuat redaksi ABAC, TIDAK memuat angka laba/pendapatan rahasia
        self.assertIn("INFORMASI DIBATASI OLEH KEBIJAKAN ABAC", result.filtered_answer)
        self.assertNotIn("750.000.000", result.filtered_answer)
        self.assertNotIn("32.4%", result.filtered_answer)

        # Evaluasi ABAC tercatat eksplisit
        self.assertEqual(result.abac_evaluation["total_revenue"]["decision"], "DENIED_BY_ABAC")
        self.assertEqual(result.abac_evaluation["gross_profit_margin"]["decision"], "DENIED_BY_ABAC")
        self.assertGreaterEqual(result.confidence_score, 95.0)

    def test_conversational_query_director_full_access(self):
        """DoD 3: Jawaban untuk DIRECTOR diberikan akses penuh tanpa redaksi."""
        result: ConversationalTurnResult = process_conversational_query(
            tenant_id=self.tenant_id,
            session_id=self.session_id,
            turn_number=1,
            user_id=str(uuid.uuid4()),
            user_role="DIRECTOR",
            user_department_id=None,
            query_text="Tampilkan ringkasan pendapatan operasional dan margin laba kotor.",
            data_points=self.data_points,
        )

        # Filtered answer untuk DIRECTOR memuat angka lengkap
        self.assertIn("750.000.000", result.filtered_answer)
        self.assertIn("32.4%", result.filtered_answer)
        self.assertNotIn("INFORMASI DIBATASI OLEH KEBIJAKAN ABAC", result.filtered_answer)

        # Seluruh keputusan evaluasi adalah ALLOW
        self.assertEqual(result.abac_evaluation["total_revenue"]["decision"], "ALLOW")
        self.assertEqual(result.abac_evaluation["gross_profit_margin"]["decision"], "ALLOW")

    def test_multi_turn_drill_down_continuity(self):
        """DoD 2: Menjamin nomor putaran (turn_number) dan kontinuitas sesi percakapan."""
        turn1 = process_conversational_query(
            tenant_id=self.tenant_id,
            session_id=self.session_id,
            turn_number=1,
            user_id=str(uuid.uuid4()),
            user_role="MANAGER",
            user_department_id=None,
            query_text="Bagaimana status penyelesaian tugas operasional kita?",
            data_points=self.data_points,
        )
        self.assertEqual(turn1.turn_number, 1)
        self.assertIn("85", turn1.filtered_answer)

        turn2 = process_conversational_query(
            tenant_id=self.tenant_id,
            session_id=self.session_id,
            turn_number=2,
            user_id=str(uuid.uuid4()),
            user_role="MANAGER",
            user_department_id=None,
            query_text="Lalu berapa jumlah prospek aktif dalam pipeline?",
            data_points=self.data_points,
        )
        self.assertEqual(turn2.turn_number, 2)
        self.assertEqual(turn2.session_id, self.session_id)
        self.assertIn("28", turn2.filtered_answer)


if __name__ == "__main__":
    unittest.main()
