"""secure tenant rls and member isolation

Revision ID: 0042_secure_tenant_rls_and_member_isolation
Revises: 0041_commercial_plans_subscription_and_credit_engine
Create Date: 2026-09-24 10:00:00.000000

Penguatan Row-Level Security (RLS) pada tabel tenants, tenant_memberships,
dan tenant_subscriptions untuk mencegah kebocoran data organisasi pra-otentikasi:
1. Menghapus policy longgar pada tenants dan tenant_memberships
2. Mengamankan SELECT pada tenants hanya untuk user terotentikasi yang memiliki
   keanggotaan (tenant_memberships) untuk auth.uid() atau sesi app.tenant_id terverifikasi
3. Mengamankan SELECT pada tenant_memberships hanya untuk auth_user_id = auth.uid()
   atau sesi app.tenant_id
4. Memastikan anon role mendapatkan 0 baris secara deterministik
5. Memastikan FORCE ROW LEVEL SECURITY aktif pada seluruh tabel tenansi
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0042_secure_tenant_rls_and_member_isolation'
down_revision: Union[str, None] = '0041_commercial_plans_subscription_and_credit_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Pastikan RLS aktif dan FORCE pada tabel tenants
    op.execute("""
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
    ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
    ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
    """)

    # 2. Perbarui policy tenants
    op.execute("""
    DROP POLICY IF EXISTS tenant_readable_by_member ON tenants;
    DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
    DROP POLICY IF EXISTS tenant_isolation ON tenants;
    DROP POLICY IF EXISTS tenant_write_by_context ON tenants;

    -- SELECT: Hanya member terdaftar atau sesi PDP backend yang dapat membaca tenant
    CREATE POLICY tenant_readable_by_member ON tenants
        FOR SELECT
        USING (
            id IN (
                SELECT tenant_id FROM tenant_memberships
                WHERE auth_user_id = auth.uid()
            )
            OR (
                NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
                AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        );

    -- ALL (Insert/Update/Delete): Hanya sesi PDP backend ber-tenant_id
    CREATE POLICY tenant_write_by_context ON tenants
        FOR ALL
        USING (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
    """)

    # 3. Perbarui policy tenant_memberships
    op.execute("""
    DROP POLICY IF EXISTS membership_readable_by_user ON tenant_memberships;
    DROP POLICY IF EXISTS tenant_isolation_memberships ON tenant_memberships;
    DROP POLICY IF EXISTS tenant_isolation ON tenant_memberships;

    CREATE POLICY membership_readable_by_user ON tenant_memberships
        FOR SELECT
        USING (
            auth_user_id = auth.uid()
            OR (
                NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
                AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        );

    CREATE POLICY membership_write_by_context ON tenant_memberships
        FOR ALL
        USING (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
    """)

    # 4. Perbarui policy tenant_subscriptions
    op.execute("""
    DROP POLICY IF EXISTS subscription_readable_by_member ON tenant_subscriptions;
    DROP POLICY IF EXISTS tenant_isolation_subscriptions ON tenant_subscriptions;
    DROP POLICY IF EXISTS tenant_isolation ON tenant_subscriptions;

    CREATE POLICY subscription_readable_by_member ON tenant_subscriptions
        FOR SELECT
        USING (
            tenant_id IN (
                SELECT tenant_id FROM tenant_memberships
                WHERE auth_user_id = auth.uid()
            )
            OR (
                NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
                AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        );

    CREATE POLICY subscription_write_by_context ON tenant_subscriptions
        FOR ALL
        USING (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
    """)


def downgrade() -> None:
    op.execute("""
    DROP POLICY IF EXISTS tenant_readable_by_member ON tenants;
    DROP POLICY IF EXISTS tenant_write_by_context ON tenants;
    DROP POLICY IF EXISTS membership_readable_by_user ON tenant_memberships;
    DROP POLICY IF EXISTS membership_write_by_context ON tenant_memberships;
    DROP POLICY IF EXISTS subscription_readable_by_member ON tenant_subscriptions;
    DROP POLICY IF EXISTS subscription_write_by_context ON tenant_subscriptions;

    CREATE POLICY tenant_isolation ON tenants
        USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    CREATE POLICY tenant_isolation ON tenant_memberships
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    """)
