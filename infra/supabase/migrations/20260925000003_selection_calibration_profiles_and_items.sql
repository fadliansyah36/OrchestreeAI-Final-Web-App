-- Universal AI Selection Calibration Profiles and Items (PRD v2.2 Bagian 13.1 & 17.5)
-- Menambahkan:
-- 1. Tabel selection_calibration_profiles (profil kalibrasi kriteria per tenant)
-- 2. Tabel selection_calibration_items (entitas item nama tipe + persentase)
-- 3. Penegakan RLS FORCE bertenant ketat pada kedua tabel
-- 4. Pendaftaran kapabilitas 'selection.calibration.manage'

-- 1. Tabel selection_calibration_profiles
CREATE TABLE IF NOT EXISTS selection_calibration_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_name text NOT NULL,
    domain_category text,
    created_by_membership_id uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS domain_category text;
ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS created_by_membership_id uuid;
ALTER TABLE selection_calibration_profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_selection_calib_profiles_tenant ON selection_calibration_profiles(tenant_id);

-- 2. Tabel selection_calibration_items
CREATE TABLE IF NOT EXISTS selection_calibration_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calibration_profile_id uuid NOT NULL REFERENCES selection_calibration_profiles(id) ON DELETE CASCADE,
    field_type_name text NOT NULL,
    percentage numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    display_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_calib_items_profile ON selection_calibration_items(calibration_profile_id);

-- 3. Penegakan Row Level Security (RLS) FORCE bertenant
ALTER TABLE selection_calibration_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_calibration_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles;
CREATE POLICY p_selection_calibration_profiles_tenant_isolation ON selection_calibration_profiles
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE selection_calibration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_calibration_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_selection_calibration_items_tenant_isolation ON selection_calibration_items;
CREATE POLICY p_selection_calibration_items_tenant_isolation ON selection_calibration_items
    AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
    USING (
        EXISTS (
            SELECT 1 FROM selection_calibration_profiles p
            WHERE p.id = selection_calibration_items.calibration_profile_id
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM selection_calibration_profiles p
            WHERE p.id = selection_calibration_items.calibration_profile_id
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    );

-- 4. Registrasi Capability PDP
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES 
    (gen_random_uuid(), 'selection.calibration.manage', 1, 'Mengelola profil kalibrasi dan persentase kriteria seleksi')
ON CONFLICT (capability_key) DO NOTHING;
