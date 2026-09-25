"""Universal AI Selection Calibration Profiles and Items

Revision ID: 0046_selection_calibration_profiles_and_items
Revises: 0045_selection_history_automation_and_review
Create Date: 2026-09-25 05:00:00.000000

Skema:
- Tabel selection_calibration_profiles (profil kalibrasi kriteria per tenant)
- Tabel selection_calibration_items (entitas item nama tipe + persentase)
- Penegakan RLS FORCE bertenant ketat pada kedua tabel
- Pendaftaran kapabilitas 'selection.calibration.manage'
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0046_selection_calibration_profiles_and_items"
down_revision: Union[str, None] = "0045_selection_history_automation_and_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel selection_calibration_profiles
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_calibration_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        profile_name text NOT NULL,
        domain_category text,
        created_by_membership_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS domain_category text;
    ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS created_by_membership_id uuid;
    ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

    CREATE INDEX IF NOT EXISTS idx_selection_calib_profiles_tenant ON selection_calibration_profiles(tenant_id);
    """)

    # 2. Tabel selection_calibration_items
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_calibration_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        calibration_profile_id uuid NOT NULL REFERENCES selection_calibration_profiles(id) ON DELETE CASCADE,
        field_type_name text NOT NULL,
        percentage numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
        display_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_selection_calib_items_profile ON selection_calibration_items(calibration_profile_id);
    """)

    # 3. Penegakan Row Level Security (RLS) FORCE bertenant
    op.execute("""
    ALTER TABLE selection_calibration_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_calibration_profiles FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles;
    CREATE POLICY p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE selection_calibration_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_calibration_items FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_calibration_items_tenant_isolation ON selection_calibration_items;
    CREATE POLICY p_selection_calibration_items_tenant_isolation ON selection_calibration_items
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (
            EXISTS (
                SELECT 1 FROM selection_calibration_profiles p
                WHERE p.id = selection_calibration_items.calibration_profile_id
                AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM selection_calibration_profiles p
                WHERE p.id = selection_calibration_items.calibration_profile_id
                AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        );
    """)

    # 4. Registrasi Capability PDP
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES 
        (gen_random_uuid(), 'selection.calibration.manage', 1, 'Mengelola profil kalibrasi dan persentase kriteria seleksi')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DROP POLICY IF EXISTS p_selection_calibration_items_tenant_isolation ON selection_calibration_items;
    DROP TABLE IF EXISTS selection_calibration_items;
    DROP POLICY IF EXISTS p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles;
    DROP TABLE IF EXISTS selection_calibration_profiles;
    DELETE FROM feature_capabilities WHERE capability_key = 'selection.calibration.manage';
    """)
