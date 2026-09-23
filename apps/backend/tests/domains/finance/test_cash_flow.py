"""
Uji Otomatis Cash Flow Analytics Engine (PRD v2.2 Bagian 8.13.6, 8.13.8)
Menguji:
1. Perhitungan arus kas sumber native internal untuk All-Tier (Starter, Growth, Pro).
2. Harmonisasi arus kas sumber ERP eksternal untuk Enterprise Tier.
3. Estimasi burn rate harian dan runway.
"""

import unittest
import uuid
import datetime
from orchestree.domains.finance.cash_flow import (
    FinanceCashFlowEngine,
    CashFlowSummary,
    CashFlowItem,
)


class TestFinanceCashFlowEngine(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.engine = FinanceCashFlowEngine()
        self.tenant_id = str(uuid.uuid4())
        self.period_start = "2026-09-01"
        self.period_end = "2026-09-30"

    async def test_native_internal_cash_flow_all_tier(self):
        """
        Pengujian tier STARTER / GROW / PRO menggunakan data transaksi native internal (All-Tier).
        """
        simulated_internal_records = [
            {
                "id": str(uuid.uuid4()),
                "date": "2026-09-05",
                "description": "Pembayaran Pesanan Kopi Arabika",
                "amount": 2500000.0,
                "direction": "INFLOW",
                "category": "COMMERCE_REVENUE",
                "source_system": "ORCHESTREE_NATIVE_COMMERCE",
            },
            {
                "id": str(uuid.uuid4()),
                "date": "2026-09-12",
                "description": "Langganan B2B Bulanan",
                "amount": 7500000.0,
                "direction": "INFLOW",
                "category": "SUBSCRIPTION_REVENUE",
                "source_system": "ORCHESTREE_NATIVE_COMMERCE",
            },
            {
                "id": str(uuid.uuid4()),
                "date": "2026-09-15",
                "description": "Refund Produk Rusak",
                "amount": 500000.0,
                "direction": "OUTFLOW",
                "category": "REFUND",
                "source_system": "ORCHESTREE_PAYMENTS",
            },
        ]

        summary: CashFlowSummary = await self.engine.calculate_cash_flow(
            tenant_id=self.tenant_id,
            period_start=self.period_start,
            period_end=self.period_end,
            tier_code="PRO",
            current_cash_balance=10000000.0,
            simulated_internal_records=simulated_internal_records,
        )

        self.assertEqual(summary.data_source, "INTERNAL_NATIVE_ALL_TIER")
        self.assertFalse(summary.is_external_erp)
        self.assertEqual(summary.total_inflows, 10000000.0)
        self.assertEqual(summary.total_outflows, 500000.0)
        self.assertEqual(summary.net_cash_flow, 9500000.0)
        self.assertGreater(summary.average_daily_burn, 0)
        self.assertIsNotNone(summary.estimated_runway_days)

    async def test_enterprise_tier_external_erp_harmonization(self):
        """
        Pengujian tier ENTERPRISE yang tersambung dengan ERP eksternal (SAP / NetSuite).
        """
        simulated_erp_records = [
            {
                "id": str(uuid.uuid4()),
                "date": "2026-09-02",
                "description": "SAP GL Inflow: Kontrak Korporat Bank BNI",
                "amount": 250000000.0,
                "direction": "INFLOW",
                "category": "ERP_ACCOUNTS_RECEIVABLE",
                "source_system": "ERP_SAP_FINANCE",
                "source_reference": "SAP-GL-400100",
            },
            {
                "id": str(uuid.uuid4()),
                "date": "2026-09-10",
                "description": "SAP GL Outflow: Pembayaran Vendor Server AWS",
                "amount": 35000000.0,
                "direction": "OUTFLOW",
                "category": "INFRASTRUCTURE_EXPENSE",
                "source_system": "ERP_SAP_FINANCE",
                "source_reference": "SAP-GL-600200",
            },
        ]

        summary: CashFlowSummary = await self.engine.calculate_cash_flow(
            tenant_id=self.tenant_id,
            period_start=self.period_start,
            period_end=self.period_end,
            tier_code="ENTERPRISE",
            current_cash_balance=500000000.0,
            simulated_erp_records=simulated_erp_records,
        )

        self.assertEqual(summary.data_source, "EXTERNAL_ERP_ENTERPRISE")
        self.assertTrue(summary.is_external_erp)
        self.assertEqual(summary.total_inflows, 250000000.0)
        self.assertEqual(summary.total_outflows, 35000000.0)
        self.assertEqual(summary.net_cash_flow, 215000000.0)
        self.assertEqual(len(summary.items), 2)
        self.assertEqual(summary.items[0].source_system, "ERP_SAP_FINANCE")

    async def test_starter_tier_cannot_use_erp_as_primary(self):
        """
        Memastikan tenant tier STARTER tidak menggunakan ERP eksternal bahkan jika ERP record dikirim.
        """
        summary: CashFlowSummary = await self.engine.calculate_cash_flow(
            tenant_id=self.tenant_id,
            period_start=self.period_start,
            period_end=self.period_end,
            tier_code="STARTER",
            simulated_erp_records=[{"amount": 1000}],
            simulated_internal_records=[{"amount": 500, "direction": "INFLOW"}],
        )

        self.assertEqual(summary.data_source, "INTERNAL_NATIVE_ALL_TIER")
        self.assertFalse(summary.is_external_erp)


if __name__ == "__main__":
    unittest.main()
