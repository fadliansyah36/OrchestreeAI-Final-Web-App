"""Marketing Campaigns, Audience Resolution, Content Calendar F.01-SOCIAL, Metadata Scrubbing, Marketplace Ingestion (PRD v2.2 Bagian 11.12.7, 12.6, 14)

Revision ID: 0021_campaigns_marketing_and_social_calendar
Revises: 0020_commerce_catalog_orders_payments_shipments
Create Date: 2026-09-24 00:00:00.000000

Skema:
- Tabel campaigns, campaign_audiences, campaign_messages, campaign_sends
- Tabel content_calendar_items, metadata_scrub_logs
- Tabel marketplace_integrations, marketplace_order_syncs
- RLS FORCE bertenant pada seluruh 8 tabel
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0021_campaigns_marketing_and_social_calendar"
down_revision: Union[str, None] = "0020_commerce_catalog_orders_payments_shipments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Campaigns
    op.execute("""
    CREATE TABLE IF NOT EXISTS campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        objective text NOT NULL DEFAULT 'CONVERSION'
            CHECK (objective IN ('AWARENESS', 'RETENTION', 'CONVERSION', 'WINBACK', 'UPSELL')),
        status text NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
        segment_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
        channel_types jsonb NOT NULL DEFAULT '["WHATSAPP"]'::jsonb,
        message_template text NOT NULL,
        scheduled_at timestamptz,
        started_at timestamptz,
        completed_at timestamptz,
        total_audience int NOT NULL DEFAULT 0,
        total_sent int NOT NULL DEFAULT 0,
        total_delivered int NOT NULL DEFAULT 0,
        total_failed int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status 
    ON campaigns(tenant_id, status);
    """)

    # 2. Campaign Audiences
    op.execute("""
    CREATE TABLE IF NOT EXISTS campaign_audiences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        channel text NOT NULL,
        recipient_address text NOT NULL,
        dynamic_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'EXCLUDED')),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_audiences_tenant_campaign 
    ON campaign_audiences(tenant_id, campaign_id);
    """)

    # 3. Campaign Messages
    op.execute("""
    CREATE TABLE IF NOT EXISTS campaign_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        template_content text NOT NULL,
        channel_type text NOT NULL,
        media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_messages_tenant_campaign 
    ON campaign_messages(tenant_id, campaign_id);
    """)

    # 4. Campaign Sends
    op.execute("""
    CREATE TABLE IF NOT EXISTS campaign_sends (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        audience_id uuid NOT NULL REFERENCES campaign_audiences(id) ON DELETE CASCADE,
        channel text NOT NULL,
        message_body text NOT NULL,
        dispatch_id text,
        status text NOT NULL DEFAULT 'QUEUED'
            CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
        failure_reason text,
        sent_at timestamptz,
        delivered_at timestamptz,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_sends_tenant_campaign 
    ON campaign_sends(tenant_id, campaign_id);
    """)

    # 5. Content Calendar Items (F.01-SOCIAL)
    op.execute("""
    CREATE TABLE IF NOT EXISTS content_calendar_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title text NOT NULL,
        caption text NOT NULL,
        media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        channels jsonb NOT NULL DEFAULT '["INSTAGRAM"]'::jsonb,
        scheduled_publish_at timestamptz NOT NULL,
        published_at timestamptz,
        status text NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT', 'SCHEDULED', 'METADATA_CLEANING', 'READY_TO_PUBLISH', 'PUBLISHED', 'FAILED')),
        metadata_scrub_status text NOT NULL DEFAULT 'dirty'
            CHECK (metadata_scrub_status IN ('dirty', 'scrubbing', 'clean', 'failed')),
        disclose_ai_generated boolean NOT NULL DEFAULT FALSE,
        failure_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_content_calendar_tenant_schedule 
    ON content_calendar_items(tenant_id, scheduled_publish_at);
    """)

    # 6. Metadata Scrub Logs
    op.execute("""
    CREATE TABLE IF NOT EXISTS metadata_scrub_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        content_calendar_item_id uuid NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
        original_filename text NOT NULL,
        scrubbed_filename text NOT NULL,
        stripped_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        scrubbed_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'SUCCESS'
            CHECK (status IN ('SUCCESS', 'FAILED'))
    );

    CREATE INDEX IF NOT EXISTS idx_metadata_scrub_logs_tenant_item 
    ON metadata_scrub_logs(tenant_id, content_calendar_item_id);
    """)

    # 7. Marketplace Integrations
    op.execute("""
    CREATE TABLE IF NOT EXISTS marketplace_integrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel text NOT NULL
            CHECK (channel IN ('SHOPEE', 'TOKOPEDIA', 'TIKTOK_SHOP', 'BLIBLI')),
        shop_id text NOT NULL,
        shop_name text NOT NULL,
        credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT TRUE,
        sync_status text NOT NULL DEFAULT 'SYNCED'
            CHECK (sync_status IN ('SYNCED', 'SYNCING', 'ERROR', 'DISCONNECTED')),
        last_synced_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id, channel, shop_id)
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_tenant 
    ON marketplace_integrations(tenant_id);
    """)

    # 8. Marketplace Order Syncs
    op.execute("""
    CREATE TABLE IF NOT EXISTS marketplace_order_syncs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        marketplace_channel text NOT NULL,
        external_order_id text NOT NULL,
        internal_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        marketplace_status text NOT NULL,
        sync_direction text NOT NULL DEFAULT 'INBOUND'
            CHECK (sync_direction IN ('INBOUND', 'OUTBOUND')),
        last_synced_at timestamptz NOT NULL DEFAULT now(),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE(tenant_id, marketplace_channel, external_order_id)
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_order_syncs_tenant 
    ON marketplace_order_syncs(tenant_id, marketplace_channel, external_order_id);
    """)

    # Enforce Row-Level Security on all 8 tables
    tables = [
        "campaigns",
        "campaign_audiences",
        "campaign_messages",
        "campaign_sends",
        "content_calendar_items",
        "metadata_scrub_logs",
        "marketplace_integrations",
        "marketplace_order_syncs",
    ]

    for table in tables:
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS {table}_tenant_isolation_policy ON {table};
        CREATE POLICY {table}_tenant_isolation_policy ON {table}
        AS RESTRICTIVE
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        """)

    # Register Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_name, description, module_name, is_active)
    VALUES 
        (gen_random_uuid(), 'CAP_MARKETING_CAMPAIGNS', 'Omnichannel Marketing Campaigns & Parameterized Segment Resolution', 'marketing', true),
        (gen_random_uuid(), 'CAP_SOCIAL_CONTENT_CALENDAR', 'F.01-SOCIAL Content Calendar Scheduling Engine', 'social', true),
        (gen_random_uuid(), 'CAP_METADATA_SCRUBBER', 'Mandatory EXIF/XMP/IPTC/C2PA Image Metadata Stripping Before Publishing', 'social', true),
        (gen_random_uuid(), 'CAP_MARKETPLACE_TRANSACTIONAL', 'Tenant Marketplace Transactional Ingestion & Two-Way Sync', 'marketplace', true),
        (gen_random_uuid(), 'CAP_COMMERCIAL_INTENT_DETECTOR', 'Meta and TikTok Commercial Intent Detection & Automated Direct Messaging', 'marketing', true)
    ON CONFLICT (capability_name) DO UPDATE 
    SET description = EXCLUDED.description, is_active = true;
    """)


def downgrade() -> None:
    tables = [
        "marketplace_order_syncs",
        "marketplace_integrations",
        "metadata_scrub_logs",
        "content_calendar_items",
        "campaign_sends",
        "campaign_messages",
        "campaign_audiences",
        "campaigns",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_name IN (
        'CAP_MARKETING_CAMPAIGNS',
        'CAP_SOCIAL_CONTENT_CALENDAR',
        'CAP_METADATA_SCRUBBER',
        'CAP_MARKETPLACE_TRANSACTIONAL',
        'CAP_COMMERCIAL_INTENT_DETECTOR'
    );
    """)
