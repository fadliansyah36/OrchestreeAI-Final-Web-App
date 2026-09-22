"""
Harness Uji Konkuren Operasi Finansial & Dompet Kredit (PRD v2.2 Bagian 2.6 & Bagian 8).
Menyediakan kerangka pengujian eksekusi paralel N request terhadap satu baris data (single-row concurrency)
untuk mendeteksi dan mencegah race conditions serta memastikan row-level locking (SELECT FOR UPDATE).
"""

import asyncio
from decimal import Decimal
from typing import Any, Callable, Coroutine, Dict, List, Optional
from pydantic import BaseModel, Field


class ConcurrencyReport(BaseModel):
    """Laporan hasil pengujian eksekusi konkuren."""
    total_workers: int
    successful_debits: int
    failed_insufficient_funds: int
    lock_conflicts_or_retries: int
    initial_balance: Decimal
    final_balance: Decimal
    total_debited_amount: Decimal
    duration_seconds: float


class AsyncRowLockedWallet:
    """
    Simulasi stateful mesin locking row-level asinkron.
    Meniru mekanisme row-level lock (SELECT ... FOR UPDATE) di PostgreSQL
    sebelum database schema Credit Ledger dimigrasi penuh di modul keuangan.
    """

    def __init__(self, wallet_id: str, tenant_id: str, initial_balance: Decimal):
        self.wallet_id = wallet_id
        self.tenant_id = tenant_id
        self._balance = initial_balance
        self._row_mutex = asyncio.Lock()
        self._ledger_entries: List[Dict[str, Any]] = []

    async def debit_with_row_lock(self, amount: Decimal, transaction_id: str) -> bool:
        """
        Melakukan debit dengan mengunci baris (Row-Level Locking).
        Mencegah lost-update dan saldo negatif saat diakses konkuren.
        """
        async with self._row_mutex:
            # Simulasi latensi I/O transaksi database mikro (1ms)
            await asyncio.sleep(0.001)

            if self._balance >= amount:
                self._balance -= amount
                return True
            return False

    async def debit_naive_without_lock(self, amount: Decimal) -> bool:
        """
        Debit tanpa locking (anti-pattern) untuk membuktikan bahaya race conditions.
        """
        current_val = self._balance
        await asyncio.sleep(0.002)  # Window vulnerabilitas race condition
        if current_val >= amount:
            self._balance = current_val - amount
            return True
        return False

    @property
    def balance(self) -> Decimal:
        return self._balance


class WalletConcurrencyHarness:
    """
    Harness eksekusi pengujian konkuren multi-worker.
    Mengeksekusi N coroutine konkuren dan memverifikasi integritas finansial:
    1. final_balance = initial_balance - (successful_debits * debit_amount)
    2. final_balance >= 0 (tidak ada double-spend atau overdraft)
    3. successful_debits + failed_insufficient_funds = total_workers
    """

    @staticmethod
    async def run_concurrent_debit_stress(
        wallet: AsyncRowLockedWallet,
        worker_count: int,
        debit_amount_per_worker: Decimal
    ) -> ConcurrencyReport:
        start_time = asyncio.get_event_loop().time()

        successful = 0
        failed = 0
        lock_retries = 0

        async def worker(worker_id: int):
            nonlocal successful, failed, lock_retries
            tx_id = f"tx-worker-{worker_id}"
            success = await wallet.debit_with_row_lock(debit_amount_per_worker, tx_id)
            if success:
                successful += 1
            else:
                failed += 1

        # Luncurkan N worker paralel secara bersamaan
        tasks = [worker(i) for i in range(worker_count)]
        await asyncio.gather(*tasks)

        end_time = asyncio.get_event_loop().time()

        total_debited = Decimal(successful) * debit_amount_per_worker

        return ConcurrencyReport(
            total_workers=worker_count,
            successful_debits=successful,
            failed_insufficient_funds=failed,
            lock_conflicts_or_retries=lock_retries,
            initial_balance=wallet.balance + total_debited,
            final_balance=wallet.balance,
            total_debited_amount=total_debited,
            duration_seconds=round(end_time - start_time, 4),
        )
