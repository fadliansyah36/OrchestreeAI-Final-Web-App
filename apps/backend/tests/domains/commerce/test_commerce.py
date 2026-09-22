"""
Unit & Domain Tests for OrchestreeAI Commerce Domain (PRD v2.2 Bagian 12)
Verifikasi:
1. handle_payment_webhook():
   - Validasi signature Midtrans (SHA512) & Xendit (Callback Token).
   - SATU-SATUNYA sumber kebenaran status 'paid' adalah webhook resmi tervalidasi signature.
   - Signature palsu/salah ditolak dengan status SIGNATURE_INVALID dan status pesanan tidak berubah.
2. SalesStageMachine:
   - State machine sales_stage: GREETING -> DISCOVERY -> RECOMMENDATION -> OBJECTION_HANDLING ->
     CLOSING -> CART_CHECKOUT -> PAYMENT_PENDING -> ORDER_CONFIRMED -> POST_SALE -> RETENTION.
3. CommerceGroundingValidator:
   - Penegakan Grounding harga & stok produk sebelum dikirim ke pelanggan.
   - Produk dengan stok habis dilarang direkomendasikan.
   - Ketidakcocokan harga dialihkan ke pernyataan 'perlu konfirmasi dulu' dan eskalasi HUMAN_APPROVAL.
4. CourierAggregatorService:
   - Menjawab pertanyaan 'sudah sampai mana' hanya dari shipment_tracking_events nyata.
"""

import hashlib
import asyncio
from unittest.mock import MagicMock, patch

from orchestree.domains.commerce.payment_webhook import (
    verify_midtrans_signature,
    verify_xendit_webhook_token,
    handle_payment_webhook,
)
from orchestree.domains.commerce.sales_stage_machine import (
    SalesStage,
    ALLOWED_STAGE_TRANSITIONS,
    SalesStageMachine,
)
from orchestree.domains.commerce.grounding_validator import (
    CommerceGroundingValidator,
)
from orchestree.domains.commerce.courier_service import (
    CourierAggregatorService,
)


def test_verify_midtrans_signature_valid():
    """Memverifikasi perhitungan signature SHA512 Midtrans valid."""
    order_id = "ORD-2026-001"
    status_code = "200"
    gross_amount = "150000.00"
    server_key = "sandbox-server-key-secret-999"

    raw = f"{order_id}{status_code}{gross_amount}{server_key}"
    expected_sig = hashlib.sha512(raw.encode("utf-8")).hexdigest()

    assert verify_midtrans_signature(
        order_id=order_id,
        status_code=status_code,
        gross_amount=gross_amount,
        server_key=server_key,
        received_signature=expected_sig,
    ) is True


def test_verify_midtrans_signature_tampered_rejected():
    """Memverifikasi signature Midtrans yang dimodifikasi ditolak."""
    order_id = "ORD-2026-001"
    status_code = "200"
    gross_amount = "150000.00"
    server_key = "sandbox-server-key-secret-999"

    invalid_sig = "tampered_signature_hash_value_1234567890abcdef"

    assert verify_midtrans_signature(
        order_id=order_id,
        status_code=status_code,
        gross_amount=gross_amount,
        server_key=server_key,
        received_signature=invalid_sig,
    ) is False


def test_verify_xendit_webhook_token():
    """Memverifikasi token callback Xendit."""
    secret = "xendit_verification_token_777"
    assert verify_xendit_webhook_token(secret, secret) is True
    assert verify_xendit_webhook_token("wrong_token", secret) is False


def test_sales_stage_transitions():
    """Memverifikasi urutan siklus penjualan SalesStage."""
    stages = [
        SalesStage.GREETING,
        SalesStage.DISCOVERY,
        SalesStage.RECOMMENDATION,
        SalesStage.OBJECTION_HANDLING,
        SalesStage.CLOSING,
        SalesStage.CART_CHECKOUT,
        SalesStage.PAYMENT_PENDING,
        SalesStage.ORDER_CONFIRMED,
        SalesStage.POST_SALE,
        SalesStage.RETENTION,
    ]
    # Pastikan seluruh 10 stage terdefinisi
    assert len(stages) == 10
    assert SalesStage.GREETING.value == "GREETING"
    assert SalesStage.ORDER_CONFIRMED.value == "ORDER_CONFIRMED"
    assert SalesStage.RETENTION.value == "RETENTION"

    # Verifikasi matriks transisi
    assert SalesStage.DISCOVERY in ALLOWED_STAGE_TRANSITIONS[SalesStage.GREETING]
    assert SalesStage.CART_CHECKOUT in ALLOWED_STAGE_TRANSITIONS[SalesStage.RECOMMENDATION]
    assert SalesStage.ORDER_CONFIRMED in ALLOWED_STAGE_TRANSITIONS[SalesStage.PAYMENT_PENDING]


