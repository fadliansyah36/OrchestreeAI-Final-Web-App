"""Specialist Agent Registry, Project Health Scores, and Multi-Agent Parallel Collaboration (PRD v2.2 Bagian 8.13.7)

Revision ID: 0035_specialist_agents_project_health_and_collaboration
Revises: 0034_event_definitions_and_knowledge_rules
Create Date: 2026-09-23 14:00:00.000000

Skema:
- Tabel specialist_agent_registry: Registrasi agen spesialis domain dengan framework prompt dan kapabilitas
- Tabel project_health_scores: Skor kesehatan inisiatif/proyek lintas metrik (jadwal, anggaran, risiko)
- Tabel multi_agent_collaboration_sessions: Sesi kolaborasi multi-agent paralel dengan penelusuran kontribusi agen (traceability)
- RLS FORCE terisolasi per tenant
- Pendaftaran feature_capabilities untuk project health dan multi-agent collaboration
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0035_specialist_agents_project_health_and_collaboration"
down_revision: Union[str, None] = "0034_event_definitions_and_knowledge_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel specialist_agent_registry
    op.execute("""
    CREATE TABLE IF NOT EXISTS specialist_agent_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_code VARCHAR(100) NOT NULL,
        specialization_domain VARCHAR(100) NOT NULL CHECK (specialization_domain IN (
            'FINANCE',
            'SUPPLY_CHAIN',
            'LEGAL',
            'COMMERCIAL',
            'TECHNOLOGY',
            'WORKFORCE',
            'OPERATIONS',
            'RISK_GOVERNANCE'
        )),
        display_name VARCHAR(150) NOT NULL,
        description TEXT,
        persona_type VARCHAR(100) NOT NULL DEFAULT 'SPECIALIST_ANALYST',
        system_prompt_framework TEXT NOT NULL,
        capabilities TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_specialist_agent UNIQUE (tenant_id, agent_code)
    );

    CREATE INDEX IF NOT EXISTS idx_specialist_agents_tenant
        ON specialist_agent_registry(tenant_id, specialization_domain, is_active);
    """)

    # 2. Tabel project_health_scores
    op.execute("""
    CREATE TABLE IF NOT EXISTS project_health_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_ref_id VARCHAR(255) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        overall_health_score NUMERIC(5, 2) NOT NULL CHECK (overall_health_score BETWEEN 0 AND 100),
        health_status VARCHAR(50) NOT NULL CHECK (health_status IN ('CRITICAL', 'AT_RISK', 'MODERATE', 'HEALTHY', 'EXCELLENT')),
        schedule_adherence_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
        budget_burn_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
        resource_allocation_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
        risk_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
        metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_project_health UNIQUE (tenant_id, project_ref_id)
    );

    CREATE INDEX IF NOT EXISTS idx_project_health_tenant
        ON project_health_scores(tenant_id, health_status);
    """)

    # 3. Tabel multi_agent_collaboration_sessions
    # Menyimpan sesi kolaborasi paralel dengan penelusuran (traceability) kontribusi masing-masing agen
    op.execute("""
    CREATE TABLE IF NOT EXISTS multi_agent_collaboration_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_ref_id VARCHAR(255) NOT NULL,
        session_topic VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN (
            'INITIALIZING',
            'IN_PROGRESS',
            'SYNTHESIZING',
            'COMPLETED',
            'FAILED'
        )),
        participating_agent_codes TEXT[] NOT NULL DEFAULT '{}',
        agent_contributions JSONB NOT NULL DEFAULT '[]'::jsonb,
        executive_recommendation JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_multi_agent_collab_tenant
        ON multi_agent_collaboration_sessions(tenant_id, project_ref_id, status);
    """)

    # 4. RLS Isolation Policies
    op.execute("""
    ALTER TABLE specialist_agent_registry ENABLE ROW LEVEL SECURITY;
    ALTER TABLE specialist_agent_registry FORCE ROW LEVEL SECURITY;

    CREATE POLICY specialist_agent_registry_tenant_isolation ON specialist_agent_registry
        FOR ALL TO authenticated
        USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid)
        WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid);

    ALTER TABLE project_health_scores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE project_health_scores FORCE ROW LEVEL SECURITY;

    CREATE POLICY project_health_scores_tenant_isolation ON project_health_scores
        FOR ALL TO authenticated
        USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid)
        WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid);

    ALTER TABLE multi_agent_collaboration_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE multi_agent_collaboration_sessions FORCE ROW LEVEL SECURITY;

    CREATE POLICY multi_agent_collab_tenant_isolation ON multi_agent_collaboration_sessions
        FOR ALL TO authenticated
        USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid)
        WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid);
    """)

    # 5. Registrasi Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (
        code, domain, name, description, min_tier_level, requires_addon, metadata, created_at, updated_at
    ) VALUES 
        (
            'enterprise.project_health.view',
            'enterprise',
            'Project Health Diagnostic & Scoring',
            'Pemantauan skor kesehatan inisiatif proyek komprehensif (jadwal, anggaran, alokasi sumber daya)',
            3,
            false,
            '{"supported_tiers": ["ENTERPRISE"]}'::jsonb,
            now(),
            now()
        ),
        (
            'enterprise.multi_agent_collaboration.execute',
            'enterprise',
            'Multi-Agent Parallel Collaboration & Executive Recommendation',
            'Kolaborasi paralel agen spesialis lintas domain dengan sintesis rekomendasi eksekutif terverifikasi',
            3,
            false,
            '{"supported_tiers": ["ENTERPRISE"]}'::jsonb,
            now(),
            now()
        )
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        min_tier_level = EXCLUDED.min_tier_level,
        updated_at = now();
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE code IN (
        'enterprise.project_health.view',
        'enterprise.multi_agent_collaboration.execute'
    );
    DROP TABLE IF EXISTS multi_agent_collaboration_sessions CASCADE;
    DROP TABLE IF EXISTS project_health_scores CASCADE;
    DROP TABLE IF EXISTS specialist_agent_registry CASCADE;
    """)
