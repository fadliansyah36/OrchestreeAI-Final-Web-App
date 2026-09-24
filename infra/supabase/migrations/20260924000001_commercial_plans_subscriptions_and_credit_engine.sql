-- ============================================================================
-- Migration: Commercial Plans, Subscription Lifecycle & AI Credit Engine
-- PRD v2.2 Bagian 14 & Billing Specification
-- ============================================================================

-- 1. Perluas subscription_plans
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS monthly_price_idr numeric(18,2);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS ai_credit_allowance numeric(18,4);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS human_staff_limit int;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS ai_agent_limit int;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_duration_days int;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_custom_quote boolean NOT NULL DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;

-- 2. Tabel matriks fasilitas
CREATE TABLE IF NOT EXISTS plan_facility_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_key text NOT NULL UNIQUE,
    display_name text NOT NULL,
    display_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_facility_matrix (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    facility_key text NOT NULL REFERENCES plan_facility_catalog(facility_key),
    level text NOT NULL CHECK (level IN ('none','basic','advanced','enterprise','custom','limited','unlimited')),
    UNIQUE (plan_id, facility_key)
);

-- 3. Baseline metering aktivitas AI
CREATE TABLE IF NOT EXISTS ai_activity_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    base_work_unit_min numeric(18,4) NOT NULL,
    base_work_unit_max numeric(18,4) NOT NULL
);

-- 4. Faktor formula (Complexity/Model/Tool/Execution)
CREATE TABLE IF NOT EXISTS credit_complexity_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complexity_code text NOT NULL UNIQUE,
    multiplier numeric(6,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_model_cost_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    llm_model_id uuid REFERENCES llm_models(id) ON DELETE SET NULL,
    model_code text NOT NULL UNIQUE,
    multiplier numeric(6,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_tool_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_tier text NOT NULL UNIQUE CHECK (risk_tier IN ('low','medium','high')),
    multiplier numeric(6,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_execution_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_mode text NOT NULL UNIQUE,
    multiplier numeric(6,3) NOT NULL
);

-- 5. Top-up & langganan tenant
CREATE TABLE IF NOT EXISTS credit_topup_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    credit_amount numeric(18,4) NOT NULL,
    price_idr numeric(18,2) NOT NULL,
    validity_days int NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES subscription_plans(id),
    billing_cycle_start timestamptz NOT NULL,
    billing_cycle_end timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('trialing','active','past_due','cancelled')),
    is_unlimited_override boolean NOT NULL DEFAULT false,
    unlimited_reason text,
    granted_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id, status);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenant_subscriptions' AND policyname = 'tenant_subscriptions_isolation_policy'
    ) THEN
        CREATE POLICY tenant_subscriptions_isolation_policy ON tenant_subscriptions
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
END $$;

-- 6. Perluas credit_reservations
ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS activity_type_id uuid REFERENCES ai_activity_types(id);
ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;
ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS execution_ref text;

-- 7. Tabel credit_allocations
CREATE TABLE IF NOT EXISTS credit_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('subscription_cycle','topup_purchase','manual_adjustment')),
    source_reference_id uuid,
    credit_amount numeric(18,4) NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_allocations_tenant ON credit_allocations(tenant_id, created_at DESC);

ALTER TABLE credit_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_allocations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'credit_allocations' AND policyname = 'credit_allocations_isolation_policy'
    ) THEN
        CREATE POLICY credit_allocations_isolation_policy ON credit_allocations
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
END $$;

-- 8. Seed Master Data Resmi (Idempotent ON CONFLICT)
INSERT INTO subscription_plans (
    plan_code, tier_level, display_name, price_monthly, monthly_price_idr,
    ai_credit_allowance, human_staff_limit, ai_agent_limit, is_trial,
    trial_duration_days, is_custom_quote, display_order, currency
) VALUES
('TRIAL', 0, 'Trial 7 Hari', 0.00, 0.00, 1000.0000, 3, 2, true, 7, false, 1, 'IDR'),
('STARTER', 1, 'Starter SME', 1500000.00, 1500000.00, 15000.0000, 10, 5, false, NULL, false, 2, 'IDR'),
('PROFESSIONAL', 2, 'Professional Business', 4500000.00, 4500000.00, 50000.0000, 30, 15, false, NULL, false, 3, 'IDR'),
('ENTERPRISE', 3, 'Enterprise Scaled', 12500000.00, 12500000.00, 150000.0000, 100, 50, false, NULL, false, 4, 'IDR'),
('CUSTOM', 4, 'Custom Enterprise & Gov', NULL, NULL, NULL, NULL, NULL, false, NULL, true, 5, 'IDR')
ON CONFLICT (plan_code) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    display_name = EXCLUDED.display_name,
    price_monthly = EXCLUDED.price_monthly,
    monthly_price_idr = EXCLUDED.monthly_price_idr,
    ai_credit_allowance = EXCLUDED.ai_credit_allowance,
    human_staff_limit = EXCLUDED.human_staff_limit,
    ai_agent_limit = EXCLUDED.ai_agent_limit,
    is_trial = EXCLUDED.is_trial,
    trial_duration_days = EXCLUDED.trial_duration_days,
    is_custom_quote = EXCLUDED.is_custom_quote,
    display_order = EXCLUDED.display_order;

