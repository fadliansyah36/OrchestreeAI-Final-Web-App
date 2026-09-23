"""
Uji Otomatis Korelator Sinyal Lintas Sistem (PRD v2.2 Bagian 8.13.1)
Definition of Done:
Empat sinyal lintas sistem berbeda menghasilkan satu company_context_events
gabungan yang dapat ditelusuri ke masing-masing sumber.
"""

import unittest
import uuid
from app.domains.enterprise.correlator import (
    CrossSystemSignalCorrelator,
    SourceSignal,
    CorrelatedContextEvent,
)


class TestCrossSystemCorrelator(unittest.TestCase):

    def test_cross_system_correlator_four_distinct_signals(self):
        correlator = CrossSystemSignalCorrelator()
        tenant_id = str(uuid.uuid4())

        # 4 sinyal lintas sistem berbeda dari sumber Native, Synced, dan Uploaded
        signal_crm = SourceSignal(
            source_type="Native",
            source_system="ORCHESTREE_CRM",
            signal_type="DEAL_ESCALATION_HIGH_VALUE",
            title="Eskalasi Peluang Penjualan Korporat PT Mega Global Senilai Rp 4.2 Miliar",
            payload={"deal_value": 4200000000, "client_tier": "VIP_ENTERPRISE"},
            source_ref_id="CRM-DEAL-8821"
        )

        signal_erp = SourceSignal(
            source_type="Synced",
            source_system="ERP_SAP_SUPPLY_CHAIN",
            signal_type="SHIPMENT_BACKORDER_DELAY",
            title="Keterlambatan Pengiriman Batch Server Rack ke Gudang Cikarang",
            payload={"batch_code": "SAP-WH-9902", "delay_days": 4},
            source_ref_id="SAP-DEL-1049"
        )

        signal_doc = SourceSignal(
            source_type="Uploaded",
            source_system="ADMIN_LEGAL_STORE",
            signal_type="ENTERPRISE_SLA_PENALTY_CLAUSE",
            title="Adendum Kontrak Pengadaan Q3: Klausul Denda Keterlambatan Pengiriman 2% per Hari",
            payload={"penalty_rate_daily": 0.02, "max_liability_cap": 0.15},
            source_ref_id="DOC-PDF-LEGAL-771"
        )

        signal_hris = SourceSignal(
            source_type="Synced",
            source_system="HRIS_WORKFORCE_OPS",
            signal_type="LOGISTICS_TEAM_CAPACITY_BOTTLENECK",
            title="Lonjakan Beban Kerja Tim Logistik Gudang Akibat Cuti Bersama",
            payload={"staff_absent_pct": 38, "open_shift_count": 6},
            source_ref_id="HRIS-ATTN-330"
        )

        signals = [signal_crm, signal_erp, signal_doc, signal_hris]

        # Eksekusi korelasi
        event = correlator.correlate_signals(
            tenant_id=tenant_id,
            signals=signals,
            context_theme="Risiko Eksekusi Pengadaan Q3 Terhadap SLA Kontrak dan Penjualan"
        )

        # Verifikasi hasil korelasi
        self.assertIsInstance(event, CorrelatedContextEvent)
        self.assertEqual(event.tenant_id, tenant_id)
        self.assertEqual(event.event_type, "CROSS_SYSTEM_SYNTHESIS")

        # 4 sinyal berbeda terpetakan
        self.assertEqual(len(event.source_signals), 4)

        # 3 tipe sumber terwakili
        self.assertEqual(set(event.source_types), {"Native", "Synced", "Uploaded"})

        # Traceability ke ID referensi masing-masing sumber
        source_refs = {s["source_ref_id"] for s in event.source_signals}
        self.assertEqual(source_refs, {"CRM-DEAL-8821", "SAP-DEL-1049", "DOC-PDF-LEGAL-771", "HRIS-ATTN-330"})

        # Skor korelasi valid
        self.assertGreaterEqual(event.correlation_score, 0.70)
        self.assertLessEqual(event.correlation_score, 1.00)

        # Insights dan rekomendasi aksi terisi
        self.assertGreater(len(event.insights), 0)
        self.assertGreater(len(event.recommended_actions), 0)


if __name__ == "__main__":
    unittest.main()
