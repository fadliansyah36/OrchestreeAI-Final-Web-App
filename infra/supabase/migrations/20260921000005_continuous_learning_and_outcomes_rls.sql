-- Migrasi Reversible: 005_continuous_learning_and_outcomes_rls.sql
-- Pembelajaran Berkelanjutan & Evaluasi Keputusan Agen per PRD v2.2 Bagian 8.11, 15, dan 20.1

BEGIN

-- 1. Tabel Bertenant: agent_decision_outcomes (Evaluasi Objektif Hasil Eksekusi Node)
CREATE TABLE IF NOT EXISTS agent_decision_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    workflow_node_run_id uuid REFERENCES workflow_node_runs(id) ON DELETE SET NULL,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    node_key text NOT NULL,
    decision_type text NOT NULL,
    input_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    action_taken jsonb NOT NULL DEFAULT '{}'::jsonb,
    objective_outcome text NOT NULL CHECK (objective_outcome IN ('success', 'failed', 'partial')),
    evaluation_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_by_system boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_agent_decision_outcomes_tenant ON agent_decision_outcomes(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_decision_outcomes_exec ON agent_decision_outcomes(workflow_execution_id);

-- 2. Tabel Bertenant: agent_lesson_learned (Distilasi Pelajaran Terbukti Empiris)
CREATE TABLE IF NOT EXISTS agent_lesson_learned (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    skill_name text NOT NULL,
    context_pattern text NOT NULL,
    lesson_summary text NOT NULL,
    sample_size int NOT NULL DEFAULT 1,
    min_sample_threshold int NOT NULL DEFAULT 3,
    is_validated boolean NOT NULL DEFAULT false,
    success_rate numeric(5, 2) NOT NULL DEFAULT 0.00,
    confidence_score numeric(5, 2) NOT NULL DEFAULT 0.50,
    last_applied_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, skill_name, context_pattern)
)

CREATE INDEX IF NOT EXISTS idx_agent_lesson_learned_tenant ON agent_lesson_learned(tenant_id, skill_name);

-- 3. Tabel Bertenant: agent_skill_confidence (Tingkat Keyakinan Keahlian Agen & Decay)
CREATE TABLE IF NOT EXISTS agent_skill_confidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    skill_name text NOT NULL,
    confidence_score numeric(5, 2) NOT NULL DEFAULT 0.80 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    total_invocations int NOT NULL DEFAULT 0,
    successful_invocations int NOT NULL DEFAULT 0,
    last_updated_at timestamptz NOT NULL DEFAULT now(),
    decay_rate_per_day numeric(5, 4) NOT NULL DEFAULT 0.0100,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, agent_id, skill_name)
)

CREATE INDEX IF NOT EXISTS idx_agent_skill_confidence_lookup ON agent_skill_confidence(tenant_id, skill_name);

-- 4. Tabel Bertenant: agent_skill_growth_log (Audit Pertumbuhan Keahlian)
CREATE TABLE IF NOT EXISTS agent_skill_growth_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    skill_name text NOT NULL,
    previous_confidence numeric(5, 2) NOT NULL,
    new_confidence numeric(5, 2) NOT NULL,
    trigger_event text NOT NULL,
    delta numeric(5, 2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_agent_skill_growth_tenant ON agent_skill_growth_log(tenant_id, created_at DESC);

-- 5. Row Level Security (RLS) FORCE pada Semua Tabel Pembelajaran
ALTER TABLE agent_decision_outcomes ENABLE ROW LEVEL SECURITY

ALTER TABLE agent_decision_outcomes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_agent_decision_outcomes ON agent_decision_outcomes;

CREATE POLICY tenant_isolation_agent_decision_outcomes ON agent_decision_outcomes
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE agent_lesson_learned ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent_lesson_learned FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_agent_lesson_learned ON agent_lesson_learned;

CREATE POLICY tenant_isolation_agent_lesson_learned ON agent_lesson_learned
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE agent_skill_confidence ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent_skill_confidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_agent_skill_confidence ON agent_skill_confidence;

CREATE POLICY tenant_isolation_agent_skill_confidence ON agent_skill_confidence
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE agent_skill_growth_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent_skill_growth_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_agent_skill_growth_log ON agent_skill_growth_log;

CREATE POLICY tenant_isolation_agent_skill_growth_log ON agent_skill_growth_log
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Hak DML ke runtime database role orchestree_app jika ada
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_decision_outcomes TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_lesson_learned TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_skill_confidence TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_skill_growth_log TO orchestree_app;
    END IF;
END $$

-- 6. Registrasi Feature Capabilities Baru untuk Continuous Learning
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('learning.outcomes.view', 0, 'Akses melihat jejak evaluasi dan hasil keputusan agen otonom'),
    ('learning.skills.manage', 1, 'Akses pemantauan pertumbuhan dan keyakinan skill agen')
ON CONFLICT (capability_key) DO NOTHING

-- 7. Pemetaan Role
INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'learning.outcomes.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'learning.skills.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER')
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
