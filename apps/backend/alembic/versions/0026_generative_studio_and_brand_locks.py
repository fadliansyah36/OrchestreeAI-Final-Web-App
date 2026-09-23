"""Generative Studio Hub, Image Router, Brand Asset Locks & Metadata Scrubbing (PRD v2.2 Bagian 11.10, 13.2, 14)

Revision ID: 0026_generative_studio_and_brand_locks
Revises: 0025_universal_selection_and_scoring
Create Date: 2026-09-29 00:00:00.000000

Skema:
- Tabel brand_asset_locks (Kunci identitas palet warna, logo, font, dan gaya visual brand)
- Tabel prompt_library_templates (Pustaka template prompt siap pakai multi-kategori)
- Tabel generative_jobs (Pekerjaan kreasi visual, status state machine, reserve/consume kredit)
- Tabel file_artifacts (Berkas artefak visual bersih, public URL, verifikasi integritas)
- Tabel content_metadata_scrub_log (Audit trail pembersihan EXIF/XMP/C2PA dengan kolom stripped_fields & verified_clean)
- RLS FORCE bertenant pada seluruh 5 tabel
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0026_generative_studio_and_brand_locks"
down_revision: Union[str, None] = "0025_universal_selection_and_scoring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Brand Asset Locks
    op.execute("""
    CREATE TABLE IF NOT EXISTS brand_asset_locks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        brand_name text NOT NULL,
        logo_url text,
        primary_color text NOT NULL DEFAULT '#1FA35A',
        secondary_color text DEFAULT '#0B1220',
        accent_color text DEFAULT '#38BDF8',
        palette_hex_codes jsonb NOT NULL DEFAULT '["#1FA35A", "#0B1220", "#38BDF8"]'::jsonb,
        typography_fonts jsonb NOT NULL DEFAULT '["Plus Jakarta Sans", "Inter"]'::jsonb,
        brand_voice_guidelines text DEFAULT 'Profesional, modern, bersih, berorientasi teknologi masa depan',
        visual_style_keywords jsonb NOT NULL DEFAULT '["clean", "minimalist", "modern tech", "high fidelity"]'::jsonb,
        negative_style_keywords jsonb NOT NULL DEFAULT '["blurry", "low quality", "distorted text", "overexposed", "cluttered"]'::jsonb,
        enforce_strict_palette boolean NOT NULL DEFAULT TRUE,
        enforce_logo_presence boolean NOT NULL DEFAULT FALSE,
        max_color_delta_e numeric NOT NULL DEFAULT 25.0,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_brand_asset_locks_tenant 
    ON brand_asset_locks(tenant_id, is_active);
    """)

    # 2. Prompt Library Templates
    op.execute("""
    CREATE TABLE IF NOT EXISTS prompt_library_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title text NOT NULL,
        category text NOT NULL DEFAULT 'PRODUCT_SHOWCASE'
            CHECK (category IN ('PRODUCT_SHOWCASE', 'MARKETING_HERO', 'PROMO_BANNER', 'LOGO_MOCKUP', 'SOCIAL_STORY', 'ECOMMERCE_CATALOG', 'BRAND_ASSET')),
        template_body text NOT NULL,
        default_negative_prompt text,
        recommended_aspect_ratio text NOT NULL DEFAULT '1:1'
            CHECK (recommended_aspect_ratio IN ('1:1', '16:9', '9:16', '4:3', '3:2')),
        style_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        credit_estimate numeric NOT NULL DEFAULT 5.0,
        usage_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant_cat 
    ON prompt_library_templates(tenant_id, category);
    """)

    # 3. Generative Jobs
    op.execute("""
    CREATE TABLE IF NOT EXISTS generative_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_type text NOT NULL DEFAULT 'IMAGE_GENERATION'
            CHECK (job_type IN ('IMAGE_GENERATION', 'PRODUCT_SHOWCASE', 'PRODUCT_MOCKUP', 'MARKETING_HERO', 'PROMO_BANNER', 'LOGO_MOCKUP', 'SOCIAL_STORY', 'SOCIAL_POST_VISUAL', 'ECOMMERCE_CATALOG', 'BRAND_ASSET', 'BANNER', 'PROMO_FLYER')),
        prompt text NOT NULL,
        composed_prompt text,
        negative_prompt text,
        aspect_ratio text NOT NULL DEFAULT '1:1'
            CHECK (aspect_ratio IN ('1:1', '16:9', '9:16', '4:3', '3:2')),
        style_preset text,
        model_used text NOT NULL DEFAULT 'gpt-image-2',
        status text NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING', 'COMPOSING', 'GENERATING', 'VALIDATING', 'SCRUBBING', 'COMPLETED', 'REJECTED', 'FAILED')),
        rejection_reason text,
        brand_lock_applied boolean NOT NULL DEFAULT FALSE,
        brand_lock_id uuid REFERENCES brand_asset_locks(id) ON DELETE SET NULL,
        credit_cost numeric NOT NULL DEFAULT 5.0,
        credit_reserved boolean NOT NULL DEFAULT FALSE,
        credit_consumed boolean NOT NULL DEFAULT FALSE,
        output_artifact_id uuid,
        quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_generative_jobs_tenant_status 
    ON generative_jobs(tenant_id, status);
    """)

    # 4. File Artifacts
    op.execute("""
    CREATE TABLE IF NOT EXISTS file_artifacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_id uuid REFERENCES generative_jobs(id) ON DELETE SET NULL,
        file_name text NOT NULL,
        storage_path text NOT NULL,
        public_url text NOT NULL,
        mime_type text NOT NULL DEFAULT 'image/png',
        file_size_bytes bigint NOT NULL DEFAULT 0,
        width int,
        height int,
        checksum_sha256 text,
        verified_clean boolean NOT NULL DEFAULT FALSE,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_file_artifacts_tenant_clean 
    ON file_artifacts(tenant_id, verified_clean);
    """)

    # 5. Content Metadata Scrub Log (Retrofit & Universal Scrub Log)
    op.execute("""
    CREATE TABLE IF NOT EXISTS content_metadata_scrub_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        artifact_id uuid REFERENCES file_artifacts(id) ON DELETE CASCADE,
        job_id uuid REFERENCES generative_jobs(id) ON DELETE SET NULL,
        source_module text NOT NULL DEFAULT 'GENERATIVE_STUDIO',
        original_filename text NOT NULL,
        cleaned_filename text NOT NULL,
        stripped_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        verified_clean boolean NOT NULL DEFAULT FALSE,
        scrub_details jsonb NOT NULL DEFAULT '{}'::jsonb,
        scrubbed_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_scrub_log_tenant_artifact 
    ON content_metadata_scrub_log(tenant_id, artifact_id);
    """)

    # 6. FK dari generative_jobs ke file_artifacts
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_generative_jobs_artifact'
        ) THEN
            ALTER TABLE generative_jobs
            ADD CONSTRAINT fk_generative_jobs_artifact
            FOREIGN KEY (output_artifact_id) REFERENCES file_artifacts(id) ON DELETE SET NULL;
        END IF;
    END $$;
    """)

    # 7. Aktifkan Row-Level Security (RLS) pada seluruh 5 tabel
    tables = [
        "brand_asset_locks",
        "prompt_library_templates",
        "generative_jobs",
        "file_artifacts",
        "content_metadata_scrub_log"
    ]

    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE tablename = '{table}' AND policyname = '{table}_tenant_isolation'
            ) THEN
                CREATE POLICY {table}_tenant_isolation ON {table}
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
            END IF;
        END $$;
        """)

    # 8. Daftarkan Capability Baru di feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'generative.image.create', 1, 'Eksekusi Model Router image multi-provider (GPT-Image-2 prioritas 1, fallback NVIDIA NIM) dengan Universal Prompt Composer'),
        (gen_random_uuid(), 'brand.asset.lock', 2, 'Proteksi konsistensi palet warna, logo, dan gaya visual dengan Output Validator Gate terpadu'),
        (gen_random_uuid(), 'metadata.clean.verified', 1, 'Pembersihan 100% metadata teknis sebelum berkas dapat diunduh atau dipublikasikan')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE IF EXISTS generative_jobs DROP CONSTRAINT IF EXISTS fk_generative_jobs_artifact;
    DROP TABLE IF EXISTS content_metadata_scrub_log CASCADE;
    DROP TABLE IF EXISTS file_artifacts CASCADE;
    DROP TABLE IF EXISTS generative_jobs CASCADE;
    DROP TABLE IF EXISTS prompt_library_templates CASCADE;
    DROP TABLE IF EXISTS brand_asset_locks CASCADE;
    DELETE FROM feature_capabilities WHERE capability_key IN ('generative.image.create', 'brand.asset.lock', 'metadata.clean.verified');
    """)