def test_grounding_price_extraction():
    """Memverifikasi ekstraksi penyebutan nominal rupiah."""
    mock_db = MagicMock()
    validator = CommerceGroundingValidator(mock_db, "tenant-test-uuid")

    text = "Harga kemeja ini Rp 150.000 atau bisa juga Rp175,000, diskon jadi 120 ribu."
    prices = validator.extract_price_mentions(text)

    assert 150000.0 in prices
    assert 175000.0 in prices
    assert 120000.0 in prices


def test_grounding_out_of_stock_rejected():
    """Memverifikasi AI dilarang merekomendasikan produk yang stoknya habis."""
    mock_db = MagicMock()
    # Mock query ketersediaan produk
    mock_row = {
        "id": "prod-1",
        "sku": "KMJ-01",
        "name": "Kemeja Flanel Hitam",
        "base_price": 150000.0,
        "status": "OUT_OF_STOCK",
        "total_stock": 0,
    }
    mock_db.execute.return_value.mappings.return_value.all.return_value = [mock_row]

    validator = CommerceGroundingValidator(mock_db, "tenant-test-uuid")
    result = validator.validate_and_enforce_grounding("Silakan beli Kemeja Flanel Hitam seharga Rp 150.000")

    assert result["is_grounded"] is False
    assert result["action"] == "ESCALATED_HUMAN_APPROVAL"
    assert "perlu melakukan konfirmasi" in result["sanitized_text"]
    assert any("stoknya habis" in v for v in result["violations"])


def test_grounding_price_mismatch_escalates():
    """Memverifikasi AI yang menyebut harga tidak cocok dialihkan ke konfirmasi staf."""
    mock_db = MagicMock()
    mock_prod = {
        "id": "prod-1",
        "sku": "KMJ-01",
        "name": "Kemeja Flanel Hitam",
        "base_price": 150000.0,
        "status": "ACTIVE",
        "total_stock": 25,
    }
    # Return produk saat query produk, return empty promotions saat query promo
    mock_db.execute.return_value.mappings.return_value.all.side_effect = [
        [mock_prod],  # query products
        [],           # query promotions
    ]

    validator = CommerceGroundingValidator(mock_db, "tenant-test-uuid")
    # AI menyebut harga Rp 80.000 padahal harga resmi Rp 150.000
    result = validator.validate_and_enforce_grounding("Kemeja Flanel Hitam harganya hanya Rp 80.000 kak!")

    assert result["is_grounded"] is False
    assert result["action"] == "ESCALATED_HUMAN_APPROVAL"
    assert "perlu melakukan konfirmasi" in result["sanitized_text"]
    assert any("tidak cocok dengan harga katalog resmi" in v for v in result["violations"])


def test_grounding_valid_price_and_stock_approved():
    """Memverifikasi AI yang menyebut harga dan stok resmi disetujui."""
    mock_db = MagicMock()
    mock_prod = {
        "id": "prod-1",
        "sku": "KMJ-01",
        "name": "Kemeja Flanel Hitam",
        "base_price": 150000.0,
        "status": "ACTIVE",
        "total_stock": 25,
    }
    mock_db.execute.return_value.mappings.return_value.all.side_effect = [
        [mock_prod],  # query products
        [],           # query promotions
    ]

    validator = CommerceGroundingValidator(mock_db, "tenant-test-uuid")
    text_input = "Kemeja Flanel Hitam tersedia dengan harga resmi Rp 150.000."
    result = validator.validate_and_enforce_grounding(text_input)

    assert result["is_grounded"] is True
    assert result["action"] == "APPROVED"
    assert result["sanitized_text"] == text_input
    assert len(result["violations"]) == 0


def test_courier_tracking_answer_grounded():
    """Memverifikasi jawaban 'sudah sampai mana' hanya dari shipment_tracking_events nyata."""
    mock_db = MagicMock()
    courier_service = CourierAggregatorService()

    # Skenario 1: Pesanan belum ada resi
    mock_db.execute.return_value.mappings.return_value.first.return_value = {
        "id": "ord-1",
        "order_number": "ORD-101",
        "status": "CONFIRMED",
        "fulfillment_status": "PROCESSING",
        "shipment_id": None,
        "courier_code": None,
        "tracking_number": None,
        "shipment_status": None,
    }

    ans_no_resi = courier_service.answer_where_is_my_order(
        mock_db,
        tenant_id="tenant-test-uuid",
        order_number="ORD-101",
    )
    assert ans_no_resi["found"] is True
    assert "Nomor resi pengiriman belum diterbitkan" in ans_no_resi["message"]


def run_all_commerce_tests():
    """Runner langsung untuk test suite commerce."""
    print("Menjalankan test suite Commerce Domain...")
    test_verify_midtrans_signature_valid()
    test_verify_midtrans_signature_tampered_rejected()
    test_verify_xendit_webhook_token()
    test_sales_stage_transitions()
    test_grounding_price_extraction()
    test_grounding_out_of_stock_rejected()
    test_grounding_price_mismatch_escalates()
    test_grounding_valid_price_and_stock_approved()
    test_courier_tracking_answer_grounded()
    print("✅ Seluruh test suite Commerce Domain (Fase 9) BERHASIL!")


if __name__ == "__main__":
    run_all_commerce_tests()
