"""Inisialisasi Identitas dan Otorisasi Dasar (Fase 1)

Revision ID: 0002_identity_and_authorization
Revises: 0001_initial_core_roles
Create Date: 2026-09-22 09:00:00.000000

PRD v2.2 Bagian 3, Bagian 9, Bagian 13.4, Bagian 16 & Bagian 17:
- Tabel tenants, tenant_memberships, roles, role_permissions, user_roles
- Tabel subscription_plans, feature_capabilities, tenant_capability_overrides
- Tabel audit_logs (terpartisi), outbox_events, platform_settings
- Tabel tenant_company_codes, hr_approval_queue
- Penegakan RLS ketat (ENABLE + FORCE ROW LEVEL SECURITY) pada seluruh tabel bertenant
- Kebijakan isolasi tenant (tenant_isolation) menggunakan current_setting('app.tenant_id', true)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_identity_and_authorization"
down_revision: Union[str, None] = "0001_initial_core_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Hak grant role orchestree_app ke postgres untuk runtime switching
    op.execute("GRANT orchestree_app TO postgres;")

    # 1. subscription_plans (Global Reference Data)
    op.execute("""
    CREATE TABLE IF NOT EXISTS subscription_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_code text NOT NULL UNIQUE,
        tier_level int NOT NULL,
        display_name text NOT NULL,
        price_monthly numeric(18,2),
        currency text NOT NULL DEFAULT 'IDR'
    );
    """)

    # 2. tenants
    op.execute("""
    CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        legal_name text NOT NULL,
        display_name text NOT NULL,
        subscription_plan_id uuid REFERENCES subscription_plans(id),
        status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','churned')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz
    );
    """)

    # 3. tenant_memberships
    op.execute("""
    CREATE TABLE IF NOT EXISTS tenant_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        auth_user_id uuid NOT NULL,
        full_name text NOT NULL,
        department_id uuid,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, auth_user_id)
    );
    """)

    # 4. roles, role_permissions, user_roles
    op.execute("""
    CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_code text NOT NULL UNIQUE CHECK (role_code IN
            ('SUPER_ADMIN','TENANT_OWNER','TENANT_ADMIN','DEPT_MANAGER','STAFF_HUMAN','AI_AGENT')),
        description text
    );

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
    """)

    # 5. feature_capabilities & tenant_capability_overrides
    op.execute("""
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
    """)

    # 6. audit_logs (Partisi Bulanan / Range) & outbox_events
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
            CREATE TABLE audit_logs (
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
            ) PARTITION BY RANGE (created_at);

            CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;
        END IF;
    END
    $$;

    CREATE TABLE IF NOT EXISTS outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
    );
    """)

    # 7. platform_settings
    op.execute("""
    CREATE TABLE IF NOT EXISTS platform_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        description text,
        updated_by uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 8. tenant_company_codes & hr_approval_queue
    op.execute("""
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
    );

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
    """)

    # 9. Penegakan Row Level Security (RLS) dan FORCE RLS (PRD v2.2 Bagian 17.3)
    tables_with_tenant_id = [
        "tenant_memberships",
        "tenant_capability_overrides",
        "audit_logs",
        "outbox_events",
        "tenant_company_codes",
        "hr_approval_queue",
    ]

    # RLS untuk tabel tenants
    op.execute("""
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenant_isolation'
        ) THEN
            CREATE POLICY tenant_isolation ON tenants
                USING (id = current_setting('app.tenant_id', true)::uuid)
                WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
        END IF;
    END
    $$;
    """)

    # RLS untuk tabel bertenant dengan kolom tenant_id
    for tbl in tables_with_tenant_id:
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")
        if tbl in ["audit_logs", "outbox_events"]:
            op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies 
                    WHERE schemaname = 'public' AND tablename = '{tbl}' AND policyname = 'tenant_isolation'
                ) THEN
                    CREATE POLICY tenant_isolation ON {tbl}
                        USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)
                        WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);
                END IF;
            END
            $$;
            """)
        else:
            op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies 
                    WHERE schemaname = 'public' AND tablename = '{tbl}' AND policyname = 'tenant_isolation'
                ) THEN
                    CREATE POLICY tenant_isolation ON {tbl}
                        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
                        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
                END IF;
            END
            $$;
            """)

    # 10. Privilese runtime orchestree_app
    op.execute("""
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orchestree_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orchestree_app;
    """)

    # 11. Seed Data Global Awal
    op.execute("""
    INSERT INTO subscription_plans (plan_code, tier_level, display_name, price_monthly, currency) VALUES
        ('FREE_TRIAL', 0, 'Free Trial', 0.00, 'IDR'),
        ('STARTER', 1, 'Starter Workforce', 499000.00, 'IDR'),
        ('PRO', 2, 'Professional Autonomous', 1999000.00, 'IDR'),
        ('ENTERPRISE', 3, 'Enterprise Autonomous', 9999000.00, 'IDR')
    ON CONFLICT (plan_code) DO NOTHING;

    INSERT INTO roles (role_code, description) VALUES
        ('SUPER_ADMIN', 'Platform Super Administrator'),
        ('TENANT_OWNER', 'Pemilik Utama Tenant Perusahaan'),
        ('TENANT_ADMIN', 'Administrator Tenant Perusahaan'),
        ('DEPT_MANAGER', 'Manajer Departemen'),
        ('STAFF_HUMAN', 'Staf Karyawan'),
        ('AI_AGENT', 'Pekerja AI Autonomous')
    ON CONFLICT (role_code) DO NOTHING;

    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('hr.company_code.manage', 0, 'Kelola dan buat kode registrasi perusahaan'),
        ('hr.approval.review', 0, 'Review dan persetujuan antrean registrasi staf'),
        ('tenant.members.view', 0, 'Lihat anggota dan peran tenant'),
        ('tenant.profile.manage', 0, 'Kelola profil perusahaan tenant')
    ON CONFLICT (capability_key) DO NOTHING;

    -- Mapping permission ke roles
    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    CROSS JOIN feature_capabilities c
    WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    JOIN feature_capabilities c ON c.capability_key IN ('hr.approval.review', 'tenant.members.view')
    WHERE r.role_code = 'DEPT_MANAGER'
    ON CONFLICT (role_id, capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, c.capability_key
    FROM roles r
    JOIN feature_capabilities c ON c.capability_key = 'tenant.members.view'
    WHERE r.role_code = 'STAFF_HUMAN'
    ON CONFLICT (role_id, capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    # 1. Hapus Tabel dalam urutan foreign key
    op.execute("DROP TABLE IF EXISTS hr_approval_queue CASCADE;")
    op.execute("DROP TABLE IF EXISTS tenant_company_codes CASCADE;")
    op.execute("DROP TABLE IF EXISTS platform_settings CASCADE;")
    op.execute("DROP TABLE IF EXISTS outbox_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE;")
    op.execute("DROP TABLE IF EXISTS tenant_capability_overrides CASCADE;")
    op.execute("DROP TABLE IF EXISTS feature_capabilities CASCADE;")
    op.execute("DROP TABLE IF EXISTS user_roles CASCADE;")
    op.execute("DROP TABLE IF EXISTS role_permissions CASCADE;")
    op.execute("DROP TABLE IF EXISTS roles CASCADE;")
    op.execute("DROP TABLE IF EXISTS tenant_memberships CASCADE;")
    op.execute("DROP TABLE IF EXISTS tenants CASCADE;")
    op.execute("DROP TABLE IF EXISTS subscription_plans CASCADE;")
