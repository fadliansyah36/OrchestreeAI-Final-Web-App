-- Migrasi Reversible: 008_abac_ai_data_permissions_and_department_caps_rls.sql
-- Implementasi ABAC (Attribute-Based Access Control) & Department Budget Cap per PRD v2.2 Bagian 3.3, 3.5, 15, dan 20.1

BEGIN

-- 1. Tabel Bertenant: ai_data_permission_policies (Kebijakan Izin Data Agen AI)
CREATE TABLE IF NOT EXISTS ai_data_permission_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
    agent_persona_type text,
    resource_type text NOT NULL,
    resource_identifier text NOT NULL,
    action text NOT NULL,
    data_classification text NOT NULL DEFAULT 'internal' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
    conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
    effect text NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
    priority int NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_ai_data_policies_tenant ON ai_data_permission_policies(tenant_id, resource_type, resource_identifier);

CREATE INDEX IF NOT EXISTS idx_ai_data_policies_agent ON ai_data_permission_policies(tenant_id, agent_id);

-- 2. Tabel Bertenant: ai_data_access_requests (Permintaan Izin Akses Data Agen AI)
CREATE TABLE IF NOT EXISTS ai_data_access_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    requester_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    resource_type text NOT NULL,
    resource_identifier text NOT NULL,
    action text NOT NULL,
    data_classification text NOT NULL DEFAULT 'internal',
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    decision_reason text,
    reviewed_by uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_ai_data_requests_tenant ON ai_data_access_requests(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_data_requests_agent ON ai_data_access_requests(tenant_id, agent_id);

-- 3. Tambahkan kolom Department Credit Budget Cap pada departments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'departments' AND column_name = 'credit_cap'
    ) THEN
        ALTER TABLE departments ADD COLUMN credit_cap numeric(18, 4) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'departments' AND column_name = 'credit_spent'
    ) THEN
        ALTER TABLE departments ADD COLUMN credit_spent numeric(18, 4) NOT NULL DEFAULT 0.0000;
    END IF;
END $$

-- 4. Terapkan Row Level Security (RLS) FORCE Terisolasi Tenant
ALTER TABLE ai_data_permission_policies ENABLE ROW LEVEL SECURITY

ALTER TABLE ai_data_permission_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies;

CREATE POLICY tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE ai_data_access_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE ai_data_access_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ai_data_access_requests ON ai_data_access_requests;

CREATE POLICY tenant_isolation_ai_data_access_requests ON ai_data_access_requests
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

COMMIT;
