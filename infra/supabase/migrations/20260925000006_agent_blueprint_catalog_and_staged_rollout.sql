-- ==============================================================================
-- Migrasi: Agent Blueprint Catalog & Staged Rollout (PRD v2.2 Bagian 11.3 & F.01)
-- Timestamp: 2026-09-25 12:00:00
-- 1. Memastikan perkakas resmi mcp_tools terdaftar dan aktif
-- 2. Menambahkan kolom blueprint_id pada ai_agents
-- 3. Tabel agent_blueprint_catalog (reference data global)
-- 4. Tabel agent_blueprint_rollout_log (riwayat transisi rilis)
-- 5. Trigger validasi integritas recommended_tool_keys terhadap mcp_tools aktif
-- 6. RLS pada agent_blueprint_catalog & agent_blueprint_rollout_log
-- 7. Registrasi feature_capabilities baru
-- 8. Seed 15 blueprint resmi satu per Jabatan Utama (general_availability)
-- ==============================================================================

BEGIN;

-- 1. Sinkronisasi perkakas MCP resmi ke mcp_tools
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mcp_tools'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tools' AND column_name = 'tool_name'
        ) THEN
            ALTER TABLE mcp_tools ADD COLUMN tool_name text;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tools' AND column_name = 'name'
        ) THEN
            ALTER TABLE mcp_tools ADD COLUMN name text;
        END IF;
    END IF;
END $$;

