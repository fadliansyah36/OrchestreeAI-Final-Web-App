-- Universal AI Selection & Intelligence Domain Expansion
-- Skema Lengkap: Jobs, Source Documents, Criteria, Scoring Results, Insights, Analytics Snapshots, Visualizations, Calibration Profiles
-- RLS FORCE bertenant pada seluruh tabel

-- 1. Tabel Kategori Domain Seleksi
CREATE TABLE IF NOT EXISTS selection_domain_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_key text UNIQUE NOT NULL,
    display_name text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed domain categories
INSERT INTO selection_domain_categories (id, category_key, display_name, description)
VALUES
    (gen_random_uuid(), 'recruitment', 'Rekrutmen & Talenta', 'Penyaringan CV, portofolio, dan penilaian kualifikasi kandidat'),
    (gen_random_uuid(), 'supplier', 'Pengadaan & Vendor', 'Seleksi vendor, evaluasi proposal tender, dan verifikasi kapabilitas'),
    (gen_random_uuid(), 'finance', 'Keuangan & Investasi', 'Analisis kelayakan kredit, underwriting risiko, dan penilaian prospektus'),
    (gen_random_uuid(), 'sales', 'Kualifikasi Prospek', 'Lead scoring, prioritasi deal B2B, dan kecocokan ICP'),
    (gen_random_uuid(), 'general', 'Umum & Operasional', 'Audit dokumen umum dan evaluasi multi-kriteria kustom')
ON CONFLICT (category_key) DO NOTHING;

-- 2. Tabel Profil Kalibrasi Seleksi (per-tenant)
CREATE TABLE IF NOT EXISTS selection_calibration_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_name text NOT NULL,
    domain_category text,
    calibration_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Perluas Tabel selection_jobs
CREATE TABLE IF NOT EXISTS selection_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title text NOT NULL,
    domain_category text,
    instruction_prompt text NOT NULL DEFAULT '',
    calibration_profile_id uuid REFERENCES selection_calibration_profiles(id) ON DELETE SET NULL,
    pipeline_stage text NOT NULL DEFAULT 'uploaded',
    stage_progress_pct numeric(5,2) NOT NULL DEFAULT 0,
    initiated_by_membership_id uuid,
    initiated_by_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- Tambahkan kolom bila tabel sudah ada dari migrasi sebelumnya
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS domain_category text;
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS instruction_prompt text NOT NULL DEFAULT '';
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS calibration_profile_id uuid REFERENCES selection_calibration_profiles(id) ON DELETE SET NULL;
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'uploaded';
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS stage_progress_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS initiated_by_membership_id uuid;
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS initiated_by_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL;
ALTER TABLE selection_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Check constraint untuk pipeline_stage
ALTER TABLE selection_jobs DROP CONSTRAINT IF EXISTS ck_selection_jobs_pipeline_stage;
ALTER TABLE selection_jobs ADD CONSTRAINT ck_selection_jobs_pipeline_stage
    CHECK (pipeline_stage IN ('uploaded','reading','understanding','validating','selecting','scoring','ranking','analyzing','visualizing','recommending','completed','failed'));

CREATE INDEX IF NOT EXISTS idx_selection_jobs_tenant_stage ON selection_jobs(tenant_id, pipeline_stage);

-- 4. Tabel selection_source_documents (Multi-Kanal)
CREATE TABLE IF NOT EXISTS selection_source_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    source_channel text NOT NULL DEFAULT 'file_upload',
    file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL,
    raw_text_ref text,
    detected_schema jsonb,
    data_classification text,
    quality_score numeric(5,2),
    duplicate_of_document_id uuid REFERENCES selection_source_documents(id) ON DELETE SET NULL,
    validity_status text,
    ingested_at timestamptz NOT NULL DEFAULT now()
);

-- Tambahkan kolom dan sesuaikan constraint bila tabel sudah ada
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS selection_job_id uuid REFERENCES selection_jobs(id) ON DELETE CASCADE;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'file_upload';
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS file_artifact_id uuid REFERENCES file_artifacts(id) ON DELETE SET NULL;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS raw_text_ref text;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS detected_schema jsonb;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS data_classification text;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS quality_score numeric(5,2);
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS duplicate_of_document_id uuid REFERENCES selection_source_documents(id) ON DELETE SET NULL;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS validity_status text;
ALTER TABLE selection_source_documents ADD COLUMN IF NOT EXISTS ingested_at timestamptz NOT NULL DEFAULT now();

-- Isi selection_job_id dari job_id jika ada
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='selection_source_documents' AND column_name='job_id'
    ) THEN
        UPDATE selection_source_documents SET selection_job_id = job_id WHERE selection_job_id IS NULL;
        ALTER TABLE selection_source_documents ALTER COLUMN document_name DROP NOT NULL;
        ALTER TABLE selection_source_documents ALTER COLUMN candidate_name DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE selection_source_documents DROP CONSTRAINT IF EXISTS ck_selection_source_channel;
