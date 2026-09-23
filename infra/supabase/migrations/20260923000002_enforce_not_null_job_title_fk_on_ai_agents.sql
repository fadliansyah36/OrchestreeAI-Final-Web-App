-- 20260923000002_enforce_not_null_job_title_fk_on_ai_agents.sql
-- PRD v2.2 Bagian 2.4 & Bagian 9.1:
-- Penegakan constraint database NOT NULL dan FOREIGN KEY pada ai_agents.job_title_id
-- setelah selesainya rekonsiliasi Shadow Mapping dengan 0 baris ambigu.

BEGIN;

-- 1. Tambahkan kolom struktural opsional dan sub-title spesialisasi bila belum ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_agents' AND column_name = 'structural_role_id'
    ) THEN
        ALTER TABLE ai_agents ADD COLUMN structural_role_id uuid REFERENCES ai_structural_roles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_agents' AND column_name = 'job_subtitle_id'
    ) THEN
        ALTER TABLE ai_agents ADD COLUMN job_subtitle_id uuid REFERENCES job_subtitles(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- 2. Pastikan tidak ada data ai_agents yang memiliki job_title_id NULL
-- (Bila masih ada baris yang tersisa, petakan ke default AI Operations & Fleet sebelum enforce NOT NULL)
DO $$
DECLARE
    default_title_id uuid;
BEGIN
    SELECT id INTO default_title_id FROM ai_job_titles WHERE title_code = 'AI_OPERATIONS_FLEET' LIMIT 1;
    IF default_title_id IS NOT NULL THEN
        UPDATE ai_agents SET job_title_id = default_title_id WHERE job_title_id IS NULL;
    END IF;
END
$$;

-- 3. Perbarui Foreign Key Constraint menjadi ON DELETE RESTRICT (katalog resmi tidak boleh dihapus jika dipakai)
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_job_title_id_fkey;

ALTER TABLE ai_agents
    ADD CONSTRAINT ai_agents_job_title_id_fkey
    FOREIGN KEY (job_title_id)
    REFERENCES ai_job_titles(id)
    ON DELETE RESTRICT;

-- 4. Terapkan NOT NULL constraint pada job_title_id
ALTER TABLE ai_agents ALTER COLUMN job_title_id SET NOT NULL;

-- 5. Tambahkan indeks performa
CREATE INDEX IF NOT EXISTS idx_ai_agents_structural_role_id ON ai_agents(structural_role_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_job_subtitle_id ON ai_agents(job_subtitle_id);

COMMIT;
