import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

async function runMigration0017() {
  console.log('🔄 Memulai eksekusi migrasi DDL 0017_prospects_trial_slots_and_web_integrity...');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke database PostgreSQL.');

    await client.query('BEGIN');

    // 1. Inisialisasi platform_settings untuk kapasitas slot trial (awal 36) dan durasi (7 hari)
    console.log('⚙️ Inisialisasi platform_settings (slot capacity & duration)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        description text,
        updated_by uuid,
        updated_at timestamptz DEFAULT now()
      );

      INSERT INTO platform_settings (key, value, description)
      VALUES 
        ('trial_slot_capacity', '{"capacity": 36}'::jsonb, 'Kapasitas maksimum slot uji coba aktif serentak'),
        ('trial_duration_days', '{"days": 7}'::jsonb, 'Durasi masa uji coba aktif per tenant dalam hari'),
        ('trial_initial_credits', '{"credits": 1000}'::jsonb, 'Jumlah kredit kerja awal yang dialokasikan untuk uji coba'),
        ('web_integrity_turnstile', '{"enforced": true, "tolerance_ms": 300000}'::jsonb, 'Kebijakan penegakan Cloudflare Turnstile pada endpoint publik')
      ON CONFLICT (key) DO NOTHING;
    `);

    // 2. Modifikasi / penyelarasan tabel prospects
    console.log('📋 Menyelaraskan tabel prospects...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS prospects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name text NOT NULL,
        work_email text NOT NULL,
        phone_number text,
        company_name text NOT NULL,
        company_scale text,
        interest_type text NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_status text NOT NULL DEFAULT 'REGISTERED';
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS meeting_status text NOT NULL DEFAULT 'NOT_SCHEDULED';
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_date timestamptz;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_link text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_notes text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_credits_allocated int NOT NULL DEFAULT 0;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_notes text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_slot_number int;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS web_integrity_verified boolean NOT NULL DEFAULT false;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS turnstile_token text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ip_address text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS user_agent text;
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

      CREATE INDEX IF NOT EXISTS idx_prospects_trial_status ON prospects(trial_status);
      CREATE INDEX IF NOT EXISTS idx_prospects_work_email ON prospects(work_email);
      CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON prospects(created_at DESC);
    `);

    // 3. Pembuatan tabel trial_slots
    console.log('🎰 Membuat tabel trial_slots & seeding 36 slot awal...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS trial_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_number int UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'ALLOCATED', 'EXPIRED')),
        prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
        tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
        reserved_at timestamptz,
        allocated_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_trial_slots_status ON trial_slots(status);
      CREATE INDEX IF NOT EXISTS idx_trial_slots_slot_number ON trial_slots(slot_number);
      CREATE INDEX IF NOT EXISTS idx_trial_slots_prospect_id ON trial_slots(prospect_id);

      -- Seeding 36 slot awal jika belum ada
      INSERT INTO trial_slots (slot_number, status)
      SELECT s, 'AVAILABLE'
      FROM generate_series(1, 36) AS s
      ON CONFLICT (slot_number) DO NOTHING;
    `);

    // 4. Pembuatan tabel trial_activations
    console.log('🚀 Membuat tabel trial_activations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS trial_activations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id uuid NOT NULL REFERENCES trial_slots(id) ON DELETE RESTRICT,
        prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
        tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
        initial_credits int NOT NULL DEFAULT 1000,
        credits_remaining int NOT NULL DEFAULT 1000,
        started_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CONVERTED', 'SUSPENDED')),
        conversion_subscription_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
        activated_by uuid,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_trial_activations_status ON trial_activations(status);
      CREATE INDEX IF NOT EXISTS idx_trial_activations_tenant_id ON trial_activations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_trial_activations_prospect_id ON trial_activations(prospect_id);
    `);

    // 5. Pembuatan tabel web_integrity_logs
    console.log('🛡️ Membuat tabel web_integrity_logs (Turnstile audit log)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS web_integrity_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint text NOT NULL,
        ip_address text,
        turnstile_token text,
        status text NOT NULL CHECK (status IN ('VERIFIED', 'REJECTED', 'BYPASSED', 'RATE_LIMITED')),
        error_code text,
        cf_timestamp timestamptz,
        hostname text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_web_integrity_endpoint ON web_integrity_logs(endpoint, status);
      CREATE INDEX IF NOT EXISTS idx_web_integrity_created_at ON web_integrity_logs(created_at DESC);
    `);

    // 6. RLS Enforcement & Grants
    console.log('🔒 Menegakkan RLS & Grants pada tabel-tabel baru...');
    const tables = ['prospects', 'trial_slots', 'trial_activations', 'web_integrity_logs', 'platform_settings'];
    for (const t of tables) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);

      // Service role policy
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}' AND policyname = '${t}_service_role_all'
          ) THEN
            CREATE POLICY ${t}_service_role_all ON ${t}
              FOR ALL TO public
              USING (
                current_user IN ('postgres', 'service_role', 'orchestree_app')
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN'
              )
              WITH CHECK (
                current_user IN ('postgres', 'service_role', 'orchestree_app')
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN'
              );
          END IF;
        END $$;
      `);

      // Grant permissions to orchestree_app
      await client.query(`GRANT ALL ON TABLE ${t} TO orchestree_app;`);
    }

    // Public insertion for prospects & read for trial_slots
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospects' AND policyname = 'prospects_public_insert'
        ) THEN
          CREATE POLICY prospects_public_insert ON prospects
            FOR INSERT TO anon, authenticated
            WITH CHECK (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trial_slots' AND policyname = 'trial_slots_public_read'
        ) THEN
          CREATE POLICY trial_slots_public_read ON trial_slots
            FOR SELECT TO anon, authenticated
            USING (true);
        END IF;
      END $$;
    `);

    // 7. Registrasi ke feature_capabilities
    console.log('✨ Mendaftarkan feature capability...');
    await client.query(`
      INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
      VALUES 
        (gen_random_uuid(), 'PROSPECT_TRIAL_ALLOCATION_AND_INTEGRITY', 0, 'Manajemen Prospek, Alokasi Slot Trial Atomik & Web Integrity Turnstile')
      ON CONFLICT (capability_key) DO UPDATE SET 
        description = EXCLUDED.description;
    `);

    await client.query('COMMIT');
    console.log('🎉 Migrasi 0017 berhasil dieksekusi penuh di PostgreSQL Supabase!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal menjalankan migrasi 0017:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration0017();
