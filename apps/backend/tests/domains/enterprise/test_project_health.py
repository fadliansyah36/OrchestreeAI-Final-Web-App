"""
Uji Otomatis Project Health & Multi-Agent Parallel Collaboration Engine (PRD v2.2 Bagian 8.13.7)

DEFINITION OF DONE:
"Satu Executive Recommendation dihasilkan dari kontribusi paralel beberapa Specialist Agent yang berbeda,
dapat ditelusuri kontribusi masing-masing."
"""

import unittest
import uuid
from orchestree.domains.enterprise.project_health import (
    EnterpriseProjectHealthEngine,
    ProjectHealthDiagnostic,
    MultiAgentCollaborationSession,
    ExecutiveRecommendation,
    SpecialistAgentContribution,
    ContributingSpecialistTrace,
    DEFAULT_SPECIALIST_AGENTS,
)


class TestEnterpriseProjectHealthEngine(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.engine = EnterpriseProjectHealthEngine()
        self.tenant_id = str(uuid.uuid4())
        self.project_ref_id = "PRJ-ENTERPRISE-2026-ALPHA"
        self.project_name = "Implementasi ERP & Otomasi Rantai Pasok Korporat"

    def test_calculate_health_diagnostic_metrics(self):
        """
        Pengujian kalkulasi diagnostik kesehatan proyek:
        Jadwal (35%), Anggaran (35%), dan Alokasi Sumber Daya (30%).
        """
        # Skenario: Proyek terancam (delayed tasks, pembengkakan anggaran, overload tim)
        metrics = {
            "total_tasks": 50,
            "completed_tasks": 20,
            "delayed_tasks": 12,
            "allocated_budget": 500000000.0,
            "actual_spend": 620000000.0,  # Overspend 24%
            "resource_utilization_pct": 94.0,  # Red zone > 90%
            "supplier_delay_days": 8,
        }

        health: ProjectHealthDiagnostic = self.engine.calculate_health_diagnostic(
            project_ref_id=self.project_ref_id,
            project_name=self.project_name,
            metrics=metrics,
        )

        self.assertEqual(health.project_ref_id, self.project_ref_id)
        self.assertEqual(health.project_name, self.project_name)
        # Skor harus berada dalam zona AT_RISK atau CRITICAL karena metrik bermasalah
        self.assertIn(health.health_status, ("CRITICAL", "AT_RISK"))
        self.assertLess(health.overall_health_score, 65.0)
        self.assertGreater(len(health.risk_factors), 2)
        self.assertTrue(any("deviasi jadwal" in r for r in health.risk_factors))
        self.assertTrue(any("anggaran" in r for r in health.risk_factors))

    async def test_dod_single_executive_recommendation_from_parallel_specialists_with_traceability(self):
        """
        PENEGAKAN DEFINITION OF DONE MUTLAK:
        1. Beberapa Specialist Agent yang berbeda (Finance, Supply Chain, Legal, Commercial)
           menjalankan analisis paralel.
        2. Menghasilkan SATU Executive Recommendation terpadu.
        3. Setiap kontribusi dapat ditelusuri (traceable) ke agen spesialis asalnya melalui trace_id.
        """
        # Diagnostik proyek dalam kondisi genting
        metrics = {
            "total_tasks": 40,
            "completed_tasks": 15,
            "delayed_tasks": 9,
            "allocated_budget": 300000000.0,
            "actual_spend": 340000000.0,
            "resource_utilization_pct": 92.5,
            "supplier_delay_days": 6,
        }
        health = self.engine.calculate_health_diagnostic(
            project_ref_id=self.project_ref_id,
            project_name=self.project_name,
            metrics=metrics,
        )

        specialist_codes = [
            "SPECIALIST_FINANCIAL_ANALYST",
            "SPECIALIST_SUPPLY_CHAIN",
            "SPECIALIST_LEGAL_COMPLIANCE",
            "SPECIALIST_COMMERCIAL_GROWTH",
        ]

        # Eksekusi kolaborasi paralel multi-agent
        session: MultiAgentCollaborationSession = await self.engine.run_parallel_multi_agent_collaboration(
            tenant_id=self.tenant_id,
            project_ref_id=self.project_ref_id,
            project_name=self.project_name,
            health=health,
            specialist_agent_codes=specialist_codes,
        )

        self.assertEqual(session.status, "COMPLETED")
        self.assertEqual(len(session.participating_agent_codes), 4)
        self.assertEqual(len(session.agent_contributions), 4)

        # DoD Bagian 1: Verifikasi SATU Executive Recommendation terpadu dihasilkan
        exec_rec: ExecutiveRecommendation = session.executive_recommendation
        self.assertIsNotNone(exec_rec)
        self.assertEqual(exec_rec.project_ref_id, self.project_ref_id)
        self.assertEqual(exec_rec.overall_health_verdict, health.health_status)
        self.assertGreater(exec_rec.consensus_score, 0.8)
        self.assertIn("Stabilization Directive", exec_rec.recommendation_title)

        # DoD Bagian 2: Verifikasi kontribusi berasal dari beberapa Specialist Agent BERBEDA
        contributing_domains = {t.domain for t in exec_rec.contributing_specialists_traces}
        expected_domains = {"FINANCE", "SUPPLY_CHAIN", "LEGAL", "COMMERCIAL"}
        self.assertEqual(contributing_domains, expected_domains)
        self.assertEqual(len(exec_rec.contributing_specialists_traces), 4)

        # DoD Bagian 3: Traceability - Setiap kontribusi spesialis dapat ditelusuri secara presisi
        trace_ids = [t.trace_id for t in exec_rec.contributing_specialists_traces]
        self.assertEqual(len(trace_ids), len(set(trace_ids)), "Setiap trace_id wajib unik")

        for trace in exec_rec.contributing_specialists_traces:
            self.assertTrue(trace.trace_id.startswith("TRACE-SPECIALIST_"))
            self.assertIsNotNone(trace.key_contribution)
            self.assertGreater(len(trace.key_contribution), 10)
            self.assertGreater(trace.confidence_score, 0.80)

        # DoD Bagian 4: Immediate action items merujuk kembali ke agen asal dan trace_id
        self.assertGreater(len(exec_rec.immediate_action_items), 3)
        for item in exec_rec.immediate_action_items:
            self.assertIn("originating_agent_code", item)
            self.assertIn("trace_id", item)
            self.assertIn(item["originating_agent_code"], specialist_codes)
            self.assertIn(item["trace_id"], trace_ids)

        # DoD Bagian 5: Strategi terpadu merangkum seluruh domain
        self.assertIn("FINANCE", exec_rec.synthesized_strategy)
        self.assertIn("SUPPLY_CHAIN", exec_rec.synthesized_strategy)
        self.assertIn("LEGAL", exec_rec.synthesized_strategy)
        self.assertIn("COMMERCIAL", exec_rec.synthesized_strategy)

    async def test_collaboration_with_workforce_productivity_specialist(self):
        """
        Pengujian kolaborasi yang melibatkan agen spesialis produktivitas tenaga kerja.
        """
        health = self.engine.calculate_health_diagnostic(
            project_ref_id="PRJ-BETA",
            project_name="Digital Banking Core Modernization",
            metrics={"total_tasks": 100, "completed_tasks": 80, "delayed_tasks": 2, "resource_utilization_pct": 82.0},
        )

        session = await self.engine.run_parallel_multi_agent_collaboration(
            tenant_id=self.tenant_id,
            project_ref_id="PRJ-BETA",
            project_name="Digital Banking Core Modernization",
            health=health,
            specialist_agent_codes=[
                "SPECIALIST_FINANCIAL_ANALYST",
                "SPECIALIST_WORKFORCE_PRODUCTIVITY",
            ],
        )

        self.assertEqual(len(session.agent_contributions), 2)
        exec_rec = session.executive_recommendation
        domains = {t.domain for t in exec_rec.contributing_specialists_traces}
        self.assertEqual(domains, {"FINANCE", "WORKFORCE"})


if __name__ == "__main__":
    unittest.main()
