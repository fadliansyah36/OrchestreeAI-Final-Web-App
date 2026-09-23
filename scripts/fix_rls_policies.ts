import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function fix() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log('Dropping restrictive policy and creating standard permissive policy...');
  await client.query(`
    DROP POLICY IF EXISTS tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies;
    CREATE POLICY tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies
      FOR ALL
      TO PUBLIC
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  `);

  console.log('Permissive policy successfully created.');
  await client.end();
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
