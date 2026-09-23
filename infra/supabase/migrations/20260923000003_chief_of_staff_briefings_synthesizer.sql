-- Migration: Chief of Staff Executive Briefings Synthesizer & Authority Boundaries
-- PRD v2.2 Bagian 8.10

CREATE TABLE IF NOT EXISTS chief_of_staff_briefings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    briefing_date date NOT NULL DEFAULT CURRENT_DATE,
    executive_summary text NOT NULL,
    department_highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
    kpi_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    specialist_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
    skill_confidence_trends jsonb NOT NULL DEFAULT '[]'::jsonb,
    authority_boundary_enforced boolean NOT NULL DEFAULT true,
    requires_human_approval boolean NOT NULL DEFAULT true,
    generated_by text NOT NULL DEFAULT 'Arya (AI Chief of Staff)',
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chief_of_staff_briefings' AND column_name = 'specialist_insights'
    ) THEN
        ALTER TABLE chief_of_staff_briefings ADD COLUMN specialist_insights jsonb NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chief_of_staff_briefings' AND column_name = 'skill_confidence_trends'
    ) THEN
        ALTER TABLE chief_of_staff_briefings ADD COLUMN skill_confidence_trends jsonb NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chief_of_staff_briefings' AND column_name = 'authority_boundary_enforced'
    ) THEN
        ALTER TABLE chief_of_staff_briefings ADD COLUMN authority_boundary_enforced boolean NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chief_of_staff_briefings' AND column_name = 'requires_human_approval'
    ) THEN
        ALTER TABLE chief_of_staff_briefings ADD COLUMN requires_human_approval boolean NOT NULL DEFAULT true;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cos_briefings_tenant_date
    ON chief_of_staff_briefings(tenant_id, briefing_date DESC);

ALTER TABLE chief_of_staff_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chief_of_staff_briefings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cos_briefings_tenant_isolation ON chief_of_staff_briefings;
CREATE POLICY cos_briefings_tenant_isolation ON chief_of_staff_briefings
    FOR ALL
    TO PUBLIC
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT ALL ON chief_of_staff_briefings TO authenticated, orchestree_app;

INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
    ('chief_of_staff.briefing.generate', 3, 'Sintesis otomatis Executive Morning Briefing lintas performa departemen dan riwayat kompetensi keahlian'),
    ('chief_of_staff.briefing.view', 3, 'Akses riwayat Executive Morning Briefing dan pemantauan agregat performa organisasi'),
    ('command_center.executive.view', 3, 'Pusat kendali eksekutif real-time dengan metrik global seluruh departemen'),
    ('command_center.workforce.manage', 3, 'Tata kelola koordinasi tenaga kerja eksekutif dengan batasan persetujuan manusia')
ON CONFLICT (capability_key) DO UPDATE SET
    min_tier_level = EXCLUDED.min_tier_level,
    description = EXCLUDED.description;
