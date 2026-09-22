/**
 * OrchestreeAI Credit State Machine & Billing Ledger (TypeScript Backend)
 * Sesuai PRD v2.2 Bagian 14.2:
 * 1. reserveCredit()
 * 2. consumeCredit()
 * 3. refundCredit()
 * 4. topupCredit()
 * 5. getWallet()
 * 6. getFinancialCommandCenter()
 * 
 * Menggunakan isolasi transaksi row-level locking (SELECT ... FOR UPDATE) pada tenant_credit_wallet
 * untuk menjamin ACID, mencegah race conditions, dan memastikan saldo tidak pernah negatif.
 */

import pg from 'pg';
import crypto from 'crypto';

export class InsufficientCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientCreditError';
  }
}

export class InvalidReservationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReservationStateError';
  }
}

export interface TenantWalletInfo {
  id: string;
  tenant_id: string;
  balance: number;
  reserved_balance: number;
  available_balance: number;
  low_balance_threshold: number;
  currency: string;
  auto_topup_enabled: boolean;
  auto_topup_amount: number;
  is_low_balance: boolean;
}

export async function getOrCreateWalletTx(
  client: pg.PoolClient,
  tenantId: string,
  forUpdate = false
): Promise<TenantWalletInfo> {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const selRes = await client.query(
    `SELECT id, tenant_id, balance, reserved_balance, low_balance_threshold, currency,
            auto_topup_enabled, auto_topup_amount
     FROM tenant_credit_wallet
     WHERE tenant_id = $1
     ${lockClause};`,
    [tenantId]
  );

  if (selRes.rows.length > 0) {
    const row = selRes.rows[0];
    const bal = parseFloat(row.balance || '0');
    const resv = parseFloat(row.reserved_balance || '0');
    const thresh = parseFloat(row.low_balance_threshold || '50000');
    const avail = bal - resv;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      balance: bal,
      reserved_balance: resv,
      available_balance: avail,
      low_balance_threshold: thresh,
      currency: row.currency || 'IDR',
      auto_topup_enabled: Boolean(row.auto_topup_enabled),
      auto_topup_amount: parseFloat(row.auto_topup_amount || '0'),
      is_low_balance: avail <= thresh,
    };
  }

  // Jika belum ada, inisialisasi dompet baru dengan saldo uji coba 250,000 IDR
  const initialBalance = 250000;
  const newId = crypto.randomUUID();
  const insRes = await client.query(
    `INSERT INTO tenant_credit_wallet (
       id, tenant_id, balance, reserved_balance, low_balance_threshold, currency
     ) VALUES (
       $1, $2, $3, 0.0000, 50000.0000, 'IDR'
     )
     ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
     RETURNING id, tenant_id, balance, reserved_balance, low_balance_threshold, currency,
               auto_topup_enabled, auto_topup_amount;`,
    [newId, tenantId, initialBalance]
  );

  const row = insRes.rows[0];
  const bal = parseFloat(row.balance);
  const resv = parseFloat(row.reserved_balance);
  const thresh = parseFloat(row.low_balance_threshold);

  // Catat transaksi inisiasi
  await client.query(
    `INSERT INTO tenant_credit_transactions (
       id, tenant_id, transaction_type, amount, balance_after, reference_id, description
     ) VALUES (
       $1, $2, 'topup', $3, $4, $5, 'Saldo kredit inisiasi organisasi baru'
     );`,
    [crypto.randomUUID(), tenantId, initialBalance, initialBalance, `init-${tenantId}`]
  );

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    balance: bal,
    reserved_balance: resv,
    available_balance: bal - resv,
    low_balance_threshold: thresh,
    currency: row.currency || 'IDR',
    auto_topup_enabled: Boolean(row.auto_topup_enabled),
    auto_topup_amount: parseFloat(row.auto_topup_amount || '0'),
    is_low_balance: (bal - resv) <= thresh,
  };
}