INSERT INTO mcp_tools (id, tool_name, name, risk_tier, input_schema, output_schema, description, is_active)
VALUES
    ('tool-knowledge-lookup', 'knowledge.lookup', 'knowledge.lookup', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Mencari rujukan dokumen SOP dan kebijakan organisasi', true),
    ('tool-task-create', 'task.create_from_intent', 'task.create_from_intent', 'medium', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Membuat kartu tugas baru di papan kerja tim', true),
    ('tool-crm-contact-verify', 'crm.contact_verify', 'crm.contact_verify', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Memverifikasi format kontak pelanggan', true),
    ('tool-product-recommend', 'product.recommend', 'product.recommend', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Rekomendasi katalog produk pelanggan', true),
    ('tool-cart-create', 'cart.create', 'cart.create', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Membuat keranjang belanja pesanan', true),
    ('tool-sales-discount-apply', 'sales.discount.apply', 'sales.discount.apply', 'high', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Menerapkan diskon penjualan dengan guardrail', true),
    ('tool-sales-refund-process', 'sales.refund.process', 'sales.refund.process', 'high', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Memproses pengembalian dana transaksi', true),
    ('tool-sales-order-cancel', 'sales.order.cancel', 'sales.order.cancel', 'high', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Membatalkan pesanan terdaftar', true),
    ('tool-sales-custom-contract', 'sales.custom_contract.create', 'sales.custom_contract.create', 'high', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Membuat kontrak perjanjian penjualan B2B', true),
    ('tool-crm-lead-create', 'crm.lead.create', 'crm.lead.create', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Mencatat prospek peluang baru di CRM', true),
    ('tool-crm-lead-update-stage', 'crm.lead.update_stage', 'crm.lead.update_stage', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Memperbarui tahap proses prospek CRM', true),
    ('tool-crm-lead-record-qualification', 'crm.lead.record_qualification', 'crm.lead.record_qualification', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Merekam jawaban kualifikasi prospek', true),
    ('tool-crm-lead-recalculate-score', 'crm.lead.recalculate_score', 'crm.lead.recalculate_score', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Menghitung ulang skor prospek penjualan', true),
    ('tool-crm-activity-timeline', 'crm.activity.get_timeline', 'crm.activity.get_timeline', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Mengambil linimasa aktivitas interaksi prospek', true),
    ('tool-scrape-crawl-target', 'scrape.crawl_target', 'scrape.crawl_target', 'medium', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Melakukan analisis data publik kompetitor', true),
    ('tool-memory-search', 'memory.search', 'memory.search', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Pencarian semantik pada memori korporat', true),
    ('tool-memory-remember', 'memory.remember', 'memory.remember', 'medium', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Menyimpan pengetahuan kerja ke memori persisten', true),
    ('tool-memory-session-resume', 'memory.session_resume', 'memory.session_resume', 'medium', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Melanjutkan kembali sesi alur kerja agen tertunda', true),
    ('tool-memory-consolidate', 'memory.consolidate', 'memory.consolidate', 'low', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 'Pemeliharaan konsolidasi memori pengetahuan', true)
ON CONFLICT (id) DO UPDATE SET
    tool_name = EXCLUDED.tool_name,
    name = EXCLUDED.name,
    is_active = true;

UPDATE mcp_tools SET
    tool_name = COALESCE(tool_name, name),
    name = COALESCE(name, tool_name)
WHERE tool_name IS NULL OR name IS NULL;

-- 2. Tabel agent_blueprint_catalog
CREATE TABLE IF NOT EXISTS agent_blueprint_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    description text NOT NULL,
    industry_category text NOT NULL,
    job_title_id uuid NOT NULL REFERENCES ai_job_titles(id),
    structural_role_id uuid REFERENCES ai_structural_roles(id),
    default_skill_summary text NOT NULL,
    recommended_tool_keys text[] NOT NULL DEFAULT '{}',
    recommended_model_capability text,
    rollout_stage text NOT NULL DEFAULT 'internal_review' CHECK (rollout_stage IN
        ('internal_review', 'beta_tenant', 'general_availability', 'deprecated')),
    source_reference_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_blueprint_catalog_job_title
    ON agent_blueprint_catalog(job_title_id);
CREATE INDEX IF NOT EXISTS idx_agent_blueprint_catalog_stage
    ON agent_blueprint_catalog(rollout_stage);
CREATE INDEX IF NOT EXISTS idx_agent_blueprint_catalog_industry
    ON agent_blueprint_catalog(industry_category);

-- 3. Tambahkan kolom blueprint_id pada ai_agents jika belum ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_agents'
        AND column_name = 'blueprint_id'
    ) THEN
        ALTER TABLE ai_agents ADD COLUMN blueprint_id uuid REFERENCES agent_blueprint_catalog(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_agents_blueprint_id ON ai_agents(blueprint_id);

-- 4. Tabel agent_blueprint_rollout_log
CREATE TABLE IF NOT EXISTS agent_blueprint_rollout_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id uuid NOT NULL REFERENCES agent_blueprint_catalog(id) ON DELETE CASCADE,
    from_stage text,
    to_stage text NOT NULL,
    changed_by uuid NOT NULL,
    reason text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_blueprint_rollout_log_bp
    ON agent_blueprint_rollout_log(blueprint_id, changed_at DESC);

-- 5. Trigger validasi integritas recommended_tool_keys terhadap mcp_tools aktif (A.3)
CREATE OR REPLACE FUNCTION validate_blueprint_recommended_tools()
RETURNS trigger AS $$
DECLARE
    tool_key text;
    valid_count int;
BEGIN
    IF NEW.recommended_tool_keys IS NOT NULL AND array_length(NEW.recommended_tool_keys, 1) > 0 THEN
        FOREACH tool_key IN ARRAY NEW.recommended_tool_keys LOOP
            SELECT COUNT(*) INTO valid_count
            FROM mcp_tools
            WHERE is_active = true
              AND (
                  tool_name = tool_key
                  OR name = tool_key
                  OR id::text = tool_key
              );
            IF valid_count = 0 THEN
                RAISE EXCEPTION 'Tool key "%" tidak terdaftar atau tidak aktif di tabel mcp_tools.', tool_key;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_blueprint_tools ON agent_blueprint_catalog;
CREATE TRIGGER trg_validate_blueprint_tools
BEFORE INSERT OR UPDATE ON agent_blueprint_catalog
FOR EACH ROW
EXECUTE FUNCTION validate_blueprint_recommended_tools();

-- 6. RLS Enforcement untuk agent_blueprint_catalog & agent_blueprint_rollout_log
ALTER TABLE agent_blueprint_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_blueprint_rollout_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_agent_blueprint_catalog_select ON agent_blueprint_catalog;
CREATE POLICY p_agent_blueprint_catalog_select ON agent_blueprint_catalog
    FOR SELECT
    USING (
        rollout_stage = 'general_availability'
        OR current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
        OR (
            rollout_stage = 'beta_tenant'
            AND (
                EXISTS (
                    SELECT 1 FROM tenant_capability_overrides tco
                    WHERE tco.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                      AND (tco.capability_overrides->>'beta_program')::boolean IS TRUE
                )
                OR current_setting('request.jwt.claims', true)::jsonb->>'beta_program' = 'true'
            )
        )
        OR (
            rollout_stage = 'internal_review'
            AND (
                current_user IN ('postgres', 'service_role')
                OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
                OR current_setting('app.actor_type', true) = 'super_admin'
            )
        )
    );

DROP POLICY IF EXISTS p_agent_blueprint_catalog_admin ON agent_blueprint_catalog;
CREATE POLICY p_agent_blueprint_catalog_admin ON agent_blueprint_catalog
    FOR ALL
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DROP POLICY IF EXISTS p_agent_blueprint_rollout_log_select ON agent_blueprint_rollout_log;
CREATE POLICY p_agent_blueprint_rollout_log_select ON agent_blueprint_rollout_log
    FOR SELECT
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DROP POLICY IF EXISTS p_agent_blueprint_rollout_log_admin ON agent_blueprint_rollout_log;
CREATE POLICY p_agent_blueprint_rollout_log_admin ON agent_blueprint_rollout_log
    FOR ALL
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_blueprint_catalog TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_blueprint_rollout_log TO orchestree_app;
    END IF;
END $$;

-- 7. Registrasi Feature Capabilities
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('agentcat.admin.manage', 0, 'Kelola katalog blueprint agen AI platform untuk Super Admin'),
    ('agentcat.tenant.view', 0, 'Akses melihat daftar blueprint agen AI untuk tenant'),
    ('agentcat.blueprint.view', 0, 'Akses melihat blueprint agen AI'),
    ('agentcat.blueprint.manage', 0, 'Kelola blueprint agen AI')
ON CONFLICT (capability_key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'agentcat.tenant.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'agentcat.blueprint.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'agentcat.admin.manage'
FROM roles r WHERE r.role_code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- 8. Seed 15 Blueprints Terstandarisasi (1 per Jabatan Utama)
INSERT INTO agent_blueprint_catalog (
    blueprint_code, display_name, description, industry_category,
    job_title_id, structural_role_id, default_skill_summary,
    recommended_tool_keys, recommended_model_capability,
    rollout_stage, source_reference_hash
) VALUES
(
    'BP-EXEC-001',
    'Blueprint: Orkestrasi Koordinasi Eksekutif & Briefing Harian',
    'Mendukung jajaran direksi dalam memantau ritme kerja harian korporasi, merangkum deliverable lintas divisi, dan mendistribusikan mandat prioritas tinggi.',
    'general_enterprise',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_CHIEF_OF_STAFF'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_CHIEF_OF_STAFF'),
    'Sintesis eksekutif, koordinasi lintas divisi, delegasi penugasan berkala, dan pemantauan kepatuhan arahan kerja',
    ARRAY['task.create_from_intent', 'knowledge.lookup', 'memory.search'],
    'text_reasoning',
    'general_availability',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
),
(
    'BP-KNOW-001',
    'Blueprint: Pengelolaan Pengetahuan Korporat & Standar Prosedur',
    'Mengindeks seluruh dokumentasi SOP, manual teknis, serta arsip kebijakan perusahaan untuk memberikan rujukan kontekstual yang konsisten tanpa halusinasi.',
    'professional_services',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_COMPANY_INTELLIGENCE'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_COMPANY_INTELLIGENCE'),
    'Penelusuran basis pengetahuan semantik, temu balik kebijakan SOP korporat, dan pengarsipan refleksi operasional',
    ARRAY['knowledge.lookup', 'memory.search', 'memory.remember'],
    'text_reasoning',
    'general_availability',
    'c56a84128527a296568853b92f9154b2d1899e46a782b88aa0b3952f9c7be78a'
),
(
    'BP-OPS-001',
    'Blueprint: Manajemen Operasional & Penjadwalan Tugas Logistik',
    'Mengatur alur penugasan operasional gudang dan rute distribusi, memantau utilisasi armada serta memastikan kepatuhan jadwal pengiriman.',
    'logistics',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_OPERATIONS_FLEET'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_OPERATIONS_FLEET'),
    'Delegasi tiket pengiriman otomatis, monitoring jadwal operasional, dan kepatuhan panduan logistik',
    ARRAY['task.create_from_intent', 'knowledge.lookup'],
    'text_reasoning',
    'general_availability',
    'b7990c8851c23315a6b0c6dfba89196b0c793ff8bb2c4f6974753045610ec259'
),
(
    'BP-FIN-001',
    'Blueprint: Rekonsiliasi Keuangan & Pemantauan Arus Kas',
    'Membantu proses rekonsiliasi mutasi kas, pengecekan kesesuaian dokumen invoice dengan pesanan, dan penyusunan estimasi likuiditas berkala.',
    'finance',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_FINANCE_CASH_FLOW'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_FINANCE_CASH_FLOW'),
    'Pengecekan kepatuhan invoice, pencatatan transaksi terverifikasi, dan kalkulasi proyeksi kas',
    ARRAY['knowledge.lookup', 'task.create_from_intent'],
    'text_reasoning',
    'general_availability',
    'd60c4c47f7d141e984f8846c24523bb8e37e96b3469e3d74c0e64c3917a26c48'
),
(
    'BP-PROC-001',
    'Blueprint: Pengadaan Barang & Evaluasi Komparasi Vendor',
    'Membandingkan penawaran harga dari pemasok, memvalidasi kelengkapan dokumen pengadaan, dan menyusun draf purchase order terstruktur.',
    'supply_chain',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_PROCUREMENT_VENDOR'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_PROCUREMENT_VENDOR'),
    'Komparasi penawaran supplier, verifikasi izin usaha rekanan, dan pengajuan draf pengadaan barang',
    ARRAY['task.create_from_intent', 'knowledge.lookup'],
    'text_reasoning',
    'general_availability',
    '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
),
(
    'BP-SALES-001',
    'Blueprint: Kualifikasi Prospek & Penutupan Penjualan B2B',
    'Melakukan validasi kontak calon klien, verifikasi kesesuaian kualifikasi kebutuhan, serta memfasilitasi persetujuan draf penawaran komersial.',
    'retail',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_SALES_DEAL_CLOSER'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_SALES_DEAL_CLOSER'),
    'Verifikasi kontak prospek masuk, evaluasi diskon terstruktur sesuai guardrail, dan penyusunan draf kontrak penjualan',
    ARRAY['crm.contact_verify', 'sales.discount.apply', 'sales.custom_contract.create'],
    'text_reasoning',
    'general_availability',
    '96570656bc08182245c363d6d066c1b3f9dd404d80544cf0c09eb2a85e492d3b'
),
(
    'BP-HR-001',
    'Blueprint: Operasional SDM & Penapisan Berkas Talenta',
    'Mendukung proses seleksi administrasi kandidat berdasarkan rubrik kompetensi terstandarisasi, menjawab pertanyaan kebijakan kerja, dan koordinasi orientasi staf.',
    'human_resources',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_HR_PEOPLE_OPS'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_HR_PEOPLE_OPS'),
    'Penapisan berkas lamaran objektif, konsultasi panduan kehadiran, dan penugasan orientasi karyawan baru',
    ARRAY['knowledge.lookup', 'task.create_from_intent'],
    'text_reasoning',
    'general_availability',
    '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9'
),
(
    'BP-CS-001',
    'Blueprint: Layanan Pelanggan & Mitigasi Penanganan Keluhan',
    'Merespons kendala pelanggan secara tanggap, memverifikasi data akun komunikasi, dan mendelegasikan tiket eskalasi ke penanggung jawab teknis.',
    'saas',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_CUSTOMER_SUCCESS'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_CUSTOMER_SUCCESS'),
    'Pemberian solusi kendala berbasis SOP, validasi kontak pengguna, dan eskalasi isu kritis secara cepat',
    ARRAY['knowledge.lookup', 'task.create_from_intent', 'crm.contact_verify'],
    'text_reasoning',
    'general_availability',
    '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b'
),
(
    'BP-PM-001',
    'Blueprint: Pemantauan Milestone Proyek & Mitigasi Risiko',
    'Mengawasi jadwal penyelesaian deliverable proyek, mendeteksi potensi keterlambatan lebih dini, serta memicu pengingat tindak lanjut berkala.',
    'technology',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_PROJECT_MILESTONES'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_PROJECT_MILESTONES'),
    'Pelacakan linimasa pekerjaan, pembuatan kartu mitigasi hambatan, dan pengawasan komitmen tim',
    ARRAY['task.create_from_intent', 'knowledge.lookup'],
    'text_reasoning',
    'general_availability',
    'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35'
),
(
    'BP-MKT-001',
    'Blueprint: Kampanye Pemasaran & Strategi Konten Brand',
    'Menyusun rekomendasi katalog promosi, mengoordinasikan penawaran produk pada kanal daring, dan merancang skenario penyebaran pesan merek.',
    'ecommerce',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_MARKETING_BRANDING'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_MARKETING_BRANDING'),
    'Rekomendasi item katalog terpersonalisasi, pembuatan pesanan promosi, dan penjadwalan konten kampanye',
    ARRAY['product.recommend', 'cart.create'],
    'multimodal',
    'general_availability',
    '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce'
),
(
    'BP-CRM-001',
    'Blueprint: Siklus Hidup Pelanggan & Retensi Dinamis',
    'Mengelola peluang prospek di sepanjang corong konversi, mencatat hasil kualifikasi interaksi, dan meninjau riwayat perjalanan kontak pelanggan.',
    'retail',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_CRM_LIFECYCLE'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_CRM_LIFECYCLE'),
    'Pembuatan dan pembaruan tahap prospek, pencatatan jawaban kualifikasi, dan penarikan linimasa aktivitas CRM',
    ARRAY['crm.lead.create', 'crm.lead.update_stage', 'crm.activity.get_timeline'],
    'text_reasoning',
    'general_availability',
    '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a'
),
(
    'BP-TASK-001',
    'Blueprint: Tata Kelola Alur Kerja & Pengawasan Batas Waktu',
    'Mendistribusikan kartu kerja ke anggota tim yang tepat, memantau batas waktu penyelesaian, dan memulihkan sesi proses kerja yang tertunda.',
    'manufacturing',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_TASK_WORKFLOW'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_TASK_WORKFLOW'),
    'Distribusi tiket penugasan tim, pemulihan status eksekusi tertunda, dan pemantauan kepatuhan tenggat waktu',
    ARRAY['task.create_from_intent', 'memory.session_resume'],
    'text_reasoning',
    'general_availability',
    'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d'
),
(
    'BP-DOC-001',
    'Blueprint: Pengarsipan & Temu Balik Dokumen Terstruktur',
    'Mengklasifikasikan berkas perjanjian dan arsip legalitas organisasi, melakukan temu balik instan, serta mengoptimalkan relevansi indeks pengetahuan.',
    'legal',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_KNOWLEDGE_DOCUMENT'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_KNOWLEDGE_DOCUMENT'),
    'Pengindeksan dokumen korporat, pencarian teks terstruktur, dan konsolidasi pemeliharaan indeks memori',
    ARRAY['knowledge.lookup', 'memory.search', 'memory.consolidate'],
    'text_reasoning',
    'general_availability',
    '07923769c279c17f7663f7ed5f6c8d76d6ec5c0d876402422784cfb776a3e5e4'
),
(
    'BP-RES-001',
    'Blueprint: Riset Pasar & Pemantauan Data Publik',
    'Mengumpulkan data pasar dari sumber publik secara beretika, mengidentifikasi pergeseran penawaran eksternal, dan mengarsipkan rangkuman intelijen bisnis.',
    'consulting',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_RESEARCH_INTELLIGENCE'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_RESEARCH_INTELLIGENCE'),
    'Pengumpulan data web publik beretika, ekstraksi poin perubahan pasar, dan penyimpanan memori intelijen',
    ARRAY['scrape.crawl_target', 'memory.remember'],
    'text_reasoning',
    'general_availability',
    'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
),
(
    'BP-BI-001',
    'Blueprint: Agregasi Analitik Lintas Fungsi & Pelaporan Eksekutif',
    'Mengompilasi capaian kinerja dari berbagai divisi, memvalidasi ketercapaian target operasional, dan menyusun laporan ringkas untuk para pemangku kepentingan.',
    'analytics',
    (SELECT id FROM ai_job_titles WHERE title_code = 'AI_REPORTING_BI_ANALYST'),
    (SELECT structural_role_id FROM ai_job_titles WHERE title_code = 'AI_REPORTING_BI_ANALYST'),
    'Agregasi metrik kinerja divisi, pencarian data pembanding historis, dan perumusan laporan eksekutif',
    ARRAY['knowledge.lookup', 'memory.search'],
    'text_reasoning',
    'general_availability',
    '11842e030e13ebd57c555566399a62ffda76d87851a80e6e7302c049ebb878c9'
)
ON CONFLICT (blueprint_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    industry_category = EXCLUDED.industry_category,
    job_title_id = EXCLUDED.job_title_id,
    structural_role_id = EXCLUDED.structural_role_id,
    default_skill_summary = EXCLUDED.default_skill_summary,
    recommended_tool_keys = EXCLUDED.recommended_tool_keys,
    recommended_model_capability = EXCLUDED.recommended_model_capability,
    rollout_stage = EXCLUDED.rollout_stage,
    updated_at = now();

COMMIT;
