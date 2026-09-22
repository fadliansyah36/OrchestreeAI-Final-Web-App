"""Inisialisasi Kanban Boards, Columns, Tasks (Optimistic Locking), Task Events, WebAuthn Credentials, dan Attendance Records

Revision ID: 0007_boards_tasks_and_webauthn
Revises: 0006_departments_and_ai_agents
Create Date: 2026-09-22 11:00:00.000000

Skema Kanban & Presensi WebAuthn:
- Tabel boards: Papan kerja per tenant
- Tabel board_columns: Kolom status tahapan kerja dengan posisi & wip_limit
- Tabel tasks: Kartu tugas dengan kolom version untuk optimistic concurrency control (PRD 18.1)
- Tabel task_events: Jejak audit perpindahan kolom dan pembaruan kemajuan
- Tabel task_comments: Diskusi pada tugas
- Tabel task_attachments: Lampiran berkas tugas
- Tabel webauthn_credentials: Kredensial hardware passkey / biometrik terdaftar dengan sign_count
- Tabel attendance_records: Rekaman log presensi check-in / check-out diverifikasi via webauthn
- Penegakan RLS ketat (ENABLE + FORCE ROW LEVEL SECURITY) pada semua tabel bertenant
- Pendaftaran kapabilitas: tasks.board.view, tasks.board.manage, tasks.move, attendance.webauthn.register, attendance.clock, attendance.view
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0007_boards_tasks_and_webauthn"
down_revision: Union[str, None] = "0006_departments_and_ai_agents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Buat Tabel boards
    op.execute("""
    CREATE TABLE IF NOT EXISTS boards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 2. Buat Tabel board_columns
    op.execute("""
    CREATE TABLE IF NOT EXISTS board_columns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name text NOT NULL,
        position int NOT NULL DEFAULT 0,
        wip_limit int,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 3. Buat Tabel tasks (dengan kolom version NOT NULL DEFAULT 1 untuk optimistic locking)
    op.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        column_id uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text,
        position int NOT NULL DEFAULT 0,
        priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        assigned_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 4. Buat Tabel task_events
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        from_column_id uuid REFERENCES board_columns(id) ON DELETE SET NULL,
        to_column_id uuid REFERENCES board_columns(id) ON DELETE SET NULL,
        actor_type text NOT NULL DEFAULT 'user',
        actor_id text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 5. Buat Tabel task_comments
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 6. Buat Tabel task_attachments
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        file_name text NOT NULL,
        file_url text NOT NULL,
        file_size int NOT NULL DEFAULT 0,
        mime_type text,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 7. Buat Tabel webauthn_credentials
    op.execute("""
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        credential_id text NOT NULL UNIQUE,
        public_key text NOT NULL,
        sign_count bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 8. Buat Tabel attendance_records
    op.execute("""
    CREATE TABLE IF NOT EXISTS attendance_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        check_type text NOT NULL CHECK (check_type IN ('in', 'out')),
        verified_via text NOT NULL DEFAULT 'webauthn',
        recorded_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 9. Terapkan ENABLE dan FORCE ROW LEVEL SECURITY (RLS) pada semua tabel bertenant
    op.execute("""
    ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
    ALTER TABLE boards FORCE ROW LEVEL SECURITY;

    ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE board_columns FORCE ROW LEVEL SECURITY;

    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

    ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_events FORCE ROW LEVEL SECURITY;

    ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;

    ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_attachments FORCE ROW LEVEL SECURITY;

    ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
    ALTER TABLE webauthn_credentials FORCE ROW LEVEL SECURITY;

    ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
    """)

    # 10. Kebijakan Isolasi Tenant
    tables = [
        "boards", "board_columns", "tasks", "task_events",
        "task_comments", "task_attachments",
        "webauthn_credentials", "attendance_records"
    ]
    for tbl in tables:
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

    # 11. Indeks Performa
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_boards_tenant ON boards(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id, position);
    CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webauthn_cred_member ON webauthn_credentials(tenant_membership_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_member_time ON attendance_records(tenant_membership_id, recorded_at DESC);
    """)

    # 12. Hak akses role orchestree_app
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON boards, board_columns, tasks, task_events,
                  task_comments, task_attachments, webauthn_credentials, attendance_records TO orchestree_app;
        END IF;
    END
    $$;
    """)

    # 13. Daftarkan Capability Fitur Baru
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('tasks.board.view', 1, 'Hak membaca papan Kanban dan daftar tugas'),
        ('tasks.board.manage', 1, 'Hak membuat dan mengonfigurasi papan serta kolom'),
        ('tasks.move', 1, 'Hak memindahkan tahapan tugas antar kolom'),
        ('attendance.webauthn.register', 1, 'Hak mendaftarkan kunci keamanan WebAuthn passkey'),
        ('attendance.clock', 1, 'Hak melakukan check-in dan check-out terverifikasi WebAuthn'),
        ('attendance.view', 1, 'Hak melihat log kehadiran kerja')
    ON CONFLICT (capability_key) DO UPDATE SET
        description = EXCLUDED.description;
    """)

    # 14. Berikan Izin ke Peran-Peran
    op.execute("""
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('tasks.board.view'),
            ('tasks.board.manage'),
            ('tasks.move'),
            ('attendance.webauthn.register'),
            ('attendance.clock'),
            ('attendance.view')
    ) AS c(capability_key)
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('tasks.board.view'),
            ('tasks.board.manage'),
            ('tasks.move'),
            ('attendance.webauthn.register'),
            ('attendance.clock'),
            ('attendance.view')
    ) AS c(capability_key)
    WHERE r.role_code = 'DEPT_MANAGER'
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN (
        VALUES 
            ('tasks.board.view'),
            ('tasks.move'),
            ('attendance.webauthn.register'),
            ('attendance.clock'),
            ('attendance.view')
    ) AS c(capability_key)
    WHERE r.role_code = 'STAFF_HUMAN'
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    # 1. Hapus Kebijakan RLS
    tables = [
        "attendance_records", "webauthn_credentials", "task_attachments",
        "task_comments", "task_events", "tasks", "board_columns", "boards"
    ]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")

    # 2. Hapus Izin & Kapabilitas
    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'tasks.board.view', 'tasks.board.manage', 'tasks.move',
        'attendance.webauthn.register', 'attendance.clock', 'attendance.view'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'tasks.board.view', 'tasks.board.manage', 'tasks.move',
        'attendance.webauthn.register', 'attendance.clock', 'attendance.view'
    );
    """)
