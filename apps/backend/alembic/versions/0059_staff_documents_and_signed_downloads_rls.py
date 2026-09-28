"""staff documents and signed downloads rls

Revision ID: 0059_staff_documents_and_signed_downloads_rls
Revises: 0058_channel_verification_otp_hash_and_audit
Create Date: 2026-09-28 08:00:00.000000

Tata Kelola Upload & Unduhan Berkas Nyata Terisolasi RLS (PRD v2.2 Bagian 15.3, 16.3, & Bagian 18):
1. Tabel staff_documents untuk arsip berkas karyawan (KTP, NPWP, Sertifikat, Slip Gaji, Kontrak)
2. Kolom file_artifact_id pada service_request_attachments
3. Pendaftaran kapabilitas otorisasi unduhan dan upload aman pada feature_capabilities
4. Penegakan kebijakan RLS ENABLE + FORCE pada staff_documents
5. Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0059_staff_documents_and_signed_downloads_rls'
down_revision: Union[str, None] = '0058_channel_verification_otp_hash_and_audit'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel staff_documents
    op.execute("""
    CREATE TABLE IF NOT EXISTS staff_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        document_type varchar(50) NOT NULL, -- 'KTP', 'NPWP', 'CERTIFICATE', 'PAYSLIP', 'CONTRACT', 'OTHER'
        document_title varchar(255) NOT NULL,
        file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL,
        storage_path text NOT NULL,
        file_size_bytes bigint NOT NULL DEFAULT 0,
        mime_type varchar(100) NOT NULL,
        verified_clean boolean NOT NULL DEFAULT true,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_documents_tenant_member
        ON staff_documents(tenant_id, membership_id);

    CREATE INDEX IF NOT EXISTS idx_staff_documents_type
        ON staff_documents(tenant_id, document_type);

    -- RLS Enforce
    ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE staff_documents FORCE ROW LEVEL SECURITY;

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'staff_documents' AND policyname = 'staff_documents_tenant_isolation'
        ) THEN
            CREATE POLICY staff_documents_tenant_isolation ON staff_documents
                FOR ALL
                TO orchestree_app
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        END IF;
    END $$;
    """)

    # 2. Perluas service_request_attachments dengan file_artifact_id
    op.execute("""
    ALTER TABLE service_request_attachments
        ADD COLUMN IF NOT EXISTS file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL;
    """)

    # 3. Registrasi kapabilitas fitur baru
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('staff.documents.upload', 1, 'Hak mengunggah dokumen identitas dan berkas resmi staf'),
        ('staff.documents.view', 1, 'Hak melihat arsip dokumen staf dan riwayat berkas'),
        ('staff.documents.download', 1, 'Hak mengunduh dokumen staf dan slip gaji via Signed URL sementara'),
        ('selection.documents.upload', 1, 'Hak mengunggah dokumen sumber kandidat atau vendor multi-format'),
        ('selection.reports.download', 1, 'Hak mengunduh berkas laporan hasil evaluasi seleksi cerdas'),
        ('billing.invoice.download', 1, 'Hak mengunduh dokumen faktur tagihan dan laporan pembayaran resmi')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities 
    WHERE capability_key IN (
        'staff.documents.upload',
        'staff.documents.view',
        'staff.documents.download',
        'selection.documents.upload',
        'selection.reports.download',
        'billing.invoice.download'
    );

    ALTER TABLE service_request_attachments
        DROP COLUMN IF EXISTS file_artifact_id;

    DROP POLICY IF EXISTS staff_documents_tenant_isolation ON staff_documents;
    DROP TABLE IF EXISTS staff_documents;
    """)
