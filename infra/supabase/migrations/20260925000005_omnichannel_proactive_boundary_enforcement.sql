-- Migrasi Reversible: 20260925000005_omnichannel_proactive_boundary_enforcement.sql
-- Omnichannel and Proactive Strict Boundary and Blocking Enforcement (PRD v2.2 Bagian 3.5, 8.4, 10.3, 10.5, 12, 14)

BEGIN;

-- 1. Audience scope pada Semantic Memory (memory_documents)
ALTER TABLE memory_documents 
ADD COLUMN IF NOT EXISTS audience_scope text NOT NULL DEFAULT 'internal_only'
CHECK (audience_scope IN ('internal_only', 'customer_facing_safe', 'both'));

CREATE INDEX IF NOT EXISTS idx_memory_documents_audience 
ON memory_documents (tenant_id, audience_scope);

-- 2. Context scope pada AI Agent (ai_agents)
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS context_scope text NOT NULL DEFAULT 'internal'
CHECK (context_scope IN ('internal', 'customer_facing'));

CREATE INDEX IF NOT EXISTS idx_ai_agents_context_scope 
ON ai_agents (tenant_id, context_scope);

-- 3. Context scope pada MCP Tool (mcp_tools)
ALTER TABLE mcp_tools 
ADD COLUMN IF NOT EXISTS context_scope text NOT NULL DEFAULT 'internal_only'
CHECK (context_scope IN ('internal_only', 'customer_facing_allowed'));

CREATE INDEX IF NOT EXISTS idx_mcp_tools_context_scope 
ON mcp_tools (context_scope);

-- 4. Allow-list pengirim resmi untuk kanal Proactive
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

-- 5. Audit khusus percobaan pelanggaran boundary
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

-- 6. RLS Enforcement untuk proactive_verified_senders dan cross_boundary_violation_log
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

-- 7. Pendaftaran Kapabilitas Baru pada feature_capabilities
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES
    (gen_random_uuid(), 'boundary.enforce', 1, 'Strict Boundary & Blocking antara agen customer-facing dan internal-facing'),
    (gen_random_uuid(), 'boundary.violation.view', 1, 'Melihat jejak audit percobaan pelanggaran batas lintas konteks AI')
ON CONFLICT (capability_key) DO NOTHING;

COMMIT;
