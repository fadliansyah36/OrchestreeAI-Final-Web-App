-- 20260921000010_third_party_integrations_and_sync_rls.sql
-- Integrasi Pihak Ketiga & Observasi Kerja Transparan (PRD v2.2 Bagian 12 & 12.9)

-- 1. third_party_app_registry
CREATE TABLE IF NOT EXISTS third_party_app_registry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    app_code text UNIQUE NOT NULL,
    name text NOT NULL,
    category text NOT NULL CHECK (category IN ('social', 'marketplace', 'workforce_collaboration', 'productivity')),
    description text NOT NULL,
    icon text NOT NULL DEFAULT 'share2',
    auth_type text NOT NULL DEFAULT 'oauth2' CHECK (auth_type IN ('oauth2', 'api_key', 'webhook')),
    supported_scopes text[] NOT NULL DEFAULT '{}',
    client_id text,
    client_secret_vault_ref text,
    authorization_url text,
    token_url text,
    revoke_url text,
    health_check_url text,
    is_active boolean NOT NULL DEFAULT true,
    requires_transparency_notice boolean NOT NULL DEFAULT false,
    transparency_notice_template text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tp_app_category ON third_party_app_registry(category, is_active);
CREATE INDEX IF NOT EXISTS idx_tp_app_code ON third_party_app_registry(app_code);

-- 2. integration_connections
CREATE TABLE IF NOT EXISTS integration_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    app_id uuid NOT NULL REFERENCES third_party_app_registry(id) ON DELETE CASCADE,
    app_code text NOT NULL,
    connection_name text NOT NULL,
    status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'pending', 'connected', 'error', 'suspended')),
    access_token_encrypted text,
    refresh_token_encrypted text,
    token_expires_at timestamptz,
    authorized_scopes text[] NOT NULL DEFAULT '{}',
    external_account_id text,
    external_account_name text,
    health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'unreachable', 'expired', 'unknown')),
    last_health_check_at timestamptz,
    last_sync_at timestamptz,
    error_message text,
    transparency_notice_accepted_at timestamptz,
    transparency_notice_accepted_by uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    observation_mode text NOT NULL DEFAULT 'metadata_only' CHECK (observation_mode IN ('metadata_only', 'none')),
    active_workers_count int NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_app UNIQUE (tenant_id, app_code)
);

