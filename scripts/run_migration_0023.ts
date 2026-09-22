import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL tidak ditemukan di .env');
  process.exit(1);
}

async function runMigration0023() {
  console.log('Memulai eksekusi migrasi DDL 0023 (Message Experiments, A/B Testing Results, Revenue Attribution)...');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log('Terhubung ke database Supabase PostgreSQL.');

    await client.query('BEGIN');

    // 1. message_experiments
    console.log('1/4 Membuat tabel message_experiments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_experiments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        channel_type text NOT NULL CHECK (channel_type IN ('WHATSAPP', 'TELEGRAM', 'INSTAGRAM', 'EMAIL')),
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RUNNING', 'CONCLUDED', 'CANCELLED')),
        variant_a_template text NOT NULL,
        variant_b_template text NOT NULL,
        variant_a_name text NOT NULL DEFAULT 'Variant A (Kontrol)',
        variant_b_name text NOT NULL DEFAULT 'Variant B (Eksperimen)',
        target_metric text NOT NULL DEFAULT 'CONVERSION_RATE' CHECK (target_metric IN ('CLICK_RATE', 'REPLY_RATE', 'CONVERSION_RATE', 'REVENUE')),
        min_sample_size integer NOT NULL DEFAULT 100 CHECK (min_sample_size >= 10),
        confidence_level_threshold numeric(4, 3) NOT NULL DEFAULT 0.950,
        variant_a_sample_count integer NOT NULL DEFAULT 0,
        variant_b_sample_count integer NOT NULL DEFAULT 0,
        variant_a_conversions integer NOT NULL DEFAULT 0,
        variant_b_conversions integer NOT NULL DEFAULT 0,
        variant_a_revenue numeric(15, 2) NOT NULL DEFAULT 0.00,
        variant_b_revenue numeric(15, 2) NOT NULL DEFAULT 0.00,
        winner_variant text CHECK (winner_variant IN ('VARIANT_A', 'VARIANT_B', 'INCONCLUSIVE')),
        p_value numeric(6, 5),
        z_score numeric(8, 4),
        is_statistically_significant boolean NOT NULL DEFAULT false,
        conclusion_reason text,
        created_by_user_id uuid,
        started_at timestamptz,
        concluded_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_msg_exp_tenant_status ON message_experiments(tenant_id, status);
    `);

    // 2. message_experiment_results
    console.log('2/4 Membuat tabel message_experiment_results...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_experiment_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        experiment_id uuid NOT NULL REFERENCES message_experiments(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        assigned_variant text NOT NULL CHECK (assigned_variant IN ('VARIANT_A', 'VARIANT_B')),
        message_sent_text text NOT NULL,
        is_delivered boolean NOT NULL DEFAULT false,
        delivered_at timestamptz,
        is_read boolean NOT NULL DEFAULT false,
        read_at timestamptz,
        has_replied boolean NOT NULL DEFAULT false,
        replied_at timestamptz,
        has_converted boolean NOT NULL DEFAULT false,
        converted_at timestamptz,
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        revenue_generated numeric(15, 2) NOT NULL DEFAULT 0.00,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_msg_exp_res_exp ON message_experiment_results(experiment_id, assigned_variant);
      CREATE INDEX IF NOT EXISTS idx_msg_exp_res_tenant ON message_experiment_results(tenant_id);
    `);

    // 3. RLS FORCE & Policies
    console.log('3/4 Menetapkan RLS FORCE & Policies...');
    const tables = ['message_experiments', 'message_experiment_results'];
    for (const table of tables) {
      await client.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS ${table}_tenant_isolation_policy ON ${table};
        CREATE POLICY ${table}_tenant_isolation_policy ON ${table}
          FOR ALL
          USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR
            tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
            OR
            tenant_id IS NULL
          )
          WITH CHECK (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR
            tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
            OR
            tenant_id IS NULL
          );
      `);
    }

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON message_experiments, message_experiment_results TO orchestree_app;
        END IF;
      END $$;
    `);

    // 4. Feature capabilities
    console.log('4/4 Mendaftarkan feature capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
      VALUES 
        (gen_random_uuid(), 'sales.message_experiments.manage', 1, 'Pengelolaan A/B Testing Template Pesan Penjualan dengan Uji Signifikansi Statistik Z-Score'),
        (gen_random_uuid(), 'sales.revenue_intelligence.view', 1, 'Visibilitas Analisis Pendapatan First-Touch Attribution Lintas Kanal dan Asisten AI'),
        (gen_random_uuid(), 'sales.coach.evaluate', 1, 'Evaluasi Sales Coach AI Terhadap Transkrip Percakapan dan Penutupan Penjualan'),
        (gen_random_uuid(), 'brain.catalog_sync.manage', 1, 'Sinkronisasi Otomatis Katalog Produk dan Inventori Real-Time ke Company Brain')
      ON CONFLICT (capability_key) DO UPDATE 
      SET description = EXCLUDED.description;
    `);

    await client.query(`
      INSERT INTO alembic_version (version_num) 
      VALUES ('0023_message_experiments_and_revenue_attribution')
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Migrasi 0023 DDL sukses dieksekusi.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Gagal menjalankan migrasi 0023:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration0023();
