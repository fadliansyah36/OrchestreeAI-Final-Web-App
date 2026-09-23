"""data quality issues and confidence

Revision ID: 0039_data_quality_issues_and_confidence
Revises: 0038_chief_of_staff_briefings_synthesizer
Create Date: 2026-09-23 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0039_data_quality_issues_and_confidence'
down_revision: Union[str, None] = '0038_chief_of_staff_briefings_synthesizer'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'data_quality_issues',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('entity_type', sa.String(length=64), nullable=False),
        sa.Column('entity_id', sa.String(length=128), nullable=False),
        sa.Column('field_name', sa.String(length=64), nullable=False),
        sa.Column('issue_type', sa.String(length=48), nullable=False),
        sa.Column('severity', sa.String(length=16), server_default='MEDIUM', nullable=False),
        sa.Column('availability_state', sa.String(length=24), nullable=False),
        sa.Column('confidence_score', sa.Numeric(precision=5, scale=4), server_default='0.0000', nullable=False),
        sa.Column('sources_involved', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('conflict_details', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('ai_auto_selection_prevented', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('requires_human_resolution', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('resolution_status', sa.String(length=24), server_default='UNRESOLVED', nullable=False),
        sa.Column('resolved_by', sa.String(length=128), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_source_chosen', sa.String(length=128), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index(
        'idx_data_quality_issues_tenant_status',
        'data_quality_issues',
        ['tenant_id', 'resolution_status'],
        unique=False
    )
    op.create_index(
        'idx_data_quality_issues_entity',
        'data_quality_issues',
        ['tenant_id', 'entity_type', 'entity_id'],
        unique=False
    )
    op.create_index(
        'idx_data_quality_issues_availability',
        'data_quality_issues',
        ['tenant_id', 'availability_state'],
        unique=False
    )

    # Enable RLS
    op.execute("ALTER TABLE data_quality_issues ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY data_quality_issues_tenant_isolation ON data_quality_issues
            FOR ALL
            USING (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
                OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
                OR current_user IN ('postgres', 'service_role')
            );
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS data_quality_issues_tenant_isolation ON data_quality_issues;")
    op.drop_index('idx_data_quality_issues_availability', table_name='data_quality_issues')
    op.drop_index('idx_data_quality_issues_entity', table_name='data_quality_issues')
    op.drop_index('idx_data_quality_issues_tenant_status', table_name='data_quality_issues')
    op.drop_table('data_quality_issues')
