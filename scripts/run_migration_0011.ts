import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

async function runMigration0011() {
  console.log('🔄 Memulai eksekusi migrasi DDL 0011_proactive_notifications_and_chat...');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in environment');
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke database Supabase PostgreSQL.');

    await client.query('BEGIN');

    // 1. proactive_official_channels
    console.log('📦 Membuat tabel proactive_official_channels...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS proactive_official_channels (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_type text NOT NULL CHECK (channel_type IN ('whatsapp_official', 'telegram_bot_official')),
          credential_ref text NOT NULL,
          phone_number_id text,
          waba_id text,
          bot_username text,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_proactive_official_type ON proactive_official_channels(channel_type, status);
    `);

    // 2. channel_verification
    console.log('📦 Membuat tabel channel_verification...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_verification (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
          destination_target text NOT NULL,
          verification_code text NOT NULL,
          status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
          expires_at timestamptz NOT NULL,
          verified_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_channel_verif_tenant ON channel_verification(tenant_id, membership_id);
      CREATE INDEX IF NOT EXISTS idx_channel_verif_code ON channel_verification(channel, verification_code, status);
    `);

    // 3. proactive_subscriptions
    console.log('📦 Membuat tabel proactive_subscriptions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS proactive_subscriptions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
          destination_target text NOT NULL,
          notif_types text[] NOT NULL DEFAULT '{"daily_briefing", "urgent_alerts"}'::text[],
          send_times text[] NOT NULL DEFAULT '{"08:00", "17:00"}'::text[],
          timezone text NOT NULL DEFAULT 'Asia/Jakarta',
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'unsubscribed')),
          paused_reason text,
          daily_message_count int NOT NULL DEFAULT 0,
          last_sent_date date,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT unique_tenant_member_channel UNIQUE (tenant_id, tenant_membership_id, channel)
      );
      CREATE INDEX IF NOT EXISTS idx_proactive_sub_tenant ON proactive_subscriptions(tenant_id, tenant_membership_id);
      CREATE INDEX IF NOT EXISTS idx_proactive_sub_status ON proactive_subscriptions(status);
    `);

    // 4. proactive_messages_log
    console.log('📦 Membuat tabel proactive_messages_log...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS proactive_messages_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          subscription_id uuid REFERENCES proactive_subscriptions(id) ON DELETE SET NULL,
          channel_type text NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
          recipient_target text NOT NULL,
          message_type text NOT NULL,
          composed_text text NOT NULL,
          risk_score numeric(4, 3) NOT NULL DEFAULT 0.000,
          delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'blocked_antispam')),
          provider_message_id text,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_proactive_msg_tenant ON proactive_messages_log(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_proactive_msg_recipient ON proactive_messages_log(recipient_target, created_at DESC);
    `);

    // 5. notifications
    console.log('📦 Membuat tabel notifications...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          title text NOT NULL,
          body text NOT NULL,
          category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'task', 'attendance', 'billing', 'security', 'ai_intelligence')),
          is_read boolean NOT NULL DEFAULT false,
          action_url text,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_tenant_member ON notifications(tenant_id, membership_id, is_read, created_at DESC);
    `);

    // 6. push_subscriptions
    console.log('📦 Membuat tabel push_subscriptions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          endpoint text NOT NULL,
          p256dh text NOT NULL,
          auth_token text NOT NULL,
          user_agent text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT unique_member_endpoint UNIQUE (membership_id, endpoint)
      );
      CREATE INDEX IF NOT EXISTS idx_push_sub_member ON push_subscriptions(membership_id);
    `);

    // 7. RLS Enforcement
    console.log('🔒 Mengonfigurasi Row Level Security (RLS)...');
    await client.query(`
      ALTER TABLE proactive_official_channels ENABLE ROW LEVEL SECURITY;
      ALTER TABLE proactive_official_channels FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS superadmin_all_proactive_channels ON proactive_official_channels;
      CREATE POLICY superadmin_all_proactive_channels ON proactive_official_channels
          FOR ALL
          USING (
              current_setting('request.jwt.claim.role', true) = 'super_admin'
              OR current_setting('app.current_user_is_superadmin', true) = 'true'
              OR current_setting('app.is_superadmin', true) = 'true'
          );

      ALTER TABLE channel_verification ENABLE ROW LEVEL SECURITY;
      ALTER TABLE channel_verification FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_channel_verification ON channel_verification;
      CREATE POLICY tenant_isolation_channel_verification ON channel_verification
          FOR ALL
          USING (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          )
          WITH CHECK (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          );

      ALTER TABLE proactive_subscriptions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE proactive_subscriptions FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_proactive_subscriptions ON proactive_subscriptions;
      CREATE POLICY tenant_isolation_proactive_subscriptions ON proactive_subscriptions
          FOR ALL
          USING (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          )
          WITH CHECK (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          );

      ALTER TABLE proactive_messages_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE proactive_messages_log FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_proactive_messages_log ON proactive_messages_log;
      CREATE POLICY tenant_isolation_proactive_messages_log ON proactive_messages_log
          FOR ALL
          USING (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          )
          WITH CHECK (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          );

      ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
      CREATE POLICY tenant_isolation_notifications ON notifications
          FOR ALL
          USING (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          )
          WITH CHECK (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          );

      ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_push_subscriptions ON push_subscriptions;
      CREATE POLICY tenant_isolation_push_subscriptions ON push_subscriptions
          FOR ALL
          USING (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          )
          WITH CHECK (
              tenant_id = COALESCE(
                  NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                  NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
              )
          );
    `);

    // 8. Grants
    console.log('🔑 Mengonfigurasi peran dan hak akses orchestree_app...');
    await client.query(`
      DO $$
      BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
              GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_official_channels TO orchestree_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON channel_verification TO orchestree_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_subscriptions TO orchestree_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_messages_log TO orchestree_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO orchestree_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO orchestree_app;
          END IF;
      END $$;
    `);

    // 9. Feature Capabilities
    console.log('📋 Mendaftarkan feature capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
      VALUES
          ('proactive.channels.manage', 1, 'Akses mengelola preferensi kanal komunikasi proaktif staf'),
          ('proactive.messages.view', 0, 'Akses melihat riwayat pesan dan notifikasi proaktif'),
          ('chat.assistant.access', 0, 'Akses tanya jawab AI kognitif otonom (Ask AI)'),
          ('admin.proactive_channels.manage', 3, 'Akses konfigurasi kanal proaktif resmi platform')
      ON CONFLICT (capability_key) DO NOTHING;

      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, 'proactive.channels.manage'
      FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
      ON CONFLICT (role_id, capability_key) DO NOTHING;

      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, 'proactive.messages.view'
      FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
      ON CONFLICT (role_id, capability_key) DO NOTHING;

      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, 'chat.assistant.access'
      FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
      ON CONFLICT (role_id, capability_key) DO NOTHING;

      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, 'admin.proactive_channels.manage'
      FROM roles r WHERE r.role_code IN ('PLATFORM_SUPERADMIN')
      ON CONFLICT (role_id, capability_key) DO NOTHING;
    `);

    // 10. Seed official channels
    console.log('🌱 Menyiapkan kanal resmi platform...');
    await client.query(`
      INSERT INTO proactive_official_channels (channel_type, credential_ref, bot_username, status, metadata)
      SELECT 'telegram_bot_official', 'kms:env:TELEGRAM_OFFICIAL_BOT_TOKEN', 'OrchestreeAI.bot', 'active',
             '{"description": "Official Proactive Telegram Bot for Staff Daily Briefings & Urgent Alerts"}'::jsonb
      WHERE NOT EXISTS (
          SELECT 1 FROM proactive_official_channels WHERE channel_type = 'telegram_bot_official'
      );

      INSERT INTO proactive_official_channels (channel_type, credential_ref, phone_number_id, waba_id, status, metadata)
      SELECT 'whatsapp_official', 'kms:env:WA_PROACTIVE_ACCESS_TOKEN', 'WA_OFFICIAL_PHONE_ID', 'WA_OFFICIAL_WABA_ID', 'active',
             '{"description": "Official Proactive Meta WhatsApp Cloud API Channel"}'::jsonb
      WHERE NOT EXISTS (
          SELECT 1 FROM proactive_official_channels WHERE channel_type = 'whatsapp_official'
      );
    `);

    // 11. Update alembic_version
    await client.query(`
      ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar(64);
      UPDATE alembic_version SET version_num = '0011_proactive_channels_chat';
    `);

    await client.query('COMMIT');
    console.log('🎉 Migrasi 0011_proactive_channels_chat berhasil diterapkan!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal menjalankan migrasi 0011:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration0011().catch(e => {
  console.error(e);
  process.exit(1);
});
