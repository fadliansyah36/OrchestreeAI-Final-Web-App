-- Migrasi Reversible: 004_cognitive_core_orchestration_and_mcp_rls.sql
-- Inti Kognitif Sistem: Workflow Engine, Model Router, LLM Logs, dan MCP Tools per PRD v2.2 Bagian 8.1, 8.2, 11.2, 15, dan 20.1

BEGIN

-- 1. Tabel Reference Global: llm_providers (Katalog Penyedia Model LLM)
CREATE TABLE IF NOT EXISTS llm_providers (
    id text PRIMARY KEY,
    display_name text NOT NULL,
    base_url text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
    last_health_check timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
)

-- 2. Tabel Reference Global: llm_models (Daftar Model Tersedia Dinamis)
CREATE TABLE IF NOT EXISTS llm_models (
    id text PRIMARY KEY,
    provider_id text NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
    model_identifier text NOT NULL,
    context_window int NOT NULL DEFAULT 8192,
    input_cost_per_million numeric(12, 4) NOT NULL DEFAULT 0.0000,
    output_cost_per_million numeric(12, 4) NOT NULL DEFAULT 0.0000,
    capabilities jsonb NOT NULL DEFAULT '{"chat": true}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);

-- 3. Tabel Bertenant: model_routing_rules
CREATE TABLE IF NOT EXISTS model_routing_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_type text NOT NULL,
    primary_model_id text NOT NULL REFERENCES llm_models(id),
    fallback_model_id text REFERENCES llm_models(id),
    priority int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_model_routing_tenant ON model_routing_rules(tenant_id, task_type);

-- 4. Tabel Bertenant: llm_usage_logs (Audit Konsumsi Token Nyata)
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_execution_id uuid,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    prompt_tokens int NOT NULL DEFAULT 0,
    completion_tokens int NOT NULL DEFAULT 0,
    total_tokens int NOT NULL DEFAULT 0,
    latency_ms numeric(10, 2) NOT NULL DEFAULT 0.0,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant ON llm_usage_logs(tenant_id, created_at);

-- 5. Tabel Reference Global: mcp_tools (Registri Alat F.01-MCP)
CREATE TABLE IF NOT EXISTS mcp_tools (
    id text PRIMARY KEY,
    tool_name text NOT NULL UNIQUE,
    risk_tier text NOT NULL CHECK (risk_tier IN ('low', 'medium', 'high', 'critical')),
    input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
)

-- 6. Tabel Bertenant: tool_permissions (Otorisasi Alat per Role Organisasi)
CREATE TABLE IF NOT EXISTS tool_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_code text NOT NULL,
    tool_name text NOT NULL REFERENCES mcp_tools(tool_name) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, role_code, tool_name)
)

CREATE INDEX IF NOT EXISTS idx_tool_permissions_lookup ON tool_permissions(tenant_id, role_code);

-- 7. Tabel Bertenant: tool_invocations (Audit Ledger Pemanggilan Alat)
CREATE TABLE IF NOT EXISTS tool_invocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_execution_id uuid,
    tool_name text NOT NULL,
    input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_payload jsonb,
    status text NOT NULL CHECK (status IN ('started', 'success', 'failed', 'blocked')),
    duration_ms numeric(10, 2),
    invoked_by uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant ON tool_invocations(tenant_id, created_at);

-- 8. Tabel Reference Global: tool_health_checks
CREATE TABLE IF NOT EXISTS tool_health_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name text NOT NULL,
    status text NOT NULL,
    latency_ms numeric(10, 2),
    checked_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_tool_health_checks_name ON tool_health_checks(tool_name, checked_at);

-- 9. Tabel Bertenant: workflow_definitions (Graph Spec disimpan sebagai Data)
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    graph_spec jsonb NOT NULL,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant ON workflow_definitions(tenant_id);

-- 10. Tabel Bertenant: workflow_executions (Durable Execution & Checkpoints)
CREATE TABLE IF NOT EXISTS workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_definition_id uuid REFERENCES workflow_definitions(id) ON DELETE SET NULL,
    intent_text text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    current_node_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_workflow_executions_tenant ON workflow_executions(tenant_id, created_at);

-- 11. Tabel Reference Definisi Node dalam Graph
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    node_key text NOT NULL,
    node_type text NOT NULL CHECK (node_type IN ('CLASSIFY', 'PLAN', 'TOOL_CALL', 'LLM_GENERATE', 'HUMAN_APPROVAL', 'PERSONA_HANDOFF', 'DELIVER')),
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_def ON workflow_nodes(workflow_definition_id);

-- 12. Tabel Bertenant: workflow_node_runs (Jejak Node & Resume State)
CREATE TABLE IF NOT EXISTS workflow_node_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    node_key text NOT NULL,
    node_type text NOT NULL,
    status text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'paused')),
    input_state jsonb,
    output_state jsonb,
    error_detail text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
)

CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_exec ON workflow_node_runs(workflow_execution_id);

CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_tenant ON workflow_node_runs(tenant_id);

-- 13. Terapkan Row Level Security (RLS) FORCE pada Semua Tabel Bertenant
ALTER TABLE model_routing_rules ENABLE ROW LEVEL SECURITY

ALTER TABLE model_routing_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_model_routing ON model_routing_rules;

