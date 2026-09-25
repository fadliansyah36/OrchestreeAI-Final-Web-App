-- OrchestreeAI Migration 20260925000007
-- Pustaka Template Prompt Siap Pakai & Visual Composer Atomik (PRD v2.2 Bagian 11.10, 13.2, H.1)

-- 0. Perluas tipe pekerjaan dan rasio aspek pada generative_jobs
ALTER TABLE generative_jobs DROP CONSTRAINT IF EXISTS generative_jobs_job_type_check;
ALTER TABLE generative_jobs ADD CONSTRAINT generative_jobs_job_type_check
    CHECK (job_type IN (
        'IMAGE_GENERATION', 'PRODUCT_SHOWCASE', 'PRODUCT_MOCKUP', 'MARKETING_HERO',
        'PROMO_BANNER', 'LOGO_MOCKUP', 'SOCIAL_STORY', 'SOCIAL_POST_VISUAL',
        'ECOMMERCE_CATALOG', 'BRAND_ASSET', 'BANNER', 'PROMO_FLYER',
        'SOCIAL_MEDIA_POST', 'PRODUCT_PHOTO', 'BRAND_MASCOT', 'STAFF_AVATAR',
        'INFOGRAPHIC_REPORT', 'UI_MOCKUP_PITCH', 'EVENT_POSTER'
    ));

ALTER TABLE generative_jobs DROP CONSTRAINT IF EXISTS generative_jobs_aspect_ratio_check;
ALTER TABLE generative_jobs ADD CONSTRAINT generative_jobs_aspect_ratio_check
    CHECK (aspect_ratio IN ('1:1', '16:9', '9:16', '4:3', '3:2', '4:5', '3:4'));

-- 1. Tabel Kategori Template
CREATE TABLE IF NOT EXISTS prompt_template_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    description text NOT NULL,
    icon_key text NOT NULL,
    display_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_template_categories_order ON prompt_template_categories(display_order, category_code);

-- 2. Tabel Pustaka Template Prompt Atomik Terstruktur
CREATE TABLE IF NOT EXISTS prompt_template_library (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES prompt_template_categories(id) ON DELETE CASCADE,
    template_name text NOT NULL,
    concept_summary text NOT NULL,
    subject_field text NOT NULL,
    scene_context_field text,
    lighting_field text,
    material_texture_field text,
    composition_layout_field text,
    color_palette_field text,
    style_reference_field text,
    constraints_field text,
    avoid_terms text[] DEFAULT '{}'::text[],
    prefer_terms text[] DEFAULT '{}'::text[],
    recommended_aspect_ratio text DEFAULT '1:1',
    recommended_platform text[] DEFAULT '{}'::text[],
    example_generated_file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL,
    is_global boolean NOT NULL DEFAULT true,
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    created_by uuid,
    usage_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_prompt_template_aspect_ratio CHECK (
        recommended_aspect_ratio IN ('1:1', '9:16', '16:9', '4:5', '3:4', '4:3', '3:2')
    )
);

CREATE INDEX IF NOT EXISTS idx_prompt_template_library_category ON prompt_template_library(category_id);
CREATE INDEX IF NOT EXISTS idx_prompt_template_library_tenant ON prompt_template_library(tenant_id, is_global);
CREATE INDEX IF NOT EXISTS idx_prompt_template_library_usage ON prompt_template_library(usage_count DESC, created_at DESC);

-- 3. Tabel Jejak Pemakaian Template
CREATE TABLE IF NOT EXISTS prompt_template_usage_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES prompt_template_library(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    generative_job_id uuid REFERENCES generative_jobs(id) ON DELETE SET NULL,
    used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_template_usage_tenant ON prompt_template_usage_log(tenant_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_template_usage_template ON prompt_template_usage_log(template_id, used_at DESC);

-- 4. Keamanan & Penegakan RLS
ALTER TABLE prompt_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prompt_template_categories_select ON prompt_template_categories;
CREATE POLICY p_prompt_template_categories_select ON prompt_template_categories
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS p_prompt_template_categories_admin ON prompt_template_categories;
CREATE POLICY p_prompt_template_categories_admin ON prompt_template_categories
    FOR ALL
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

ALTER TABLE prompt_template_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_library FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prompt_template_library_select ON prompt_template_library;
CREATE POLICY p_prompt_template_library_select ON prompt_template_library
    FOR SELECT
    USING (
        is_global = true
        OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DROP POLICY IF EXISTS p_prompt_template_library_insert ON prompt_template_library;
CREATE POLICY p_prompt_template_library_insert ON prompt_template_library
    FOR INSERT
    WITH CHECK (
        (is_global = false AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DROP POLICY IF EXISTS p_prompt_template_library_update ON prompt_template_library;
CREATE POLICY p_prompt_template_library_update ON prompt_template_library
    FOR UPDATE
    USING (
        (is_global = false AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DROP POLICY IF EXISTS p_prompt_template_library_delete ON prompt_template_library;
CREATE POLICY p_prompt_template_library_delete ON prompt_template_library
    FOR DELETE
    USING (
        (is_global = false AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

ALTER TABLE prompt_template_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_usage_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prompt_template_usage_log_tenant ON prompt_template_usage_log;
CREATE POLICY p_prompt_template_usage_log_tenant ON prompt_template_usage_log
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

-- 5. Hak Akses Role Aplikasi
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_template_categories TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_template_library TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_template_usage_log TO orchestree_app;
    END IF;
END $$;

-- 6. Registrasi Kapabilitas Baru ke feature_capabilities
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES
    (gen_random_uuid(), 'generative.prompt_library.read', 0, 'Melihat dan mencari pustaka template prompt siap pakai'),
    (gen_random_uuid(), 'generative.prompt_library.manage', 1, 'Menyimpan dan mengelola template prompt privat tenant'),
    (gen_random_uuid(), 'generative.prompt_library.curate', 2, 'Kurasi master data kategori dan template prompt global platform')
ON CONFLICT (capability_key) DO UPDATE SET
    min_tier_level = EXCLUDED.min_tier_level,
    description = EXCLUDED.description;
