"""enforce lowercase tenant status check constraint

Revision ID: 0043_enforce_lowercase_tenant_status
Revises: 0042_secure_tenant_rls_and_member_isolation
Create Date: 2026-09-24 11:00:00.000000

Standardisasi kolom status pada tabel tenants agar selalu lowercase:
1. Normalisasi data eksisting (UPDATE tenants SET status = LOWER(status))
2. Tambahkan CHECK constraint (status = LOWER(status))
   dan nilai valid ('trial', 'active', 'suspended', 'churned')
3. Reversible downgrade dengan menghapus constraint
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0043_enforce_lowercase_tenant_status'
down_revision: Union[str, None] = '0042_secure_tenant_rls_and_member_isolation'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Normalisasi seluruh baris yang ada ke lowercase
    op.execute("UPDATE tenants SET status = LOWER(TRIM(status));")

    # 2. Tambahkan CHECK constraint status lowercase dan nilai terdaftar
    op.execute("""
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_status_lowercase;
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_status_valid;

    ALTER TABLE tenants
        ADD CONSTRAINT ck_tenants_status_lowercase
        CHECK (status = LOWER(status));

    ALTER TABLE tenants
        ADD CONSTRAINT ck_tenants_status_valid
        CHECK (status IN ('trial', 'active', 'suspended', 'churned'));
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_status_valid;
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_status_lowercase;
    """)
