"""Perbaikan Casting Safe NULLIF UUID pada Seluruh Kebijakan RLS

Revision ID: 0004_safe_uuid_nullif_rls
Revises: 0003_company_code_lookup_policy
Create Date: 2026-09-22 09:40:00.000000

Mengganti casting current_setting('app.tenant_id', true)::uuid
menjadi NULLIF(current_setting('app.tenant_id', true), '')::uuid
untuk mencegah error DataError saat session setting kosong.
"""
from typing import Sequence, Union
from alembic import op


revision: str = "0004_safe_uuid_nullif_rls"
down_revision: Union[str, None] = "0003_company_code_lookup_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Drop old named policies if present
    for p, t in [
        ('tenant_isolation_tenants', 'tenants'),
        ('tenant_isolation_memberships', 'tenant_memberships'),
        ('tenant_isolation_overrides', 'tenant_capability_overrides'),
        ('tenant_isolation_audit_logs', 'audit_logs'),
        ('tenant_isolation_outbox', 'outbox_events'),
        ('tenant_isolation_company_codes', 'tenant_company_codes'),
        ('tenant_isolation_hr_queue', 'hr_approval_queue'),
    ]:
        op.execute(f"DROP POLICY IF EXISTS {p} ON {t};")

    # 1. tenants
    op.execute("""
    DROP POLICY IF EXISTS tenant_isolation ON tenants;
    CREATE POLICY tenant_isolation ON tenants
        USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    """)

    # 2. Tabel-tabel bertenant
    for tbl in ["tenant_memberships", "tenant_capability_overrides", "tenant_company_codes", "hr_approval_queue"]:
        op.execute(f"""
        DROP POLICY IF EXISTS tenant_isolation ON {tbl};
        CREATE POLICY tenant_isolation ON {tbl}
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        """)

    # 3. audit_logs & outbox_events
    for tbl in ["audit_logs", "outbox_events"]:
        op.execute(f"""
        DROP POLICY IF EXISTS tenant_isolation ON {tbl};
        CREATE POLICY tenant_isolation ON {tbl}
            USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        """)


def downgrade() -> None:
    pass
