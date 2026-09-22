"""
Unit tests for Customer Service Intake, Handover Protocol, F.01-HUMANIZE-ID, and Abandoned Cart
(PRD v2.2 Bagian 11.9, 12.7, 13, 14, 16)
"""

import unittest
from datetime import datetime, timezone
import uuid

from orchestree.domains.service.intake import (
    CustomerServiceIntakeNode,
    ServiceRequestCategory,
    ServiceRequestStatus,
    ServiceRequestPriority,
    process_customer_service_intake,
    approve_service_request,
    reject_service_request,
)
from orchestree.domains.sales.handover import (
    evaluate_handover_trigger,
    build_handover_summary,
    HandoverTriggerType,
)
from orchestree.skills.f01_humanize_id.skill import (
    F01HumanizeIdSkill,
    extract_factual_tokens,
    verify_factual_invariance,
    humanize_indonesian_response,
)
from orchestree.domains.commerce.abandoned_cart import (
    schedule_abandoned_cart_recovery,
)


class TestCustomerServiceIntake(unittest.TestCase):
    def test_detect_category_refund(self):
        cat, prio, term = CustomerServiceIntakeNode.detect_category("Halo, saya ingin refund dana saya karena salah transfer.")
        self.assertEqual(cat, ServiceRequestCategory.REFUND)
        self.assertEqual(prio, ServiceRequestPriority.HIGH)
        self.assertEqual(term, "refund")

    def test_detect_category_return(self):
        cat, prio, term = CustomerServiceIntakeNode.detect_category("Paket sudah sampai tapi barangnya retur rusak cacat fisik.")
        self.assertEqual(cat, ServiceRequestCategory.RETURN)
        self.assertEqual(prio, ServiceRequestPriority.HIGH)
        self.assertIn(term, ["retur", "rusak", "cacat"])

    def test_refund_request_must_stop_at_human_approval(self):
        """
        ATURAN MUTLAK PRD v2.2:
        Refund customer sungguhan tercatat service_requests dan BERHENTI di HUMAN_APPROVAL,
        tidak diputuskan sepihak oleh AI.
        """
        tenant_id = str(uuid.uuid4())
        ticket = process_customer_service_intake(
            tenant_id=tenant_id,
            customer_id=str(uuid.uuid4()),
            conversation_id=str(uuid.uuid4()),
            subject="Permohonan Refund",
            description="Barang rusak saat pengiriman, mohon refund dana Rp 350.000.",
            amount=350000.0,
        )

        self.assertEqual(ticket["category"], "REFUND")
        self.assertEqual(ticket["status"], ServiceRequestStatus.HUMAN_APPROVAL.value)
        self.assertTrue(ticket["requires_human_approval"])
        self.assertTrue(ticket["ticket_number"].startswith("SR-"))

    def test_human_approval_flow(self):
        tenant_id = str(uuid.uuid4())
        ticket_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        approval = approve_service_request(
            tenant_id=tenant_id,
            ticket_id=ticket_id,
            user_id=user_id,
            resolution_notes="Disetujui setelah verifikasi foto kerusakan fisik.",
        )
        self.assertEqual(approval["status"], "APPROVED")
        self.assertEqual(approval["approved_by_user_id"], user_id)

        rejection = reject_service_request(
            tenant_id=tenant_id,
            ticket_id=ticket_id,
            user_id=user_id,
            rejection_reason="Bukti tidak memenuhi ketentuan garansi 14 hari.",
        )
        self.assertEqual(rejection["status"], "REJECTED")
        self.assertEqual(rejection["rejected_by_user_id"], user_id)


