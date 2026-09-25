-- Universal AI Selection History, Automation, Human Review & Export (PRD v2.2 Bagian 13.1 & 17.5)
-- Menambahkan:
-- 1. Tabel selection_reruns (pelacakan variasi eksperimen kriteria antar-pekerjaan)
-- 2. Tabel selection_automation_triggers (pemicu terjadwal, unggah berkas, webhook, alur kerja)
-- 3. Tabel selection_automation_executions (riwayat eksekusi otomasi)
-- 4. Kolom audit review manual pada selection_scoring_results (previous_rank_position, reviewer_notes)
-- 5. Kebijakan RLS FORCE bertenant ketat pada seluruh tabel baru

-- 1. Tabel selection_reruns
CREATE TABLE IF NOT EXISTS selection_reruns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    new_selection_job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
    changed_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_reruns_tenant ON selection_reruns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_selection_reruns_orig ON selection_reruns(original_selection_job_id);
CREATE INDEX IF NOT EXISTS idx_selection_reruns_new ON selection_reruns(new_selection_job_id);

-- 2. Tabel selection_automation_triggers
CREATE TABLE IF NOT EXISTS selection_automation_triggers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_name text NOT NULL DEFAULT 'Pemicu Seleksi Otomatis',
    trigger_type text NOT NULL CHECK (trigger_type IN ('new_file_upload','scheduled','webhook','workflow_trigger')),
    trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    target_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    criteria_template jsonb NOT NULL DEFAULT '[]'::jsonb,
    calibration_profile_id uuid REFERENCES selection_calibration_profiles(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_triggers_tenant_type ON selection_automation_triggers(tenant_id, trigger_type, is_active);

-- 3. Tabel selection_automation_executions
CREATE TABLE IF NOT EXISTS selection_automation_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_id uuid NOT NULL REFERENCES selection_automation_triggers(id) ON DELETE CASCADE,
    selection_job_id uuid REFERENCES selection_jobs(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','running')),
    detail text,
    executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_exec_tenant_trigger ON selection_automation_executions(tenant_id, trigger_id);

-- 4. Perluas selection_scoring_results untuk Audit Trail Review Manusia
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS previous_rank_position int;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS reviewer_notes text;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid;
ALTER TABLE selection_scoring_results ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 5. RLS FORCE bertenant pada Seluruh Tabel Baru
ALTER TABLE selection_reruns ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_reruns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_reruns_tenant_isolation ON selection_reruns;
CREATE POLICY p_selection_reruns_tenant_isolation ON selection_reruns
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_automation_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_automation_triggers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_automation_triggers_tenant_isolation ON selection_automation_triggers;
CREATE POLICY p_selection_automation_triggers_tenant_isolation ON selection_automation_triggers
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_automation_executions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_automation_executions_tenant_isolation ON selection_automation_executions;
CREATE POLICY p_selection_automation_executions_tenant_isolation ON selection_automation_executions
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 6. Pendaftaran Hak Kapabilitas PDP Baru
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES 
    (gen_random_uuid(), 'selection.rerun.create', 1, 'Membuat pekerjaan seleksi ulang dengan kriteria variasi'),
    (gen_random_uuid(), 'selection.compare.view', 1, 'Membandingkan dua hasil seleksi secara berdampingan'),
    (gen_random_uuid(), 'selection.export.generate', 1, 'Mengekspor laporan seleksi dalam format PDF, Excel, atau CSV'),
    (gen_random_uuid(), 'selection.review.submit', 1, 'Meninjau dan menyetujui atau menyesuaikan peringkat hasil seleksi'),
    (gen_random_uuid(), 'selection.automation.manage', 1, 'Mengelola pemicu otomasi seleksi terjadwal dan integrasi')
ON CONFLICT (capability_key) DO NOTHING;
