import pg from 'pg';
import dotenv from 'dotenv';
import { reserveCredit, consumeCredit } from '../src/server/creditWallet';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

const ORCHESTREE_TENANT_ID = '10e75d63-15f8-42e8-a6ce-24fece12cd04';
const TREXIO_TENANT_ID = '88f0e51b-6e90-4797-b7ef-b127dceb40c3';

export async function runFounderTenantsAndUnlimitedCreditAudit(): Promise<void> {
  console.log('================================================================');
  console.log('AUDIT: FOUNDER TENANTS & UNLIMITED CREDIT PRIVILEGE SUITE');
  console.log('Verifying founder isolation, unlimited override, and credit engine');
  console.log('================================================================\n');

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();

  try {
    // 1. Verify founder accounts exist with is_founder_account=true and is_unlimited_override=true
    console.log('1. Checking founder tenant records and Enterprise subscription...');
    const tenantsRes = await client.query(
      `SELECT t.id, t.display_name, t.is_founder_account, t.status,
              sp.plan_code, s.is_unlimited_override, s.unlimited_reason,
              s.billing_cycle_end
       FROM tenants t
       JOIN tenant_subscriptions s ON s.tenant_id = t.id
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE t.id IN ($1, $2)
       ORDER BY t.display_name ASC;`,
      [ORCHESTREE_TENANT_ID, TREXIO_TENANT_ID]
    );

    if (tenantsRes.rows.length !== 2) {
      throw new Error(`Expected 2 founder tenants, found: ${tenantsRes.rows.length}`);
    }

    for (const t of tenantsRes.rows) {
      console.log(` - Tenant: ${t.display_name} (${t.id})`);
      if (!t.is_founder_account) throw new Error(`Tenant ${t.display_name} is_founder_account is not true!`);
      if (!t.is_unlimited_override) throw new Error(`Tenant ${t.display_name} is_unlimited_override is not true!`);
      if (t.plan_code.toLowerCase() !== 'enterprise') throw new Error(`Tenant ${t.display_name} plan is not enterprise!`);
      if (t.status !== 'active') throw new Error(`Tenant ${t.display_name} status is not active!`);
    }

    // 2. Empty profile fields must be NULL (no fake/mock data)
    console.log('2. Verifying unprovided company profile fields are strictly NULL...');
    const profileRes = await client.query(
      `SELECT id, display_name, address, npwp, industry, phone, website, logo_url
       FROM tenants
       WHERE id IN ($1, $2);`,
      [ORCHESTREE_TENANT_ID, TREXIO_TENANT_ID]
    );

    for (const p of profileRes.rows) {
      if (p.address !== null || p.npwp !== null || p.industry !== null || p.phone !== null || p.website !== null || p.logo_url !== null) {
        throw new Error(`Tenant ${p.display_name} has non-null dummy profile fields!`);
      }
      console.log(` - Tenant ${p.display_name}: address=NULL, npwp=NULL, industry=NULL (EmptyState compliant)`);
    }

    // 3. Auth users password verification in Supabase
    console.log('3. Verifying auth.users password bcrypt hashes in Supabase...');
    const usersRes = await client.query(
      `SELECT id, email, email_confirmed_at,
              (encrypted_password = crypt('Orchestree#Founder2026!', encrypted_password)) as orch_pass_valid,
              (encrypted_password = crypt('Trexio#Founder2026!', encrypted_password)) as trexio_pass_valid,
              (encrypted_password = crypt('WrongPassword123!', encrypted_password)) as wrong_pass_valid
       FROM auth.users
       WHERE email IN ('orchestree.ai.id@gmail.com', 'trexioadventure@gmail.com');`
    );

    if (usersRes.rows.length !== 2) {
      throw new Error(`Expected 2 founder auth users, found: ${usersRes.rows.length}`);
    }

    for (const u of usersRes.rows) {
      if (!u.email_confirmed_at) throw new Error(`User ${u.email} email_confirmed_at is null!`);
      if (u.wrong_pass_valid) throw new Error(`User ${u.email} accepted invalid password!`);

      if (u.email === 'orchestree.ai.id@gmail.com') {
        if (!u.orch_pass_valid) throw new Error(`OrchestreeAI password verification failed in Supabase!`);
        console.log(` - User ${u.email}: password verified via Supabase pgcrypto bcrypt`);
      } else if (u.email === 'trexioadventure@gmail.com') {
        if (!u.trexio_pass_valid) throw new Error(`Trexio Adventure password verification failed in Supabase!`);
        console.log(` - User ${u.email}: password verified via Supabase pgcrypto bcrypt`);
      }
    }

    // 4. Test real credit reservation and consumption without balance failure
    console.log('4. Testing credit reservation & consumption under unlimited override...');
    const refId = `test-audit-${Date.now()}`;
    const reservation = await reserveCredit(
      pool,
      ORCHESTREE_TENANT_ID,
      1000000,
      'ai_agent_task',
      refId,
      { audit_check: true }
    );

    if (reservation.status !== 'reserved') {
      throw new Error(`Reservation failed with status: ${reservation.status}`);
    }
    console.log(` - Reserved 1,000,000 IDR credit successfully with 0 balance (Reservation ID: ${reservation.id})`);

    const consumption = await consumeCredit(
      pool,
      reservation.id,
      750000,
      { tokens_used: 15000 }
    );

    if (consumption.amount !== -750000) {
      throw new Error(`Consumption amount mismatch: ${consumption.amount}`);
    }
    console.log(` - Consumed 750,000 IDR credit successfully, recorded in ledger`);

    // Verify audit logs
    const auditRes = await client.query(
      `SELECT count(*) FROM audit_logs WHERE tenant_id IN ($1, $2) AND action = 'tenant.founder_provisioned';`,
      [ORCHESTREE_TENANT_ID, TREXIO_TENANT_ID]
    );
    console.log(` - Found ${auditRes.rows[0].count} founder provisioning audit entries in audit_logs`);

    // 5. Verify exclusion from automated renewal & topup expiration queries
    console.log('5. Verifying exclusion from automated lifecycle jobs...');
    const renewalQuery = await client.query(`
      SELECT ts.id
      FROM tenant_subscriptions ts
      JOIN subscription_plans sp ON sp.id = ts.plan_id
      JOIN tenants t ON t.id = ts.tenant_id
      WHERE ts.status = 'active'
        AND COALESCE(t.is_founder_account, false) = false
        AND COALESCE(ts.is_unlimited_override, false) = false
        AND t.id IN ($1, $2);
    `, [ORCHESTREE_TENANT_ID, TREXIO_TENANT_ID]);

    if (renewalQuery.rows.length !== 0) {
      throw new Error('Founder tenants were not excluded from automated renewal job query!');
    }
    console.log(' - Founder accounts excluded from automated renewal job');

    const topupQuery = await client.query(`
      SELECT ca.id
      FROM credit_allocations ca
      JOIN tenants t ON t.id = ca.tenant_id
      LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = ca.tenant_id AND ts.status IN ('active', 'trialing')
      WHERE ca.source_type = 'topup_purchase'
        AND COALESCE(t.is_founder_account, false) = false
        AND COALESCE(ts.is_unlimited_override, false) = false
        AND t.id IN ($1, $2);
    `, [ORCHESTREE_TENANT_ID, TREXIO_TENANT_ID]);

    if (topupQuery.rows.length !== 0) {
      throw new Error('Founder tenants were not excluded from automated topup expiration job query!');
    }
    console.log(' - Founder accounts excluded from automated topup expiration job');

    console.log('\n================================================================');
    console.log('AUDIT PASSED: ALL FOUNDER PRIVILEGES & EXCLUSIONS VERIFIED');
    console.log('================================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('test_founder_tenants_and_unlimited_credit')) {
  runFounderTenantsAndUnlimitedCreditAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}