ALTER TABLE selection_source_documents ADD CONSTRAINT ck_selection_source_channel
    CHECK (source_channel IN ('file_upload','prompt_text','whatsapp','telegram','api','database_query','workflow_trigger','integration_fabric'));

ALTER TABLE selection_source_documents DROP CONSTRAINT IF EXISTS ck_selection_validity_status;
ALTER TABLE selection_source_documents ADD CONSTRAINT ck_selection_validity_status
    CHECK (validity_status IS NULL OR validity_status IN ('valid','invalid','needs_review'));

CREATE INDEX IF NOT EXISTS idx_selection_source_docs_job ON selection_source_documents(selection_job_id, tenant_id);

-- 5. Tabel selection_criteria (Terpisah dari Kalibrasi)
CREATE TABLE IF NOT EXISTS selection_criteria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    criterion_key text NOT NULL,
    criterion_label text NOT NULL,
    weight numeric(5,4) NOT NULL,
    source_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_selection_criteria_source_type CHECK (
        source_type IN ('user_prompt','company_brain','user_custom','ai_generated','calibration_profile')
    )
);

CREATE INDEX IF NOT EXISTS idx_selection_criteria_job ON selection_criteria(selection_job_id, tenant_id);

-- 6. Tabel selection_scoring_results
CREATE TABLE IF NOT EXISTS selection_scoring_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    source_document_id uuid NOT NULL REFERENCES selection_source_documents(id) ON DELETE CASCADE,
    entity_label text NOT NULL,
    total_score numeric(7,3) NOT NULL,
    score_breakdown jsonb NOT NULL,
    rank_position int,
    priority_level text,
    recommendation_classification text,
    risk_score numeric(5,2),
    confidence_score numeric(5,2),
    decision_status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_selection_priority_level CHECK (priority_level IS NULL OR priority_level IN ('low','medium','high','critical')),
    CONSTRAINT ck_selection_decision_status CHECK (decision_status IN ('pending','approved','rejected','overridden'))
);

-- Tambahkan kolom bila tabel sudah ada dari 0025
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS selection_job_id uuid REFERENCES selection_jobs(id) ON DELETE CASCADE;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES selection_source_documents(id) ON DELETE CASCADE;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS entity_label text;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS total_score numeric(7,3);
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS priority_level text;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS recommendation_classification text;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS risk_score numeric(5,2);
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2);
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'pending';

-- Drop constraint NOT NULL pada kolom lama jika ada
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='selection_scoring_results' AND column_name='run_id'
    ) THEN
        ALTER TABLE selection_scoring_results ALTER COLUMN run_id DROP NOT NULL;
        ALTER TABLE selection_scoring_results ALTER COLUMN document_id DROP NOT NULL;
        ALTER TABLE selection_scoring_results ALTER COLUMN candidate_name DROP NOT NULL;
        ALTER TABLE selection_scoring_results ALTER COLUMN overall_score DROP NOT NULL;
        ALTER TABLE selection_scoring_results ALTER COLUMN justification DROP NOT NULL;
        ALTER TABLE selection_scoring_results ALTER COLUMN recommendation DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE selection_scoring_results DROP CONSTRAINT IF EXISTS ck_selection_priority_level;
ALTER TABLE selection_scoring_results ADD CONSTRAINT ck_selection_priority_level
    CHECK (priority_level IS NULL OR priority_level IN ('low','medium','high','critical'));

ALTER TABLE selection_scoring_results DROP CONSTRAINT IF EXISTS ck_selection_decision_status;
ALTER TABLE selection_scoring_results ADD CONSTRAINT ck_selection_decision_status
    CHECK (decision_status IN ('pending','approved','rejected','overridden'));

CREATE INDEX IF NOT EXISTS idx_selection_scoring_results_job ON selection_scoring_results(selection_job_id, rank_position);

-- 7. Tabel selection_insights (Insight Naratif AI)
CREATE TABLE IF NOT EXISTS selection_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    insight_type text NOT NULL,
    related_scoring_result_id uuid REFERENCES selection_scoring_results(id) ON DELETE SET NULL,
    content text NOT NULL,
    generated_by_model_id text REFERENCES llm_models(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_selection_insight_type CHECK (
        insight_type IN ('ranking_reason','strength','weakness','risk','anomaly','opportunity','action_recommendation')
    )
);

CREATE INDEX IF NOT EXISTS idx_selection_insights_job ON selection_insights(selection_job_id, tenant_id);

