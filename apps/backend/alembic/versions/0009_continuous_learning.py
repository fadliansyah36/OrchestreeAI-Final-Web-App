"""Inisialisasi Continuous Learning & Agent Confidence Feedback Loop (PRD v2.2 Bagian 8.11)

Revision ID: 0009_continuous_learning
Revises: 0008_cognitive_core
Create Date: 2026-09-22 13:00:00.000000

Skema Continuous Learning:
- Tabel agent_decision_outcomes: Rekaman jejak keputusan tiap node workflow dengan verifikasi objektif.
- Tabel agent_lesson_learned: Sintesis pembelajaran dari pola keputusan berulang (valid jika sample_size >= MIN_SAMPLE_SIZE).
- Tabel agent_skill_confidence: Skor kepercayaan dinamis per skill dengan peluruhan waktu (time-decay).
- Tabel agent_skill_growth_log: Buku catatan perubahan confidence score dan peristiwa pembelajaran.
- Penegakan RLS FORCE bertenant pada seluruh tabel.
- Registrasi kapabilitas sistem continuous learning ke feature_capabilities dan role_permissions.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0009_continuous_learning"
down_revision: Union[str, None] = "0008_cognitive_core"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel agent_decision_outcomes
    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_decision_outcomes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
        workflow_node_run_id uuid REFERENCES workflow_node_runs(id) ON DELETE CASCADE,
        node_key text NOT NULL,
        decision_type text NOT NULL,
        input_state jsonb NOT NULL DEFAULT '{}'::jsonb,
        action_taken jsonb NOT NULL DEFAULT '{}'::jsonb,
        objective_outcome text NOT NULL DEFAULT 'SUCCESS',
        evaluation_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
        verified_by_system boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS node_run_id uuid REFERENCES workflow_node_runs(id) ON DELETE CASCADE;
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS context_input jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS decision_output jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS objective_success boolean NOT NULL DEFAULT true;
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS confidence_score numeric(5, 4) NOT NULL DEFAULT 1.0000;
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS verification_source text NOT NULL DEFAULT 'system_runtime';
    ALTER TABLE agent_decision_outcomes ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_agent_decision_outcomes_tenant ON agent_decision_outcomes(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_decision_outcomes_exec ON agent_decision_outcomes(workflow_execution_id);
    CREATE INDEX IF NOT EXISTS idx_agent_decision_outcomes_node ON agent_decision_outcomes(node_key);
    """)

    # 2. Tabel agent_lesson_learned
    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_lesson_learned (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        skill_name text NOT NULL,
        context_pattern text NOT NULL DEFAULT '*',
        lesson_summary text NOT NULL,
        sample_size integer NOT NULL DEFAULT 1,
        min_sample_threshold integer NOT NULL DEFAULT 3,
        is_validated boolean NOT NULL DEFAULT false,
        success_rate numeric(5, 4) NOT NULL DEFAULT 1.0000,
        confidence_score numeric(5, 4) NOT NULL DEFAULT 0.8500,
        last_applied_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE agent_lesson_learned ADD COLUMN IF NOT EXISTS skill_key text;
    ALTER TABLE agent_lesson_learned ADD COLUMN IF NOT EXISTS lesson_type text NOT NULL DEFAULT 'BEST_PRACTICE';
    ALTER TABLE agent_lesson_learned ADD COLUMN IF NOT EXISTS trigger_condition jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE agent_lesson_learned ADD COLUMN IF NOT EXISTS prescribed_action jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE agent_lesson_learned ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    -- Sinkronisasi skill_key dan skill_name
    UPDATE agent_lesson_learned SET skill_key = skill_name WHERE skill_key IS NULL;

    CREATE INDEX IF NOT EXISTS idx_agent_lesson_learned_tenant ON agent_lesson_learned(tenant_id, skill_name);
    """)

    # 3. Tabel agent_skill_confidence
    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_skill_confidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        skill_name text NOT NULL,
        confidence_score numeric(5, 4) NOT NULL DEFAULT 0.8500,
        total_invocations integer NOT NULL DEFAULT 0,
        successful_invocations integer NOT NULL DEFAULT 0,
        last_updated_at timestamptz NOT NULL DEFAULT now(),
        decay_rate_per_day numeric(5, 4) NOT NULL DEFAULT 0.0500,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS skill_key text;
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS current_confidence numeric(5, 4) NOT NULL DEFAULT 0.8500;
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS failed_invocations integer NOT NULL DEFAULT 0;
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS decay_half_life_days integer NOT NULL DEFAULT 14;
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS last_calculated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS last_decay_applied_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE agent_skill_confidence ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    -- Sinkronisasi skill_key dan skill_name serta current_confidence
    UPDATE agent_skill_confidence SET skill_key = skill_name WHERE skill_key IS NULL;
    UPDATE agent_skill_confidence SET current_confidence = confidence_score WHERE current_confidence IS NULL;

    ALTER TABLE agent_skill_confidence DROP CONSTRAINT IF EXISTS agent_skill_confidence_tenant_id_agent_id_skill_name_key;
    ALTER TABLE agent_skill_confidence ADD CONSTRAINT agent_skill_confidence_tenant_id_agent_id_skill_name_key UNIQUE NULLS NOT DISTINCT (tenant_id, agent_id, skill_name);

    CREATE INDEX IF NOT EXISTS idx_agent_skill_confidence_lookup ON agent_skill_confidence(tenant_id, skill_name);
    """)

    # 4. Tabel agent_skill_growth_log
    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_skill_growth_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        skill_name text NOT NULL,
        previous_confidence numeric(5, 4) NOT NULL DEFAULT 0.8500,
        new_confidence numeric(5, 4) NOT NULL DEFAULT 0.8500,
        trigger_event text NOT NULL DEFAULT 'NODE_EXECUTION',
        delta numeric(5, 4) NOT NULL DEFAULT 0.0000,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE agent_skill_growth_log ADD COLUMN IF NOT EXISTS skill_key text;
    ALTER TABLE agent_skill_growth_log ADD COLUMN IF NOT EXISTS delta_confidence numeric(5, 4) NOT NULL DEFAULT 0.0000;
    ALTER TABLE agent_skill_growth_log ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'NODE_EXECUTION';
    ALTER TABLE agent_skill_growth_log ADD COLUMN IF NOT EXISTS outcome_id uuid REFERENCES agent_decision_outcomes(id) ON DELETE SET NULL;

    UPDATE agent_skill_growth_log SET skill_key = skill_name WHERE skill_key IS NULL;
    UPDATE agent_skill_growth_log SET delta_confidence = delta WHERE delta_confidence IS NULL;
    UPDATE agent_skill_growth_log SET reason = trigger_event WHERE reason IS NULL;

    CREATE INDEX IF NOT EXISTS idx_agent_skill_growth_tenant ON agent_skill_growth_log(tenant_id, created_at DESC);
    """)

    # 5. Row-Level Security (RLS FORCE) pada seluruh tabel bertenant
    op.execute("""
    -- RLS untuk agent_decision_outcomes
    ALTER TABLE agent_decision_outcomes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_decision_outcomes FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_agent_decision_outcomes ON agent_decision_outcomes;
    CREATE POLICY tenant_isolation_agent_decision_outcomes ON agent_decision_outcomes
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

    -- RLS untuk agent_lesson_learned
    ALTER TABLE agent_lesson_learned ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_lesson_learned FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_agent_lesson_learned ON agent_lesson_learned;
    CREATE POLICY tenant_isolation_agent_lesson_learned ON agent_lesson_learned
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

    -- RLS untuk agent_skill_confidence
    ALTER TABLE agent_skill_confidence ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_skill_confidence FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_agent_skill_confidence ON agent_skill_confidence;
    CREATE POLICY tenant_isolation_agent_skill_confidence ON agent_skill_confidence
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

    -- RLS untuk agent_skill_growth_log
    ALTER TABLE agent_skill_growth_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_skill_growth_log FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_agent_skill_growth_log ON agent_skill_growth_log;
    CREATE POLICY tenant_isolation_agent_skill_growth_log ON agent_skill_growth_log
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

    -- Grants
    GRANT ALL ON TABLE agent_decision_outcomes TO orchestree_app, postgres;
    GRANT ALL ON TABLE agent_lesson_learned TO orchestree_app, postgres;
    GRANT ALL ON TABLE agent_skill_confidence TO orchestree_app, postgres;
    GRANT ALL ON TABLE agent_skill_growth_log TO orchestree_app, postgres;
    """)

    # 6. Registrasi kapabilitas fitur continuous learning
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('learning.outcome.view', 0, 'Melihat jejak evaluasi objektif keputusan node workflow agen'),
        ('learning.lesson.view', 0, 'Melihat repositori lesson learned yang telah tervalidasi'),
        ('learning.confidence.view', 0, 'Melihat skor kepercayaan skill dan riwayat growth log'),
        ('learning.feedback.submit', 0, 'Memberikan koreksi atau feedback objektif terhadap outcome keputusan')
    ON CONFLICT (capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('learning.outcome.view'),
            ('learning.lesson.view'),
            ('learning.confidence.view'),
            ('learning.feedback.submit')
    ) AS c(capability_key)
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN')
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('learning.outcome.view'),
            ('learning.lesson.view'),
            ('learning.confidence.view')
    ) AS c(capability_key)
    WHERE r.role_code IN ('DEPT_MANAGER', 'STAFF_HUMAN', 'STAFF_AI')
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    tables = [
        "agent_skill_growth_log",
        "agent_skill_confidence",
        "agent_lesson_learned",
        "agent_decision_outcomes",
    ]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_policy ON {tbl};")
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")

    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'learning.outcome.view', 'learning.lesson.view', 'learning.confidence.view', 'learning.feedback.submit'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'learning.outcome.view', 'learning.lesson.view', 'learning.confidence.view', 'learning.feedback.submit'
    );
    """)
