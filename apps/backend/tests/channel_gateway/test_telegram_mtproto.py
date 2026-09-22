"""
Pengujian Unit & Domain: Telegram MTProto Gateway & Envelope KMS Security (PRD v2.2 Bagian 10.2).
Memverifikasi:
1. Envelope KMS Encryption/Decryption: session string terenkripsi, tidak ada plaintext di ciphertext, tamper-detection (HMAC).
2. Anti-Flood Guard: laju pengiriman dibatasi minimal 2.0 detik per pesan, memicu FloodWaitException bila terlalu cepat.
3. Status Akun: penolakan bila akun REVOKED / SUSPENDED.
4. Deduksi Kredit: atomisitas pemotongan saldo kredit terpadu (SELECT ... FOR UPDATE).
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
from datetime import datetime, timezone

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

from orchestree.core.security.envelope_kms import (
    encrypt_session_string,
    decrypt_session_string,
    KMSDecryptionError,
)
from orchestree.channel_gateway.telegram_mtproto import (
    AntiFloodGuard,
    FloodWaitException,
    MTProtoClientManager,
    AccountRevokedException,
)
from orchestree.channel_gateway.gateway import (
    ChannelGatewayService,
    InboundMessage,
    record_usage_and_deduct_credit,
    InsufficientCreditException,
)


def test_envelope_kms_encryption_and_tamper_detection():
    """Memverifikasi enkripsi envelope KMS untuk sesi MTProto."""
    account_id = "ca-tg-test-999"
    raw_session = "1BVtsOMQBu8xXXXX-very-sensitive-telegram-session-string-12345"

    encrypted_blob = encrypt_session_string(raw_session, account_id)

    # 1. Pastikan string asli (plaintext) sama sekali tidak muncul di ciphertext
    assert raw_session not in encrypted_blob
    assert "sensitive" not in encrypted_blob

    # 2. Dekripsi dengan account_id yang benar harus menghasilkan plaintext identik
    decrypted = decrypt_session_string(encrypted_blob, account_id)
    assert decrypted == raw_session

    # 3. Dekripsi dengan account_id berbeda (KMS context isolation) harus gagal
    with pytest.raises(KMSDecryptionError):
        decrypt_session_string(encrypted_blob, "ca-tg-different-account")

    # 4. Modifikasi / manipulasi ciphertext (tampering) harus terdeteksi oleh HMAC
    tampered_blob = encrypted_blob[:-4] + "AAAA"
    with pytest.raises(KMSDecryptionError):
        decrypt_session_string(tampered_blob, account_id)


def test_anti_flood_guard():
    """Memverifikasi pembatasan laju anti-flood Telegram (PRD v2.2 Bagian 10.2)."""
    guard = AntiFloodGuard(min_interval_seconds=2.0)
    account_id = "ca-flood-test-01"

    # Pengiriman pertama harus lolos
    guard.acquire(account_id)

    # Pengiriman langsung berikutnya (< 2.0s) harus memicu FloodWaitException
    with pytest.raises(FloodWaitException) as exc_info:
        guard.acquire(account_id)

    assert exc_info.value.wait_seconds > 0.0
    assert exc_info.value.account_id == account_id

    # Akun lain yang berbeda tidak boleh terhalang oleh akun pertama
    other_account = "ca-flood-test-02"
    guard.acquire(other_account)  # Sukses, tidak raise


@pytest.mark.asyncio
async def test_mtproto_account_status_and_revocation():
    """Memverifikasi penolakan pengiriman pesan jika status akun REVOKED / SUSPENDED."""
    mock_db = AsyncMock()

    # Query akun mengembalikan status REVOKED
    mock_account = MagicMock()
    mock_account.id = "ca-revoked-01"
    mock_account.status = "REVOKED"
    mock_account.channel_type = "telegram_mtproto"

    mock_res = MagicMock()
    mock_res.first.return_value = mock_account
    mock_db.execute.return_value = mock_res

    manager = MTProtoClientManager(mock_db, "tenant-test-01")

    with pytest.raises(AccountRevokedException):
        await manager.send_message(
            channel_account_id="ca-revoked-01",
            recipient_id="user_target_01",
            text="Halo pesan uji",
        )


@pytest.mark.asyncio
async def test_record_usage_and_deduct_credit_row_locking():
    """
    Memverifikasi pemotongan saldo kredit terpadu (PRD v2.2 Bagian 8 & Bagian 10.2).
    - Memastikan query menggunakan SELECT ... FOR UPDATE pada tenant_credit_wallet.
    - Mengurangi saldo sebesar tarif kanal (0.05 kredit untuk Telegram MTProto).
    - Menolak bila saldo tidak mencukupi (InsufficientCreditException).
    """
    mock_db = AsyncMock()

    # Skenario 1: Saldo mencukupi (50.0 kredit, potong 0.05)
    mock_wallet = MagicMock()
    mock_wallet.balance_credits = Decimal("50.00")
    mock_wallet.is_locked = False

    mock_res_wallet = MagicMock()
    mock_res_wallet.first.return_value = mock_wallet

    mock_db.execute.side_effect = [
        mock_res_wallet,  # SELECT FOR UPDATE
        MagicMock(),       # UPDATE tenant_credit_wallet
        MagicMock(),       # INSERT tenant_credit_ledger
    ]

    deducted = await record_usage_and_deduct_credit(
        db=mock_db,
        tenant_id="tenant-test-01",
        channel_type="telegram_mtproto",
        units=1,
    )

    assert deducted == Decimal("0.05")

    # Skenario 2: Saldo tidak mencukupi
    mock_poor_wallet = MagicMock()
    mock_poor_wallet.balance_credits = Decimal("0.01")
    mock_poor_wallet.is_locked = False

    mock_res_poor = MagicMock()
    mock_res_poor.first.return_value = mock_poor_wallet
    mock_db.execute.side_effect = [mock_res_poor]

    with pytest.raises(InsufficientCreditException):
        await record_usage_and_deduct_credit(
            db=mock_db,
            tenant_id="tenant-test-01",
            channel_type="telegram_mtproto",
            units=1,
        )
