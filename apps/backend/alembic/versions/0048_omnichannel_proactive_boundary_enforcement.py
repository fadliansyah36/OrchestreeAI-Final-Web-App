"""Omnichannel and Proactive Strict Boundary and Blocking Enforcement

Revision ID: 0048_omnichannel_proactive_boundary_enforcement
Revises: 0047_selection_audit_lifecycle_and_abac
Create Date: 2026-09-25 09:00:00.000000

Skema:
- Audience scope pada memory_documents ('internal_only', 'customer_facing_safe', 'both')
- Context scope pada ai_agents ('internal', 'customer_facing')
- Context scope pada mcp_tools ('internal_only', 'customer_facing_allowed')
- sender_allowlist_enforced pada proactive_official_channels
- Tabel proactive_verified_senders dengan RLS bertenant
- Tabel cross_boundary_violation_log dengan RLS bertenant
- Registrasi kapabilitas 'boundary.enforce' dan 'boundary.violation.view'
- Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0048_omnichannel_proactive_boundary_enforcement"
down_revision: Union[str, None] = "0047_selection_audit_lifecycle_and_abac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Audience scope pada Semantic Memory (memory_documents)
    op.execute("""
    ALTER TABLE memory_documents 
    ADD COLUMN IF NOT EXISTS audience_scope text NOT NULL DEFAULT 'internal_only'
    CHECK (audience_scope IN ('internal_only', 'customer_facing_safe', 'both'));

    CREATE INDEX IF NOT EXISTS idx_memory_documents_audience 
    ON memory_documents (tenant_id, audience_scope);
    """)

    # 2. Context scope pada AI Agent (ai_agents)
    op.execute("""
    ALTER TABLE ai_agents 
    ADD COLUMN IF NOT EXISTS context_scope text NOT NULL DEFAULT 'internal'
    CHECK (context_scope IN ('internal', 'customer_facing'));

    CREATE INDEX IF NOT EXISTS idx_ai_agents_context_scope 
    ON ai_agents (tenant_id, context_scope);
    """)

    # 3. Context scope pada MCP Tool (mcp_tools)
    op.execute("""
    ALTER TABLE mcp_tools 
    ADD COLUMN IF NOT EXISTS context_scope text NOT NULL DEFAULT 'internal_only'
    CHECK (context_scope IN ('internal_only', 'customer_facing_allowed'));

    CREATE INDEX IF NOT EXISTS idx_mcp_tools_context_scope 
    ON mcp_tools (context_scope);
    """)

    # 4. Allow-list pengirim resmi untuk kanal Proactive
    op.execute("""
    ALTER TABLE proactive_official_channels 
    ADD COLUMN IF NOT EXISTS sender_allowlist_enforced boolean NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS proactive_verified_senders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        proactive_official_channel_id uuid NOT NULL REFERENCES proactive_official_channels(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        external_identifier_hash text NOT NULL,
        verified_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_proactive_verified_sender UNIQUE (proactive_official_channel_id, external_identifier_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_proactive_verified_senders_lookup 
    ON proactive_verified_senders (proactive_official_channel_id, external_identifier_hash);

    CREATE INDEX IF NOT EXISTS idx_proactive_verified_senders_tenant 
    ON proactive_verified_senders (tenant_id);
    """)

    # 5. Audit khusus percobaan pelanggaran boundary
    op.execute("""
    CREATE TABLE IF NOT EXISTS cross_boundary_violation_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
        violation_type text NOT NULL CHECK (violation_type IN
            ('memory_leak_blocked', 'tool_call_blocked', 'unverified_sender_blocked',
             'agent_dual_context_blocked', 'output_sanitization_blocked')),
        context_detail jsonb NOT NULL,
        blocked_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_cross_boundary_violation_log_tenant 
    ON cross_boundary_violation_log (tenant_id, violation_type, blocked_at DESC);
    """)

    # 6. RLS Enforcement untuk proactive_verified_senders dan cross_boundary_violation_log
    op.execute("""
    ALTER TABLE proactive_verified_senders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE proactive_verified_senders FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_proactive_verified_senders ON proactive_verified_senders;
    CREATE POLICY tenant_isolation_proactive_verified_senders ON proactive_verified_senders
        FOR ALL
        USING (
            tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        );

    ALTER TABLE cross_boundary_violation_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cross_boundary_violation_log FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_cross_boundary_violation_log ON cross_boundary_violation_log;
    CREATE POLICY tenant_isolation_cross_boundary_violation_log ON cross_boundary_violation_log
        FOR ALL
        USING (
            tenant_id IS NULL
            OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        );

    -- Grant hak akses ke role runtime orchestree_app
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_verified_senders TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON cross_boundary_violation_log TO orchestree_app;
        END IF;
    END $$;
    """)

    # 7. Pendaftaran Kapabilitas Baru pada feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'boundary.enforce', 1, 'Strict Boundary & Blocking antara agen customer-facing dan internal-facing'),
        (gen_random_uuid(), 'boundary.violation.view', 1, 'Melihat jejak audit percobaan pelanggaran batas lintas konteks AI')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    # 1. Hapus Kapabilitas
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN ('boundary.enforce', 'boundary.violation.view');
    """)

    # 2. Hapus Tabel & RLS
    op.execute("""
    DROP TABLE IF EXISTS cross_boundary_violation_log CASCADE;
    DROP TABLE IF EXISTS proactive_verified_senders CASCADE;
    """)

    # 3. Hapus Kolom Tambahan
    op.execute("""
    ALTER TABLE proactive_official_channels DROP COLUMN IF EXISTS sender_allowlist_enforced;
    ALTER TABLE mcp_tools DROP COLUMN IF EXISTS context_scope;
    ALTER TABLE ai_agents DROP COLUMN IF EXISTS context_scope;
    ALTER TABLE memory_documents DROP COLUMN IF EXISTS audience_scope;
    """)
