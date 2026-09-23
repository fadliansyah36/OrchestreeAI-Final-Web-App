"""Company Context Fabric 8 Dimensions & AI Research Agent with 6-Level Knowledge Priority Hierarchy (PRD v2.2 Bagian 8.6, 8.13.1, 3.5)

Revision ID: 0031_company_context_fabric_and_research_agent
Revises: 0030_company_context_events_and_correlator
Create Date: 2026-09-23 06:00:00.000000

Skema:
- Tabel company_context_dimensions: 8 Dimensi Inti Company Context Fabric
- Tabel company_context_knowledge_nodes: Node pengetahuan domain per dimensi dengan penanda prioritas 1-6
- Tabel tenant_research_policies: Pengaturan kebijakan riset tenant (penegakan eksplisit izin web publik)
- Tabel ai_research_queries: Audit query AI Research Agent dengan penelusuran sumber (traceability)
- RLS FORCE terisolasi per tenant pada seluruh tabel
- Feature capabilities:
  - context.fabric.dimensions.view (min_tier_level 2)
  - context.fabric.dimensions.manage (min_tier_level 3)
  - enterprise.research_agent.execute (min_tier_level 3)
  - enterprise.research_agent.web_search (min_tier_level 3)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0031_company_context_fabric_and_research_agent"
down_revision: Union[str, None] = "0030_company_context_events_and_correlator"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel company_context_dimensions (8 Dimensi Inti)
    op.execute("""
    CREATE TABLE IF NOT EXISTS company_context_dimensions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        dimension_code VARCHAR(50) NOT NULL CHECK (dimension_code IN (
            'ORGANIZATIONAL_STRUCTURE',
            'STRATEGY_AND_OBJECTIVES',
            'PRODUCTS_AND_SERVICES',
            'PROCESSES_AND_SOPS',
            'BRAND_AND_IDENTITY',
            'FINANCIALS_AND_BUDGET',
            'COMPLIANCE_AND_LEGAL',
            'CUSTOMER_AND_MARKET'
        )),
        dimension_name VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING_REVIEW', 'ARCHIVED')),
        weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_context_dimension UNIQUE (tenant_id, dimension_code)
    );

    CREATE INDEX IF NOT EXISTS idx_company_context_dimensions_tenant
    ON company_context_dimensions(tenant_id, dimension_code);
    """)

    # 2. Tabel company_context_knowledge_nodes
    op.execute("""
    CREATE TABLE IF NOT EXISTS company_context_knowledge_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        dimension_id UUID REFERENCES company_context_dimensions(id) ON DELETE CASCADE,
        dimension_code VARCHAR(50) NOT NULL,
        node_key VARCHAR(150) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        priority_level INT NOT NULL DEFAULT 1 CHECK (priority_level BETWEEN 1 AND 6),
        source_classification VARCHAR(20) NOT NULL CHECK (source_classification IN ('Native', 'Synced', 'Uploaded', 'External')),
        source_reference VARCHAR(255),
        tags TEXT[] NOT NULL DEFAULT '{}',
        is_verified BOOLEAN NOT NULL DEFAULT true,
        verified_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_dimension_node_key UNIQUE (tenant_id, dimension_code, node_key)
    );

    CREATE INDEX IF NOT EXISTS idx_company_context_nodes_lookup
    ON company_context_knowledge_nodes(tenant_id, dimension_code, priority_level);
    """)

    # 3. Tabel tenant_research_policies
    op.execute("""
    CREATE TABLE IF NOT EXISTS tenant_research_policies (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        allow_public_web_search BOOLEAN NOT NULL DEFAULT false,
        max_research_depth INT NOT NULL DEFAULT 3,
        require_traceability_citations BOOLEAN NOT NULL DEFAULT true,
        allowed_domains TEXT[] NOT NULL DEFAULT '{}',
        blocked_domains TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)

    # 4. Tabel ai_research_queries
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_research_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID,
        query_text TEXT NOT NULL,
        research_objective TEXT,
        knowledge_levels_consulted INT[] NOT NULL DEFAULT '{}',
        sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
        public_web_search_attempted BOOLEAN NOT NULL DEFAULT false,
        public_web_search_allowed BOOLEAN NOT NULL DEFAULT false,
        answer_text TEXT NOT NULL,
        traceability_report JSONB NOT NULL DEFAULT '{}'::jsonb,
        confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9000,
        latency_ms INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_research_queries_tenant
    ON ai_research_queries(tenant_id, created_at DESC);
    """)

    # 5. Row Level Security FORCE
    op.execute("""
    ALTER TABLE company_context_dimensions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE company_context_dimensions FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_company_context_dimensions ON company_context_dimensions;
    CREATE POLICY tenant_isolation_company_context_dimensions ON company_context_dimensions
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE company_context_knowledge_nodes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE company_context_knowledge_nodes FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_company_context_knowledge_nodes ON company_context_knowledge_nodes;
    CREATE POLICY tenant_isolation_company_context_knowledge_nodes ON company_context_knowledge_nodes
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE tenant_research_policies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_research_policies FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_tenant_research_policies ON tenant_research_policies;
    CREATE POLICY tenant_isolation_tenant_research_policies ON tenant_research_policies
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE ai_research_queries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_research_queries FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_ai_research_queries ON ai_research_queries;
    CREATE POLICY tenant_isolation_ai_research_queries ON ai_research_queries
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    GRANT ALL ON company_context_dimensions TO authenticated, orchestree_app;
    GRANT ALL ON company_context_knowledge_nodes TO authenticated, orchestree_app;
    GRANT ALL ON tenant_research_policies TO authenticated, orchestree_app;
    GRANT ALL ON ai_research_queries TO authenticated, orchestree_app;
    """)

    # 6. Registrasi feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('context.fabric.dimensions.view', 2, 'Melihat 8 dimensi Company Context Fabric korporat'),
        ('context.fabric.dimensions.manage', 3, 'Mengonfigurasi bobot dan entitas 8 dimensi Company Context Fabric'),
        ('enterprise.research_agent.execute', 3, 'Menjalankan AI Research Agent dengan 6 tingkat Knowledge Priority Hierarchy'),
        ('enterprise.research_agent.web_search', 3, 'Mengonfigurasi dan mengaktifkan akses riset web publik untuk AI Research Agent')
    ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'context.fabric.dimensions.view',
        'context.fabric.dimensions.manage',
        'enterprise.research_agent.execute',
        'enterprise.research_agent.web_search'
    );

    DROP TABLE IF EXISTS ai_research_queries CASCADE;
    DROP TABLE IF EXISTS tenant_research_policies CASCADE;
    DROP TABLE IF EXISTS company_context_knowledge_nodes CASCADE;
    DROP TABLE IF EXISTS company_context_dimensions CASCADE;
    """)
