"""
Tests for OrchestreeAI Intelligence 5-State Data Availability & Output Validator
Definition of Done: Klaim AVAILABLE palsu dari LLM ditolak Output Validator
(uji coba nyata dengan skenario data sengaja dikosongkan).
"""

import sys
import os
import unittest
from datetime import datetime, timezone, timedelta

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from orchestree.domains.intelligence.confidence import (
    DataAvailabilityState,
    IntelligenceConfidenceEngine,
    FalseDataAvailabilityClaimError,
)


class TestIntelligenceConfidenceDoD(unittest.TestCase):
    def test_dod_false_available_claim_rejected_on_empty_data(self):
        """
        DEFINITION OF DONE:
        Klaim AVAILABLE palsu dari LLM ditolak Output Validator
        (uji coba nyata dengan skenario data sengaja dikosongkan).
        """
        # Skenario: Data sengaja dikosongkan (empty dict / None)
        empty_data = {}

        # LLM/Agen secara keliru mengklaim ketersediaan data sebagai AVAILABLE
        claimed_state = DataAvailabilityState.AVAILABLE

        # Output Validator memvalidasi klaim
        validation_result = IntelligenceConfidenceEngine.validate_output_claim(
            claimed_state=claimed_state,
            actual_data=empty_data,
            required_fields=["price", "stock", "sku"],
            raise_on_false_claim=False,
        )

        # Verifikasi klaim palsu berhasil ditolak
        self.assertFalse(validation_result.is_valid)
        self.assertTrue(validation_result.was_false_claim_rejected)
        self.assertEqual(validation_result.claimed_state, DataAvailabilityState.AVAILABLE)
        self.assertEqual(validation_result.validated_state, DataAvailabilityState.NOT_AVAILABLE)
        self.assertIn("Klaim AVAILABLE palsu ditolak oleh Output Validator", validation_result.rejection_reason)
        self.assertEqual(validation_result.confidence_score, 0.0)

    def test_dod_false_available_claim_raises_exception(self):
        """
        Uji penolakan keras: Melempar FalseDataAvailabilityClaimError bila raise_on_false_claim diaktifkan.
        """
        # Skenario: Data sengaja diatur None
        none_data = None

        with self.assertRaises(FalseDataAvailabilityClaimError) as ctx:
            IntelligenceConfidenceEngine.validate_output_claim(
                claimed_state=DataAvailabilityState.AVAILABLE,
                actual_data=none_data,
                raise_on_false_claim=True,
            )

        self.assertEqual(ctx.exception.corrected_state, DataAvailabilityState.NOT_AVAILABLE)
        self.assertIn("Klaim AVAILABLE palsu ditolak", str(ctx.exception))

    def test_conflicting_sources_triggers_conflicting_state(self):
        """
        Uji deteksi konflik antar sumber eksternal:
        Dua sumber data eksternal memberikan harga berbeda -> status CONFLICTING.
        """
        sources = [
            {
                "source_name": "tokopedia",
                "data": {"product_name": "Produk A", "price": 150000}
            },
            {
                "source_name": "shopee",
                "data": {"product_name": "Produk A", "price": 135000}
            }
        ]

        state, breakdown = IntelligenceConfidenceEngine.evaluate_availability_and_confidence(
            data={"product_name": "Produk A", "price": 150000},
            sources=sources,
        )

        self.assertEqual(state, DataAvailabilityState.CONFLICTING)
        self.assertEqual(breakdown.availability_state, DataAvailabilityState.CONFLICTING)
        self.assertEqual(breakdown.consistency_score, 0.0)
        self.assertTrue(any("Konflik nilai terdeteksi" in r for r in breakdown.reasons))

    def test_stale_data_triggers_stale_state(self):
        """
        Uji deteksi data usang (STALE):
        Data berumur lebih dari batas TTL (e.g. 36 jam vs TTL 24 jam).
        """
        past_timestamp = datetime.now(timezone.utc) - timedelta(hours=36)

        state, breakdown = IntelligenceConfidenceEngine.evaluate_availability_and_confidence(
            data={"price": 100000, "stock": 50},
            data_timestamp=past_timestamp,
            ttl_hours=24.0,
        )

        self.assertEqual(state, DataAvailabilityState.STALE)
        self.assertEqual(breakdown.availability_state, DataAvailabilityState.STALE)
        self.assertTrue(any("melampaui ambang batas kesegaran" in r for r in breakdown.reasons))

    def test_partial_data_triggers_partial_state(self):
        """
        Uji kelengkapan data (PARTIAL):
        Hanya 1 dari 4 bidang kunci yang ada.
        """
        sparse_data = {"sku": "SKU-001"}
        required_fields = ["sku", "title", "price", "stock_count"]

        state, breakdown = IntelligenceConfidenceEngine.evaluate_availability_and_confidence(
            data=sparse_data,
            required_fields=required_fields,
        )

        self.assertEqual(state, DataAvailabilityState.PARTIAL)
        self.assertEqual(breakdown.completeness_score, 0.25)
        self.assertTrue(any("Atribut penting tidak lengkap" in r for r in breakdown.reasons))

    def test_legitimate_available_data(self):
        """
        Uji data yang sah, lengkap, dan segar -> status AVAILABLE diterima.
        """
        full_data = {
            "sku": "SKU-999",
            "title": "Paket Premium",
            "price": 2500000,
            "status": "in_stock"
        }
        sources = [{"source_name": "official_erp", "data": full_data}]

        validation_result = IntelligenceConfidenceEngine.validate_output_claim(
            claimed_state=DataAvailabilityState.AVAILABLE,
            actual_data=full_data,
            required_fields=["sku", "title", "price"],
            sources=sources,
            data_timestamp=datetime.now(timezone.utc),
        )

        self.assertTrue(validation_result.is_valid)
        self.assertFalse(validation_result.was_false_claim_rejected)
        self.assertEqual(validation_result.validated_state, DataAvailabilityState.AVAILABLE)
        self.assertGreaterEqual(validation_result.confidence_score, 0.8)


if __name__ == "__main__":
    unittest.main()
