"""Konfigurasi RLS untuk User Roles dan Tabel Katalog Global

Revision ID: 0005_fix_catalog_and_user_roles_rls
Revises: 0004_safe_uuid_nullif_rls
Create Date: 2026-09-22 09:50:00.000000

- Menambahkan policy tenant_isolation pada user_roles berbasis relasi tenant_memberships
- Men-disable RLS pada tabel katalog global publik (roles, role_permissions, subscription_plans, dll)
"""
from typing import Sequence, Union
from alembic import op


revision: str = "0005_fix_roles_rls"
down_revision: Union[str, None] = "0004_safe_uuid_nullif_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. user_roles policy
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_tenant_isolation'
        ) THEN
            CREATE POLICY user_roles_tenant_isolation ON user_roles
                USING (
                    EXISTS (
                        SELECT 1 FROM tenant_memberships tm
                        WHERE tm.id = user_roles.tenant_membership_id
                        AND tm.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                    )
                )
                WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM tenant_memberships tm
                        WHERE tm.id = user_roles.tenant_membership_id
                        AND tm.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                    )
                );
        END IF;
    END
    $$;
    """)

    # 2. Disable RLS pada tabel katalog / metadata global
    catalog_tables = [
        "roles",
        "role_permissions",
        "subscription_plans",
        "feature_capabilities",
        "platform_settings",
        "llm_providers",
        "llm_models",
        "mcp_tools",
        "tool_health_checks",
        "workflow_nodes",
        "alembic_version",
    ]
    for tbl in catalog_tables:
        op.execute(f"ALTER TABLE {tbl} DISABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_roles_tenant_isolation ON user_roles;")