-- 8. Tabel selection_analytics_snapshots (Analytics Dinamis Tersimpan)
CREATE TABLE IF NOT EXISTS selection_analytics_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    analytics_type text NOT NULL,
    result_data jsonb NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_selection_analytics_type CHECK (
        analytics_type IN ('kpi','statistic','distribution','comparison','trend','correlation','performance','anomaly_detection')
    )
);

CREATE INDEX IF NOT EXISTS idx_selection_analytics_job ON selection_analytics_snapshots(selection_job_id, tenant_id);

-- 9. Tabel selection_visualizations (Visualisasi Otomatis)
CREATE TABLE IF NOT EXISTS selection_visualizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    chart_type text NOT NULL,
    chart_config jsonb NOT NULL,
    selection_reason text NOT NULL,
    source_analytics_snapshot_id uuid REFERENCES selection_analytics_snapshots(id) ON DELETE SET NULL,
    CONSTRAINT ck_selection_chart_type CHECK (
        chart_type IN ('bar','line','pie','donut','area','scatter','funnel','heatmap','ranking_chart')
    )
);

CREATE INDEX IF NOT EXISTS idx_selection_visualizations_job ON selection_visualizations(selection_job_id, tenant_id);

-- 10. RLS FORCE bertenant pada Seluruh Tabel Seleksi
ALTER TABLE selection_calibration_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_calibration_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles;
CREATE POLICY p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_jobs_tenant_isolation ON selection_jobs;
CREATE POLICY p_selection_jobs_tenant_isolation ON selection_jobs
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_source_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_source_documents_tenant_isolation ON selection_source_documents;
CREATE POLICY p_selection_source_documents_tenant_isolation ON selection_source_documents
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_criteria FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_criteria_tenant_isolation ON selection_criteria;
CREATE POLICY p_selection_criteria_tenant_isolation ON selection_criteria
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_scoring_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_scoring_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_scoring_results_tenant_isolation ON selection_scoring_results;
CREATE POLICY p_selection_scoring_results_tenant_isolation ON selection_scoring_results
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_insights FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_insights_tenant_isolation ON selection_insights;
CREATE POLICY p_selection_insights_tenant_isolation ON selection_insights
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_analytics_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_analytics_snapshots_tenant_isolation ON selection_analytics_snapshots;
CREATE POLICY p_selection_analytics_snapshots_tenant_isolation ON selection_analytics_snapshots
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_visualizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_visualizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_visualizations_tenant_isolation ON selection_visualizations;
CREATE POLICY p_selection_visualizations_tenant_isolation ON selection_visualizations
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 11. Registrasi Capabilities Seleksi & Pipeline Node
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES 
    (gen_random_uuid(), 'selection.job.create', 1, 'Membuat pekerjaan seleksi multi-sumber baru'),
    (gen_random_uuid(), 'selection.pipeline.run', 1, 'Menjalankan 10 alur pipeline seleksi cerdas otonom'),
    (gen_random_uuid(), 'selection.analytics.view', 1, 'Melihat visualisasi dan analisis dinamis hasil seleksi'),
    (gen_random_uuid(), 'selection.insight.generate', 1, 'Menghasilkan insight rekomendasi dan justifikasi AI'),
    (gen_random_uuid(), 'workflow.node.selection_read', 1, 'Eksekusi node pipeline seleksi: SELECTION_READ'),
    (gen_random_uuid(), 'workflow.node.selection_understand', 1, 'Eksekusi node pipeline seleksi: SELECTION_UNDERSTAND'),
    (gen_random_uuid(), 'workflow.node.selection_validate', 1, 'Eksekusi node pipeline seleksi: SELECTION_VALIDATE'),
    (gen_random_uuid(), 'workflow.node.selection_select', 1, 'Eksekusi node pipeline seleksi: SELECTION_SELECT'),
    (gen_random_uuid(), 'workflow.node.selection_score', 1, 'Eksekusi node pipeline seleksi: SELECTION_SCORE'),
    (gen_random_uuid(), 'workflow.node.selection_rank', 1, 'Eksekusi node pipeline seleksi: SELECTION_RANK'),
    (gen_random_uuid(), 'workflow.node.selection_analyze', 1, 'Eksekusi node pipeline seleksi: SELECTION_ANALYZE'),
    (gen_random_uuid(), 'workflow.node.selection_visualize', 1, 'Eksekusi node pipeline seleksi: SELECTION_VISUALIZE'),
    (gen_random_uuid(), 'workflow.node.selection_recommend', 1, 'Eksekusi node pipeline seleksi: SELECTION_RECOMMEND'),
    (gen_random_uuid(), 'workflow.node.selection_result', 1, 'Eksekusi node pipeline seleksi: SELECTION_RESULT')
ON CONFLICT (capability_key) DO NOTHING;
