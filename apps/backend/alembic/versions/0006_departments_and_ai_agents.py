"""Inisialisasi Tabel Departemen dan AI Agent Registry dengan Isolasi RLS

Revision ID: 0006_departments_and_ai_agents
Revises: 0005_fix_roles_rls
Create Date: 2026-09-22 10:15:00.000000

Skema Tenaga Kerja Organisasi:
- Tabel departments: Struktur departemen, hierarki induk, manajer, tag warna, dan soft delete
- Relasi tenant_memberships.department_id -> departments(id)
- Tabel ai_agents: Registri agen AI otonom dengan persona_type dan status
- Penegakan RLS ketat (ENABLE + FORCE ROW LEVEL SECURITY)
- Kebijakan isolasi tenant (tenant_isolation) menggunakan current_setting('app.tenant_id', true)
- Pendaftaran kapabilitas fitur: workforce.department.manage, workforce.staff.manage, workforce.agent.manage
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0006_departments_and_ai_agents"
down_revision: Union[str, None] = "0005_fix_roles_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Buat Tabel departments
    op.execute("""
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
    );
    """)

    # 2. Tambah foreign key department_id pada tenant_memberships jika belum ada
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'tenant_memberships'
            AND column_name = 'department_id'
        ) THEN
            ALTER TABLE tenant_memberships ADD COLUMN department_id uuid REFERENCES departments(id);
        ELSE
            -- Tambahkan constraint FK jika kolom sudah ada tetapi belum berelasi
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema = 'public'
                AND table_name = 'tenant_memberships'
                AND constraint_name = 'tenant_memberships_department_id_fkey'
            ) THEN
                ALTER TABLE tenant_memberships ADD CONSTRAINT tenant_memberships_department_id_fkey
                FOREIGN KEY (department_id) REFERENCES departments(id);
            END IF;
        END IF;
    END
    $$;
    """)

    # 3. Buat Tabel ai_agents
    # Catatan Utang Teknis: Kolom persona_type saat ini menerima kode identifier bebas
    # dan dijadwalkan akan digantikan dengan foreign key wajib job_title_id pada iterasi mendatang.
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_agents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        department_id uuid REFERENCES departments(id),
        persona_type text NOT NULL,
        display_name text NOT NULL,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
        created_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 4. Terapkan ENABLE dan FORCE ROW LEVEL SECURITY (RLS)
    op.execute("""
    ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE departments FORCE ROW LEVEL SECURITY;

    ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_agents FORCE ROW LEVEL SECURITY;
    """)

    # 5. Kebijakan Isolasi Tenant
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'departments' AND policyname = 'departments_tenant_isolation'
        ) THEN
            CREATE POLICY departments_tenant_isolation ON departments
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'ai_agents' AND policyname = 'ai_agents_tenant_isolation'
        ) THEN
            CREATE POLICY ai_agents_tenant_isolation ON ai_agents
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        END IF;
    END
    $$;
    """)

    # 6. Hak Akses Schema untuk Runtime orchestree_app
    op.execute("""
    GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO orchestree_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agents TO orchestree_app;
    """)

    # 7. Daftarkan Kapabilitas Tenaga Kerja ke feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('workforce.department.manage', 0, 'Kelola struktur hierarki departemen organisasi'),
        ('workforce.department.view', 0, 'Lihat departemen organisasi'),
        ('workforce.staff.manage', 0, 'Kelola dan mutasi staf anggota tenant'),
        ('workforce.staff.view', 0, 'Lihat data staf anggota tenant'),
        ('workforce.agent.manage', 0, 'Kelola registri dan status AI Agent otonom'),
        ('workforce.agent.view', 0, 'Lihat registri dan metrik AI Agent')
    ON CONFLICT (capability_key) DO NOTHING;

    -- Mapping kapabilitas ke peran TENANT_OWNER dan TENANT_ADMIN
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN feature_capabilities c
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
    AND c.capability_key IN (
        'workforce.department.manage',
        'workforce.department.view',
        'workforce.staff.manage',
        'workforce.staff.view',
        'workforce.agent.manage',
        'workforce.agent.view'
    )
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    -- Mapping kapabilitas spesifik ke DEPT_MANAGER
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    JOIN feature_capabilities c ON c.capability_key IN (
        'workforce.department.view',
        'workforce.staff.view',
        'workforce.agent.view'
    )
    WHERE r.role_code = 'DEPT_MANAGER'
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    -- Mapping kapabilitas baca dasar ke STAFF_HUMAN
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    JOIN feature_capabilities c ON c.capability_key IN (
        'workforce.staff.view',
        'workforce.agent.view'
    )
    WHERE r.role_code = 'STAFF_HUMAN'
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    # Hapus kebijakan dan tabel dalam urutan aman
    op.execute("DROP POLICY IF EXISTS ai_agents_tenant_isolation ON ai_agents;")
    op.execute("DROP POLICY IF EXISTS departments_tenant_isolation ON departments;")
    op.execute("DROP TABLE IF EXISTS ai_agents CASCADE;")

    # Lepas FK department_id di tenant_memberships
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
            AND table_name = 'tenant_memberships'
            AND constraint_name = 'tenant_memberships_department_id_fkey'
        ) THEN
            ALTER TABLE tenant_memberships DROP CONSTRAINT tenant_memberships_department_id_fkey;
        END IF;
    END
    $$;
    """)

    op.execute("DROP TABLE IF EXISTS departments CASCADE;")

    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'workforce.department.manage',
        'workforce.department.view',
        'workforce.staff.manage',
        'workforce.staff.view',
        'workforce.agent.manage',
        'workforce.agent.view'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'workforce.department.manage',
        'workforce.department.view',
        'workforce.staff.manage',
        'workforce.staff.view',
        'workforce.agent.manage',
        'workforce.agent.view'
    );
    """)