INSERT INTO plan_facility_catalog (facility_key, display_name, display_order) VALUES
('orchestreeai_app', 'OrchestreeAI Operating System Core App', 1),
('ai_workforce', 'AI Workforce Registry & 15 AI Job Titles', 2),
('ai_chief_of_staff', 'Chief of Staff Autonomous Briefing Synthesizer', 3),
('company_brain', 'Company Context Brain & Knowledge Vector', 4),
('semantic_memory', 'Semantic Memory & Rolling Decay Engine', 5),
('task_workflow', 'Kanban Task Workflow & Autonomous Execution', 6),
('ai_selection_analytics', 'AI Universal Selection & Candidate Scoring', 7),
('proactive_ai', 'Proactive Communication Channels & Triggers', 8),
('whatsapp_telegram', 'WhatsApp Cloud API & Telegram MTProto Gateway', 9),
('multi_llm', 'Multi-LLM Dynamic Cost Router & Circuit Breaker', 10),
('integrations', 'Third-Party App Registry & Webhook Connectors', 11),
('rbac', 'Multi-Role Role-Based Access Control (RBAC)', 12),
('audit_trail', 'Tamper-Evident Security & Billing Audit Trail', 13),
('api_access', 'RESTful API Access & Webhook Notifications', 14),
('advanced_automation', 'Advanced Cross-Department Multi-Agent Automation', 15),
('enterprise_security', 'Envelope KMS Encryption & DPIA Privacy Vault', 16),
('sso', 'Enterprise SSO & WebAuthn Biometric Attendance', 17),
('private_deployment', 'Private Cloud & VPC Deployment Options', 18),
('dedicated_infrastructure', 'Dedicated Compute & Database Infrastructure', 19),
('sla_support', '24/7 Priority SLA & Dedicated Engineering Support', 20),
('custom_ai_workforce', 'Custom Fine-Tuned Domain Agents & Blueprint Catalog', 21)
ON CONFLICT (facility_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order;

INSERT INTO ai_activity_types (activity_code, display_name, base_work_unit_min, base_work_unit_max) VALUES
('simple_chat', 'Simple Conversational Query', 1.0000, 3.0000),
('summarization', 'Document & Meeting Summarization', 2.0000, 5.0000),
('basic_analysis', 'Basic Operational Analysis', 3.0000, 8.0000),
('document_analysis', 'Deep Document & Contract Analysis', 5.0000, 15.0000),
('research', 'Competitor & Market Research Crawl', 8.0000, 20.0000),
('advanced_analysis', 'Multi-Variable Quantitative Analysis', 10.0000, 25.0000),
('report_generation', 'Automated Executive Briefing & Report', 12.0000, 30.0000),
('ai_selection', 'Candidate & Lead Smart Selection', 5.0000, 15.0000),
('scoring_ranking', 'Multi-Criteria Scoring & Ranking', 4.0000, 12.0000),
('data_processing', 'Data Quality & Anomaly Detection', 3.0000, 10.0000),
('workflow_execution', 'Single Workflow Node Execution', 2.0000, 6.0000),
('automation', 'Automated Scheduled Campaign Execution', 4.0000, 12.0000),
('ai_agent_execution', 'Specialist AI Agent Goal Execution', 15.0000, 35.0000),
('multi_agent_task', 'Cross-Department Multi-Agent Orchestration', 25.0000, 60.0000),
('tool_operation', 'MCP Sandboxed Tool Invocation', 5.0000, 15.0000),
('autonomous_execution', 'Chief of Staff Autonomous Strategic Sweep', 30.0000, 75.0000),
('proactive_ai_analysis', 'Proactive Event Correlator & Alert', 6.0000, 18.0000),
('omnichannel_ai_task', 'Omnichannel Message Intake & Auto-Response', 2.0000, 8.0000)
ON CONFLICT (activity_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    base_work_unit_min = EXCLUDED.base_work_unit_min,
    base_work_unit_max = EXCLUDED.base_work_unit_max;

INSERT INTO credit_complexity_factors (complexity_code, multiplier) VALUES
('low', 1.000),
('medium', 1.500),
('high', 2.500),
('very_high', 4.000)
ON CONFLICT (complexity_code) DO UPDATE SET multiplier = EXCLUDED.multiplier;

INSERT INTO credit_tool_factors (risk_tier, multiplier) VALUES
('low', 1.000),
('medium', 1.300),
('high', 2.000)
ON CONFLICT (risk_tier) DO UPDATE SET multiplier = EXCLUDED.multiplier;

INSERT INTO credit_execution_factors (execution_mode, multiplier) VALUES
('single_step', 1.000),
('multi_step', 1.800),
('autonomous', 3.000)
ON CONFLICT (execution_mode) DO UPDATE SET multiplier = EXCLUDED.multiplier;

INSERT INTO credit_model_cost_factors (model_code, multiplier) VALUES
('default', 1.000),
('meta-llama/llama-3.1-70b-instruct', 1.200),
('meta-llama/llama-3.1-8b-instruct', 0.800),
('gemini-1.5-pro', 1.500),
('gemini-1.5-flash', 0.700),
('gemini-2.5-flash', 0.750),
('gemini-2.5-pro', 1.600),
('gpt-4o', 2.000),
('gpt-4o-mini', 0.600)
ON CONFLICT (model_code) DO UPDATE SET multiplier = EXCLUDED.multiplier;

INSERT INTO credit_topup_packages (name, credit_amount, price_idr, validity_days, is_active) VALUES
('Paket Kredit Micro 5,000', 5000.0000, 500000.00, 30, true),
('Paket Kredit Standar 25,000', 25000.0000, 2250000.00, 60, true),
('Paket Kredit Pro 75,000', 75000.0000, 6000000.00, 90, true),
('Paket Kredit Enterprise 250,000', 250000.0000, 18000000.00, 180, true);
