"""Inisialisasi Kanal Komunikasi Proaktif Resmi, Verifikasi Staf, Langganan Notifikasi, Pusat Notifikasi In-App, dan Web Push

Revision ID: 0011_proactive_channels_chat
Revises: 0010_billing_and_credit_wallet
Create Date: 2026-09-22 14:30:00.000000

Skema Komunikasi Proaktif & Notifikasi:
- Tabel proactive_official_channels: Kanal resmi tingkat platform (WhatsApp Business & Telegram Bot) dikelola Super Admin.
- Tabel channel_verification: Tiket OTP WhatsApp & Deep-link Telegram untuk verifikasi nomor/ID staf.
- Tabel proactive_subscriptions: Preferensi jadwal dan jenis pesan proaktif per anggota organisasi.
- Tabel proactive_messages_log: Catatan audit seluruh pesan proaktif terkirim lengkap dengan skor risiko & anti-spam.
- Tabel notifications: Pusat notifikasi internal aplikasi (In-App Notification Center).
- Tabel push_subscriptions: Langganan Web Push peramban berbasis standar VAPID.
- Penegakan RLS FORCE bertenant pada seluruh tabel bertenant dan proteksi platform-level pada kanal resmi.
- Registrasi kapabilitas fitur ke feature_capabilities dan role_permissions.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0011_proactive_channels_chat"
down_revision: Union[str, None] = "0010_billing_and_credit_wallet"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel proactive_official_channels (Platform-level, dikelola SUPER_ADMIN)
    op.execute("""
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
    """)

    # 2. Tabel channel_verification
    op.execute("""
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
    """)

    # 3. Tabel proactive_subscriptions
    op.execute("""
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
    """)

    # 4. Tabel proactive_messages_log
    op.execute("""
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
    """)

    # 5. Tabel notifications (Notification Center In-App)
    op.execute("""
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
    """)

    # 6. Tabel push_subscriptions (Web Push VAPID)
    op.execute("""
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
    """)

    # 7. Penegakan Row Level Security (RLS)
    op.execute("""
    -- proactive_official_channels: Hanya SUPER_ADMIN
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

    -- channel_verification: Isolasi Tenant
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

    -- proactive_subscriptions: Isolasi Tenant
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

    -- proactive_messages_log: Isolasi Tenant
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

    -- notifications: Isolasi Tenant
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

    -- push_subscriptions: Isolasi Tenant
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

    -- Grant izin ke orchestree_app
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
    """)

    # 8. Registrasi kapabilitas fitur
    op.execute("""
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
    """)

    # 9. Inisialisasi kanal proaktif resmi jika belum terdaftar
    op.execute("""
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
    """)


def downgrade() -> None:
    tables = [
        "push_subscriptions",
        "notifications",
        "proactive_messages_log",
        "proactive_subscriptions",
        "channel_verification",
        "proactive_official_channels",
    ]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{tbl} ON {tbl};")
        op.execute(f"DROP POLICY IF EXISTS superadmin_all_{tbl} ON {tbl};")
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")

    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'proactive.channels.manage', 'proactive.messages.view', 'chat.assistant.access', 'admin.proactive_channels.manage'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'proactive.channels.manage', 'proactive.messages.view', 'chat.assistant.access', 'admin.proactive_channels.manage'
    );
    """)
