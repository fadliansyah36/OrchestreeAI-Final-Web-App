"""create persistent auth token revocation ledger

Revision ID: 0061_auth_token_revocation
Revises: 0060_storage_buckets_and_tenant_isolation_rls
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0061_auth_token_revocation"
down_revision: Union[str, None] = "0060_storage_buckets_and_tenant_isolation_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_revoked_tokens",
        sa.Column("token_hash", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_auth_revoked_tokens_revoked_at", "auth_revoked_tokens", ["revoked_at"])


def downgrade() -> None:
    op.drop_index("ix_auth_revoked_tokens_revoked_at", table_name="auth_revoked_tokens")
    op.drop_table("auth_revoked_tokens")
