"""ai agent live state cognitive monitoring

Revision ID: 0057_ai_agent_live_state_cognitive_monitoring
Revises: 0056_onboarding_persona_and_company_brain
Create Date: 2026-09-26 16:30:00.000000

Live AI Cognitive Monitoring Panel & Realtime Agent State (PRD v2.2 Bagian 25.2, 8.1, 3.5, 14 & 18):
1. Tabel ai_agent_live_state (Satu baris per eksekusi AI Agent aktif, updated realtime oleh Orchestration Engine)
2. Aturan privasi: Metadata operasional generik tanpa konten prompt/output LLM
3. RLS: Super Admin membaca semua baris; Tenant hanya membaca baris miliknya
4. Registrasi kapabilitas admin.cognitive_monitoring.view dan ai_agent.live_state.manage
5. Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0057_ai_agent_live_state_cognitive_monitoring'
down_revision: Union[str, None] = '0056_onboarding_persona_and_company_brain'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel ai_agent_live_state
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_agent_live_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        ai_agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
        workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
        current_status text NOT NULL CHECK (current_status IN (
            'idle', 'thinking', 'calling_tool', 'generating_image',
            'retrieving_memory', 'waiting_approval', 'error', 'completed'
        )),
        current_step_label text NOT NULL,
        current_tool_name text,
        confidence_score numeric(5,2),
        source_channel text DEFAULT 'internal',
        started_at timestamptz NOT NULL DEFAULT now(),
        last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ai_agent_workflow_execution UNIQUE (ai_agent_id, workflow_execution_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_tenant ON ai_agent_live_state(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_agent ON ai_agent_live_state(ai_agent_id);
    CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_status ON ai_agent_live_state(current_status);
    CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_heartbeat ON ai_agent_live_state(last_heartbeat_at);

    ALTER TABLE ai_agent_live_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_agent_live_state FORCE ROW LEVEL SECURITY;

    -- Policy Super Admin: dapat membaca seluruh status live lintas-tenant
    DROP POLICY IF EXISTS ai_agent_live_state_super_admin_select ON ai_agent_live_state;
    CREATE POLICY ai_agent_live_state_super_admin_select ON ai_agent_live_state
        FOR SELECT
        USING (
            current_setting('app.actor_type', true) = 'superadmin'
            OR current_setting('app.role_code', true) IN ('SUPER_ADMIN', 'PLATFORM_SUPERADMIN')
            OR current_setting('request.jwt.claim.role', true) = 'service_role'
        );

    -- Policy Tenant: hanya dapat membaca baris milik tenant_id sendiri
    DROP POLICY IF EXISTS ai_agent_live_state_tenant_select ON ai_agent_live_state;
    CREATE POLICY ai_agent_live_state_tenant_select ON ai_agent_live_state
        FOR SELECT
        USING (
            tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        );

    -- Policy Insert/Update/Delete (Service Role & Engine internal)
    DROP POLICY IF EXISTS ai_agent_live_state_modify ON ai_agent_live_state;
    CREATE POLICY ai_agent_live_state_modify ON ai_agent_live_state
        FOR ALL
        USING (
            tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('request.jwt.claim.role', true) = 'service_role'
            OR current_setting('app.actor_type', true) = 'superadmin'
            OR current_setting('app.role_code', true) IN ('SUPER_ADMIN', 'PLATFORM_SUPERADMIN')
        )
        WITH CHECK (
            tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('request.jwt.claim.role', true) = 'service_role'
            OR current_setting('app.actor_type', true) = 'superadmin'
            OR current_setting('app.role_code', true) IN ('SUPER_ADMIN', 'PLATFORM_SUPERADMIN')
        );

    -- 2. Registrasi kapabilitas fitur
    INSERT INTO feature_capabilities (capability_code, description, domain, risk_tier)
    VALUES
        ('admin.cognitive_monitoring.view', 'Pemantauan Visual Kognitif AI Lintas Tenant Super Admin', 'admin', 'low'),
        ('ai_agent.live_state.manage', 'Manajemen & Publikasi Detak Live State Agen AI', 'workforce', 'low')
    ON CONFLICT (capability_code) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_code IN ('admin.cognitive_monitoring.view', 'ai_agent.live_state.manage');
    DROP TABLE IF EXISTS ai_agent_live_state CASCADE;
    """)
