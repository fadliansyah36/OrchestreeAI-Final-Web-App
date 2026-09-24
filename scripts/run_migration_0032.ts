import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0032 (Report Data Points, Automatic Reporting & Management Conversational Query).');

  try {
    await client.query('BEGIN;');

    console.log('1. Membuat tabel automated_reports...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS automated_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
        title TEXT NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        executive_summary TEXT NOT NULL,
        narrative TEXT NOT NULL,
        key_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        department_highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
        action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED')),
        generated_by TEXT NOT NULL DEFAULT 'Arya (AI Chief of Staff)',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_automated_reports_tenant_period
        ON automated_reports(tenant_id, report_type, period_end DESC);
      CREATE INDEX IF NOT EXISTS idx_automated_reports_status
        ON automated_reports(tenant_id, status);
    `);

    console.log('2. Membuat tabel report_data_points...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_data_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        report_id UUID REFERENCES automated_reports(id) ON DELETE CASCADE,
        metric_key VARCHAR(100) NOT NULL,
        metric_label TEXT NOT NULL,
        metric_value NUMERIC(16, 4) NOT NULL,
        unit VARCHAR(50) NOT NULL DEFAULT '',
        period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        source_table VARCHAR(100) NOT NULL,
        source_query TEXT NOT NULL,
        source_dimension VARCHAR(100) NOT NULL DEFAULT 'FINANCIALS_AND_BUDGET',
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        department_code VARCHAR(50),
        sensitivity_level VARCHAR(50) NOT NULL DEFAULT 'INTERNAL'
          CHECK (sensitivity_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED_MANAGEMENT', 'FINANCIAL_EXECUTIVE')),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_report_data_points_lookup
        ON report_data_points(tenant_id, report_id, metric_key);
      CREATE INDEX IF NOT EXISTS idx_report_data_points_period
        ON report_data_points(tenant_id, period_type, period_end DESC);
      CREATE INDEX IF NOT EXISTS idx_report_data_points_sensitivity
        ON report_data_points(tenant_id, sensitivity_level);
    `);

    console.log('3. Membuat tabel management_conversational_queries...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS management_conversational_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        session_id UUID NOT NULL,
        turn_number INT NOT NULL DEFAULT 1,
        user_id UUID,
        user_role VARCHAR(50) NOT NULL DEFAULT 'STAFF',
        user_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        query_text TEXT NOT NULL,
        raw_answer TEXT NOT NULL,
        filtered_answer TEXT NOT NULL,
        data_points_consulted UUID[] NOT NULL DEFAULT '{}',
        abac_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
        confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 98.40,
        reasoning_transparency JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_mgmt_queries_session
        ON management_conversational_queries(tenant_id, session_id, turn_number ASC);
      CREATE INDEX IF NOT EXISTS idx_mgmt_queries_user
        ON management_conversational_queries(tenant_id, user_id, created_at DESC);
    `);

    console.log('4. Mengonfigurasi RLS FORCE pada ketiga tabel...');
    await client.query(`
      ALTER TABLE automated_reports ENABLE ROW LEVEL SECURITY;
      ALTER TABLE automated_reports FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS automated_reports_tenant_isolation ON automated_reports;
      CREATE POLICY automated_reports_tenant_isolation ON automated_reports
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE report_data_points ENABLE ROW LEVEL SECURITY;
      ALTER TABLE report_data_points FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS report_data_points_tenant_isolation ON report_data_points;
      CREATE POLICY report_data_points_tenant_isolation ON report_data_points
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE management_conversational_queries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE management_conversational_queries FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS mgmt_queries_tenant_isolation ON management_conversational_queries;
      CREATE POLICY mgmt_queries_tenant_isolation ON management_conversational_queries
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      GRANT ALL ON automated_reports TO authenticated, orchestree_app;
      GRANT ALL ON report_data_points TO authenticated, orchestree_app;
      GRANT ALL ON management_conversational_queries TO authenticated, orchestree_app;
    `);

    console.log('5. Mendaftarkan feature capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
      VALUES
        ('reporting.automated.view', 2, 'Melihat laporan otomatis terjadwal Daily, Weekly, Monthly'),
        ('reporting.automated.generate', 2, 'Menjalankan engine agregasi laporan data points otomatis'),
        ('reporting.conversational.query', 3, 'Management Conversational Query multi-turn berpenyaring ABAC'),
        ('reporting.abac.filter', 3, 'Penyaringan data titik laporan berdasarkan level sensitivitas dan hak akses ABAC')
      ON CONFLICT (capability_key) DO UPDATE
      SET min_tier_level = EXCLUDED.min_tier_level,
          description = EXCLUDED.description;
    `);

    await client.query('COMMIT;');
    console.log('✅ Migrasi 0032 BERHASIL dieksekusi ke database Supabase!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Gagal mengeksekusi migrasi 0032:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
