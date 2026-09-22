-- Alembic Migration: 001_identity_and_tenancy_rls.sql
-- PRD v2.2 Section 17.2, 17.3, 3.2, 3.4, 9.3, 13.4, 16.1

BEGIN

-- 1. Create runtime role orchestree_app with NOBYPASSRLS (PRD 9.3)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchestree_app') THEN
    CREATE ROLE orchestree_app WITH LOGIN NOBYPASSRLS;
  END IF;
END
$$

-- 2. tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  subscription_plan_id uuid,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','churned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
)

-- 3. tenant_memberships
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  full_name text NOT NULL,
  department_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_user_id)
)

-- 4. roles, role_permissions, user_roles (PRD 3.2)
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE CHECK (role_code IN
    ('SUPER_ADMIN','TENANT_OWNER','TENANT_ADMIN','DEPT_MANAGER','STAFF_HUMAN','AI_AGENT')),
  description text
)

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  UNIQUE (role_id, capability_key)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  UNIQUE (tenant_membership_id, role_id)
);

-- 5. subscription_plans, feature_capabilities, tenant_capability_overrides (PRD 3.4)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL UNIQUE,
  tier_level int NOT NULL,
  display_name text NOT NULL,
  price_monthly numeric(18,2),
  currency text NOT NULL DEFAULT 'IDR'
)

ALTER TABLE tenants 
  DROP CONSTRAINT IF EXISTS fk_tenants_subscription_plan,
  ADD CONSTRAINT fk_tenants_subscription_plan FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id);

CREATE TABLE IF NOT EXISTS feature_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE,
  min_tier_level int NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS tenant_capability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  enabled_override boolean NOT NULL,
  reason text NOT NULL,
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, capability_key)
);

-- 6. audit_logs (append-only, monthly partitioned - PRD 16.1)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('human_user','ai_agent','system')),
  actor_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  payload_before jsonb,
  payload_after jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at)

-- Partitions for audit_logs
CREATE TABLE IF NOT EXISTS audit_logs_2026_09 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01')

CREATE TABLE IF NOT EXISTS audit_logs_2026_10 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;

-- 7. outbox_events (PRD 9.4)
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
)

-- 8. platform_settings (PRD 23.3)
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
)

-- 9. tenant_company_codes & hr_approval_queue (PRD 13.4)
CREATE TABLE IF NOT EXISTS tenant_company_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamptz,
  max_uses int,
  use_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
)

CREATE TABLE IF NOT EXISTS hr_approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requesting_auth_user_id uuid NOT NULL,
  company_code_id uuid NOT NULL REFERENCES tenant_company_codes(id),
  submitted_profile jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. ROW LEVEL SECURITY ENFORCEMENT (PRD 17.3)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_capability_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenant_capability_overrides FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_company_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenant_company_codes FORCE ROW LEVEL SECURITY;

ALTER TABLE hr_approval_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE hr_approval_queue FORCE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants

CREATE POLICY tenant_isolation_tenants ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_memberships ON tenant_memberships;

CREATE POLICY tenant_isolation_memberships ON tenant_memberships
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_overrides ON tenant_capability_overrides;

CREATE POLICY tenant_isolation_overrides ON tenant_capability_overrides
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_outbox ON outbox_events;

CREATE POLICY tenant_isolation_outbox ON outbox_events
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_company_codes ON tenant_company_codes;

CREATE POLICY tenant_isolation_company_codes ON tenant_company_codes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_hr_queue ON hr_approval_queue;

CREATE POLICY tenant_isolation_hr_queue ON hr_approval_queue
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 11. Reference Data Seeding
INSERT INTO roles (role_code, description) VALUES
  ('SUPER_ADMIN', 'Platform Administrator with executive governance access'),
  ('TENANT_OWNER', 'Primary organization legal owner with full tenant control'),
  ('TENANT_ADMIN', 'Organization system administrator'),
  ('DEPT_MANAGER', 'Departmental team leader and workflow supervisor'),
  ('STAFF_HUMAN', 'Human organization workforce member'),
  ('AI_AGENT', 'Autonomous worker agent with cryptographic credential identity')
ON CONFLICT (role_code) DO NOTHING

INSERT INTO subscription_plans (plan_code, tier_level, display_name, price_monthly, currency) VALUES
  ('TRIAL', 0, 'Uji Coba Sistem', 0.00, 'IDR'),
  ('STARTER', 1, 'Standar Operasional', 990000.00, 'IDR'),
  ('GROWTH', 2, 'Pengembangan Otonom', 2990000.00, 'IDR'),
  ('ENTERPRISE', 3, 'Ekosistem Korporat Terpadu', 9990000.00, 'IDR')
ON CONFLICT (plan_code) DO NOTHING;

INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
  ('hr.company_code.manage', 0, 'Membuat dan mengelola kode registrasi organisasi'),
  ('hr.approval.review', 0, 'Meninjau dan menyetujui pendaftaran staf baru'),
  ('tenant.members.view', 0, 'Melihat daftar anggota organisasi dan peran'),
  ('tenant.profile.manage', 0, 'Mengubah identitas legal dan display nama organisasi'),
  ('workforce.agent.dispatch', 1, 'Menugaskan dan mengoordinasikan agen kerja AI'),
  ('sales.prospecting.execute', 1, 'Menjalankan riset prospek otomatis'),
  ('security.audit.view', 2, 'Mengakses ledger audit dan log keamanan terenkripsi')
ON CONFLICT (capability_key) DO NOTHING;

-- Grant permissions for orchestree_app runtime role
GRANT USAGE ON SCHEMA public TO orchestree_app

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orchestree_app;

COMMIT;
