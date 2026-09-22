-- Migrasi Reversible: 003_kanban_tasks_and_webauthn_rls.sql
-- Autonomous Workforce: Boards, Board Columns, Tasks with Optimistic Locking, Task Events, WebAuthn Credentials, and Attendance Records with Force RLS

BEGIN

-- 1. Buat Tabel boards
CREATE TABLE IF NOT EXISTS boards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_boards_tenant ON boards(tenant_id);

-- 2. Buat Tabel board_columns
CREATE TABLE IF NOT EXISTS board_columns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name text NOT NULL,
    position int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id, position);

CREATE INDEX IF NOT EXISTS idx_board_columns_tenant ON board_columns(tenant_id);

-- 3. Buat Tabel tasks dengan Optimistic Lock (version int not null default 1) per PRD 18.1
CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    version int NOT NULL DEFAULT 1,
    assigned_membership_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    assigned_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    progress_percentage int NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    position int NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id, position) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);

-- 4. Buat Tabel task_events
CREATE TABLE IF NOT EXISTS task_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_events_tenant ON task_events(tenant_id);

-- 5. Buat Tabel task_comments
CREATE TABLE IF NOT EXISTS task_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_membership_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
    comment text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- 6. Buat Tabel task_attachments
CREATE TABLE IF NOT EXISTS task_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_url text NOT NULL,
    file_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

-- 7. Buat Tabel webauthn_credentials
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    credential_id text NOT NULL UNIQUE,
    public_key text NOT NULL,
    sign_count bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_webauthn_member ON webauthn_credentials(tenant_membership_id);

CREATE INDEX IF NOT EXISTS idx_webauthn_tenant ON webauthn_credentials(tenant_id);

-- 8. Buat Tabel attendance_records
CREATE TABLE IF NOT EXISTS attendance_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    check_type text NOT NULL CHECK (check_type IN ('in', 'out')),
    verified_via text NOT NULL DEFAULT 'webauthn',
    sign_count bigint NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance_records(tenant_membership_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance_records(tenant_id);

-- 9. Terapkan Row Level Security (RLS) FORCE secara identik pada semua tabel bertenant
ALTER TABLE boards ENABLE ROW LEVEL SECURITY

ALTER TABLE boards FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_boards ON boards;

CREATE POLICY tenant_isolation_boards ON boards
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;

ALTER TABLE board_columns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_board_columns ON board_columns;

CREATE POLICY tenant_isolation_board_columns ON board_columns
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;

CREATE POLICY tenant_isolation_tasks ON tasks
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE task_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_task_events ON task_events;

CREATE POLICY tenant_isolation_task_events ON task_events
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_task_comments ON task_comments;

CREATE POLICY tenant_isolation_task_comments ON task_comments
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE task_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_task_attachments ON task_attachments;

CREATE POLICY tenant_isolation_task_attachments ON task_attachments
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE webauthn_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_webauthn ON webauthn_credentials;

CREATE POLICY tenant_isolation_webauthn ON webauthn_credentials
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_attendance ON attendance_records;

CREATE POLICY tenant_isolation_attendance ON attendance_records
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Berikan izin DML ke runtime database role orchestree_app jika tersedia
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON boards TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON board_columns TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON task_events TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON task_comments TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON task_attachments TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON webauthn_credentials TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records TO orchestree_app;
    END IF;
END $$

-- 10. Seeding Feature Capabilities Baru
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('workforce.board.manage', 0, 'Kemampuan melihat dan mengelola papan tugas tim'),
    ('workforce.task.manage', 0, 'Kemampuan membuat dan menyunting tugas'),
    ('workforce.task.move', 0, 'Kemampuan memindahkan posisi kolom atau kemajuan tugas'),
    ('attendance.record', 0, 'Kemampuan melakukan presensi masuk dan pulang terverifikasi WebAuthn')
ON CONFLICT (capability_key) DO NOTHING

-- 11. Pemetaan Hak Akses Role
INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.board.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.task.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'workforce.task.move'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'attendance.record'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
