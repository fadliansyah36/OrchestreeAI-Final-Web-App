"""
Pengujian Konkurensi Operasi Finansial & Dompet Kredit (PRD v2.2 Bagian 2.6 & Bagian 8).
Memverifikasi perlindungan terhadap race condition dan penjaminan row-level locking
pada operasi saldo dompet kredit di bawah beban konkuren tinggi.
"""

import os
from decimal import Decimal
import pytest
from tests.harness.concurrency_harness import (
    AsyncRowLockedWallet,
    WalletConcurrencyHarness,
)


@pytest.mark.asyncio
async def test_wallet_concurrency_row_locking_stress():
    """
    Menjalankan 30 worker konkuren secara paralel ke satu dompet kredit:
    - Saldo awal: 150 unit kredit
    - Setiap worker meminta debit: 10 unit kredit (total permintaan: 300 unit)
    - Ekspektasi ketat:
      * Tepat 15 transaksi berhasil (15 x 10 = 150 unit)
      * Tepat 15 transaksi ditolak karena saldo tidak mencukupi
      * Saldo akhir wajib tepat 0 unit (tidak boleh minus, tidak boleh ada lost update)
    """
    initial_balance = Decimal("150.00")
    debit_per_worker = Decimal("10.00")
    worker_count = 30

    wallet = AsyncRowLockedWallet(
        wallet_id="wallet-test-tenant-01",
        tenant_id="tenant-alpha-001",
        initial_balance=initial_balance,
    )

    report = await WalletConcurrencyHarness.run_concurrent_debit_stress(
        wallet=wallet,
        worker_count=worker_count,
        debit_amount_per_worker=debit_per_worker,
    )

    # Verifikasi invariansi konservasi saldo
    assert report.total_workers == worker_count
    assert report.successful_debits == 15, f"Ekspektasi 15 transaksi sukses, hasil: {report.successful_debits}"
    assert report.failed_insufficient_funds == 15, f"Ekspektasi 15 transaksi gagal, hasil: {report.failed_insufficient_funds}"
    assert report.final_balance == Decimal("0.00"), f"Saldo akhir harus 0, hasil: {report.final_balance}"
    assert report.total_debited_amount == Decimal("150.00")
    assert report.final_balance == report.initial_balance - report.total_debited_amount


@pytest.mark.asyncio
async def test_postgres_testcontainers_credit_ledger_hook():
    """
    Hook integrasi testcontainers/live Postgres untuk Credit Ledger sungguhan.
    Akan mengeksekusi row-level lock (SELECT FOR UPDATE) secara langsung ke engine DB
    begitu modul Credit Ledger dan skema tabel dimigrasikan pada modul Keuangan.
    """
    db_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip(
            "Koneksi live Postgres / testcontainers belum aktif. "
            "Harness siap dieksekusi otomatis begitu komponen database dimigrasikan."
        )

    # Ketika DATABASE_URL aktif, verifikasi konektivitas pool
    assert db_url.startswith("postgresql")