class TestHandoverProtocol(unittest.TestCase):
    def test_trigger_explicit_human_request(self):
        should_handover, trigger, reason = evaluate_handover_trigger(
            "Tolong sambungkan saya, saya mau bicara sama orang admin sekarang"
        )
        self.assertTrue(should_handover)
        self.assertEqual(trigger, HandoverTriggerType.EXPLICIT_HUMAN_REQUEST.value)
        self.assertIn("Pelanggan meminta secara eksplisit", reason)

    def test_trigger_low_confidence(self):
        should_handover, trigger, reason = evaluate_handover_trigger(
            "Bagaimana perbandingan teknis spesifikasi internal produk ini dengan versi sebelumnya?",
            model_confidence=0.52,
        )
        self.assertTrue(should_handover)
        self.assertEqual(trigger, HandoverTriggerType.LOW_CONFIDENCE.value)

    def test_trigger_out_of_scope_objection(self):
        should_handover, trigger, reason = evaluate_handover_trigger(
            "Saya butuh klausul hukum kontrak kerja sama tertulis sebelum memesan."
        )
        self.assertTrue(should_handover)
        self.assertEqual(trigger, HandoverTriggerType.OUT_OF_SCOPE_OBJECTION.value)

    def test_trigger_high_value_refund(self):
        should_handover, trigger, reason = evaluate_handover_trigger(
            "Saya minta refund pesanan kemarin",
            refund_amount=750000.0,
        )
        self.assertTrue(should_handover)
        self.assertEqual(trigger, HandoverTriggerType.HIGH_VALUE_REFUND.value)

    def test_build_handover_summary_structure(self):
        """
        ATURAN MUTLAK PRD v2.2 Bagian 12.7:
        Field angka (lead_score, budget) diambil langsung dari data terstruktur nyata.
        """
        tenant_id = str(uuid.uuid4())
        conv_id = str(uuid.uuid4())
        summary = build_handover_summary(
            tenant_id=tenant_id,
            conversation_id=conv_id,
            customer_id=str(uuid.uuid4()),
            trigger_reason=HandoverTriggerType.EXPLICIT_HUMAN_REQUEST.value,
        )

        self.assertIn("handover_id", summary)
        self.assertIn("sales_metrics", summary)
        self.assertIn("customer", summary)
        self.assertIn("actionable_recommendations", summary)
        self.assertIsInstance(summary["sales_metrics"]["lead_score"], float)
        self.assertIsInstance(summary["sales_metrics"]["budget"], float)


class TestF01HumanizeIdSkill(unittest.TestCase):
    def setUp(self):
        self.skill = F01HumanizeIdSkill(default_honorific="Kak")

    def test_removes_robotic_ai_phrases(self):
        raw_text = "Sebagai asisten AI, perlu dicatat bahwa pesanan Anda sudah dikirim dengan resi JNE123456."
        result = self.skill.humanize(raw_text, customer_name="Budi Pratama")

        self.assertTrue(result["factual_invariance_passed"])
        self.assertNotIn("Sebagai asisten AI", result["humanized_text"])
        self.assertIn("JNE123456", result["humanized_text"])

    def test_preserves_numbers_and_currency_invariance(self):
        raw_text = "Total pesanan Anda adalah Rp 450.000 untuk 3 item dengan diskon 10% kode PROMO10."
        result = self.skill.humanize(raw_text, customer_name="Siti")

        self.assertTrue(result["factual_invariance_passed"])
        # Fakta angka dan mata uang tidak boleh berubah satu pun!
        self.assertIn("Rp 450.000", result["humanized_text"])
        self.assertIn("3", result["humanized_text"])
        self.assertIn("10%", result["humanized_text"])
        self.assertIn("PROMO10", result["humanized_text"])

    def test_factual_invariance_rejection_on_altered_numbers(self):
        orig = "Harga total pesanan adalah Rp 150.000."
        corrupted = "Halo Kak, harga total pesanan adalah Rp 175.000 ya kak."

        is_invariant, detail = verify_factual_invariance(orig, corrupted)
        self.assertFalse(is_invariant)
        self.assertIn("Token fakta hilang", detail)


class TestAbandonedCartRecovery(unittest.TestCase):
    def test_schedule_recovery_job(self):
        tenant_id = str(uuid.uuid4())
        cart_id = str(uuid.uuid4())
        job = schedule_abandoned_cart_recovery(
            tenant_id=tenant_id,
            cart_id=cart_id,
            cart_value=250000.0,
            channel="WHATSAPP",
            delay_minutes=30,
        )

        self.assertEqual(job["status"], "SCHEDULED")
        self.assertEqual(job["cart_value"], 250000.0)
        self.assertEqual(job["discount_code"], "PULIH10")


if __name__ == "__main__":
    unittest.main()
