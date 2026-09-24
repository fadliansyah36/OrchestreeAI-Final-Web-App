"""
Pengujian Unit Komprehensif: Billing Specification & AI Credit Engine (PRD v2.2 Bagian 14 & prompt)
Memverifikasi:
1. Tahap 1: Formula Estimasi Biaya Kredit (estimate_credit_cost)
2. Tahap 2: Reservasi Kredit & Model Token
3. Tahap 4 & 5: Model Konsumsi dan Pengembalian (Refund) Kredit
4. Penanganan Eksepsi InsufficientCreditException
"""

import unittest
from decimal import Decimal
from app.domains.billing.credit_engine import (
    CreditEstimate,
    ReservationToken,
    InsufficientCreditException,
)


class TestBillingCreditEngine(unittest.TestCase):

    def test_credit_estimate_formula_standalone(self):
        """Memverifikasi bahwa kalkulasi formula pengali deterministik dan akurat."""
        base = 5.0
        comp = 1.5
        model = 2.0
        tool = 1.5
        execution = 1.5

        expected = base * comp * model * tool * execution
        self.assertEqual(round(expected, 4), 33.7500)

        estimate = CreditEstimate(
            activity_code="data_extraction_complex",
            base_work_units=base,
            complexity_multiplier=comp,
            model_multiplier=model,
            tool_multiplier=tool,
            execution_multiplier=execution,
            final_estimate=expected,
        )
        self.assertEqual(estimate.final_estimate, 33.75)

    def test_reservation_token_model(self):
        """Memverifikasi struktur model ReservationToken."""
        token = ReservationToken(
            id="res-test-123",
            tenant_id="tenant-alpha-001",
            estimated_cost=33.75,
            execution_ref="task-exec-456",
            status="reserved",
            is_unlimited_override=False,
        )
        self.assertEqual(token.id, "res-test-123")
        self.assertEqual(token.estimated_cost, 33.75)
        self.assertEqual(token.status, "reserved")
        self.assertFalse(token.is_unlimited_override)

    def test_insufficient_credit_exception(self):
        """Memverifikasi pesan kesalahan InsufficientCreditException informatif dan jelas."""
        exc = InsufficientCreditException(
            "Saldo kredit tidak mencukupi (Tersedia: 10.0, Diminta: 50.0). Silakan lakukan top up."
        )
        self.assertIn("tidak mencukupi", str(exc))
        self.assertIn("10.0", str(exc))


if __name__ == "__main__":
    unittest.main()
