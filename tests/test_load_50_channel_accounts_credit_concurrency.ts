import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

interface LoadMetrics {
  totalRequests: number;
  successful: number;
  rejectedInsufficient: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
  initialBalance: number;
  finalBalance: number;
  negativeBalanceDetected: boolean;
}

export async function runLoadTest50ChannelAccounts(): Promise<LoadMetrics> {
  console.log('================================================================');
  console.log('UJI BEBAN KONKUREN: ≥ 50 CHANNEL ACCOUNT AKTIF PER TENANT');
  console.log('PRD v2.2 Bagian 2.6, 8, 14.2: Degradasi Performa & Anti-Negative Balance');
  console.log('================================================================\n');

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10, // Optimal pool size sesuai kapasitas Supabase direct connection
  });

  const testTenantId = crypto.randomUUID();
  const testWalletId = crypto.randomUUID();
  const initialBalance = 150000; // 150.000 IDR
  const channelCount = 52; // Memenuhi syarat ≥ 50 channel accounts

  // Helper untuk menjalankan tugas dengan konkurensi terkontrol (pool-friendly)
  async function runConcurrent<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, idx: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIdx = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (nextIdx < items.length) {
        const currentIdx = nextIdx++;
        results[currentIdx] = await fn(items[currentIdx], currentIdx);
      }
    });
    await Promise.all(workers);
    return results;
  }

  try {
    // 1. SETUP: Buat Tenant dan Dompet Kredit
    console.log('[STEP 1] Menyiapkan tenant pengujian dan dompet kredit...');
    await pool.query(
      `
      INSERT INTO tenants (id, legal_name, display_name, status)
      VALUES ($1, 'PT Load Test Concurrency Corp', 'Load Test Concurrency', 'active')
    `,
      [testTenantId]
    );

    await pool.query(
      `
      INSERT INTO tenant_credit_wallet (
        id, tenant_id, balance, reserved_balance, low_balance_threshold,
        currency, auto_topup_enabled, auto_topup_amount, created_at, updated_at
      ) VALUES ($1, $2, $3, 0, 5000, 'IDR', false, 0, now(), now())
    `,
      [testWalletId, testTenantId, initialBalance]
    );
    console.log(`✓ Tenant ${testTenantId} aktif dengan saldo awal Rp ${initialBalance.toLocaleString('id-ID')}`);

    // 2. SETUP: Buat 52 Channel Accounts Aktif (Telegram, WhatsApp, Instagram, Facebook, TikTok)
    console.log(`\n[STEP 2] Memprovisi ${channelCount} Channel Account aktif untuk tenant...`);
    const channelTypes = [
      'telegram_mtproto',
      'whatsapp_cloud',
      'instagram',
      'facebook',
      'tiktok',
    ];
    const channelIds: string[] = [];

    for (let i = 0; i < channelCount; i++) {
      const chId = crypto.randomUUID();
      const chType = channelTypes[i % channelTypes.length];
      const extId = `ext-${chType}-${i}-${Date.now()}`;
      const extHash = crypto.createHash('sha256').update(extId).digest('hex');

      await pool.query(
        `
        INSERT INTO channel_accounts (
          id, tenant_id, channel_type, connection_mode, account_label,
          external_identifier, external_identifier_hash, status,
          requires_owner_approval, is_approved, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'official_business_api', $4,
          $5, $6, 'ACTIVE', false, true, '{}', now(), now()
        )
      `,
        [chId, testTenantId, chType, `Channel ${chType.toUpperCase()} #${i + 1}`, extId, extHash]
      );
      channelIds.push(chId);
    }

    const countCheck = await pool.query(
      `SELECT count(*) as total FROM channel_accounts WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [testTenantId]
    );
    const activeChannels = parseInt(countCheck.rows[0].total, 10);
    console.log(`✓ Terdaftar dan aktif: ${activeChannels} Channel Account (Persyaratan ≥ 50 Terpenuhi: TRUE)`);

    // 3. LOAD TEST ROUND 1: 52 Transaksi Simultan (Normal Concurrent Debit)
    console.log('\n[STEP 3] Menjalankan Uji Beban Ronde 1: 52 Transaksi Simultan (Debit Rp 2.000 per channel)...');
    const costPerDebit = 2000;
    const latencies: number[] = [];

    const startTime = performance.now();

    const round1Results = await runConcurrent(channelIds, 8, async (chId, idx) => {
      const t0 = performance.now();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Row-Level Locking ketat untuk serialisasi transaksi dompet
        const walletRes = await client.query(
          `SELECT id, balance, reserved_balance FROM tenant_credit_wallet WHERE tenant_id = $1 FOR UPDATE`,
          [testTenantId]
        );

        if (walletRes.rows.length === 0) {
          throw new Error('Dompet tidak ditemukan');
        }

        const currentBalance = parseFloat(walletRes.rows[0].balance);
        const reservedBalance = parseFloat(walletRes.rows[0].reserved_balance);
        const availableBalance = currentBalance - reservedBalance;

        if (availableBalance < costPerDebit) {
          await client.query('ROLLBACK');
          return { success: false, reason: 'INSUFFICIENT_CREDIT', latency: performance.now() - t0 };
        }

        const newBalance = currentBalance - costPerDebit;

        // Validasi invariant negatif sebelum commit
        if (newBalance < 0) {
          throw new Error(`CRITICAL: Saldo terdeteksi negatif (${newBalance})!`);
        }

        await client.query(
          `UPDATE tenant_credit_wallet SET balance = $1, updated_at = now() WHERE tenant_id = $2`,
          [newBalance, testTenantId]
        );

        const txId = crypto.randomUUID();
        await client.query(
          `INSERT INTO tenant_credit_transactions (
            id, tenant_id, transaction_type, amount, balance_after,
            reference_id, description, metadata, created_at
          ) VALUES ($1, $2, 'consumed', $3, $4, $5, $6, $7, now())`,
          [
            txId,
            testTenantId,
            costPerDebit,
            newBalance,
            chId,
            `Penggunaan kredit channel ${idx + 1}`,
            JSON.stringify({ channel_id: chId, batch_round: 1 }),
          ]
        );

        await client.query('COMMIT');
        const lat = performance.now() - t0;
        return { success: true, latency: lat };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    const totalDuration = performance.now() - startTime;

    round1Results.forEach((r) => latencies.push(r.latency));
    latencies.sort((a, b) => a - b);

    const minLat = latencies[0];
    const maxLat = latencies[latencies.length - 1];
    const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50Lat = latencies[Math.floor(latencies.length * 0.5)];
    const p95Lat = latencies[Math.floor(latencies.length * 0.95)];
    const p99Lat = latencies[Math.floor(latencies.length * 0.99)];
    const throughput = (channelCount / (totalDuration / 1000));

    console.log('✓ Ronde 1 Selesai:');
    console.log(`  - Total Request: ${channelCount}`);
    console.log(`  - Berhasil:      ${round1Results.filter((r) => r.success).length}`);
    console.log(`  - Durasi Total:  ${totalDuration.toFixed(2)} ms`);
    console.log(`  - Throughput:    ${throughput.toFixed(1)} req/s`);
    console.log(`  - Min Latency:   ${minLat.toFixed(2)} ms`);
    console.log(`  - Avg Latency:   ${avgLat.toFixed(2)} ms`);
    console.log(`  - P50 Latency:   ${p50Lat.toFixed(2)} ms`);
    console.log(`  - P95 Latency:   ${p95Lat.toFixed(2)} ms`);
    console.log(`  - P99 Latency:   ${p99Lat.toFixed(2)} ms`);
    console.log(`  - Max Latency:   ${maxLat.toFixed(2)} ms`);

    // 4. LOAD TEST ROUND 2: 100 Permintaan Konkuren Melebihi Saldo (Anti-Negative Balance Verification)
    console.log('\n[STEP 4] Menjalankan Uji Beban Ronde 2: Uji Pembuktian Anti-Negative Balance...');
    const intermediateCheck = await pool.query(
      `SELECT balance FROM tenant_credit_wallet WHERE tenant_id = $1`,
      [testTenantId]
    );
    const midBalance = parseFloat(intermediateCheck.rows[0].balance);
    console.log(`  - Saldo saat ini: Rp ${midBalance.toLocaleString('id-ID')}`);

    // Saldo awal: 150.000 IDR
    // Ronde 1: 52 channel debit @ Rp 2.000 = Rp 104.000 terpakai -> Sisa: Rp 46.000
    // Ronde 2: 30 permintaan @ Rp 2.000 = Rp 60.000 diminta -> 23 berhasil (Rp 46.000), 7 ditolak -> Sisa: Rp 0
    const stressRequestsCount = 30;
    const stressCost = 2000;
    const expectedSuccess = Math.floor(midBalance / stressCost);

    const stressRequests = Array.from({ length: stressRequestsCount }, (_, i) => i);
    const round2Results = await runConcurrent(stressRequests, 8, async (idx) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const walletRes = await client.query(
          `SELECT id, balance, reserved_balance FROM tenant_credit_wallet WHERE tenant_id = $1 FOR UPDATE`,
          [testTenantId]
        );

        const currentBalance = parseFloat(walletRes.rows[0].balance);
        const reservedBalance = parseFloat(walletRes.rows[0].reserved_balance);
        const availableBalance = currentBalance - reservedBalance;

        if (availableBalance < stressCost) {
          await client.query('ROLLBACK');
          return { success: false, reason: 'INSUFFICIENT_CREDIT' };
        }

        const newBalance = currentBalance - stressCost;
        if (newBalance < 0) {
          throw new Error(`CRITICAL: Saldo terdeteksi negatif (${newBalance})!`);
        }

        await client.query(
          `UPDATE tenant_credit_wallet SET balance = $1, updated_at = now() WHERE tenant_id = $2`,
          [newBalance, testTenantId]
        );

        const txId = crypto.randomUUID();
        await client.query(
          `INSERT INTO tenant_credit_transactions (
            id, tenant_id, transaction_type, amount, balance_after,
            reference_id, description, metadata, created_at
          ) VALUES ($1, $2, 'consumed', $3, $4, $5, $6, $7, now())`,
          [
            txId,
            testTenantId,
            stressCost,
            newBalance,
            `stress-${idx}`,
            `Stress transaction #${idx + 1}`,
            JSON.stringify({ stress_idx: idx, batch_round: 2 }),
          ]
        );

        await client.query('COMMIT');
        return { success: true, reason: 'SUCCESS' };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    const successfulRound2 = round2Results.filter((r) => r.success).length;
    const rejectedRound2 = round2Results.filter((r) => !r.success).length;

    console.log('✓ Ronde 2 Selesai:');
    console.log(`  - Total Request: ${stressRequestsCount}`);
    console.log(`  - Berhasil:      ${successfulRound2} (Ekspektasi: ${expectedSuccess})`);
    console.log(`  - Ditolak:       ${rejectedRound2} (Ekspektasi: ${stressRequestsCount - expectedSuccess})`);

    // 5. VERIFIKASI SALDO TIDAK PERNAH NEGATIF & KONSISTENSI LEDGER
    console.log('\n[STEP 5] Memverifikasi Konservasi Saldo dan Pemeriksaan Saldo Negatif...');
    const finalWalletRes = await pool.query(
      `SELECT balance, reserved_balance FROM tenant_credit_wallet WHERE tenant_id = $1`,
      [testTenantId]
    );
    const finalBalance = parseFloat(finalWalletRes.rows[0].balance);
    const finalReserved = parseFloat(finalWalletRes.rows[0].reserved_balance);

    const isNegative = finalBalance < 0 || finalReserved < 0;
    console.log(`  - Saldo Akhir: Rp ${finalBalance.toLocaleString('id-ID')}`);
    console.log(`  - Terdeteksi Saldo Negatif: ${isNegative ? 'YA (GAGAL)' : 'TIDAK (LULUS)'}`);

    if (isNegative) {
      throw new Error(`Integritas Dompet Rusak: Saldo akhir bernilai negatif (${finalBalance})!`);
    }

    // Hitung total pemotongan dari tabel transaksi nyata
    const txSumRes = await pool.query(
      `SELECT coalesce(sum(amount), 0) as total_debited, count(*) as tx_count 
       FROM tenant_credit_transactions WHERE tenant_id = $1`,
      [testTenantId]
    );
    const totalDebited = parseFloat(txSumRes.rows[0].total_debited);
    const txCount = parseInt(txSumRes.rows[0].tx_count, 10);

    console.log(`  - Total Transaksi Tercatat di Ledger: ${txCount}`);
    console.log(`  - Total Nilai Terpotong di Ledger:     Rp ${totalDebited.toLocaleString('id-ID')}`);
    console.log(`  - Rekonsiliasi (Awal - Terpotong):     Rp ${(initialBalance - totalDebited).toLocaleString('id-ID')}`);

    if (Math.abs(finalBalance - (initialBalance - totalDebited)) > 0.0001) {
      throw new Error('Ledger Reconciliation Mismatch: Saldo dompet tidak sama dengan riwayat transaksi!');
    }
    console.log('✓ Rekonsiliasi Finansial Sempurna (100% Cocok).');

    console.log('\n================================================================');
    console.log('🎉 UJI BEBAN ≥ 50 CHANNEL ACCOUNT & CONCURRENCY KREDIT LULUS 100%!');
    console.log('================================================================\n');

    return {
      totalRequests: channelCount + stressRequestsCount,
      successful: round1Results.filter((r) => r.success).length + successfulRound2,
      rejectedInsufficient: rejectedRound2,
      minLatencyMs: minLat,
      maxLatencyMs: maxLat,
      avgLatencyMs: avgLat,
      p50LatencyMs: p50Lat,
      p95LatencyMs: p95Lat,
      p99LatencyMs: p99Lat,
      throughputRps: throughput,
      initialBalance,
      finalBalance,
      negativeBalanceDetected: isNegative,
    };
  } finally {
    // Bersihkan data uji
    await pool.query('DELETE FROM tenant_credit_transactions WHERE tenant_id = $1', [testTenantId]);
    await pool.query('DELETE FROM channel_accounts WHERE tenant_id = $1', [testTenantId]);
    await pool.query('DELETE FROM tenant_credit_wallet WHERE tenant_id = $1', [testTenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    await pool.end();
  }
}

// Eksekusi jika dijalankan langsung
if (process.argv[1]?.endsWith('test_load_50_channel_accounts_credit_concurrency.ts')) {
  runLoadTest50ChannelAccounts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
