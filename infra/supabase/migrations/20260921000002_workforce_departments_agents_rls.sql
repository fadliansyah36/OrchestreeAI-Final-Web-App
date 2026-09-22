-- Migrasi Reversible: 002_workforce_departments_agents_rls.sql
-- Autonomous Workforce Hub: Departments, AI Agents, and Staff Integration with Force RLS

BEGIN

-- 1. Buat Tabel departments
CREATE TABLE IF NOT EXISTS departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    parent_department_id uuid REFERENCES departments(id),
    manager_membership_id uuid REFERENCES tenant_memberships(id),
    color_tag text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
)

-- Indeks untuk pencarian terisolasi tenant dan hierarki
CREATE INDEX IF NOT EXISTS idx_departments_tenant_active ON departments(tenant_id) WHERE deleted_at IS NULL

CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);

-- 2. Tambahkan kolom department_id pada tenant_memberships jika belum ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_memberships' AND column_name = 'department_id'
    ) THEN
        ALTER TABLE tenant_memberships ADD COLUMN department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
    END IF;
END $$

CREATE INDEX IF NOT EXISTS idx_memberships_department ON tenant_memberships(department_id);

-- 3. Buat Tabel ai_agents
-- CATATAN UTANG TEKNIS (Eksplisit per PRD v2.2 Rekonsiliasi 2.4):
-- Kolom persona_type saat ini menggunakan teks kode bebas dan WAJIB digantikan dengan foreign key
-- terstruktur job_title_id pada implementasi job title & role spesialisasi (Fase 32a/32b).
CREATE TABLE IF NOT EXISTS ai_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id uuid REFERENCES departments(id),
    persona_type text NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON ai_agents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_agents_department ON ai_agents(department_id);

-- 4. Terapkan Row Level Security (RLS) FORCE secara identik dengan standard isolasi tenant
ALTER TABLE departments ENABLE ROW LEVEL SECURITY

ALTER TABLE departments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_departments ON departments;

CREATE POLICY tenant_isolation_departments ON departments
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

ALTER TABLE ai_agents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_agents ON ai_agents;

CREATE POLICY tenant_isolation_agents ON ai_agents
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Berikan izin DML ke runtime database role orchestree_app jika tersedia
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agents TO orchestree_app;
    END IF;
END $$

-- 5. Seeding Capability Baru ke feature_capabilities
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('workforce.department.manage', 0, 'Kemampuan untuk menambah, menyunting, dan menghapus departemen dalam organisasi'),
    ('workforce.staff.manage', 0, 'Kemampuan untuk menugaskan anggota tim manusia ke dalam departemen'),
    ('workforce.agent.manage', 0, 'Kemampuan untuk mendaftarkan dan mengonfigurasi agen AI otonom'),
    ('workforce.org_chart.view', 0, 'Kemampuan untuk melihat struktur bagan organisasi terpadu')
ON CONFLICT (capability_key) DO NOTHING

-- 6. Pemetaan Hak Akses Role
INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.department.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
ON CONFLICT (role_id, capability_key) DO NOTHING

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.staff.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.agent.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.org_chart.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
