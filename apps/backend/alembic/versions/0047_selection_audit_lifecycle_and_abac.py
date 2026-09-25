"""Universal AI Selection Audit Lifecycle and ABAC Data Access Control

Revision ID: 0047_selection_audit_lifecycle_and_abac
Revises: 0046_selection_calibration_profiles_and_items
Create Date: 2026-09-25 08:30:00.000000

Skema:
- Indeks performa untuk pelacakan jejak siklus hidup seleksi pada company_context_events
- Registrasi kapabilitas 'selection.audit.view' dan 'selection.abac.enforce'
- Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0047_selection_audit_lifecycle_and_abac"
down_revision: Union[str, None] = "0046_selection_calibration_profiles_and_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Indeks audit siklus hidup seleksi pada company_context_events
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job
    ON company_context_events ((insights->>'selection_job_id'));

    CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job_alt
    ON company_context_events ((insights->>'job_id'));
    """)

    # 2. Pendaftaran Kapabilitas Baru pada feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'selection.audit.view', 1, 'Melihat jejak audit lengkap seluruh siklus hidup seleksi cerdas'),
        (gen_random_uuid(), 'selection.abac.enforce', 1, 'Penegakan kontrol akses data berbasis atribut (ABAC) untuk seleksi')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    # 1. Hapus Kapabilitas
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN ('selection.audit.view', 'selection.abac.enforce');
    """)

    # 2. Hapus Indeks
    op.execute("""
    DROP INDEX IF EXISTS idx_company_context_events_selection_job;
    DROP INDEX IF EXISTS idx_company_context_events_selection_job_alt;
    """)
