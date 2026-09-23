-- Migration: 20260923000005_token_savings_and_agent_blueprints.sql
-- Description: Create semantic_prompt_cache, token_savings_log, and agent_skill_blueprints with pgvector similarity, staged rollout, and RLS

-- 1. Semantic Prompt Cache Table (pgvector similarity matching)
CREATE TABLE IF NOT EXISTS public.semantic_prompt_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    task_type VARCHAR(64) NOT NULL,
    prompt_text TEXT NOT NULL,
    prompt_embedding vector(1536) NOT NULL,
    model_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_2',
    provider_id VARCHAR(64) NOT NULL,
    model_id VARCHAR(128) NOT NULL,
    response_content TEXT NOT NULL,
    total_tokens INT NOT NULL DEFAULT 0,
    hit_count INT NOT NULL DEFAULT 1,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_tenant_task
ON public.semantic_prompt_cache(tenant_id, task_type);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding_hnsw
ON public.semantic_prompt_cache USING hnsw (prompt_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

ALTER TABLE public.semantic_prompt_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_prompt_cache_tenant_isolation ON public.semantic_prompt_cache;
CREATE POLICY semantic_prompt_cache_tenant_isolation ON public.semantic_prompt_cache
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
        OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
        OR current_user IN ('postgres', 'service_role')
    );

-- 2. Token Savings Log Table (measurable before/after token & cost analytics)
CREATE TABLE IF NOT EXISTS public.token_savings_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    request_id VARCHAR(64),
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    task_type VARCHAR(64) NOT NULL,
    original_prompt_tokens INT NOT NULL DEFAULT 0,
    tokens_saved INT NOT NULL DEFAULT 0,
    cost_without_cache_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000,
    cost_with_cache_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000,
    cost_saved_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000,
    latency_saved_ms INT NOT NULL DEFAULT 0,
    model_tier_selected VARCHAR(32) NOT NULL DEFAULT 'TIER_2',
    model_id_selected VARCHAR(128) NOT NULL,
    similarity_score NUMERIC(5, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_savings_tenant_created
ON public.token_savings_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_savings_tenant_hit
ON public.token_savings_log(tenant_id, cache_hit);

ALTER TABLE public.token_savings_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_savings_log_tenant_isolation ON public.token_savings_log;
CREATE POLICY token_savings_log_tenant_isolation ON public.token_savings_log
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
        OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
        OR current_user IN ('postgres', 'service_role')
    );

-- 3. Agent Skill Blueprints Table (Super Admin Managed Templates with Staged Rollout)
CREATE TABLE IF NOT EXISTS public.agent_skill_blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    system_prompt_template TEXT NOT NULL,
    required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    tool_definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    rollout_stage VARCHAR(32) NOT NULL DEFAULT 'INTERNAL' CHECK (rollout_stage IN ('INTERNAL', 'BETA_TENANT', 'GENERAL_AVAILABILITY')),
    allowed_tenant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    policy_scan_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (policy_scan_status IN ('PENDING', 'PASSED', 'FAILED')),
    policy_scan_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(128) NOT NULL DEFAULT 'Super Admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_blueprints_stage_active
ON public.agent_skill_blueprints(rollout_stage, is_active);

CREATE INDEX IF NOT EXISTS idx_agent_blueprints_category
ON public.agent_skill_blueprints(category);

ALTER TABLE public.agent_skill_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_skill_blueprints_access_policy ON public.agent_skill_blueprints;
CREATE POLICY agent_skill_blueprints_access_policy ON public.agent_skill_blueprints
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

-- 4. Register Capabilities in feature_capabilities
INSERT INTO public.feature_capabilities (capability_key, min_tier_level, description) VALUES
    ('tokenopt.cache.manage', 1, 'Optimasi token LLM cerdas via semantic caching pgvector dan auto model tiering'),
    ('agentcat.blueprint.manage', 2, 'Katalog template blueprint skill agen AI dengan staged rollout dan policy scan')
ON CONFLICT (capability_key) DO UPDATE SET
    min_tier_level = EXCLUDED.min_tier_level,
    description = EXCLUDED.description;
