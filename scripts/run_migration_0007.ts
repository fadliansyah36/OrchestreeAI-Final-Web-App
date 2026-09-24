import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || (process.env.DATABASE_URL || '');

async function runMigration() {
  console.log('🔄 Memulai eksekusi migrasi DDL 0007_boards_tasks_and_webauthn...');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke database PostgreSQL.');

    await client.query('BEGIN');

    // 1. Buat Tabel boards
    console.log('📦 Membuat tabel boards...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS boards (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name text NOT NULL,
          description text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 2. Buat Tabel board_columns
    console.log('📦 Membuat tabel board_columns...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS board_columns (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
          name text NOT NULL,
          position int NOT NULL DEFAULT 0,
          wip_limit int,
          created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 3. Buat Tabel tasks
    console.log('📦 Membuat tabel tasks (dengan version optimistic locking)...');
    await client.query(`
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
    `);

    // 4. Buat Tabel task_events
    console.log('📦 Membuat tabel task_events...');
    await client.query(`
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
    `);

    // 5. Buat Tabel task_comments
    console.log('📦 Membuat tabel task_comments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_comments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          author_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
          content text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 6. Buat Tabel task_attachments
    console.log('📦 Membuat tabel task_attachments...');
    await client.query(`
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
    `);

    // 7. Buat Tabel webauthn_credentials
    console.log('📦 Membuat tabel webauthn_credentials...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          credential_id text NOT NULL UNIQUE,
          public_key text NOT NULL,
          sign_count bigint NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 8. Buat Tabel attendance_records
    console.log('📦 Membuat tabel attendance_records...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
          check_type text NOT NULL CHECK (check_type IN ('in', 'out')),
          verified_via text NOT NULL DEFAULT 'webauthn',
          recorded_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 9. Terapkan RLS
    console.log('🔒 Mengonfigurasi Row Level Security (RLS)...');
    const tables = [
      'boards', 'board_columns', 'tasks', 'task_events',
      'task_comments', 'task_attachments',
      'webauthn_credentials', 'attendance_records'
    ];
    for (const tbl of tables) {
      await client.query(`
        ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;
      `);
      await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE schemaname = 'public' AND tablename = '${tbl}' AND policyname = '${tbl}_tenant_isolation'
            ) THEN
                CREATE POLICY ${tbl}_tenant_isolation ON ${tbl}
                AS RESTRICTIVE
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
            END IF;
        END
        $$;
      `);
    }

    // 10. Indeks
    console.log('⚡ Membuat indeks query...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_boards_tenant ON boards(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id, position);
      CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id, position);
      CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webauthn_cred_member ON webauthn_credentials(tenant_membership_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_member_time ON attendance_records(tenant_membership_id, recorded_at DESC);
    `);

    // 11. Hak Akses
    await client.query(`
      DO $$
      BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
              GRANT SELECT, INSERT, UPDATE, DELETE ON boards, board_columns, tasks, task_events,
                    task_comments, task_attachments, webauthn_credentials, attendance_records TO orchestree_app;
          END IF;
      END
      $$;
    `);

    // 12. Pendaftaran Kapabilitas Fitur
    console.log('🛡️ Mendaftarkan kapabilitas dan izin otorisasi...');
    await client.query(`
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
    `);

    // 13. Role Permissions
    await client.query(`
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
    `);

    // 14. Tandai versi di tabel alembic_version jika ada
    await client.query(`
      DO $$
      BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version') THEN
              UPDATE alembic_version SET version_num = '0007_boards_tasks_and_webauthn';
          END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
    console.log('🎉 Migrasi 0007_boards_tasks_and_webauthn BERHASIL DITERAPKAN!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migrasi gagal:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration().catch((e) => {
  console.error(e);
  process.exit(1);
});
