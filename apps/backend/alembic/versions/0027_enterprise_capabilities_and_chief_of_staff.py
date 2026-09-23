"""Enterprise Capabilities Matrix, AI Chief of Staff & Integration Fabric (PRD v2.2 Bagian 3.4, 3.5)

Revision ID: 0027_enterprise_capabilities_and_chief_of_staff
Revises: 0026_generative_studio_and_brand_locks
Create Date: 2026-09-29 02:00:00.000000

Skema:
- Tabel chief_of_staff_events (Event ingestion, status PROCESSED vs REJECTED_TIER_DOWNGRADE)
- Tabel chief_of_staff_briefings (Executive Morning Briefings, KPI snapshot, rekomendasi aksi)
- Tabel integration_fabric_connectors (Konektor enterprise kustom, status ACTIVE vs SUSPENDED_TIER_DOWNGRADE)
- RLS FORCE bertenant pada seluruh 3 tabel
- Registrasi seluruh kapabilitas Enterprise-only (Integration Fabric, Company Context Fabric, Specialist Agents, AI Chief of Staff, Enterprise Command Center) ke feature_capabilities (min_tier_level = 3)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0027_enterprise_capabilities_and_chief_of_staff"
down_revision: Union[str, None] = "0026_generative_studio_and_brand_locks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Chief of Staff Events
    op.execute("""
    CREATE TABLE IF NOT EXISTS chief_of_staff_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
        title text NOT NULL,
        summary text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'PROCESSED'
            CHECK (status IN ('PENDING', 'PROCESSED', 'REJECTED_TIER_DOWNGRADE', 'ARCHIVED')),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_cos_events_tenant_created
        ON chief_of_staff_events(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cos_events_status
        ON chief_of_staff_events(tenant_id, status);
    """)

    # 2. Chief of Staff Executive Briefings
    op.execute("""
    CREATE TABLE IF NOT EXISTS chief_of_staff_briefings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        briefing_date date NOT NULL DEFAULT CURRENT_DATE,
        executive_summary text NOT NULL,
        department_highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
        kpi_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        generated_by text NOT NULL DEFAULT 'Arya (AI Chief of Staff)',
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_cos_briefings_tenant_date
        ON chief_of_staff_briefings(tenant_id, briefing_date DESC);
    """)

    # 3. Integration Fabric Connectors
    op.execute("""
    CREATE TABLE IF NOT EXISTS integration_fabric_connectors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_code text NOT NULL,
        connector_name text NOT NULL,
        connector_type text NOT NULL
            CHECK (connector_type IN ('WEBHOOK_BROKER', 'DATA_STREAM_PIPELINE', 'ERP_SAP_ORACLE', 'CUSTOM_RPC')),
        status text NOT NULL DEFAULT 'ACTIVE'
            CHECK (status IN ('ACTIVE', 'SUSPENDED_TIER_DOWNGRADE', 'DISABLED')),
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_sync_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_connector UNIQUE (tenant_id, connector_code)
    );

    CREATE INDEX IF NOT EXISTS idx_if_connectors_tenant_status
        ON integration_fabric_connectors(tenant_id, status);
    """)

    # 4. RLS FORCE Policies
    op.execute("""
    ALTER TABLE chief_of_staff_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chief_of_staff_events FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS cos_events_tenant_isolation ON chief_of_staff_events;
    CREATE POLICY cos_events_tenant_isolation ON chief_of_staff_events
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE chief_of_staff_briefings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chief_of_staff_briefings FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS cos_briefings_tenant_isolation ON chief_of_staff_briefings;
    CREATE POLICY cos_briefings_tenant_isolation ON chief_of_staff_briefings
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE integration_fabric_connectors ENABLE ROW LEVEL SECURITY;
    ALTER TABLE integration_fabric_connectors FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS if_connectors_tenant_isolation ON integration_fabric_connectors;
    CREATE POLICY if_connectors_tenant_isolation ON integration_fabric_connectors
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    GRANT ALL ON chief_of_staff_events TO authenticated, orchestree_app;
    GRANT ALL ON chief_of_staff_briefings TO authenticated, orchestree_app;
    GRANT ALL ON integration_fabric_connectors TO authenticated, orchestree_app;
    """)

    # 5. Registrasi Enterprise-Only Capabilities (min_tier_level = 3)
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        -- Domain 1: Integration Fabric
        ('integration.fabric.manage', 3, 'Kelola enterprise integration fabric, webhook broker terdistribusi, dan konektor kustom'),
        ('integration.fabric.connectors.create', 3, 'Membuat konektor enterprise pihak ketiga kustom dengan SLA terdedikasi'),
        ('integration.fabric.sync.stream', 3, 'Streaming sinkronisasi data enterprise real-time lintas sistem'),

        -- Domain 2: Company Context Fabric
        ('context.fabric.manage', 3, 'Kelola knowledge graph enterprise, multi-sumber sinkronisasi ontologi korporat'),
        ('context.fabric.query', 3, 'Kueri federasi multi-dokumen tingkat lanjut dengan reranking lintas departemen'),
        ('context.fabric.knowledge_graph.write', 3, 'Penulisan dan ingest otomatis entitas ke Company Context Graph'),

        -- Domain 3: Specialist Agents
        ('specialist.agents.cfo.access', 3, 'Akses pekerja AI spesialis CFO eksekutif dan pemodelan proyeksi finansial'),
        ('specialist.agents.deep_domain.create', 3, 'Mendaftarkan dan mengonfigurasi AI Agent spesialis domain khusus'),
        ('specialist.agents.executive.delegate', 3, 'Delegasi sasaran strategis dari eksekutif ke agen spesialis multi-departemen'),

        -- Domain 4: AI Chief of Staff
        ('chief_of_staff.briefing.generate', 3, 'Sintesis otomatis Executive Morning Briefing lintas performa departemen'),
        ('chief_of_staff.events.ingest', 3, 'Menerima dan memproses event orkestrasi real-time untuk AI Chief of Staff (Arya)'),
        ('chief_of_staff.orchestration.dispatch', 3, 'Instruksi otomatis dan penyelarasan beban kerja lintas departemen oleh Chief of Staff'),

        -- Domain 5: Enterprise Command Center
        ('command_center.executive.view', 3, 'Pusat kendali eksekutif real-time dengan metrik global seluruh departemen'),
        ('command_center.global_kpi.manage', 3, 'Kelola KPI global perusahaan, threshold alert anomali, dan alokasi sumber daya'),
        ('command_center.audit_vault.export', 3, 'Ekspor audit log terenkripsi dan pembuktian kepatuhan regulasi korporat')
    ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;

    -- Mapping permission ke roles TENANT_OWNER & TENANT_ADMIN
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN feature_capabilities c
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
      AND c.min_tier_level = 3
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'integration.fabric.manage', 'integration.fabric.connectors.create', 'integration.fabric.sync.stream',
        'context.fabric.manage', 'context.fabric.query', 'context.fabric.knowledge_graph.write',
        'specialist.agents.cfo.access', 'specialist.agents.deep_domain.create', 'specialist.agents.executive.delegate',
        'chief_of_staff.briefing.generate', 'chief_of_staff.events.ingest', 'chief_of_staff.orchestration.dispatch',
        'command_center.executive.view', 'command_center.global_kpi.manage', 'command_center.audit_vault.export'
    );

    DELETE FROM feature_capabilities WHERE capability_key IN (
        'integration.fabric.manage', 'integration.fabric.connectors.create', 'integration.fabric.sync.stream',
        'context.fabric.manage', 'context.fabric.query', 'context.fabric.knowledge_graph.write',
        'specialist.agents.cfo.access', 'specialist.agents.deep_domain.create', 'specialist.agents.executive.delegate',
        'chief_of_staff.briefing.generate', 'chief_of_staff.events.ingest', 'chief_of_staff.orchestration.dispatch',
        'command_center.executive.view', 'command_center.global_kpi.manage', 'command_center.audit_vault.export'
    );

    DROP TABLE IF EXISTS integration_fabric_connectors CASCADE;
    DROP TABLE IF EXISTS chief_of_staff_briefings CASCADE;
    DROP TABLE IF EXISTS chief_of_staff_events CASCADE;
    """)
