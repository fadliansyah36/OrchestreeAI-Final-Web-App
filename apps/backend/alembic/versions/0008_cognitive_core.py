"""Inisialisasi Cognitive Core: Orchestration Engine, Model Router, MCP Tool Registry, dan RLS

Revision ID: 0008_cognitive_core
Revises: 0007_boards_tasks_and_webauthn
Create Date: 2026-09-22 12:00:00.000000

Skema Inti Kognitif (PRD v2.2 Bagian 8.1, 8.2, 11.2):
- Tabel workflow_definitions: Definisi graf orkestasi (graph_spec jsonb) sebagai data, bukan hardcode.
- Tabel workflow_executions: Eksekusi graf dengan durable checkpoint context_state.
- Tabel workflow_nodes: Node definisi (CLASSIFY, PLAN, TOOL_CALL, LLM_GENERATE, HUMAN_APPROVAL, PERSONA_HANDOFF, DELIVER).
- Tabel workflow_node_runs: Rekaman jejak dan checkpoint eksekusi tiap node graf.
- Tabel llm_providers: Katalog provider nyata (NVIDIA NIM, OpenRouter, GPT-Image-2, Gemini).
- Tabel llm_models: Katalog model LLM lintas provider.
- Tabel model_routing_rules: Aturan perutean model cerdas per tipe tugas dengan fallback.
- Tabel llm_usage_logs: Catatan konsumsi token nyata, latensi, dan biaya per pemanggilan.
- Tabel mcp_tools: Registri alat MCP dengan risk_tier dan skema Pydantic.
- Tabel tool_permissions: Pemetaan kapabilitas yang diwajibkan untuk menjalankan MCP tool.
- Tabel tool_invocations: Catatan riwayat pemanggilan tool terotorisasi PDP.
- Tabel tool_health_checks: Telemetri kesehatan dan latensi probe tiap tool.
- Penegakan RLS ketat pada tabel bertenant.
- Pendaftaran kapabilitas sistem baru ke feature_capabilities dan role_permissions.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0008_cognitive_core"
down_revision: Union[str, None] = "0007_boards_tasks_and_webauthn"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel workflow_definitions
    op.execute("""
    CREATE TABLE IF NOT EXISTS workflow_definitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        version text NOT NULL DEFAULT '1.0.0',
        graph_spec jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 2. Tabel workflow_executions (Durable Checkpoint)
    op.execute("""
    CREATE TABLE IF NOT EXISTS workflow_executions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        workflow_definition_id uuid REFERENCES workflow_definitions(id) ON DELETE SET NULL,
        trigger_type text NOT NULL DEFAULT 'intent',
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
        input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        current_node_key text,
        context_state jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_message text,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 3. Tabel workflow_nodes
    op.execute("""
    CREATE TABLE IF NOT EXISTS workflow_nodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
        node_key text NOT NULL,
        node_type text NOT NULL CHECK (node_type IN ('CLASSIFY', 'PLAN', 'TOOL_CALL', 'LLM_GENERATE', 'HUMAN_APPROVAL', 'PERSONA_HANDOFF', 'DELIVER')),
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 4. Tabel workflow_node_runs
    op.execute("""
    CREATE TABLE IF NOT EXISTS workflow_node_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        node_key text NOT NULL,
        node_type text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
        input_state jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_state jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_message text,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 5. Tabel llm_providers
    op.execute("""
    CREATE TABLE IF NOT EXISTS llm_providers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text UNIQUE NOT NULL,
        name text NOT NULL,
        base_url text,
        priority int NOT NULL DEFAULT 1,
        is_active boolean NOT NULL DEFAULT true,
        status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down')),
        last_health_check_at timestamptz,
        latency_ms int DEFAULT 0,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 6. Tabel llm_models
    op.execute("""
    CREATE TABLE IF NOT EXISTS llm_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
        model_id text NOT NULL,
        name text NOT NULL,
        modality text NOT NULL DEFAULT 'text',
        context_window int NOT NULL DEFAULT 8192,
        is_active boolean NOT NULL DEFAULT true,
        cost_per_1k_input_tokens numeric(12, 6) DEFAULT 0,
        cost_per_1k_output_tokens numeric(12, 6) DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_provider_model UNIQUE (provider_id, model_id)
    );
    """)

    # 7. Tabel model_routing_rules
    op.execute("""
    CREATE TABLE IF NOT EXISTS model_routing_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        task_type text NOT NULL,
        preferred_provider_id uuid NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
        preferred_model_id uuid REFERENCES llm_models(id) ON DELETE SET NULL,
        fallback_provider_id uuid REFERENCES llm_providers(id) ON DELETE SET NULL,
        fallback_model_id uuid REFERENCES llm_models(id) ON DELETE SET NULL,
        timeout_seconds int NOT NULL DEFAULT 30,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 8. Tabel llm_usage_logs (Audited Token Consumption)
    op.execute("""
    CREATE TABLE IF NOT EXISTS llm_usage_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
        provider_code text NOT NULL,
        model_id text NOT NULL,
        prompt_tokens int NOT NULL DEFAULT 0,
        completion_tokens int NOT NULL DEFAULT 0,
        total_tokens int NOT NULL DEFAULT 0,
        latency_ms int NOT NULL DEFAULT 0,
        cost_usd numeric(12, 6) DEFAULT 0,
        status text NOT NULL DEFAULT 'success',
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 9. Tabel mcp_tools
    op.execute("""
    CREATE TABLE IF NOT EXISTS mcp_tools (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text UNIQUE NOT NULL,
        description text NOT NULL,
        version text NOT NULL DEFAULT '1.0.0',
        category text NOT NULL,
        risk_tier text NOT NULL DEFAULT 'low' CHECK (risk_tier IN ('low', 'medium', 'high', 'critical')),
        input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_idempotent boolean NOT NULL DEFAULT true,
        timeout_seconds int NOT NULL DEFAULT 30,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 10. Tabel tool_permissions
    op.execute("""
    CREATE TABLE IF NOT EXISTS tool_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id uuid NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
        required_capability text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tool_permission UNIQUE (tool_id, required_capability)
    );
    """)

    # 11. Tabel tool_invocations
    op.execute("""
    CREATE TABLE IF NOT EXISTS tool_invocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tool_id uuid NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
        workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        actor_type text NOT NULL DEFAULT 'ai_agent',
        input_params jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'denied')),
        error_message text,
        execution_time_ms int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 12. Tabel tool_health_checks
    op.execute("""
    CREATE TABLE IF NOT EXISTS tool_health_checks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id uuid NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'failing')),
        latency_ms int NOT NULL DEFAULT 0,
        error_message text,
        checked_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 13. Enable & Force Row Level Security
    tenant_tables = [
        "workflow_executions", "workflow_node_runs", "llm_usage_logs", "tool_invocations"
    ]
    for tbl in tenant_tables:
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")
        op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE schemaname = 'public' AND tablename = '{tbl}' AND policyname = '{tbl}_tenant_isolation'
            ) THEN
                CREATE POLICY {tbl}_tenant_isolation ON {tbl}
                AS RESTRICTIVE
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
            END IF;
        END
        $$;
        """)

    # workflow_definitions RLS: Tenant dapat melihat definisi miliknya atau template sistem (tenant_id IS NULL)
    op.execute("""
    ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'workflow_definitions' AND policyname = 'workflow_definitions_tenant_policy'
        ) THEN
            CREATE POLICY workflow_definitions_tenant_policy ON workflow_definitions
            FOR ALL
            USING (
                tenant_id IS NULL 
                OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
            WITH CHECK (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            );
        END IF;
    END
    $$;
    """)

    # 14. Indeks Kinerja
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_workflow_exec_tenant ON workflow_executions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_exec ON workflow_node_runs(execution_id, node_key);
    CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant_time ON llm_usage_logs(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant ON tool_invocations(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
    """)

    # 15. Hak akses role orchestree_app
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON 
                workflow_definitions, workflow_executions, workflow_nodes, workflow_node_runs,
                llm_providers, llm_models, model_routing_rules, llm_usage_logs,
                mcp_tools, tool_permissions, tool_invocations, tool_health_checks
            TO orchestree_app;
        END IF;
    END
    $$;
    """)

    # 16. Daftarkan Capability Fitur Baru
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('workflow.dispatch', 1, 'Hak memicu eksekusi alur kerja kognitif otonom'),
        ('workflow.view', 1, 'Hak melihat riwayat eksekusi dan checkpoint alur kerja'),
        ('workflow.manage', 2, 'Hak mengonfigurasi definisi alur kerja graf'),
        ('llm.route', 1, 'Hak meminta inferensi melalui model router'),
        ('llm.provider.view', 2, 'Hak memantau kesehatan dan status provider model AI'),
        ('mcp.tool.invoke', 1, 'Hak memanggil fungsi perkakas MCP'),
        ('mcp.tool.view', 1, 'Hak melihat katalog perkakas MCP terdaftar'),
        ('mcp.tool.manage', 2, 'Hak mengelola pendaftaran dan izin perkakas MCP')
    ON CONFLICT (capability_key) DO UPDATE SET
        description = EXCLUDED.description;
    """)

    # 17. Berikan Izin ke Peran
    op.execute("""
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('workflow.dispatch'),
            ('workflow.view'),
            ('workflow.manage'),
            ('llm.route'),
            ('llm.provider.view'),
            ('mcp.tool.invoke'),
            ('mcp.tool.view'),
            ('mcp.tool.manage')
    ) AS c(capability_key)
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN')
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('workflow.dispatch'),
            ('workflow.view'),
            ('llm.route'),
            ('mcp.tool.invoke'),
            ('mcp.tool.view')
    ) AS c(capability_key)
    WHERE r.role_code IN ('DEPT_MANAGER', 'STAFF_HUMAN', 'STAFF_AI')
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    tables = [
        "tool_health_checks", "tool_invocations", "tool_permissions", "mcp_tools",
        "llm_usage_logs", "model_routing_rules", "llm_models", "llm_providers",
        "workflow_node_runs", "workflow_nodes", "workflow_executions", "workflow_definitions"
    ]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_policy ON {tbl};")
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")

    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'workflow.dispatch', 'workflow.view', 'workflow.manage',
        'llm.route', 'llm.provider.view', 'mcp.tool.invoke', 'mcp.tool.view', 'mcp.tool.manage'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'workflow.dispatch', 'workflow.view', 'workflow.manage',
        'llm.route', 'llm.provider.view', 'mcp.tool.invoke', 'mcp.tool.view', 'mcp.tool.manage'
    );
    """)