CREATE INDEX IF NOT EXISTS idx_int_conn_tenant ON integration_connections(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_int_conn_health ON integration_connections(health_status, last_health_check_at);

-- 3. integration_sync_logs
CREATE TABLE IF NOT EXISTS integration_sync_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    sync_type text NOT NULL CHECK (sync_type IN ('health_check', 'token_refresh', 'manual_sync', 'scheduled_post_publish', 'order_sync', 'activity_metadata_poll', 'revoke_cascade')),
    status text NOT NULL CHECK (status IN ('success', 'failed', 'partial', 'cancelled')),
    items_synced int NOT NULL DEFAULT 0,
    error_detail text,
    latency_ms int NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant_conn ON integration_sync_logs(tenant_id, connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_type_status ON integration_sync_logs(sync_type, status);

-- 4. RLS POLICIES & FORCE RLS
ALTER TABLE third_party_app_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tp_registry_select_all ON third_party_app_registry;
CREATE POLICY tp_registry_select_all ON third_party_app_registry
    FOR SELECT TO authenticated, orchestree_app USING (true);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS int_conn_tenant_isolation ON integration_connections;
CREATE POLICY int_conn_tenant_isolation ON integration_connections
    FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_logs_tenant_isolation ON integration_sync_logs;
CREATE POLICY sync_logs_tenant_isolation ON integration_sync_logs
    FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT ALL ON third_party_app_registry TO orchestree_app;
GRANT ALL ON integration_connections TO orchestree_app;
GRANT ALL ON integration_sync_logs TO orchestree_app;

-- 5. SEED INITIAL PLATFORM CATALOG
INSERT INTO third_party_app_registry 
    (app_code, name, category, description, icon, auth_type, supported_scopes, requires_transparency_notice, transparency_notice_template)
VALUES
    ('meta_social', 'Meta Business (Instagram & Facebook)', 'social', 
     'Publikasi konten otomatis, pemantauan interaksi audiens, dan analitik performa posting.',
     'instagram', 'oauth2', 
     ARRAY['instagram_basic', 'instagram_content_publish', 'pages_read_engagement', 'pages_manage_posts'],
     false, null),

    ('tiktok_social', 'TikTok for Business', 'social', 
     'Distribusi video kreatif AI, pelacakan metrik views, dan penjadwalan konten kampanye.',
     'video', 'oauth2', 
     ARRAY['video.upload', 'video.list', 'user.info.basic'],
     false, null),

    ('slack_workspace', 'Slack Workspace', 'workforce_collaboration', 
     'Observasi transparan ritme kerja tim, ringkasan channel proyek, dan orkestrasi task otomatis.',
     'message-square', 'oauth2', 
     ARRAY['channels:read', 'chat:write', 'users:read', 'team:read'],
     true, 
     'Pemberitahuan Transparansi: Pengamatan dilakukan secara eksklusif terhadap metadata aktivitas (frekuensi interaksi, timestamp koordinasi proyek, status kehadiran) demi peningkatan efisiensi kolaborasi. Sistem tidak mengakses isi pesan pribadi atau percakapan rahasia.'),

    ('ms_teams', 'Microsoft Teams Enterprise', 'workforce_collaboration', 
     'Sinkronisasi alur kerja tim, pencatatan progres tugas otomatis, dan integrasi rapat koordinasi.',
     'users', 'oauth2', 
     ARRAY['Team.ReadBasic.All', 'ChannelMessage.Send', 'User.Read.All'],
     true, 
     'Pemberitahuan Transparansi: Akses dibatasi pada metadata koordinasi umum organisasi. Percakapan langsung dan kanal privat dilindungi dan tidak diarsipkan.'),

    ('trello_workspace', 'Trello Project Management', 'workforce_collaboration', 
     'Manajemen papan Kanban dua arah, sinkronisasi status kartu kerja, dan otomatisasi penugasan staf AI.',
     'trello', 'oauth2', 
     ARRAY['read', 'write', 'account'],
     false, null),

    ('google_workspace', 'Google Workspace Suite', 'productivity', 
     'Integrasi kalender operasional, sinkronisasi dokumen kerja Company Brain, dan analitik produktivitas.',
     'mail', 'oauth2', 
     ARRAY['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.readonly'],
     false, null),

    ('tokopedia_seller', 'Tokopedia Open Platform', 'marketplace', 
     'Sinkronisasi inventori produk, pemrosesan pesanan otomatis, dan penyesuaian harga real-time.',
     'shopping-bag', 'oauth2', 
     ARRAY['inventory:read', 'inventory:write', 'order:read', 'order:write'],
     false, null),

    ('shopee_seller', 'Shopee Open Platform', 'marketplace', 
     'Koneksi etalase toko, manajemen varian katalog, pembaruan stok, dan pelacakan resi pesanan.',
     'shopping-cart', 'oauth2', 
     ARRAY['product', 'order', 'logistics'],
     false, null),

    ('tiktok_shop', 'TikTok Shop Partner', 'marketplace', 
     'Penyelarasan katalog keranjang kuning, inventaris pesanan siaran langsung, dan analitik omzet.',
     'zap', 'oauth2', 
     ARRAY['seller.products', 'seller.orders', 'seller.finance'],
     false, null)
ON CONFLICT (app_code) DO NOTHING;

-- 6. FEATURE CAPABILITIES
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES 
    ('integrations.third_party.manage', 0, 
     'Konektor resmi eksternal sosial media, e-commerce marketplace, dan tools kolaborasi kerja dengan health-check berkala, auto-refresh token, dan revoke cascading.')
ON CONFLICT (capability_key) DO UPDATE SET 
    description = EXCLUDED.description;
