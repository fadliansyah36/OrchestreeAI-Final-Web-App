import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0029 (AI Data Permission Matrix & Audit).');

  try {
    await client.query('BEGIN;');

    console.log('1. Menambahkan kolom access_level pada ai_data_permission_policies jika belum ada...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ai_data_permission_policies' AND column_name = 'access_level'
        ) THEN
          ALTER TABLE ai_data_permission_policies
            ADD COLUMN access_level text NOT NULL DEFAULT 'READ_ONLY'
            CHECK (access_level IN ('NONE', 'READ_ONLY', 'READ_WRITE', 'ADMIN'));
        END IF;
      END $$;
    `);

    console.log('2. Membuat index matriks untuk lookup cepat...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_data_policies_matrix
      ON ai_data_permission_policies(tenant_id, agent_persona_type, resource_identifier);
    `);

    console.log('3. Mendaftarkan kapabilitas fitur pada feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('ai_data_permissions.view', 1, 'Melihat matriks izin akses data agen AI terhadap sistem korporat'),
        ('ai_data_permissions.manage', 2, 'Mengubah matriks izin akses data agen AI (khusus TENANT_OWNER / TENANT_ADMIN)')
      ON CONFLICT (capability_key) DO NOTHING;
    `);

    console.log('4. Memastikan RLS FORCE aktif pada ai_data_permission_policies...');
    await client.query(`
      ALTER TABLE ai_data_permission_policies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ai_data_permission_policies FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies;
      CREATE POLICY tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      GRANT ALL ON ai_data_permission_policies TO authenticated, orchestree_app;
    `);

    await client.query('COMMIT;');
    console.log('✅ Migrasi 0029 berhasil dijalankan di Supabase Postgres!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Gagal menjalankan migrasi 0029:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
