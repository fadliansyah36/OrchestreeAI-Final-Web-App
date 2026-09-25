-- Universal AI Selection Audit Lifecycle and ABAC Data Access Control
-- 1. Indeks audit siklus hidup seleksi pada company_context_events
CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job
ON company_context_events ((insights->>'selection_job_id'));

CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job_alt
ON company_context_events ((insights->>'job_id'));

-- 2. Pendaftaran Kapabilitas Baru pada feature_capabilities
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES
    (gen_random_uuid(), 'selection.audit.view', 1, 'Melihat jejak audit lengkap seluruh siklus hidup seleksi cerdas'),
    (gen_random_uuid(), 'selection.abac.enforce', 1, 'Penegakan kontrol akses data berbasis atribut (ABAC) untuk seleksi')
ON CONFLICT (capability_key) DO NOTHING;
