"""token savings and agent blueprints

Revision ID: 0040_token_savings_and_agent_blueprints
Revises: 0039_data_quality_issues_and_confidence
Create Date: 2026-09-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0040_token_savings_and_agent_blueprints'
down_revision: Union[str, None] = '0039_data_quality_issues_and_confidence'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Semantic Prompt Cache
    op.execute("""
    CREATE TABLE IF NOT EXISTS semantic_prompt_cache (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_type varchar(64) NOT NULL,
        prompt_text text NOT NULL,
        prompt_embedding vector(1536) NOT NULL,
        model_tier varchar(32) NOT NULL DEFAULT 'TIER_2',
        provider_id varchar(64) NOT NULL,
        model_id varchar(128) NOT NULL,
        response_content text NOT NULL,
        total_tokens int NOT NULL DEFAULT 0,
        hit_count int NOT NULL DEFAULT 1,
        last_accessed_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_cache_tenant_task
        ON semantic_prompt_cache(tenant_id, task_type);

    CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding_hnsw
        ON semantic_prompt_cache USING hnsw (prompt_embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);

    ALTER TABLE semantic_prompt_cache ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS semantic_prompt_cache_tenant_isolation ON semantic_prompt_cache;
    CREATE POLICY semantic_prompt_cache_tenant_isolation ON semantic_prompt_cache
        FOR ALL
        USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
            OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
            OR current_user IN ('postgres', 'service_role')
        );
    """)

    # 2. Token Savings Log
    op.execute("""
    CREATE TABLE IF NOT EXISTS token_savings_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        request_id varchar(64),
        cache_hit boolean NOT NULL DEFAULT false,
        task_type varchar(64) NOT NULL,
        original_prompt_tokens int NOT NULL DEFAULT 0,
        tokens_saved int NOT NULL DEFAULT 0,
        cost_without_cache_usd numeric(12, 6) NOT NULL DEFAULT 0.000000,
        cost_with_cache_usd numeric(12, 6) NOT NULL DEFAULT 0.000000,
        cost_saved_usd numeric(12, 6) NOT NULL DEFAULT 0.000000,
        latency_saved_ms int NOT NULL DEFAULT 0,
        model_tier_selected varchar(32) NOT NULL DEFAULT 'TIER_2',
        model_id_selected varchar(128) NOT NULL,
        similarity_score numeric(5, 4),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_token_savings_tenant_created
        ON token_savings_log(tenant_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_token_savings_tenant_hit
        ON token_savings_log(tenant_id, cache_hit);

    ALTER TABLE token_savings_log ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS token_savings_log_tenant_isolation ON token_savings_log;
    CREATE POLICY token_savings_log_tenant_isolation ON token_savings_log
        FOR ALL
        USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
            OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
            OR current_user IN ('postgres', 'service_role')
        );
    """)

    # 3. Agent Skill Blueprints
    op.execute("""
    CREATE TABLE IF NOT EXISTS agent_skill_blueprints (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id varchar(128) NOT NULL UNIQUE,
        name varchar(128) NOT NULL,
        version varchar(32) NOT NULL DEFAULT '1.0.0',
        description text NOT NULL,
        category varchar(64) NOT NULL,
        system_prompt_template text NOT NULL,
        required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
        tool_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
        default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
        rollout_stage varchar(32) NOT NULL DEFAULT 'INTERNAL' CHECK (rollout_stage IN ('INTERNAL', 'BETA_TENANT', 'GENERAL_AVAILABILITY')),
        allowed_tenant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        policy_scan_status varchar(32) NOT NULL DEFAULT 'PENDING' CHECK (policy_scan_status IN ('PENDING', 'PASSED', 'FAILED')),
        policy_scan_report jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar(128) NOT NULL DEFAULT 'Super Admin',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_blueprints_stage_active
        ON agent_skill_blueprints(rollout_stage, is_active);

    CREATE INDEX IF NOT EXISTS idx_agent_blueprints_category
        ON agent_skill_blueprints(category);

    ALTER TABLE agent_skill_blueprints ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS agent_skill_blueprints_access_policy ON agent_skill_blueprints;
    CREATE POLICY agent_skill_blueprints_access_policy ON agent_skill_blueprints
        FOR ALL
        USING (
            rollout_stage = 'GENERAL_AVAILABILITY'
            OR current_user IN ('postgres', 'service_role')
            OR (
                rollout_stage = 'BETA_TENANT'
                AND (
                    allowed_tenant_ids ? COALESCE(NULLIF(current_setting('app.tenant_id', true), ''), '00000000-0000-0000-0000-000000000000')
                    OR allowed_tenant_ids ? COALESCE(NULLIF(current_setting('request.jwt.claim.tenant_id', true), ''), '00000000-0000-0000-0000-000000000000')
                )
            )
            OR (
                rollout_stage = 'INTERNAL'
                AND (
                    current_user IN ('postgres', 'service_role')
                    OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
                    OR current_setting('app.actor_type', true) = 'super_admin'
                )
            )
        );

    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('tokenopt.cache.manage', 1, 'Optimasi token LLM cerdas via semantic caching pgvector dan auto model tiering'),
        ('agentcat.blueprint.manage', 2, 'Katalog template blueprint skill agen AI dengan staged rollout dan policy scan')
    ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN ('tokenopt.cache.manage', 'agentcat.blueprint.manage');
    DROP POLICY IF EXISTS agent_skill_blueprints_access_policy ON agent_skill_blueprints;
    DROP TABLE IF EXISTS agent_skill_blueprints CASCADE;

    DROP POLICY IF EXISTS token_savings_log_tenant_isolation ON token_savings_log;
    DROP TABLE IF EXISTS token_savings_log CASCADE;

    DROP POLICY IF EXISTS semantic_prompt_cache_tenant_isolation ON semantic_prompt_cache;
    DROP TABLE IF EXISTS semantic_prompt_cache CASCADE;
    """)
