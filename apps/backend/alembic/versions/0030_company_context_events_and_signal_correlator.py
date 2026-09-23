"""Company Context Events & Cross-System Signal Correlator (PRD v2.2 Bagian 8.13.1, 3.5, 14.2)

Revision ID: 0030_company_context_events_and_correlator
Revises: 0029_ai_data_permissions
Create Date: 2026-09-23 05:00:00.000000

Skema:
- Tabel company_context_events: Korelator sinyal sintesis lintas sistem korporat
- Tabel company_context_signals: Sinyal granular dengan klasifikasi source_type ('Native', 'Synced', 'Uploaded')
- RLS FORCE terisolasi per tenant
- Feature capabilities: company_context.events.view, company_context.signals.correlate, company_context.signals.ingest
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0030_company_context_events_and_correlator"
down_revision: Union[str, None] = "0029_ai_data_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel company_context_events (Sintesis & Korelasi Sinyal Lintas Sistem)
    op.execute("""
    CREATE TABLE IF NOT EXISTS company_context_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL DEFAULT 'CROSS_SYSTEM_SYNTHESIS',
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        correlation_score NUMERIC(5, 4) NOT NULL DEFAULT 0.8500,
        source_types TEXT[] NOT NULL DEFAULT '{}',
        source_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
        insights JSONB NOT NULL DEFAULT '{}'::jsonb,
        recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSED', 'FLAGGED', 'RESOLVED', 'DISMISSED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_company_context_events_tenant_created
    ON company_context_events(tenant_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_company_context_events_status
    ON company_context_events(tenant_id, status);
    """)

    # 2. Tabel company_context_signals (Sinyal Granular Sumber Traceable)
    op.execute("""
    CREATE TABLE IF NOT EXISTS company_context_signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('Native', 'Synced', 'Uploaded')),
        source_system VARCHAR(100) NOT NULL,
        signal_type VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_ref_id VARCHAR(255),
        correlated_event_id UUID REFERENCES company_context_events(id) ON DELETE SET NULL,
        ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_company_context_signals_tenant_source
    ON company_context_signals(tenant_id, source_type, ingested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_company_context_signals_correlated
    ON company_context_signals(correlated_event_id);
    """)

    # 3. Penegakan Row Level Security (RLS) FORCE terisolasi per tenant
    op.execute("""
    ALTER TABLE company_context_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE company_context_events FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_company_context_events ON company_context_events;
    CREATE POLICY tenant_isolation_company_context_events ON company_context_events
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE company_context_signals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE company_context_signals FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_company_context_signals ON company_context_signals;
    CREATE POLICY tenant_isolation_company_context_signals ON company_context_signals
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    GRANT ALL ON company_context_events TO authenticated, orchestree_app;
    GRANT ALL ON company_context_signals TO authenticated, orchestree_app;
    """)

    # 4. Registrasi Kapabilitas Fitur
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('company_context.events.view', 2, 'Melihat riwayat event konteks korporat dan korelasi sinyal lintas sistem'),
        ('company_context.signals.ingest', 2, 'Mengunggah dan mengalirkan sinyal dari sumber Native, Synced, atau Uploaded'),
        ('company_context.signals.correlate', 3, 'Menjalankan korelator sinyal lintas sistem otomatis AI Chief of Staff (Tier 3 Enterprise)')
    ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'company_context.events.view',
        'company_context.signals.ingest',
        'company_context.signals.correlate'
    );
    DROP TABLE IF EXISTS company_context_signals CASCADE;
    DROP TABLE IF EXISTS company_context_events CASCADE;
    """)
