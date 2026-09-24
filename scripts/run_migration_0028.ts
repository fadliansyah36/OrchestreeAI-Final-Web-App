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
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0028 (Integration Fabric & DPIA).');

  try {
    await client.query('BEGIN;');

    console.log('1. Membuat tabel dpia_records...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS dpia_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id uuid,
        assessment_title text NOT NULL,
        data_controller_name text NOT NULL,
        data_protection_officer text NOT NULL,
        processing_purpose text NOT NULL,
        data_categories text[] NOT NULL DEFAULT '{}',
        data_subject_categories text[] NOT NULL DEFAULT '{}',
        transfer_basis text NOT NULL DEFAULT 'INTERNAL_LEGITIMATE_INTEREST',
        security_measures_description text NOT NULL,
        risk_level text NOT NULL DEFAULT 'MEDIUM' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        residual_risk text NOT NULL DEFAULT 'LOW' CHECK (residual_risk IN ('LOW', 'MEDIUM', 'HIGH')),
        status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
        is_complete boolean NOT NULL DEFAULT true,
        review_notes text,
        reviewed_by uuid,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_dpia_tenant_connector ON dpia_records(tenant_id, connector_id);
      CREATE INDEX IF NOT EXISTS idx_dpia_tenant_status ON dpia_records(tenant_id, status);
    `);

    console.log('2. Memperbarui tabel integration_fabric_connectors...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS integration_fabric_connectors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_code text NOT NULL,
        connector_name text NOT NULL,
        connector_type text NOT NULL,
        status text NOT NULL DEFAULT 'DRAFT',
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_sync_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_connector UNIQUE (tenant_id, connector_code)
      );

      -- Update constraint connector_type agar mendukung ERP, HRIS, CRM, CMMS
      ALTER TABLE integration_fabric_connectors DROP CONSTRAINT IF EXISTS integration_fabric_connectors_connector_type_check;
      ALTER TABLE integration_fabric_connectors ADD CONSTRAINT integration_fabric_connectors_connector_type_check
        CHECK (connector_type IN ('ERP', 'HRIS', 'CRM', 'CMMS', 'ERP_SAP_ORACLE', 'WEBHOOK_BROKER', 'DATA_STREAM_PIPELINE', 'CUSTOM_RPC'));

      -- Update constraint status
      ALTER TABLE integration_fabric_connectors DROP CONSTRAINT IF EXISTS integration_fabric_connectors_status_check;
      ALTER TABLE integration_fabric_connectors ADD CONSTRAINT integration_fabric_connectors_status_check
        CHECK (status IN ('DRAFT', 'PENDING_DPIA', 'CONNECTED', 'ACTIVE', 'SUSPENDED_TIER_DOWNGRADE', 'DISABLED'));

      -- Tambahkan kolom kredensial terenkripsi KMS & integrasi DPIA
      ALTER TABLE integration_fabric_connectors
        ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'API_KEY'
          CHECK (auth_type IN ('API_KEY', 'OAUTH2', 'BASIC_AUTH', 'MTLS', 'CUSTOM')),
        ADD COLUMN IF NOT EXISTS credential_key_id text,
        ADD COLUMN IF NOT EXISTS credentials_encrypted text,
        ADD COLUMN IF NOT EXISTS dpia_record_id uuid REFERENCES dpia_records(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS dpia_status text NOT NULL DEFAULT 'NOT_SUBMITTED'
          CHECK (dpia_status IN ('NOT_SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
        ADD COLUMN IF NOT EXISTS dpia_approved_at timestamptz,
        ADD COLUMN IF NOT EXISTS dpia_approved_by uuid,
        ADD COLUMN IF NOT EXISTS last_sync_status text DEFAULT 'IDLE'
          CHECK (last_sync_status IN ('IDLE', 'SYNCING', 'SUCCESS', 'FAILED')),
        ADD COLUMN IF NOT EXISTS last_error_message text;

      CREATE INDEX IF NOT EXISTS idx_if_connectors_dpia ON integration_fabric_connectors(tenant_id, dpia_status);
    `);

    console.log('3. Menyambungkan Foreign Key dpia_records -> integration_fabric_connectors...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_dpia_connector'
        ) THEN
          ALTER TABLE dpia_records
            ADD CONSTRAINT fk_dpia_connector
            FOREIGN KEY (connector_id) REFERENCES integration_fabric_connectors(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    console.log('4. Membuat tabel integration_fabric_sync_logs...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS integration_fabric_sync_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id uuid NOT NULL REFERENCES integration_fabric_connectors(id) ON DELETE CASCADE,
        sync_type text NOT NULL CHECK (sync_type IN ('MANUAL', 'SCHEDULED_STREAM', 'WEBHOOK_EVENT', 'BATCH_POLL')),
        status text NOT NULL CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED', 'PARTIAL')),
        records_ingested integer NOT NULL DEFAULT 0,
        records_failed integer NOT NULL DEFAULT 0,
        latency_ms integer NOT NULL DEFAULT 0,
        payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_message text,
        triggered_by text NOT NULL DEFAULT 'SYSTEM',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_fabric_sync_tenant_conn 
        ON integration_fabric_sync_logs(tenant_id, connector_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fabric_sync_status 
        ON integration_fabric_sync_logs(tenant_id, status);
    `);

    console.log('5. Mengaktifkan Row Level Security (RLS FORCE) pada seluruh tabel...');
    await client.query(`
      ALTER TABLE dpia_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE dpia_records FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS dpia_tenant_isolation ON dpia_records;
      CREATE POLICY dpia_tenant_isolation ON dpia_records
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE integration_fabric_connectors ENABLE ROW LEVEL SECURITY;
      ALTER TABLE integration_fabric_connectors FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS if_connectors_tenant_isolation ON integration_fabric_connectors;
      CREATE POLICY if_connectors_tenant_isolation ON integration_fabric_connectors
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE integration_fabric_sync_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE integration_fabric_sync_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS if_sync_logs_tenant_isolation ON integration_fabric_sync_logs;
      CREATE POLICY if_sync_logs_tenant_isolation ON integration_fabric_sync_logs
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      GRANT ALL ON dpia_records TO authenticated, orchestree_app;
      GRANT ALL ON integration_fabric_connectors TO authenticated, orchestree_app;
      GRANT ALL ON integration_fabric_sync_logs TO authenticated, orchestree_app;
    `);

    console.log('6. Mendaftarkan kapabilitas Enterprise ke feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('integration.fabric.dpia.manage', 3, 'Kelola Data Protection Impact Assessment (DPIA) untuk koneksi korporat'),
        ('integration.fabric.dpia.approve', 3, 'Persetujuan resmi DPIA oleh Data Protection Officer (DPO) korporat'),
        ('integration.fabric.kms.rotate', 3, 'Rotasi kunci enkripsi envelope KMS untuk kredensial konektor fabric'),
        ('integration.fabric.sync_logs.view', 3, 'Audit log streaming dan sinkronisasi transaksional Integration Fabric')
      ON CONFLICT (capability_key) DO NOTHING;
    `);

    await client.query('COMMIT;');
    console.log('Migrasi 0028 selesai dengan sukses!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Migrasi 0028 gagal:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch(console.error);
