import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const FOUNDER_ACCOUNTS = [
  {
    email: 'orchestree.ai.id@gmail.com',
    password: process.env.FOUNDER_ORCHESTREE_PASSWORD || process.env.ADMIN_PASSWORD || '',
    tenantName: 'OrchestreeAI',
  },
  {
    email: 'trexioadventure@gmail.com',
    password: process.env.FOUNDER_TREXIO_PASSWORD || process.env.ADMIN_PASSWORD || '',
    tenantName: 'Trexio Adventure',
  },
];

async function setFounderPasswords() {
  console.log('Connecting to Supabase PostgreSQL...');
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    for (const acc of FOUNDER_ACCOUNTS) {
      if (!acc.password) {
        throw new Error(
          `Password untuk ${acc.email} tidak ditemukan di environment variable (FOUNDER_ORCHESTREE_PASSWORD / FOUNDER_TREXIO_PASSWORD).`
        );
      }
      console.log(`Setting password for ${acc.email} (${acc.tenantName})...`);

      // 1. Hash password with bcrypt cost 10 and confirm email in auth.users
      const updateRes = await client.query(
        `UPDATE auth.users
         SET encrypted_password = crypt($1, gen_salt('bf', 10)),
             email_confirmed_at = COALESCE(email_confirmed_at, now()),
             updated_at = now()
         WHERE LOWER(email) = LOWER($2)
         RETURNING id, email, email_confirmed_at;`,
        [acc.password, acc.email]
      );

      if (updateRes.rows.length === 0) {
        throw new Error(`User with email ${acc.email} not found in auth.users!`);
      }

      console.log(` - Updated auth.users:`, updateRes.rows[0]);

      // 2. Verify crypt match
      const verifyRes = await client.query(
        `SELECT (encrypted_password = crypt($1, encrypted_password)) as password_verified
         FROM auth.users
         WHERE LOWER(email) = LOWER($2);`,
        [acc.password, acc.email]
      );

      const verified = verifyRes.rows[0]?.password_verified;
      console.log(` - Crypt verification in PostgreSQL: ${verified}`);
      if (!verified) {
        throw new Error(`Password verification failed for ${acc.email}!`);
      }

      // 3. Log audit event
      const user = updateRes.rows[0];
      await client.query(
        `INSERT INTO audit_logs (
          id, actor_type, actor_id, action, resource_type, resource_id,
          payload_after, created_at
        ) VALUES (
          gen_random_uuid(), 'system', $1, 'auth.founder_password_set',
          'auth.users', $1, $2, now()
        );`,
        [
          user.id,
          JSON.stringify({
            email: acc.email,
            tenant_name: acc.tenantName,
            status: 'password_set_active',
            algorithm: 'bcrypt_cost_10',
          }),
        ]
      );
      console.log(` - Audit log recorded for ${acc.email}`);
    }

    console.log('\n--- ALL FOUNDER PASSWORDS GENERATED & CONFIGURED IN SUPABASE ---');
  } finally {
    client.release();
    await pool.end();
  }
}

setFounderPasswords().catch((err) => {
  console.error('Failed to set passwords:', err);
  process.exit(1);
});