export async function reserveCredit(
  pool: pg.Pool,
  tenantId: string,
  estimatedCost: number,
  referenceType: string,
  referenceId: string,
  metadata: Record<string, any> = {}
) {
  if (estimatedCost < 0) {
    throw new Error('Estimated cost tidak boleh bernilai negatif.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

    // 1. Kunci dompet tenant (SELECT ... FOR UPDATE)
    const wallet = await getOrCreateWalletTx(client, tenantId, true);
    if (wallet.available_balance < estimatedCost) {
      throw new InsufficientCreditError(
        `Saldo kredit tidak mencukupi. Tersedia: ${wallet.available_balance.toLocaleString('id-ID')} ${wallet.currency}, Dibutuhkan: ${estimatedCost.toLocaleString('id-ID')} ${wallet.currency}`
      );
    }

    // 2. Naikkan reserved_balance
    const newReserved = wallet.reserved_balance + estimatedCost;
    await client.query(
      `UPDATE tenant_credit_wallet
       SET reserved_balance = $1, updated_at = now()
       WHERE id = $2;`,
      [newReserved, wallet.id]
    );

    // 3. Catat entri reservasi
    const reservationId = crypto.randomUUID();
    await client.query(
      `INSERT INTO credit_reservations (
         id, tenant_id, estimated_cost, status, reference_type, reference_id, metadata
       ) VALUES ($1, $2, $3, 'reserved', $4, $5, $6);`,
      [reservationId, tenantId, estimatedCost, referenceType, referenceId, JSON.stringify(metadata)]
    );

    // 4. Catat mutasi audit
    const txId = crypto.randomUUID();
    const balanceAfter = wallet.balance - newReserved;
    await client.query(
      `INSERT INTO tenant_credit_transactions (
         id, tenant_id, reservation_id, transaction_type, amount, balance_after,
         reference_id, description, metadata
       ) VALUES ($1, $2, $3, 'reserved', $4, $5, $6, $7, $8);`,
      [
        txId,
        tenantId,
        reservationId,
        -estimatedCost,
        balanceAfter,
        referenceId,
        `Reservasi kredit untuk ${referenceType}:${referenceId}`,
        JSON.stringify(metadata),
      ]
    );

    await client.query('COMMIT');

    return {
      id: reservationId,
      tenant_id: tenantId,
      estimated_cost: estimatedCost,
      status: 'reserved',
      reference_type: referenceType,
      reference_id: referenceId,
      metadata,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function consumeCredit(
  pool: pg.Pool,
  reservationId: string,
  actualCost: number,
  metadata: Record<string, any> = {}
) {
  if (actualCost < 0) {
    throw new Error('Actual cost tidak boleh bernilai negatif.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Kunci reservasi
    const resCheck = await client.query(
      `SELECT id, tenant_id, estimated_cost, status, reference_type, reference_id
       FROM credit_reservations
       WHERE id = $1
       FOR UPDATE;`,
      [reservationId]
    );

    if (resCheck.rows.length === 0) {
      throw new InvalidReservationStateError(`Reservasi kredit ${reservationId} tidak ditemukan.`);
    }

    const resRow = resCheck.rows[0];
    const tenantId = resRow.tenant_id;
    const estimatedCost = parseFloat(resRow.estimated_cost);

    if (resRow.status !== 'reserved') {
      throw new InvalidReservationStateError(
        `Reservasi ${reservationId} berstatus '${resRow.status}', hanya 'reserved' yang dapat dikonsumsi.`
      );
    }

    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

    // 2. Kunci dompet tenant
    const wallet = await getOrCreateWalletTx(client, tenantId, true);

    // 3. Update saldo
    const newReserved = Math.max(0, wallet.reserved_balance - estimatedCost);
    const newBalance = Math.max(0, wallet.balance - actualCost);

    await client.query(
      `UPDATE tenant_credit_wallet
       SET balance = $1, reserved_balance = $2, updated_at = now()
       WHERE id = $3;`,
      [newBalance, newReserved, wallet.id]
    );

    // 4. Update status reservasi
    await client.query(
      `UPDATE credit_reservations
       SET status = 'consumed', actual_cost = $1, updated_at = now()
       WHERE id = $2;`,
      [actualCost, reservationId]
    );

    // 5. Catat mutasi transaksi
    const txId = crypto.randomUUID();
    const balanceAfter = newBalance - newReserved;
    await client.query(
      `INSERT INTO tenant_credit_transactions (
         id, tenant_id, reservation_id, transaction_type, amount, balance_after,
         reference_id, description, metadata
       ) VALUES ($1, $2, $3, 'consumed', $4, $5, $6, $7, $8);`,
      [
        txId,
        tenantId,
        reservationId,
        -actualCost,
        balanceAfter,
        resRow.reference_id,
        `Konsumsi kredit aktual ${resRow.reference_type}:${resRow.reference_id}`,
        JSON.stringify(metadata),
      ]
    );

    await client.query('COMMIT');

    return {
      id: txId,
      tenant_id: tenantId,
      reservation_id: reservationId,
      transaction_type: 'consumed',
      amount: -actualCost,
      balance_after: balanceAfter,
      reference_id: resRow.reference_id,
      metadata,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function refundCredit(
  pool: pg.Pool,
  reservationId: string,
  reason = 'Eksekusi gagal / dibatalkan',
  metadata: Record<string, any> = {}
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Kunci reservasi
    const resCheck = await client.query(
      `SELECT id, tenant_id, estimated_cost, status, reference_type, reference_id
       FROM credit_reservations
       WHERE id = $1
       FOR UPDATE;`,
      [reservationId]
    );

    if (resCheck.rows.length === 0) {
      throw new InvalidReservationStateError(`Reservasi kredit ${reservationId} tidak ditemukan.`);
    }

    const resRow = resCheck.rows[0];
    const tenantId = resRow.tenant_id;
    const estimatedCost = parseFloat(resRow.estimated_cost);

    if (resRow.status !== 'reserved') {
      throw new InvalidReservationStateError(
        `Reservasi ${reservationId} berstatus '${resRow.status}', hanya 'reserved' yang dapat di-refund.`
      );
    }

    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

    // 2. Kunci dompet
    const wallet = await getOrCreateWalletTx(client, tenantId, true);
    const newReserved = Math.max(0, wallet.reserved_balance - estimatedCost);

    await client.query(
      `UPDATE tenant_credit_wallet
       SET reserved_balance = $1, updated_at = now()
       WHERE id = $2;`,
      [newReserved, wallet.id]
    );

    // 3. Update status reservasi
    await client.query(
      `UPDATE credit_reservations
       SET status = 'refunded', actual_cost = 0, updated_at = now()
       WHERE id = $1;`,
      [reservationId]
    );

    // 4. Catat mutasi refund
    const txId = crypto.randomUUID();
    const balanceAfter = wallet.balance - newReserved;
    await client.query(
      `INSERT INTO tenant_credit_transactions (
         id, tenant_id, reservation_id, transaction_type, amount, balance_after,
         reference_id, description, metadata
       ) VALUES ($1, $2, $3, 'refunded', $4, $5, $6, $7, $8);`,
      [
        txId,
        tenantId,
        reservationId,
        estimatedCost,
        balanceAfter,
        resRow.reference_id,
        `Refund reservasi kredit: ${reason}`,
        JSON.stringify(metadata),
      ]
    );

    await client.query('COMMIT');

    return {
      id: txId,
      tenant_id: tenantId,
      reservation_id: reservationId,
      transaction_type: 'refunded',
      amount: estimatedCost,
      balance_after: balanceAfter,
      reference_id: resRow.reference_id,
      metadata,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function topupCredit(
  pool: pg.Pool,
  tenantId: string,
  amount: number,
  referenceId: string,
  description = 'Top up saldo kredit organisasi',
  metadata: Record<string, any> = {}
) {
  if (amount <= 0) {
    throw new Error('Jumlah top-up harus lebih besar dari 0.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

    const wallet = await getOrCreateWalletTx(client, tenantId, true);
    const newBalance = wallet.balance + amount;

    await client.query(
      `UPDATE tenant_credit_wallet
       SET balance = $1, updated_at = now()
       WHERE id = $2;`,
      [newBalance, wallet.id]
    );

    const txId = crypto.randomUUID();
    const balanceAfter = newBalance - wallet.reserved_balance;
    await client.query(
      `INSERT INTO tenant_credit_transactions (
         id, tenant_id, transaction_type, amount, balance_after,
         reference_id, description, metadata
       ) VALUES ($1, $2, 'topup', $3, $4, $5, $6, $7);`,
      [txId, tenantId, amount, balanceAfter, referenceId, description, JSON.stringify(metadata)]
    );

    await client.query('COMMIT');

    return {
      id: txId,
      tenant_id: tenantId,
      transaction_type: 'topup',
      amount,
      balance_after: balanceAfter,
      reference_id: referenceId,
      description,
      metadata,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getWallet(pool: pg.Pool, tenantId: string): Promise<TenantWalletInfo> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
    return await getOrCreateWalletTx(client, tenantId, false);
  } finally {
    client.release();
  }
}

export async function getTransactions(pool: pg.Pool, tenantId: string, limit = 50) {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
    const res = await client.query(
      `SELECT id, transaction_type, amount, balance_after, reference_id, description, created_at
       FROM tenant_credit_transactions
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [tenantId, limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      transaction_type: r.transaction_type,
      amount: parseFloat(r.amount),
      balance_after: parseFloat(r.balance_after),
      reference_id: r.reference_id,
      description: r.description,
      created_at: r.created_at,
    }));
  } finally {
    client.release();
  }
}

export async function getInvoices(pool: pg.Pool, tenantId: string, limit = 50) {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
    const res = await client.query(
      `SELECT id, invoice_number, amount, currency, status, payment_gateway, payment_reference, payment_url, items, created_at, paid_at
       FROM invoices
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [tenantId, limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      amount: parseFloat(r.amount),
      currency: r.currency,
      status: r.status,
      payment_gateway: r.payment_gateway,
      payment_reference: r.payment_reference,
      payment_url: r.payment_url,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
      created_at: r.created_at,
      paid_at: r.paid_at,
    }));
  } finally {
    client.release();
  }
}

export async function getFinancialCommandCenter(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    // Agregasi saldo beredar
    const wRes = await client.query(`
      SELECT count(*) as total_tenants,
             coalesce(sum(balance), 0) as total_circulating_balance,
             coalesce(sum(reserved_balance), 0) as total_reserved_balance
      FROM tenant_credit_wallet;
    `);
    const wRow = wRes.rows[0];

    // Agregasi invoice terbayar
    const iRes = await client.query(`
      SELECT count(*) as total_paid_invoices,
             coalesce(sum(amount), 0) as total_revenue_collected
      FROM invoices
      WHERE status = 'paid';
    `);
    const iRow = iRes.rows[0];

    // List dompet tenant
    const walletsRes = await client.query(`
      SELECT w.id, w.tenant_id, t.name as tenant_name, w.balance, w.reserved_balance,
             (w.balance - w.reserved_balance) as available_balance, w.currency, w.updated_at
      FROM tenant_credit_wallet w
      LEFT JOIN tenants t ON t.id = w.tenant_id
      ORDER BY w.balance DESC
      LIMIT 50;
    `);

    // Riwayat log rekonsiliasi gateway
    const reconRes = await client.query(`
      SELECT id, tenant_id, invoice_id, payment_gateway, event_type, signature_verified, status, created_at
      FROM payment_reconciliation_log
      ORDER BY created_at DESC
      LIMIT 30;
    `);

    const totCirc = parseFloat(wRow.total_circulating_balance || '0');
    const totResv = parseFloat(wRow.total_reserved_balance || '0');

    return {
      summary: {
        total_tenants: parseInt(wRow.total_tenants || '0', 10),
        total_circulating_balance: totCirc,
        total_reserved_balance: totResv,
        total_available_balance: totCirc - totResv,
        total_paid_invoices: parseInt(iRow.total_paid_invoices || '0', 10),
        total_revenue_collected: parseFloat(iRow.total_revenue_collected || '0'),
        currency: 'IDR',
      },
      tenant_wallets: walletsRes.rows.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_name || `Organisasi ${r.tenant_id.slice(0, 8)}`,
        balance: parseFloat(r.balance),
        reserved_balance: parseFloat(r.reserved_balance),
        available_balance: parseFloat(r.available_balance),
        currency: r.currency,
        updated_at: r.updated_at,
      })),
      recent_reconciliations: reconRes.rows.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        invoice_id: r.invoice_id,
        payment_gateway: r.payment_gateway,
        event_type: r.event_type,
        signature_verified: Boolean(r.signature_verified),
        status: r.status,
        created_at: r.created_at,
      })),
    };
  } finally {
    client.release();
  }
}
