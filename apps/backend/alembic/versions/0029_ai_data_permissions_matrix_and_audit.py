"""AI Data Permission Matrix & Audit Ledger (PRD v2.2 Bagian 3.3, 3.5, 14.2, 16.1)

Revision ID: 0029_ai_data_permissions
Revises: 0028_integration_fabric_dpia_and_kms
Create Date: 2026-09-23 04:00:00.000000

Skema:
- Penambahan kolom access_level pada ai_data_permission_policies ('NONE', 'READ_ONLY', 'READ_WRITE', 'ADMIN')
- Indeks performa untuk matriks izin bertenant
- Registrasi feature capabilities: ai_data_permissions.view & ai_data_permissions.manage
- Penegakan RLS FORCE terisolasi tenant
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0029_ai_data_permissions"
down_revision: Union[str, None] = "0028_integration_fabric_dpia_and_kms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tambah kolom access_level pada ai_data_permission_policies
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'ai_data_permission_policies' AND column_name = 'access_level'
        ) THEN
            ALTER TABLE ai_data_permission_policies
                ADD COLUMN access_level text NOT NULL DEFAULT 'READ_ONLY'
                CHECK (access_level IN ('NONE', 'READ_ONLY', 'READ_WRITE', 'ADMIN'));
        END IF;
    END $$;
    """)

    # 2. Indeks matriks untuk lookup cepat
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_ai_data_policies_matrix
    ON ai_data_permission_policies(tenant_id, agent_persona_type, resource_identifier);
    """)

    # 3. Registrasi kapabilitas fitur
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('ai_data_permissions.view', 1, 'Melihat matriks izin akses data agen AI terhadap sistem korporat'),
        ('ai_data_permissions.manage', 2, 'Mengubah matriks izin akses data agen AI (khusus TENANT_OWNER / TENANT_ADMIN)')
    ON CONFLICT (capability_key) DO NOTHING;
    """)

    # 4. RLS FORCE bertenant
    op.execute("""
    ALTER TABLE ai_data_permission_policies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_data_permission_policies FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies;
    CREATE POLICY tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    GRANT ALL ON ai_data_permission_policies TO authenticated, orchestree_app;
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX IF EXISTS idx_ai_data_policies_matrix;
    ALTER TABLE ai_data_permission_policies DROP COLUMN IF EXISTS access_level;
    DELETE FROM feature_capabilities WHERE capability_key IN ('ai_data_permissions.view', 'ai_data_permissions.manage');
    """)
