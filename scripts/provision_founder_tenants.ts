import pg from 'pg';
import crypto from 'crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const ENTERPRISE_PLAN_ID = 'faddcd18-9e75-4dd3-9ccd-6f11e05e0cde';
const TENANT_OWNER_ROLE_ID = 'dd9066c0-3300-4926-8ec6-96d9b4f36524';

interface FounderConfig {
  email: string;
  fullName: string;
  tenantName: string;
}

const FOUNDERS: FounderConfig[] = [
  {
    email: 'orchestree.ai.id@gmail.com',
    fullName: 'Farhan Fadliansyah',
    tenantName: 'OrchestreeAI',
  },
  {
    email: 'trexioadventure@gmail.com',
    fullName: 'Farhan Fadliansyah',
    tenantName: 'Trexio Adventure',
  },
];

async function main() {
  console.log('--- PROVISIONING FOUNDER TENANTS ---');
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_founder_account
    console.log('1. Adding is_founder_account and company profile columns to tenants...');
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_founder_account boolean NOT NULL DEFAULT false;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address text;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS npwp text;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry text;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone text;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website text;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url text;
    `);

    // Verify Enterprise plan exists
    const planRes = await client.query(
      `SELECT id, plan_code, display_name FROM subscription_plans WHERE id = $1;`,
      [ENTERPRISE_PLAN_ID]
    );
    if (planRes.rows.length === 0) {
      throw new Error(`Enterprise plan ID ${ENTERPRISE_PLAN_ID} not found!`);
    }
    console.log('Verified subscription plan:', planRes.rows[0]);

    // Verify Tenant Owner role exists
    const roleRes = await client.query(
      `SELECT id, role_code, description FROM roles WHERE id = $1;`,
      [TENANT_OWNER_ROLE_ID]
    );
    if (roleRes.rows.length === 0) {
      throw new Error(`Tenant Owner role ID ${TENANT_OWNER_ROLE_ID} not found!`);
    }
    console.log('Verified owner role:', roleRes.rows[0]);

    const results = [];

    for (const founder of FOUNDERS) {
      console.log(`\nProcessing founder: ${founder.tenantName} (${founder.email})...`);

      // 2. Ensure auth.users invited user
      let userId: string;
      const userRes = await client.query(`SELECT id FROM auth.users WHERE email = $1;`, [founder.email]);

      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        console.log(` - Existing auth.users record found: ${userId}`);
      } else {
        userId = crypto.randomUUID();
        const confirmationToken = crypto.randomBytes(24).toString('hex');
        await client.query(
          `INSERT INTO auth.users (
            id, aud, role, email,
            invited_at, confirmation_token, confirmation_sent_at,
            raw_app_meta_data, raw_user_meta_data,
            is_sso_user, is_anonymous, created_at, updated_at
          ) VALUES (
            $1, 'authenticated', 'authenticated', $2,
            now(), $3, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            json_build_object('full_name', $4::text),
            false, false, now(), now()
          );`,
          [userId, founder.email, confirmationToken, founder.fullName]
        );
        console.log(` - Created invited auth.users record: ${userId}`);

        // Insert identity
        await client.query(
          `INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1::uuid, $2::text,
            json_build_object('sub', $2::text, 'email', $3::text),
            'email', now(), now()
          );`,
          [userId, userId, founder.email]
        );
        console.log(` - Created auth.identities record for email provider`);
      }

      // 3. Create or update tenant
      let tenantId: string;
      const tenantCheck = await client.query(
        `SELECT id FROM tenants WHERE display_name = $1 OR legal_name = $1;`,
        [founder.tenantName]
      );

      if (tenantCheck.rows.length > 0) {
        tenantId = tenantCheck.rows[0].id;
        await client.query(
          `UPDATE tenants
           SET legal_name = $1,
               display_name = $1,
               subscription_plan_id = $2,
               status = 'active',
               is_founder_account = true,
               updated_at = now()
           WHERE id = $3;`,
          [founder.tenantName, ENTERPRISE_PLAN_ID, tenantId]
        );
        console.log(` - Updated existing tenant: ${tenantId}`);
      } else {
        tenantId = crypto.randomUUID();
        await client.query(
          `INSERT INTO tenants (
            id, legal_name, display_name, subscription_plan_id, status, is_founder_account,
            address, npwp, industry, phone, website, logo_url, created_at, updated_at
          ) VALUES (
            $1, $2, $2, $3, 'active', true,
            NULL, NULL, NULL, NULL, NULL, NULL, now(), now()
          );`,
          [tenantId, founder.tenantName, ENTERPRISE_PLAN_ID]
        );
        console.log(` - Created new tenant: ${tenantId}`);
      }

      // Set session tenant config for subsequent queries if needed
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      // 4. Create tenant membership
      let membershipId: string;
      const memberCheck = await client.query(
        `SELECT id FROM tenant_memberships WHERE tenant_id = $1 AND auth_user_id = $2;`,
        [tenantId, userId]
      );

      if (memberCheck.rows.length > 0) {
        membershipId = memberCheck.rows[0].id;
        console.log(` - Existing membership found: ${membershipId}`);
      } else {
        membershipId = crypto.randomUUID();
        await client.query(
          `INSERT INTO tenant_memberships (
            id, tenant_id, auth_user_id, full_name, status, created_at
          ) VALUES (
            $1, $2, $3, $4, 'active', now()
          );`,
          [membershipId, tenantId, userId, founder.fullName]
        );
        console.log(` - Created tenant membership: ${membershipId}`);
      }

      // Assign TENANT_OWNER role
      const userRoleCheck = await client.query(
        `SELECT id FROM user_roles WHERE tenant_membership_id = $1 AND role_id = $2;`,
        [membershipId, TENANT_OWNER_ROLE_ID]
      );
      if (userRoleCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO user_roles (id, tenant_membership_id, role_id)
           VALUES (gen_random_uuid(), $1, $2);`,
          [membershipId, TENANT_OWNER_ROLE_ID]
        );
        console.log(` - Assigned TENANT_OWNER role to membership`);
      }

      // 5. Create or update tenant subscription
      // Enterprise plan, 100 years end date, is_unlimited_override = true
      const subCheck = await client.query(
        `SELECT id FROM tenant_subscriptions WHERE tenant_id = $1;`,
        [tenantId]
      );

      const unlimitedReason = 'Akun Founder OrchestreeAI — Eksklusif Unlimited Enterprise';

      if (subCheck.rows.length > 0) {
        await client.query(
          `UPDATE tenant_subscriptions
           SET plan_id = $1,
               billing_cycle_start = now(),
               billing_cycle_end = now() + interval '100 years',
               status = 'active',
               is_unlimited_override = true,
               unlimited_reason = $2
           WHERE tenant_id = $3;`,
          [ENTERPRISE_PLAN_ID, unlimitedReason, tenantId]
        );
        console.log(` - Updated tenant subscription to Unlimited Enterprise (100 years)`);
      } else {
        await client.query(
          `INSERT INTO tenant_subscriptions (
            id, tenant_id, plan_id, billing_cycle_start, billing_cycle_end,
            status, is_unlimited_override, unlimited_reason, granted_by, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, now(), now() + interval '100 years',
            'active', true, $3, $4, now()
          );`,
          [tenantId, ENTERPRISE_PLAN_ID, unlimitedReason, userId]
        );
        console.log(` - Inserted tenant subscription: Unlimited Enterprise (100 years)`);
      }

      // 6. Ensure tenant credit wallet
      const walletCheck = await client.query(
        `SELECT id, balance, reserved_balance FROM tenant_credit_wallet WHERE tenant_id = $1;`,
        [tenantId]
      );

      let walletId: string;
      if (walletCheck.rows.length === 0) {
        walletId = crypto.randomUUID();
        await client.query(
          `INSERT INTO tenant_credit_wallet (
            id, tenant_id, balance, reserved_balance, low_balance_threshold,
            currency, auto_topup_enabled, auto_topup_amount, created_at, updated_at
          ) VALUES (
            $1, $2, 0.0000, 0.0000, 10000.0000, 'IDR', false, 0.0000, now(), now()
          );`,
          [walletId, tenantId]
        );
        console.log(` - Initialized credit wallet for tenant`);
      } else {
        walletId = walletCheck.rows[0].id;
        console.log(` - Existing wallet found: ${walletId}`);
      }

      // 7. Audit log entry
      await client.query(
        `INSERT INTO audit_logs (
          id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
          payload_after, created_at
        ) VALUES (
          gen_random_uuid(), $1, 'system', $2, 'tenant.founder_provisioned',
          'tenants', $1, $3, now()
        );`,
        [
          tenantId,
          userId,
          JSON.stringify({
            tenant_id: tenantId,
            tenant_name: founder.tenantName,
            owner_email: founder.email,
            owner_name: founder.fullName,
            is_founder_account: true,
            is_unlimited_override: true,
            unlimited_reason: unlimitedReason,
            plan_code: 'ENTERPRISE',
            billing_cycle_end: '100_years',
            missing_profile_fields_null: true,
          }),
        ]
      );
      console.log(` - Recorded audit log for founder provisioning`);

      results.push({
        tenantName: founder.tenantName,
        tenantId,
        email: founder.email,
        userId,
        membershipId,
        walletId,
      });
    }

    await client.query('COMMIT');
    console.log('\n--- SUCCESS: ALL FOUNDER TENANTS PROVISIONED ---');
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Provisioning failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
