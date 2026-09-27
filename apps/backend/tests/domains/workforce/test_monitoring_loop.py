"""
Uji Otomatis Closed-Loop Workforce Monitoring & Source Data Verification (PRD v2.2 Bagian 8.13.4, 6.2, 18.1)
Definition of Done (DoD):
"Penyelesaian task hasil monitoring loop diverifikasi dari data sumber nyata, bukan klik tombol DONE manual tanpa bukti."
"""

import unittest
import uuid
import datetime
from orchestree.domains.enterprise.correlator import SourceSignal
from orchestree.domains.enterprise.execution import AutonomousTaskExecutionEngine, AutonomousTaskPlan
from orchestree.domains.workforce.monitoring_loop import (
    WorkforceClosedLoopMonitoringEngine,
    SourceVerificationResult,
)


class TestWorkforceMonitoringLoop(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.execution_engine = AutonomousTaskExecutionEngine()
        self.monitoring_engine = WorkforceClosedLoopMonitoringEngine()
        self.tenant_id = str(uuid.uuid4())

    async def test_manual_done_click_rejected_when_source_data_incomplete(self):
        """
        DoD: Menolak klik 'DONE' manual saat data sumber nyata belum selesai.
        Kondisi: Lead status masih 'NEW', bukan 'QUALIFIED' / 'CLOSED_WON'.
        """
        lead_id = f"LEAD-MOCK-{uuid.uuid4().hex[:6]}"
        task_id = str(uuid.uuid4())

        simulated_record = {
            "_rule": {
                "source_system": "ORCHESTREE_CRM",
                "source_table": "leads",
                "source_record_id": lead_id,
                "condition_type": "STATUS_IN",
                "field_name": "status",
                "expected_value": ["QUALIFIED", "CLOSED_WON", "NEGOTIATION"],
                "verification_description": "Status prospek harus QUALIFIED atau NEGOTIATION."
            },
            "id": lead_id,
            "status": "NEW_UNCONTACTED",  # Data nyata sumber masih status baru
            "deal_value": 500000000,
        }

        result: SourceVerificationResult = await self.monitoring_engine.intercept_manual_completion_attempt(
            tenant_id=self.tenant_id,
            task_id=task_id,
            requested_by="operator_human",
            source_record_override=simulated_record
        )

        # DoD: Wajib ditolak
        self.assertFalse(result.is_verified)
        self.assertEqual(result.status, "REJECTED_UNVERIFIED")
        self.assertEqual(result.observed_value, "NEW_UNCONTACTED")
        self.assertIn("ditolak", result.rejection_reason)
        self.assertIn("tombol DONE manual", result.rejection_reason)

    async def test_task_verified_done_when_real_source_data_fulfills_condition(self):
        """
        DoD: Task diverifikasi selesai saat data sumber nyata terbukti memenuhi syarat.
        Kondisi: Lead status pada tabel sumber telah berubah menjadi 'QUALIFIED'.
        """
        lead_id = f"LEAD-MOCK-{uuid.uuid4().hex[:6]}"
        task_id = str(uuid.uuid4())

        simulated_record = {
            "_rule": {
                "source_system": "ORCHESTREE_CRM",
                "source_table": "leads",
                "source_record_id": lead_id,
                "condition_type": "STATUS_IN",
                "field_name": "status",
                "expected_value": ["QUALIFIED", "CLOSED_WON", "NEGOTIATION"],
                "verification_description": "Status prospek harus QUALIFIED."
            },
            "id": lead_id,
            "status": "QUALIFIED",  # Data nyata sumber terbukti valid
            "deal_value": 750000000,
        }

        result: SourceVerificationResult = await self.monitoring_engine.verify_task_against_source(
            tenant_id=self.tenant_id,
            task_id=task_id,
            source_record_override=simulated_record
        )

        # DoD: Wajib terverifikasi selesai dengan bukti sumber
        self.assertTrue(result.is_verified)
        self.assertEqual(result.status, "VERIFIED_DONE")
        self.assertEqual(result.observed_value, "QUALIFIED")
        self.assertIsNotNone(result.verified_at)
        self.assertIn("source_snapshot", result.verification_proof)
        self.assertEqual(result.verification_proof["audit_verdict"], "VERIFIED_GENUINE_SOURCE_DATA")

    async def test_inventory_threshold_verification(self):
        """
        Memverifikasi kriteria numerik FIELD_GTE untuk tabel inventory_stock.
        """
        product_id = "SKU-ROUTER-990"
        task_id = str(uuid.uuid4())

        rule = {
            "source_system": "ERP_SAP_SUPPLY_CHAIN",
            "source_table": "inventory_stock",
            "source_record_id": product_id,
            "condition_type": "FIELD_GTE",
            "field_name": "quantity_available",
            "expected_value": 100,
            "verification_description": "Stok minimum 100 unit di gudang."
        }

        # 1. Stok masih 45 unit -> Gagal verifikasi
        unverified_res = await self.monitoring_engine.verify_task_against_source(
            tenant_id=self.tenant_id,
            task_id=task_id,
            source_record_override={
                "_rule": rule,
                "product_id": product_id,
                "quantity_available": 45,
            }
        )
        self.assertFalse(unverified_res.is_verified)
        self.assertEqual(unverified_res.observed_value, 45)

        # 2. Stok bertambah menjadi 120 unit -> Berhasil terverifikasi selesai
        verified_res = await self.monitoring_engine.verify_task_against_source(
            tenant_id=self.tenant_id,
            task_id=task_id,
            source_record_override={
                "_rule": rule,
                "product_id": product_id,
                "quantity_available": 120,
            }
        )
        self.assertTrue(verified_res.is_verified)
        self.assertEqual(verified_res.status, "VERIFIED_DONE")
        self.assertEqual(verified_res.observed_value, 120)

    async def test_end_to_end_signal_to_execution_to_source_verified_loop(self):
        """
        Alur utuh:
        1. Sinyal terdeteksi (DEAL_RISK).
        2. Execution Engine membuat task otomatis dengan TaskVerificationRule.
        3. Upaya mark as DONE manual ditolak saat data belum siap.
        4. Transaksi real terjadi di tabel sumber -> Monitoring loop memverifikasi DONE dengan bukti SSOT.
        """
        lead_id = f"LEAD-CORP-{uuid.uuid4().hex[:6]}"
        signal = SourceSignal(
            id=str(uuid.uuid4()),
            source_type="Native",
            source_system="ORCHESTREE_CRM",
            signal_type="DEAL_RISK_HIGH_TIER",
            title="Risiko Pembatalan Prospek Pengadaan Server Bank Mandiri",
            payload={"lead_id": lead_id},
            source_ref_id=lead_id
        )

        # 1. AI membuat task otomatis dari sinyal
        task_plan: AutonomousTaskPlan = self.execution_engine.formulate_task_from_signal(
            tenant_id=self.tenant_id,
            signal_or_event=signal
        )
        self.assertEqual(task_plan.verification_rule.source_table, "leads")
        self.assertEqual(task_plan.verification_rule.source_record_id, lead_id)

        # 2. Operator coba klik DONE manual tanpa bukti -> REJECTED
        rule_dict = task_plan.verification_rule.model_dump() if hasattr(task_plan.verification_rule, "model_dump") else task_plan.verification_rule.__dict__
        premature_attempt = await self.monitoring_engine.intercept_manual_completion_attempt(
            tenant_id=self.tenant_id,
            task_id=task_plan.id,
            requested_by="human_manager",
            source_record_override={
                "_rule": rule_dict,
                "id": lead_id,
                "status": "DISCUSSING",  # Belum QUALIFIED/CLOSED_WON
            }
        )
        self.assertFalse(premature_attempt.is_verified)
        self.assertEqual(premature_attempt.status, "REJECTED_UNVERIFIED")

        # 3. Tim sales berhasil menyelesaikan deal di sistem sumber CRM
        legitimate_completion = await self.monitoring_engine.verify_task_against_source(
            tenant_id=self.tenant_id,
            task_id=task_plan.id,
            source_record_override={
                "_rule": rule_dict,
                "id": lead_id,
                "status": "CLOSED_WON",  # Terbukti selesai di SSOT
            }
        )
        self.assertTrue(legitimate_completion.is_verified)
        self.assertEqual(legitimate_completion.status, "VERIFIED_DONE")
        self.assertIn("source_snapshot", legitimate_completion.verification_proof)


if __name__ == "__main__":
    unittest.main()
