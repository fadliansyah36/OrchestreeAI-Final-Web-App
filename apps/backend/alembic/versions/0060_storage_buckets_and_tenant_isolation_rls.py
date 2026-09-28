"""storage buckets and tenant isolation rls

Revision ID: 0060_storage_buckets_and_tenant_isolation_rls
Revises: 0059_staff_documents_and_signed_downloads_rls
Create Date: 2026-09-28 09:00:00.000000

Tata Kelola Storage Bucket & RLS Kebijakan Isolasi Multi-Tenant (PRD v2.2 Bagian 15.3 & Bagian 16.3):
1. Inisialisasi storage buckets resmi: documents, brand-assets, task-attachments, knowledge-base, product-images, tickets, avatars, artifacts, campaigns
2. Kebijakan RLS terisolasi multi-tenant pada storage.objects
3. Registrasi kapabilitas storage.upload, storage.download, storage.delete ke feature_capabilities
4. Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0060_storage_buckets_and_tenant_isolation_rls'
down_revision: Union[str, None] = '0059_staff_documents_and_signed_downloads_rls'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Pastikan skema storage dan tabel buckets serta objects ada
    op.execute("""
    CREATE SCHEMA IF NOT EXISTS storage;

    CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        owner uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        public boolean DEFAULT false,
        avif_autodetection boolean DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
    );

    CREATE TABLE IF NOT EXISTS storage.objects (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        bucket_id text REFERENCES storage.buckets(id) ON DELETE CASCADE,
        name text NOT NULL,
        owner uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        last_accessed_at timestamptz DEFAULT now(),
        metadata jsonb DEFAULT '{}'::jsonb,
        path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
    );

    CREATE INDEX IF NOT EXISTS bname ON storage.objects(bucket_id, name);
    """)

    # 2. Inisialisasi bucket terisolasi
    op.execute("""
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES 
        ('documents', 'documents', false, 25000000),
        ('brand-assets', 'brand-assets', false, 15000000),
        ('task-attachments', 'task-attachments', false, 20000000),
        ('knowledge-base', 'knowledge-base', false, 50000000),
        ('product-images', 'product-images', true, 10000000),
        ('tickets', 'tickets', false, 15000000),
        ('avatars', 'avatars', true, 5000000),
        ('artifacts', 'artifacts', false, 50000000),
        ('campaigns', 'campaigns', false, 20000000)
    ON CONFLICT (id) DO UPDATE SET 
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit;
    """)

    # 3. RLS pada storage.objects
    op.execute("""
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_objects_tenant_isolation'
        ) THEN
            CREATE POLICY storage_objects_tenant_isolation ON storage.objects
                FOR ALL
                TO orchestree_app
                USING (
                    bucket_id IN ('avatars', 'product-images')
                    OR name LIKE 'tenants/' || NULLIF(current_setting('app.tenant_id', true), '') || '/%'
                    OR (metadata->>'tenant_id') = NULLIF(current_setting('app.tenant_id', true), '')
                    OR NULLIF(current_setting('app.tenant_id', true), '') IS NULL
                )
                WITH CHECK (
                    bucket_id IN ('avatars', 'product-images')
                    OR name LIKE 'tenants/' || NULLIF(current_setting('app.tenant_id', true), '') || '/%'
                    OR (metadata->>'tenant_id') = NULLIF(current_setting('app.tenant_id', true), '')
                    OR NULLIF(current_setting('app.tenant_id', true), '') IS NULL
                );
        END IF;
    END $$;
    """)

    # 4. Registrasi kapabilitas fitur penyimpanan
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('storage.upload', 1, 'Hak mengunggah berkas terverifikasi magic bytes ke Supabase Storage'),
        ('storage.download', 1, 'Hak mengunduh berkas terisolasi via Signed URL berjangka pendek'),
        ('storage.delete', 2, 'Hak menghapus berkas dari penyimpanan permanen tenant')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities 
    WHERE capability_key IN ('storage.upload', 'storage.download', 'storage.delete');

    DROP POLICY IF EXISTS storage_objects_tenant_isolation ON storage.objects;

    DELETE FROM storage.buckets 
    WHERE id IN (
        'documents', 'brand-assets', 'task-attachments', 
        'knowledge-base', 'product-images', 'tickets', 
        'avatars', 'artifacts', 'campaigns'
    );
    """)
