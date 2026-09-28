-- 20260927000001_staff_documents_and_signed_downloads_rls.sql
-- Tata Kelola Upload & Unduhan Berkas Nyata Terisolasi RLS (PRD v2.2 Bagian 15.3, 16.3, & Bagian 18)

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

ALTER TABLE service_request_attachments
    ADD COLUMN IF NOT EXISTS file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL;

INSERT INTO feature_capabilities (id, capability_name, description, default_roles)
VALUES 
    ('staff.documents.upload', 'Upload Dokumen Staf', 'Hak mengunggah dokumen identitas dan berkas resmi staf', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN', 'SUPER_ADMIN']),
    ('staff.documents.view', 'Lihat Dokumen Staf', 'Hak melihat arsip dokumen staf dan riwayat berkas', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN', 'SUPER_ADMIN']),
    ('staff.documents.download', 'Unduh Dokumen Staf & Slip Gaji', 'Hak mengunduh dokumen staf dan slip gaji via Signed URL sementara', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN', 'SUPER_ADMIN']),
    ('selection.documents.upload', 'Upload Dokumen Seleksi Cerdas', 'Hak mengunggah dokumen sumber kandidat atau vendor multi-format', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'SUPER_ADMIN']),
    ('selection.reports.download', 'Unduh Laporan Seleksi', 'Hak mengunduh berkas laporan hasil evaluasi seleksi cerdas', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'SUPER_ADMIN']),
    ('billing.invoice.download', 'Unduh Faktur Tagihan', 'Hak mengunduh dokumen faktur tagihan dan laporan pembayaran resmi', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN'])
ON CONFLICT (id) DO NOTHING;
