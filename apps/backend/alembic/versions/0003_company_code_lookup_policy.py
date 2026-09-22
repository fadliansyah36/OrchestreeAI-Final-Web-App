"""Kebijakan Pencarian Company Code untuk Registrasi Staf

Revision ID: 0003_company_code_lookup_policy
Revises: 0002_identity_and_authorization
Create Date: 2026-09-22 09:30:00.000000

Mengizinkan query SELECT pada kode perusahaan yang berstatus 'active'
sehingga calon staf yang belum terdaftar pada tenant dapat memvalidasi kode.
"""
from typing import Sequence, Union
from alembic import op


revision: str = "0003_company_code_lookup_policy"
down_revision: Union[str, None] = "0002_identity_and_authorization"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'tenant_company_codes' AND policyname = 'company_code_validation_lookup'
        ) THEN
            CREATE POLICY company_code_validation_lookup ON tenant_company_codes
                FOR SELECT
                USING (status = 'active');
        END IF;
    END
    $$;
    """)


def downgrade() -> None:
    op.execute("""
    DROP POLICY IF EXISTS company_code_validation_lookup ON tenant_company_codes;
    """)
