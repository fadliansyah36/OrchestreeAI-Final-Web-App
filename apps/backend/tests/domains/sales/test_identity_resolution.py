"""
Pengujian Unit & Domain: Customer Identity Resolution (PRD v2.2 Bagian 12.2).
Memverifikasi 4 skenario pencocokan identitas omnichannel:
1. EXACT Match: external_user_id pada channel yang sama sudah terdaftar -> kembalikan profil sama.
2. STRONG Match: nomor telepon cocok dengan profil terdaftar -> tautkan channel baru ke profil target.
3. WEAK Match: nama mirip (fuzzy >= 0.80) tanpa nomor telepon -> buat profil terisolasi, catat PENDING di customer_merge_log.
4. NEW Customer: identitas baru total -> buat customer baru.
5. Reversibilitas approve_merge() dan rollback_merge().
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

try:
    import pytest
except ImportError:
    class _MockPytest:
        class mark:
            @staticmethod
            def asyncio(f):
                return f
        @staticmethod
        def raises(expected_exception):
            class _RaisesContext:
                def __init__(self, exc):
                    self.exc = exc
                    self.value = None
                def __enter__(self):
                    return self
                def __exit__(self, exc_type, exc_val, exc_tb):
                    if exc_type is None:
                        raise AssertionError(f"Expected {self.exc} was not raised")
                    if issubclass(exc_type, self.exc):
                        self.value = exc_val
                        return True
                    return False
            return _RaisesContext(expected_exception)
    pytest = _MockPytest()

from orchestree.domains.sales.identity import (
    CustomerIdentityResolver,
    IdentityResolutionResult,
    calculate_name_similarity,
)


def test_calculate_name_similarity():
    """Memverifikasi kalkulasi kemiripan nama menggunakan Levenshtein & Trigram."""
    # Persis sama
    assert calculate_name_similarity("Budi Santoso", "Budi Santoso") == 1.0
    # Case insensitive & whitespace
    assert calculate_name_similarity("  budi santoso ", "BUDI SANTOSO") == 1.0
    # Kemiripan tinggi (typo kecil)
    sim = calculate_name_similarity("Budi Santoso", "Budi Santosa")
    assert sim >= 0.80
    # Berbeda total
    sim_diff = calculate_name_similarity("Budi Santoso", "Siti Rahmawati")
    assert sim_diff < 0.40
    # String kosong
    assert calculate_name_similarity("", "Budi") == 0.0


@pytest.mark.asyncio
async def test_identity_resolution_exact_match():
    """
    Skenario EXACT Match:
    Pesan masuk dari external_user_id yang sudah pernah berinteraksi pada channel account yang sama.
    Harus langsung mengembalikan customer_id yang sama tanpa merge log.
    """
    mock_db = AsyncMock()
    # Mock query customer_identities menemukan record
    mock_identity_row = MagicMock()
    mock_identity_row.customer_id = "cust-001-exact"
    mock_identity_row.customer_name = "Budi Santoso"
    mock_identity_row.primary_phone = "+6281234567890"

    mock_db.execute.return_value.first.return_value = mock_identity_row

    resolver = CustomerIdentityResolver(mock_db, "tenant-test-01")
    result = await resolver.resolve_identity(
        channel_type="telegram_mtproto",
        channel_account_id="ca-tg-001",
        external_user_id="tg-user-12345",
        name="Budi Santoso",
        phone="+6281234567890",
    )

    assert result.customer_id == "cust-001-exact"
    assert result.match_type == "EXACT"
    assert result.confidence_score == 1.0
    assert result.requires_human_review is False
    assert result.is_new_customer is False


@pytest.mark.asyncio
async def test_identity_resolution_strong_match():
    """
    Skenario STRONG Match:
    Pengguna baru di Telegram (belum ada di customer_identities),
    tetapi nomor teleponnya (+6281234567890) cocok dengan profil pelanggan yang sudah ada (misal dari WhatsApp).
    Harus menautkan channel baru ke customer target yang sudah ada secara otomatis.
    """
    mock_db = AsyncMock()

    # Query 1: customer_identities -> None (belum ada channel Telegram ini)
    mock_res_identity = MagicMock()
    mock_res_identity.first.return_value = None

    # Query 2: customers by verified phone -> Ditemukan profil target
    mock_target_cust = MagicMock()
    mock_target_cust.id = "cust-target-strong"
    mock_target_cust.primary_name = "Budi Santoso"
    mock_target_cust.primary_phone = "+6281234567890"

    mock_res_phone = MagicMock()
    mock_res_phone.first.return_value = mock_target_cust

    # Query 3: insert new identity
    mock_res_insert = MagicMock()

    mock_db.execute.side_effect = [
        mock_res_identity,
        mock_res_phone,
        mock_res_insert,
    ]

    resolver = CustomerIdentityResolver(mock_db, "tenant-test-01")
    result = await resolver.resolve_identity(
        channel_type="telegram_mtproto",
        channel_account_id="ca-tg-001",
        external_user_id="tg-new-67890",
        name="Budi S.",
        phone="+6281234567890",
    )

    assert result.customer_id == "cust-target-strong"
    assert result.match_type == "STRONG"
    assert result.confidence_score == 0.95
    assert result.requires_human_review is False
    assert result.is_new_customer is False


@pytest.mark.asyncio
async def test_identity_resolution_weak_match():
    """
    Skenario WEAK Match (PRD v2.2 Bagian 12.2):
    Nama pengirim sangat mirip ('Budi Santoso' vs 'Budi Santosa') namun tanpa nomor telepon.
    Sistem TIDAK BOLEH menggabungkan secara otomatis (mencegah salah sasaran).
    Sistem WAJIB:
    - Membuat customer baru sementara untuk pesan ini (keamanan isolasi data).
    - Mencatat entri PENDING di customer_merge_log untuk peninjauan manusia.
    - Mengembalikan requires_human_review = True.
    """
    mock_db = AsyncMock()

    # Query 1: exact identity -> None
    mock_res_identity = MagicMock()
    mock_res_identity.first.return_value = None

    # Query 2: customer by phone (phone is None) -> dilewati

    # Query 3: candidate customers for fuzzy name match -> Ada "Budi Santoso"
    mock_candidate = MagicMock()
    mock_candidate.id = "cust-existing-budi"
    mock_candidate.primary_name = "Budi Santoso"
    mock_candidate.primary_phone = "+62811111111"

    mock_res_candidates = MagicMock()
    mock_res_candidates.fetchall.return_value = [mock_candidate]

    # Query 4: create new customer
    mock_res_new_cust = MagicMock()
    # Query 5: create identity
    mock_res_identity_ins = MagicMock()
    # Query 6: insert customer_merge_log
    mock_res_merge_log = MagicMock()
    mock_res_merge_log.scalar.return_value = "merge-log-weak-001"

    mock_db.execute.side_effect = [
        mock_res_identity,
        mock_res_candidates,
        mock_res_new_cust,
        mock_res_identity_ins,
        mock_res_merge_log,
    ]

    resolver = CustomerIdentityResolver(mock_db, "tenant-test-01")
    result = await resolver.resolve_identity(
        channel_type="telegram_mtproto",
        channel_account_id="ca-tg-001",
        external_user_id="tg-weak-9999",
        name="Budi Santosa",  # Kemiripan tinggi dengan Budi Santoso
        phone=None,
    )

    assert result.match_type == "WEAK"
    assert result.requires_human_review is True
    assert result.is_new_customer is True
    assert result.merge_log_id == "merge-log-weak-001"
    assert result.target_customer_id == "cust-existing-budi"
    assert result.confidence_score >= 0.80


@pytest.mark.asyncio
async def test_identity_resolution_new_customer():
    """
    Skenario NEW Customer:
    Identitas baru total, nomor telepon berbeda, nama tidak memiliki kemiripan dengan profil manapun.
    Harus membuat customer baru secara bersih.
    """
    mock_db = AsyncMock()

    # Query 1: exact identity -> None
    mock_res_identity = MagicMock()
    mock_res_identity.first.return_value = None

    # Query 2: phone -> None
    mock_res_phone = MagicMock()
    mock_res_phone.first.return_value = None

    # Query 3: fuzzy candidates -> None
    mock_res_candidates = MagicMock()
    mock_res_candidates.fetchall.return_value = []

    # Insert customer & identity
    mock_res_new_cust = MagicMock()
    mock_res_new_id = MagicMock()

    mock_db.execute.side_effect = [
        mock_res_identity,
        mock_res_phone,
        mock_res_candidates,
        mock_res_new_cust,
        mock_res_new_id,
    ]

    resolver = CustomerIdentityResolver(mock_db, "tenant-test-01")
    result = await resolver.resolve_identity(
        channel_type="whatsapp_cloud",
        channel_account_id="ca-wa-001",
        external_user_id="wa-user-8888",
        name="Farhan Nugraha",
        phone="+6285554443322",
    )

    assert result.match_type == "NEW"
    assert result.confidence_score == 1.0
    assert result.requires_human_review is False
    assert result.is_new_customer is True


@pytest.mark.asyncio
async def test_approve_and_rollback_merge():
    """
    Skenario Approve & Rollback Merge:
    1. approve_merge(): memindahkan relasi identitas ke target_customer_id, menonaktifkan source_customer_id.
    2. rollback_merge(): mengembalikan relasi identitas ke source_customer_id sesuai snapshot, mengaktifkan kembali source_customer_id.
    """
    mock_db = AsyncMock()

    # 1. Test approve_merge
    mock_log_row = MagicMock()
    mock_log_row.id = "log-001"
    mock_log_row.target_customer_id = "target-cust-10"
    mock_log_row.source_customer_id = "source-cust-20"
    mock_log_row.status = "PENDING"
    mock_log_row.snapshot_before_merge = {
        "source_customer_id": "source-cust-20",
        "identities": ["ident-01", "ident-02"],
    }

    mock_res_log = MagicMock()
    mock_res_log.first.return_value = mock_log_row

    mock_db.execute.side_effect = [
        mock_res_log,      # select merge log
        MagicMock(),       # update customer_identities customer_id = target
        MagicMock(),       # update conversations customer_id = target
        MagicMock(),       # update customers set merged_into_id
        MagicMock(),       # update customer_merge_log set status = APPROVED
    ]

    resolver = CustomerIdentityResolver(mock_db, "tenant-test-01")
    approve_res = await resolver.approve_merge("log-001", reviewer_user_id="user-staff-01")

    assert approve_res["status"] == "APPROVED"
    assert approve_res["target_customer_id"] == "target-cust-10"

    # 2. Test rollback_merge
    mock_log_approved = MagicMock()
    mock_log_approved.id = "log-001"
    mock_log_approved.target_customer_id = "target-cust-10"
    mock_log_approved.source_customer_id = "source-cust-20"
    mock_log_approved.status = "APPROVED"
    mock_log_approved.snapshot_before_merge = {
        "source_customer_id": "source-cust-20",
        "identities": ["ident-01", "ident-02"],
    }

    mock_res_approved_log = MagicMock()
    mock_res_approved_log.first.return_value = mock_log_approved

    mock_db.execute.side_effect = [
        mock_res_approved_log,  # select merge log
        MagicMock(),            # update customer_identities set customer_id = source
        MagicMock(),            # update conversations set customer_id = source
        MagicMock(),            # update source customer set is_active = true, merged_into_id = null
        MagicMock(),            # update customer_merge_log set status = ROLLED_BACK
    ]

    rollback_res = await resolver.rollback_merge("log-001", reviewer_user_id="user-staff-01")

    assert rollback_res["status"] == "ROLLED_BACK"
    assert rollback_res["source_customer_id"] == "source-cust-20"
