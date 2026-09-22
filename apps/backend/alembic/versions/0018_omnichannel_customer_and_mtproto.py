"""Inisialisasi Skema Omnichannel, Resolusi Identitas Customer, dan MTProto Gateway (PRD v2.2 Bagian 10 & 12)

Revision ID: 0018_omnichannel_customer_and_mtproto
Revises: 0017_prospects_trial_slots_and_web_integrity
Create Date: 2026-09-23 00:00:00.000000

Skema Omnichannel & Customer Intelligence:
- Tabel customers: Entitas pelanggan kanonik per tenant (profil, nomor telepon E.164, email, status).
- Tabel customer_channel_identities: Identitas akun channel (WhatsApp, Telegram MTProto, Instagram, TikTok).
- Tabel customer_attributes: Atribut kustom dinamis pelanggan.
- Tabel customer_segments: Segmentasi pelanggan berbasis kriteria dinamis.
- Tabel customer_funnel_state: State corong pemasaran (AWARENESS hingga RETENTION).
- Tabel customer_merge_log: Jejak audit penggabungan identitas WEAK yang dapat dibatalkan (reversible).
- Tabel channel_accounts: Akun channel organisasi dengan mode koneksi Kategori A & B.
- Tabel channel_account_permissions: Kontrol akses RBAC staf per akun channel.
- Tabel channel_account_persona_assignments: Penugasan AI Persona aktif per channel.
- Tabel channel_account_usage_ledger: Buku besar audit pemakaian channel & pemotongan kredit.
- Tabel mtproto_sessions: Sesi Telegram MTProto terenkripsi KMS per akun, status QR, dan audit otorisasi.
- Tabel conversations: Percakapan omnichannel lintas channel.
- Tabel conversation_messages: Pesan masuk dan keluar dengan pelacakan status pengiriman.
- Tabel conversation_intents: Deteksi niat pesan pelanggan via Model Router.
- Tabel conversation_handovers: Penyerahan percakapan antara AI Agent dan Staf Manusia.
- RLS FORCE bertenant pada seluruh tabel.
- Registrasi kapabilitas fitur ke feature_capabilities.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0018_omnichannel_customer_and_mtproto"
down_revision: Union[str, None] = "0017_prospects_trial_slots_and_web_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel customers
    op.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        primary_name text,
        primary_phone text,
        primary_email text,
        avatar_url text,
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'ARCHIVED')),
        lifecycle_stage text NOT NULL DEFAULT 'LEAD' CHECK (lifecycle_stage IN ('LEAD', 'PROSPECT', 'CUSTOMER', 'CHURNED')),
        total_spent numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_spent >= 0),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_phone 
        ON customers(tenant_id, primary_phone) 
        WHERE primary_phone IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_customers_tenant_email 
        ON customers(tenant_id, primary_email) 
        WHERE primary_email IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_customers_tenant_lifecycle 
        ON customers(tenant_id, lifecycle_stage);
    """)

    # 2. Tabel channel_accounts (Dibuat lebih dulu sebelum customer_channel_identities)
    op.execute("""
    CREATE TABLE IF NOT EXISTS channel_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_type text NOT NULL CHECK (channel_type IN ('telegram_mtproto', 'whatsapp_cloud', 'instagram', 'facebook', 'tiktok')),
        connection_mode text NOT NULL CHECK (connection_mode IN ('official_business_api', 'mtproto_qr', 'platform_oauth')),
        account_label text NOT NULL,
        external_identifier text NOT NULL,
        external_identifier_hash text NOT NULL,
        credential_ref text,
        department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'PENDING_SETUP' CHECK (status IN ('PENDING_SETUP', 'ACTIVE', 'ERROR', 'REVOKED', 'SUSPENDED')),
        created_by_membership_id uuid,
        requires_owner_approval boolean NOT NULL DEFAULT false,
        is_approved boolean NOT NULL DEFAULT true,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_channel_accounts_tenant_channel_identifier UNIQUE (tenant_id, channel_type, external_identifier_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_channel_accounts_tenant_status 
        ON channel_accounts(tenant_id, status);
    """)

    # 3. Tabel customer_channel_identities
    op.execute("""
    CREATE TABLE IF NOT EXISTS customer_channel_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        channel_account_id uuid REFERENCES channel_accounts(id) ON DELETE SET NULL,
        channel_type text NOT NULL,
        external_user_id text NOT NULL,
        external_username text,
        display_name text,
        verified boolean NOT NULL DEFAULT false,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cust_channel_identities_tenant_type_ext UNIQUE (tenant_id, channel_type, external_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cust_identities_customer ON customer_channel_identities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_cust_identities_channel_user ON customer_channel_identities(tenant_id, channel_type, external_user_id);
    """)

    # 4. Tabel customer_attributes
    op.execute("""
    CREATE TABLE IF NOT EXISTS customer_attributes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        key text NOT NULL,
        value jsonb NOT NULL,
        data_type text NOT NULL DEFAULT 'string',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_customer_attributes_tenant_cust_key UNIQUE (tenant_id, customer_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_customer_attributes_lookup ON customer_attributes(tenant_id, key);
    """)

    # 5. Tabel customer_segments
    op.execute("""
    CREATE TABLE IF NOT EXISTS customer_segments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
        member_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant ON customer_segments(tenant_id);
    """)

    # 6. Tabel customer_funnel_state
    op.execute("""
    CREATE TABLE IF NOT EXISTS customer_funnel_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        funnel_stage text NOT NULL DEFAULT 'AWARENESS' CHECK (funnel_stage IN ('AWARENESS', 'INTEREST', 'CONSIDERATION', 'INTENT', 'EVALUATION', 'PURCHASE', 'RETENTION')),
        entered_at timestamptz NOT NULL DEFAULT now(),
        last_activity_at timestamptz NOT NULL DEFAULT now(),
        score numeric(5, 2) NOT NULL DEFAULT 0.00,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT uq_customer_funnel_tenant_customer UNIQUE (tenant_id, customer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_customer_funnel_tenant_stage ON customer_funnel_state(tenant_id, funnel_stage);
    """)

    # 7. Tabel customer_merge_log
    op.execute("""
    CREATE TABLE IF NOT EXISTS customer_merge_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        target_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        source_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        match_type text NOT NULL CHECK (match_type IN ('EXACT', 'STRONG', 'WEAK')),
        confidence_score numeric(4, 3) NOT NULL,
        match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ROLLED_BACK')),
        reviewed_by uuid,
        reviewed_at timestamptz,
        snapshot_before_merge jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_customer_merge_tenant_status ON customer_merge_log(tenant_id, status);
    """)

    # 8. Tabel channel_account_permissions
    op.execute("""
    CREATE TABLE IF NOT EXISTS channel_account_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        role_or_membership_id uuid NOT NULL,
        can_read boolean NOT NULL DEFAULT true,
        can_send boolean NOT NULL DEFAULT true,
        can_manage boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_channel_acc_perm UNIQUE (tenant_id, channel_account_id, role_or_membership_id)
    );
    """)

    # 9. Tabel channel_account_persona_assignments
    op.execute("""
    CREATE TABLE IF NOT EXISTS channel_account_persona_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        ai_persona_id uuid NOT NULL,
        is_default boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_channel_acc_persona UNIQUE (tenant_id, channel_account_id, ai_persona_id)
    );
    """)

    # 10. Tabel channel_account_usage_ledger
    op.execute("""
    CREATE TABLE IF NOT EXISTS channel_account_usage_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
        message_id text,
        credit_deducted numeric(10, 4) NOT NULL DEFAULT 0.0000,
        wallet_transaction_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_channel_usage_tenant_acc ON channel_account_usage_ledger(tenant_id, channel_account_id, created_at DESC);
    """)

    # 11. Tabel mtproto_sessions
    op.execute("""
    CREATE TABLE IF NOT EXISTS mtproto_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        session_string text,
        session_key_id text NOT NULL,
        api_id_ref text NOT NULL,
        device_model text NOT NULL DEFAULT 'OrchestreeAI Server',
        last_authorized_at timestamptz,
        status text NOT NULL DEFAULT 'qr_pending' CHECK (status IN ('qr_pending', 'authorized', 'revoked', 'error')),
        qr_token text,
        qr_expires_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_mtproto_sessions_channel_account UNIQUE (channel_account_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mtproto_sessions_tenant_status ON mtproto_sessions(tenant_id, status);
    """)

    # 12. Tabel conversations
    op.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        customer_channel_identity_id uuid REFERENCES customer_channel_identities(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING_STAFF', 'RESOLVED', 'CLOSED')),
        assigned_agent_id uuid,
        assigned_type text NOT NULL DEFAULT 'AI' CHECK (assigned_type IN ('AI', 'HUMAN')),
        channel_thread_id text,
        last_message_preview text,
        last_message_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
    """)

    # 13. Tabel conversation_messages
    op.execute("""
    CREATE TABLE IF NOT EXISTS conversation_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
        sender_type text NOT NULL CHECK (sender_type IN ('CUSTOMER', 'AI_AGENT', 'HUMAN_STAFF', 'SYSTEM')),
        sender_identifier text,
        content_text text NOT NULL,
        media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        external_message_id text,
        delivery_status text NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_created ON conversation_messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_conv_messages_tenant ON conversation_messages(tenant_id, created_at DESC);
    """)

    # 14. Tabel conversation_intents
    op.execute("""
    CREATE TABLE IF NOT EXISTS conversation_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        intent_name text NOT NULL,
        confidence numeric(4, 3) NOT NULL,
        extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
        detected_by text NOT NULL DEFAULT 'MODEL_ROUTER',
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_conv_intents_conv ON conversation_intents(conversation_id);
    """)

    # 15. Tabel conversation_handovers
    op.execute("""
    CREATE TABLE IF NOT EXISTS conversation_handovers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        from_agent_type text NOT NULL DEFAULT 'AI',
        to_agent_type text NOT NULL DEFAULT 'HUMAN',
        handover_reason text NOT NULL,
        summary_context text,
        assigned_to_user_id uuid,
        status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'RESOLVED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_conv_handovers_tenant_status ON conversation_handovers(tenant_id, status);
    """)

    # 16. RLS FORCE bertenant untuk 15 tabel baru
    tables = [
        "customers",
        "channel_accounts",
        "customer_channel_identities",
        "customer_attributes",
        "customer_segments",
        "customer_funnel_state",
        "customer_merge_log",
        "channel_account_permissions",
        "channel_account_persona_assignments",
        "channel_account_usage_ledger",
        "mtproto_sessions",
        "conversations",
        "conversation_messages",
        "conversation_intents",
        "conversation_handovers"
    ]

    for table in tables:
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};
        CREATE POLICY tenant_isolation_{table} ON {table}
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        """)

    # 17. Grant privileges to orchestree_app
    op.execute(f"""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON {", ".join(tables)} TO orchestree_app;
        END IF;
    END $$;
    """)

    # 18. Registrasi kapabilitas fitur ke feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (code, name, description, module_name, is_active)
    VALUES 
        ('OMNICHANNEL_CUSTOMER_IDENTITY_RESOLUTION', 'Resolusi Identitas Pelanggan Omnichannel', 'Penggabungan identitas otomatis (EXACT/STRONG) dan human review untuk WEAK match', 'sales_marketing', true),
        ('TELEGRAM_MTPROTO_CHANNEL_GATEWAY', 'Gateway Kanal Telegram MTProto', 'Koneksi akun Telegram pribadi/bisnis nyata via QR Code resmi dan persistent session', 'channel_gateway', true),
        ('OMNICHANNEL_CONVERSATIONS_AND_INBOX', 'Kotak Masuk Percakapan Omnichannel Terpadu', 'Pusat kendali obrolan real-time WhatsApp dan Telegram dengan pemotongan kredit terpadu', 'sales_marketing', true)
    ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    tables = [
        "conversation_handovers",
        "conversation_intents",
        "conversation_messages",
        "conversations",
        "mtproto_sessions",
        "channel_account_usage_ledger",
        "channel_account_persona_assignments",
        "channel_account_permissions",
        "customer_merge_log",
        "customer_funnel_state",
        "customer_segments",
        "customer_attributes",
        "customer_channel_identities",
        "channel_accounts",
        "customers"
    ]

    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    op.execute("""
    DELETE FROM feature_capabilities 
    WHERE code IN (
        'OMNICHANNEL_CUSTOMER_IDENTITY_RESOLUTION',
        'TELEGRAM_MTPROTO_CHANNEL_GATEWAY',
        'OMNICHANNEL_CONVERSATIONS_AND_INBOX'
    );
    """)
