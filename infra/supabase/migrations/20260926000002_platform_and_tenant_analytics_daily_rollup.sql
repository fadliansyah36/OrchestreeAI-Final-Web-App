-- Migrasi Supabase: Skema Analisis Platform & Tenant Harian (PRD v2.2 Bagian 2.6, 3.5, 14, 15 & 18.2)

CREATE TABLE IF NOT EXISTS platform_analytics_daily_rollup (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rollup_date date NOT NULL,
    total_tenants int NOT NULL DEFAULT 0,
    active_tenants int NOT NULL DEFAULT 0,
    trial_tenants int NOT NULL DEFAULT 0,
    total_human_staff int NOT NULL DEFAULT 0,
    total_ai_agents_active int NOT NULL DEFAULT 0,
    total_transactions int NOT NULL DEFAULT 0,
    total_revenue_idr numeric(18,2) NOT NULL DEFAULT 0.00,
    total_repeat_orders int NOT NULL DEFAULT 0,
    total_llm_cost_usd numeric(18,6) NOT NULL DEFAULT 0.000000,
    total_credit_consumed numeric(18,4) NOT NULL DEFAULT 0.0000,
    computed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_platform_analytics_daily_rollup_date UNIQUE (rollup_date)
);

CREATE INDEX IF NOT EXISTS idx_platform_analytics_date ON platform_analytics_daily_rollup(rollup_date DESC);

CREATE TABLE IF NOT EXISTS tenant_analytics_daily_rollup (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rollup_date date NOT NULL,
    transaction_count int NOT NULL DEFAULT 0,
    revenue_idr numeric(18,2) NOT NULL DEFAULT 0.00,
    credit_consumed numeric(18,4) NOT NULL DEFAULT 0.0000,
    credit_available numeric(18,4) NOT NULL DEFAULT 0.0000,
    active_ai_agent_count int NOT NULL DEFAULT 0,
    active_human_staff_count int NOT NULL DEFAULT 0,
    computed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_analytics_daily_rollup UNIQUE (tenant_id, rollup_date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_analytics_tenant_date ON tenant_analytics_daily_rollup(tenant_id, rollup_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_analytics_date ON tenant_analytics_daily_rollup(rollup_date DESC);

-- Penegakan RLS Ketat pada tenant_analytics_daily_rollup
ALTER TABLE tenant_analytics_daily_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_analytics_daily_rollup FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant_analytics_isolation ON tenant_analytics_daily_rollup;
CREATE POLICY p_tenant_analytics_isolation ON tenant_analytics_daily_rollup
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.tenant_id', true) = 'global'
        OR current_user = 'postgres'
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.tenant_id', true) = 'global'
        OR current_user = 'postgres'
    );

-- Pendaftaran kapabilitas analitik pada feature_capabilities
INSERT INTO feature_capabilities (capability_code, domain, description, is_active, min_tier)
VALUES
    ('admin.analytics.view', 'analytics', 'Akses visualisasi data dan metrik analitik platform global', true, 'ENTERPRISE'),
    ('admin.analytics.manage', 'analytics', 'Pengaturan dan komputasi ulang agregasi data analitik platform', true, 'ENTERPRISE')
ON CONFLICT (capability_code) DO NOTHING;
