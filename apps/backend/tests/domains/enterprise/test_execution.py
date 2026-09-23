"""
Uji Otomatis Autonomous Task Execution dari Sinyal Terdeteksi (PRD v2.2 Bagian 8.13.3)
Definition of Done (DoD):
1. AI membuat task otomatis dari sinyal atau event korelasi terdeteksi.
2. Setiap task memuat aturan verifikasi data sumber nyata (TaskVerificationRule).
3. Traceability provenance ke sistem sumber dan sinyal asal terjamin 100%.
"""

import unittest
import uuid
from orchestree.domains.enterprise.correlator import SourceSignal, CorrelatedContextEvent
from orchestree.domains.enterprise.execution import (
    AutonomousTaskExecutionEngine,
    AutonomousTaskPlan,
    TaskVerificationRule,
)


class TestAutonomousTaskExecution(unittest.TestCase):

    def setUp(self):
        self.engine = AutonomousTaskExecutionEngine()
        self.tenant_id = str(uuid.uuid4())

    def test_formulate_task_from_single_sales_crm_signal(self):
        """Memverifikasi pembentukan task otomatis dari sinyal eskalasi CRM dengan verifikasi tabel leads."""
        lead_id = f"LEAD-{uuid.uuid4().hex[:8].upper()}"
        signal = SourceSignal(
            id=str(uuid.uuid4()),
            source_type="Native",
            source_system="ORCHESTREE_CRM",
            signal_type="DEAL_RISK_STALLED_NEGOTIATION",
            title="Peluang Kemitraan Strategis PT Mitra Utama Mengalami Kemandekan",
            payload={"lead_id": lead_id, "deal_value": 850000000},
            source_ref_id=lead_id,
        )

        plan: AutonomousTaskPlan = self.engine.formulate_task_from_signal(
            tenant_id=self.tenant_id,
            signal_or_event=signal
        )

        self.assertIsInstance(plan, AutonomousTaskPlan)
        self.assertEqual(plan.tenant_id, self.tenant_id)
        self.assertIn("Sales", plan.assigned_department)
        self.assertEqual(plan.priority, "urgent")  # 'RISK' sets priority urgent
        self.assertIn(lead_id, plan.description)

        # Verifikasi Aturan Data Sumber Nyata
        vrule: TaskVerificationRule = plan.verification_rule
        self.assertEqual(vrule.source_table, "leads")
        self.assertEqual(vrule.source_record_id, lead_id)
        self.assertEqual(vrule.condition_type, "STATUS_IN")
        self.assertIn("QUALIFIED", vrule.expected_value)
        self.assertIn("leads", vrule.verification_description)

        # Provenance traceability
        self.assertEqual(plan.source_signal_ids, [signal.id])
        self.assertIsNone(plan.source_event_id)

    def test_formulate_task_from_inventory_erp_signal(self):
        """Memverifikasi pembentukan task otomatis dari sinyal pasokan rantai pasok dengan verifikasi inventory_stock."""
        product_sku = f"PROD-SKU-{uuid.uuid4().hex[:6].upper()}"
        signal = SourceSignal(
            id=str(uuid.uuid4()),
            source_type="Synced",
            source_system="ERP_SAP_SUPPLY_CHAIN",
            signal_type="INVENTORY_SHORTAGE_THRESHOLD_BREACH",
            title="Stok Komponen Router Enterprise di Bawah Batas Buffer Operasional",
            payload={"product_id": product_sku, "required_quantity": 50},
            source_ref_id=product_sku,
        )

        plan: AutonomousTaskPlan = self.engine.formulate_task_from_signal(
            tenant_id=self.tenant_id,
            signal_or_event=signal
        )

        self.assertEqual(plan.priority, "urgent")  # 'BREACH' sets urgent
        self.assertIn("Supply Chain", plan.assigned_department)

        vrule: TaskVerificationRule = plan.verification_rule
        self.assertEqual(vrule.source_table, "inventory_stock")
        self.assertEqual(vrule.source_record_id, product_sku)
        self.assertEqual(vrule.condition_type, "FIELD_GTE")
        self.assertEqual(vrule.expected_value, 50)

    def test_formulate_task_from_correlated_context_event(self):
        """Memverifikasi pembentukan task dari event sintesis lintas sistem korporat."""
        event_id = str(uuid.uuid4())
        sig_id_1 = str(uuid.uuid4())
        sig_id_2 = str(uuid.uuid4())

        event = CorrelatedContextEvent(
            id=event_id,
            tenant_id=self.tenant_id,
            title="Konvergensi Keterlambatan Logistik dengan Penalti SLA Kontrak",
            summary="Analisis korelasi menemukan keterlambatan armada membahayakan pemenuhan pesanan klien tier VIP.",
            correlation_score=0.92,
            source_types=["Native", "Synced", "Uploaded"],
            source_signals=[
                {
                    "id": sig_id_1,
                    "source_system": "ERP_SAP_SUPPLY_CHAIN",
                    "signal_type": "LOGISTICS_BOTTLENECK_SHIPMENT",
                    "source_ref_id": "SHIP-TRK-8812",
                    "payload": {"product_id": "SKU-991", "required_quantity": 100},
                },
                {
                    "id": sig_id_2,
                    "source_system": "ADMIN_LEGAL_STORE",
                    "signal_type": "ENTERPRISE_SLA_PENALTY_CLAUSE",
                    "source_ref_id": "DOC-LEGAL-440",
                    "payload": {},
                }
            ],
            insights={"criticality": "HIGH"},
            recommended_actions=[
                {"directive": "Prioritaskan re-routing armada logistik dan alokasikan stok cadangan gudang."}
            ]
        )

        plan: AutonomousTaskPlan = self.engine.formulate_task_from_signal(
            tenant_id=self.tenant_id,
            signal_or_event=event
        )

        self.assertEqual(plan.tenant_id, self.tenant_id)
        self.assertEqual(plan.source_event_id, event_id)
        self.assertIn(sig_id_1, plan.source_signal_ids)
        self.assertIn(sig_id_2, plan.source_signal_ids)
        self.assertIn("Sintesis Sinyal Lintas Sistem", plan.title)
        self.assertIn("TUGAS OTONOM DIBUAT OTOMATIS", plan.description)

        # Aturan verifikasi bersumber dari sinyal utama
        vrule: TaskVerificationRule = plan.verification_rule
        self.assertEqual(vrule.source_table, "inventory_stock")
        self.assertEqual(vrule.source_record_id, "SKU-991")
        self.assertEqual(vrule.expected_value, 100)


if __name__ == "__main__":
    unittest.main()
