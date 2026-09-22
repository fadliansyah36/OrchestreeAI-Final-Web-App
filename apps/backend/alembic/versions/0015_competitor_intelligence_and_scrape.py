"""Implementasi Competitor Targets, Snapshots, Change Events, Scored Insights, Reports, dan RLS FORCE Bertenant

Revision ID: 0015_competitor_intelligence_and_scrape
Revises: 0014_workforce_performance_and_scoring
Create Date: 2026-09-22 20:00:00.000000

Skema Market & Competitor Intelligence (PRD v2.2 Bagian 7.1 & 11.4):
- Tabel competitor_targets: Sasaran pemantauan kompetitor, frekuensi, adapter F.01-SCRAPE, dan status robots.txt
- Tabel competitor_snapshots: Hasil ekstraksi snapshot data halaman berstruktur LLM (content hash SHA-256)
- Tabel competitor_change_events: Deteksi perubahan granular (harga, produk baru, diskon, kampanye)
- Tabel competitor_insights: Hasil kalkulasi scoring gating (novelty, relevance, urgency, impact, final_score)
- Tabel competitor_reports: Laporan sintesis berkala dan battle card
- FORCE ROW LEVEL SECURITY bertenant pada seluruh tabel
- Hak akses DML penuh kepada role orchestree_app
- Registrasi feature capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0015_competitor_intelligence_and_scrape"
down_revision: Union[str, None] = "0014_workforce_performance_and_scoring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. competitor_targets
    op.execute("""
    CREATE TABLE IF NOT EXISTS competitor_targets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        domain text NOT NULL,
        target_type text NOT NULL DEFAULT 'web' CHECK (target_type IN ('web', 'marketplace', 'social', 'news')),
        target_url text NOT NULL,
        category text NOT NULL DEFAULT 'direct_competitor',
        frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('hourly', 'daily', 'weekly', 'manual')),
        is_active boolean NOT NULL DEFAULT true,
        crawler_adapter text NOT NULL DEFAULT 'WebAdapter' CHECK (crawler_adapter IN ('WebAdapter', 'MarketplaceAdapter', 'SocialAdapter')),
        robots_txt_status text NOT NULL DEFAULT 'allowed' CHECK (robots_txt_status IN ('allowed', 'disallowed', 'unreachable', 'bypassed_public_api')),
        last_scraped_at timestamptz,
        last_status text NOT NULL DEFAULT 'pending' CHECK (last_status IN ('pending', 'running', 'success', 'failed', 'blocked_by_robots')),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comp_targets_tenant ON competitor_targets(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_comp_targets_domain ON competitor_targets(domain);
    """)

    # 2. competitor_snapshots
    op.execute("""
    CREATE TABLE IF NOT EXISTS competitor_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        target_id uuid NOT NULL REFERENCES competitor_targets(id) ON DELETE CASCADE,
        crawl_url text NOT NULL,
        status_code int NOT NULL DEFAULT 200,
        content_hash text NOT NULL,
        extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_text_summary text,
        llm_extraction_model text NOT NULL DEFAULT 'meta-llama/llama-3.3-70b-instruct',
        token_usage int NOT NULL DEFAULT 0,
        scraped_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comp_snapshots_target_date ON competitor_snapshots(target_id, scraped_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comp_snapshots_tenant ON competitor_snapshots(tenant_id, scraped_at DESC);
    """)

    # 3. competitor_change_events
    op.execute("""
    CREATE TABLE IF NOT EXISTS competitor_change_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        target_id uuid NOT NULL REFERENCES competitor_targets(id) ON DELETE CASCADE,
        previous_snapshot_id uuid REFERENCES competitor_snapshots(id) ON DELETE SET NULL,
        current_snapshot_id uuid NOT NULL REFERENCES competitor_snapshots(id) ON DELETE CASCADE,
        change_type text NOT NULL CHECK (change_type IN ('price_drop', 'price_increase', 'new_product', 'product_discontinued', 'campaign_launch', 'positioning_shift', 'stock_change', 'website_redesign', 'other')),
        title text NOT NULL,
        description text NOT NULL,
        diff_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        detected_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comp_changes_tenant ON competitor_change_events(tenant_id, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comp_changes_target ON competitor_change_events(target_id, detected_at DESC);
    """)

    # 4. competitor_insights
    op.execute("""
    CREATE TABLE IF NOT EXISTS competitor_insights (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        target_id uuid REFERENCES competitor_targets(id) ON DELETE SET NULL,
        change_event_id uuid REFERENCES competitor_change_events(id) ON DELETE SET NULL,
        title text NOT NULL,
        summary text NOT NULL,
        category text NOT NULL DEFAULT 'pricing' CHECK (category IN ('pricing', 'product', 'marketing', 'market_shift', 'regulatory', 'general')),
        novelty_score numeric NOT NULL DEFAULT 0.5 CHECK (novelty_score >= 0 AND novelty_score <= 1.0),
        relevance_score numeric NOT NULL DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1.0),
        urgency_score numeric NOT NULL DEFAULT 0.5 CHECK (urgency_score >= 0 AND urgency_score <= 1.0),
        business_impact_score numeric NOT NULL DEFAULT 0.5 CHECK (business_impact_score >= 0 AND business_impact_score <= 1.0),
        final_score numeric NOT NULL DEFAULT 0.5 CHECK (final_score >= 0 AND final_score <= 1.0),
        dispatch_action text NOT NULL CHECK (dispatch_action IN ('SEND_IMMEDIATE', 'INCLUDE_DIGEST', 'DISCARD')),
        strategic_recommendation text NOT NULL,
        counter_strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
        proactive_dispatched boolean NOT NULL DEFAULT false,
        proactive_message_id uuid REFERENCES proactive_messages_log(id) ON DELETE SET NULL,
        idempotency_key text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comp_insights_tenant ON competitor_insights(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comp_insights_action ON competitor_insights(dispatch_action, proactive_dispatched);
    """)

    # 5. competitor_reports
    op.execute("""
    CREATE TABLE IF NOT EXISTS competitor_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        report_type text NOT NULL CHECK (report_type IN ('weekly_digest', 'monthly_landscape', 'ad_hoc_analysis', 'battle_card')),
        title text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        summary_markdown text NOT NULL,
        key_takeaways jsonb NOT NULL DEFAULT '[]'::jsonb,
        competitor_benchmarks jsonb NOT NULL DEFAULT '[]'::jsonb,
        action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'generated' CHECK (status IN ('draft', 'generating', 'generated', 'archived')),
        created_by uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comp_reports_tenant ON competitor_reports(tenant_id, created_at DESC);
    """)

    # 6. RLS FORCE bertenant
    op.execute("""
    ALTER TABLE competitor_targets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE competitor_targets FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON competitor_targets;
    CREATE POLICY tenant_isolation_policy ON competitor_targets
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE competitor_snapshots FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON competitor_snapshots;
    CREATE POLICY tenant_isolation_policy ON competitor_snapshots
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE competitor_change_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE competitor_change_events FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON competitor_change_events;
    CREATE POLICY tenant_isolation_policy ON competitor_change_events
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE competitor_insights ENABLE ROW LEVEL SECURITY;
    ALTER TABLE competitor_insights FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON competitor_insights;
    CREATE POLICY tenant_isolation_policy ON competitor_insights
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE competitor_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE competitor_reports FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON competitor_reports;
    CREATE POLICY tenant_isolation_policy ON competitor_reports
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON competitor_targets, competitor_snapshots, competitor_change_events, competitor_insights, competitor_reports TO orchestree_app;
        END IF;
    END $$;

    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('intelligence.competitor.read', 0, 'Melihat target kompetitor, log scraping, dan deteksi perubahan pasar'),
        ('intelligence.competitor.write', 1, 'Menambah atau mengonfigurasi target crawler kompetitor dan adapter'),
        ('intelligence.competitor.crawl', 1, 'Memicu scraping instan F.01-SCRAPE dan gating perubahan'),
        ('intelligence.insights.dispatch', 2, 'Mengirim rekomendasi strategis ke Proactive Agent kanal resmi'),
        ('intelligence.reports.generate', 2, 'Membuat laporan sintesis kompetitor dan battle card komparatif')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'intelligence.competitor.read',
        'intelligence.competitor.write',
        'intelligence.competitor.crawl',
        'intelligence.insights.dispatch',
        'intelligence.reports.generate'
    );
    DROP TABLE IF EXISTS competitor_reports CASCADE;
    DROP TABLE IF EXISTS competitor_insights CASCADE;
    DROP TABLE IF EXISTS competitor_change_events CASCADE;
    DROP TABLE IF EXISTS competitor_snapshots CASCADE;
    DROP TABLE IF EXISTS competitor_targets CASCADE;
    """)