CREATE POLICY tenant_isolation_model_routing ON model_routing_rules
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE llm_usage_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_llm_usage ON llm_usage_logs;

CREATE POLICY tenant_isolation_llm_usage ON llm_usage_logs
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tool_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE tool_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tool_permissions ON tool_permissions;

CREATE POLICY tenant_isolation_tool_permissions ON tool_permissions
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE tool_invocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tool_invocations ON tool_invocations;

CREATE POLICY tenant_isolation_tool_invocations ON tool_invocations
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_workflow_definitions ON workflow_definitions;

CREATE POLICY tenant_isolation_workflow_definitions ON workflow_definitions
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflow_executions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_workflow_executions ON workflow_executions;

CREATE POLICY tenant_isolation_workflow_executions ON workflow_executions
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE workflow_node_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflow_node_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_workflow_node_runs ON workflow_node_runs;

CREATE POLICY tenant_isolation_workflow_node_runs ON workflow_node_runs
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Hak DML ke runtime database role orchestree_app jika tersedia
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON model_routing_rules TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON llm_usage_logs TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tool_permissions TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tool_invocations TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_definitions TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_executions TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_nodes TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_node_runs TO orchestree_app;
        GRANT SELECT ON llm_providers TO orchestree_app;
        GRANT SELECT ON llm_models TO orchestree_app;
        GRANT SELECT ON mcp_tools TO orchestree_app;
        GRANT SELECT, INSERT ON tool_health_checks TO orchestree_app;
    END IF;
END $$

-- 14. Seeding Default LLM Providers (Katalog Resmi)
INSERT INTO llm_providers (id, display_name, base_url, is_active, health_status)
VALUES
    ('nvidia', 'NVIDIA NIM Inference Microservice', 'https://integrate.api.nvidia.com/v1', true, 'unknown'),
    ('openrouter', 'OpenRouter AI Gateway', 'https://openrouter.ai/api/v1', true, 'unknown'),
    ('openai', 'GPT-Image-2 / OpenAI Platform', 'https://api.apimart.ai/v1/images/generations', true, 'unknown'),
    ('gemini', 'Google GenAI Platform', 'https://generativelanguage.googleapis.com', true, 'unknown')
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    base_url = EXCLUDED.base_url

-- 15. Seeding LLM Models Resmi
INSERT INTO llm_models (id, provider_id, model_identifier, context_window, input_cost_per_million, output_cost_per_million, capabilities)
VALUES
    ('nvidia/meta/llama-3.3-70b-instruct', 'nvidia', 'meta/llama-3.3-70b-instruct', 131072, 0.7000, 0.9000, '{"chat": true, "tools": true}'::jsonb),
    ('nvidia/deepseek-ai/deepseek-r1', 'nvidia', 'deepseek-ai/deepseek-r1', 65536, 0.8000, 2.4000, '{"chat": true, "reasoning": true}'::jsonb),
    ('openrouter/anthropic/claude-3.5-sonnet', 'openrouter', 'anthropic/claude-3.5-sonnet', 200000, 3.0000, 15.0000, '{"chat": true, "tools": true}'::jsonb),
    ('openrouter/deepseek/deepseek-chat', 'openrouter', 'deepseek/deepseek-chat', 65536, 0.1400, 0.2800, '{"chat": true}'::jsonb),
    ('openai/gpt-image-2', 'openai', 'gpt-image-2', 2048, 0.0400, 0.0400, '{"image": true}'::jsonb),
    ('gemini/gemini-2.5-flash', 'gemini', 'gemini-2.5-flash', 1048576, 0.0750, 0.3000, '{"chat": true, "multimodal": true, "tools": true}'::jsonb)
ON CONFLICT (id) DO NOTHING

-- 16. Seeding Default MCP Tools (OrchestreeAI F.01-MCP)
INSERT INTO mcp_tools (id, tool_name, risk_tier, input_schema, output_schema, description, is_active)
VALUES
    ('tool-knowledge-lookup', 'knowledge.lookup', 'low', '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'::jsonb, '{"type": "object", "properties": {"results": {"type": "array"}}}'::jsonb, 'Mencari rujukan dokumen dan kebijakan kerja organisasi', true),
    ('tool-task-create', 'task.create_from_intent', 'medium', '{"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}, "priority": {"type": "string"}}, "required": ["title"]}'::jsonb, '{"type": "object", "properties": {"task_id": {"type": "string"}, "status": {"type": "string"}}}'::jsonb, 'Membuat kartu tugas baru di papan koordinasi tim secara otomatis', true)
ON CONFLICT (id) DO NOTHING

-- 17. Seeding Feature Capabilities Baru untuk Inti Kognitif
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('orchestration.workflow.dispatch', 0, 'Kemampuan memicu eksekusi alur kerja kognitif otonom'),
    ('orchestration.workflow.view', 0, 'Kemampuan melihat status eksekusi alur kerja'),
    ('admin.llm.view', 2, 'Akses pemantauan kesehatan penyedia LLM'),
    ('admin.mcp.view', 2, 'Akses registri alat MCP organisasi')
ON CONFLICT (capability_key) DO NOTHING

-- 18. Pemetaan Role
INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'orchestration.workflow.dispatch'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'orchestration.workflow.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'admin.llm.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'admin.mcp.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
