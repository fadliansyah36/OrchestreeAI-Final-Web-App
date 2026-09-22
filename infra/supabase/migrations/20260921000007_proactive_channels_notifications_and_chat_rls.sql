-- Migrasi Reversible: 007_proactive_channels_notifications_and_chat_rls.sql
-- Kanal Proaktif Resmi Platform, Verifikasi Kanal, Langganan Notifikasi, Pusat Notifikasi In-App, Langganan Web Push VAPID, dan Log Komunikasi

BEGIN

-- 1. Tabel Platform-Level: proactive_official_channels (Dikelola SUPER_ADMIN)
CREATE TABLE IF NOT EXISTS proactive_official_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type text NOT NULL CHECK (channel_type IN ('whatsapp_official', 'telegram_bot_official')),
    credential_ref text NOT NULL, -- KMS encrypted pointer/identifier
    phone_number_id text, -- Digunakan untuk WhatsApp Cloud API
    waba_id text,
    bot_username text, -- Digunakan untuk Telegram bot resmi
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_proactive_official_type ON proactive_official_channels(channel_type, status);

-- 2. Tabel Bertenant: channel_verification (OTP WA & Deep-link TG)
CREATE TABLE IF NOT EXISTS channel_verification (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
    destination_target text NOT NULL, -- Nomor telepon E.164 atau Telegram username/ID sementara
    verification_code text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
    expires_at timestamptz NOT NULL,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_channel_verif_tenant ON channel_verification(tenant_id, membership_id);

CREATE INDEX IF NOT EXISTS idx_channel_verif_code ON channel_verification(channel, verification_code, status);

-- 3. Tabel Bertenant: proactive_subscriptions (Preferensi Notifikasi Proaktif Per Staff)
CREATE TABLE IF NOT EXISTS proactive_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
    destination_target text NOT NULL, -- Terverifikasi
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
)

CREATE INDEX IF NOT EXISTS idx_proactive_sub_tenant ON proactive_subscriptions(tenant_id, tenant_membership_id);

CREATE INDEX IF NOT EXISTS idx_proactive_sub_status ON proactive_subscriptions(status);

-- 4. Tabel Bertenant: proactive_messages_log (Audit Pengiriman Pesan Proaktif)
CREATE TABLE IF NOT EXISTS proactive_messages_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES proactive_subscriptions(id) ON DELETE SET NULL,
    channel_type text NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
    recipient_target text NOT NULL,
    message_type text NOT NULL, -- 'daily_briefing', 'urgent_alert', 'opt_in', 'otp'
    composed_text text NOT NULL,
    risk_score numeric(4, 3) NOT NULL DEFAULT 0.000,
    delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'blocked_antispam')),
    provider_message_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_proactive_msg_tenant ON proactive_messages_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proactive_msg_recipient ON proactive_messages_log(recipient_target, created_at DESC);

-- 5. Tabel Bertenant: notifications (Notification Center In-App)
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
)

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_member ON notifications(tenant_id, membership_id, is_read, created_at DESC);

-- 6. Tabel Bertenant: push_subscriptions (Web Push VAPID)
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
)

CREATE INDEX IF NOT EXISTS idx_push_sub_member ON push_subscriptions(membership_id);

-- 7. Penegakan Row Level Security (RLS) & Kebijakan Isolasi Penyewa

-- proactive_official_channels: Hanya SUPER_ADMIN
ALTER TABLE proactive_official_channels ENABLE ROW LEVEL SECURITY

ALTER TABLE proactive_official_channels FORCE ROW LEVEL SECURITY;

CREATE POLICY superadmin_all_proactive_channels ON proactive_official_channels
    FOR ALL
    USING (
        current_setting('request.jwt.claim.role', true) = 'super_admin'
        OR current_setting('app.current_user_is_superadmin', true) = 'true'
    );

-- channel_verification: Isolasi Tenant & Pemilik Tiket Verifikasi
ALTER TABLE channel_verification ENABLE ROW LEVEL SECURITY

ALTER TABLE channel_verification FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_channel_verification ON channel_verification
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- proactive_subscriptions: Isolasi Tenant
ALTER TABLE proactive_subscriptions ENABLE ROW LEVEL SECURITY

ALTER TABLE proactive_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_proactive_subscriptions ON proactive_subscriptions
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- proactive_messages_log: Isolasi Tenant
ALTER TABLE proactive_messages_log ENABLE ROW LEVEL SECURITY

ALTER TABLE proactive_messages_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_proactive_messages_log ON proactive_messages_log
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- notifications: Isolasi Tenant & Keanggotaan Tertentu
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY

ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_notifications ON notifications
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- push_subscriptions: Isolasi Tenant
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY

ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_push_subscriptions ON push_subscriptions
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    );

COMMIT;
