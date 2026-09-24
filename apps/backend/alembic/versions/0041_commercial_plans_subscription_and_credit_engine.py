"""commercial plans subscription and credit engine

Revision ID: 0041_commercial_plans_subscription_and_credit_engine
Revises: 0040_token_savings_and_agent_blueprints
Create Date: 2026-09-24 08:00:00.000000

Membangun fondasi komersial platform OrchestreeAI:
1. Perluasan subscription_plans dengan kolom kuota kredit AI dan limit entitas
2. Katalog fasilitas platform (plan_facility_catalog) dan matriks fasilitas paket (plan_facility_matrix)
3. Baseline metering jenis aktivitas AI (ai_activity_types)
4. Faktor formula biaya kredit AI (credit_complexity_factors, credit_model_cost_factors, credit_tool_factors, credit_execution_factors)
5. Paket top-up kredit (credit_topup_packages) dan langganan organisasi (tenant_subscriptions) dengan RLS FORCE
6. Perluasan credit_reservations dengan activity_type_id, cost_breakdown, dan execution_ref
7. Buku besar alokasi kredit (credit_allocations) untuk audit jejak invoice dan perpanjangan siklus
8. Master data resmi komersial platform di-seed secara idempotent
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0041_commercial_plans_subscription_and_credit_engine'
down_revision: Union[str, None] = '0040_token_savings_and_agent_blueprints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Perluas subscription_plans
    op.execute("""
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS monthly_price_idr numeric(18,2);
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS ai_credit_allowance numeric(18,4);
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS human_staff_limit int;
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS ai_agent_limit int;
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_duration_days int;
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_custom_quote boolean NOT NULL DEFAULT false;
    ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;
    """)

    # 2. Tabel matriks fasilitas
    op.execute("""
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
    """)

    # 3. Baseline metering aktivitas AI
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_activity_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_code text NOT NULL UNIQUE,
        display_name text NOT NULL,
        base_work_unit_min numeric(18,4) NOT NULL,
        base_work_unit_max numeric(18,4) NOT NULL
    );
    """)

    # 4. Faktor formula (Complexity/Model/Tool/Execution)
    op.execute("""
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
    """)

    # 5. Top-up & langganan tenant
    op.execute("""
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
    """)

    # 6. Perluas credit_reservations
    op.execute("""
    ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS activity_type_id uuid REFERENCES ai_activity_types(id);
    ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;
    ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS execution_ref text;
    """)

    # 7. Tabel credit_allocations
    op.execute("""
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
    """)

    # 8. SEED MASTER DATA RESMI (Idempotent ON CONFLICT)
    # Master Subscription Plans
    op.execute("""
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
    """)

    # Master Facilities Catalog
    op.execute("""
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
    """)

    # Master Facility Matrix
    op.execute("""
    DO $$
    DECLARE
        p_trial uuid;
        p_starter uuid;
        p_pro uuid;
        p_ent uuid;
        p_custom uuid;
    BEGIN
        SELECT id INTO p_trial FROM subscription_plans WHERE plan_code = 'TRIAL';
        SELECT id INTO p_starter FROM subscription_plans WHERE plan_code = 'STARTER';
        SELECT id INTO p_pro FROM subscription_plans WHERE plan_code = 'PROFESSIONAL';
        SELECT id INTO p_ent FROM subscription_plans WHERE plan_code = 'ENTERPRISE';
        SELECT id INTO p_custom FROM subscription_plans WHERE plan_code = 'CUSTOM';

        IF p_trial IS NOT NULL THEN
            INSERT INTO plan_facility_matrix (plan_id, facility_key, level) VALUES
            (p_trial, 'orchestreeai_app', 'basic'),
            (p_trial, 'ai_workforce', 'limited'),
            (p_trial, 'ai_chief_of_staff', 'basic'),
            (p_trial, 'company_brain', 'limited'),
            (p_trial, 'semantic_memory', 'basic'),
            (p_trial, 'task_workflow', 'basic'),
            (p_trial, 'ai_selection_analytics', 'basic'),
            (p_trial, 'proactive_ai', 'none'),
            (p_trial, 'whatsapp_telegram', 'none'),
            (p_trial, 'multi_llm', 'basic'),
            (p_trial, 'integrations', 'none'),
            (p_trial, 'rbac', 'basic'),
            (p_trial, 'audit_trail', 'basic'),
            (p_trial, 'api_access', 'none'),
            (p_trial, 'advanced_automation', 'none'),
            (p_trial, 'enterprise_security', 'none'),
            (p_trial, 'sso', 'none'),
            (p_trial, 'private_deployment', 'none'),
            (p_trial, 'dedicated_infrastructure', 'none'),
            (p_trial, 'sla_support', 'none'),
            (p_trial, 'custom_ai_workforce', 'none')
            ON CONFLICT (plan_id, facility_key) DO UPDATE SET level = EXCLUDED.level;
        END IF;

        IF p_starter IS NOT NULL THEN
            INSERT INTO plan_facility_matrix (plan_id, facility_key, level) VALUES
            (p_starter, 'orchestreeai_app', 'basic'),
            (p_starter, 'ai_workforce', 'basic'),
            (p_starter, 'ai_chief_of_staff', 'basic'),
            (p_starter, 'company_brain', 'basic'),
            (p_starter, 'semantic_memory', 'basic'),
            (p_starter, 'task_workflow', 'basic'),
            (p_starter, 'ai_selection_analytics', 'basic'),
            (p_starter, 'proactive_ai', 'basic'),
            (p_starter, 'whatsapp_telegram', 'basic'),
            (p_starter, 'multi_llm', 'basic'),
            (p_starter, 'integrations', 'basic'),
            (p_starter, 'rbac', 'basic'),
            (p_starter, 'audit_trail', 'basic'),
            (p_starter, 'api_access', 'none'),
            (p_starter, 'advanced_automation', 'none'),
            (p_starter, 'enterprise_security', 'none'),
            (p_starter, 'sso', 'none'),
            (p_starter, 'private_deployment', 'none'),
            (p_starter, 'dedicated_infrastructure', 'none'),
            (p_starter, 'sla_support', 'none'),
            (p_starter, 'custom_ai_workforce', 'none')
            ON CONFLICT (plan_id, facility_key) DO UPDATE SET level = EXCLUDED.level;
        END IF;

        IF p_pro IS NOT NULL THEN
            INSERT INTO plan_facility_matrix (plan_id, facility_key, level) VALUES
            (p_pro, 'orchestreeai_app', 'advanced'),
            (p_pro, 'ai_workforce', 'advanced'),
            (p_pro, 'ai_chief_of_staff', 'advanced'),
            (p_pro, 'company_brain', 'advanced'),
            (p_pro, 'semantic_memory', 'advanced'),
            (p_pro, 'task_workflow', 'advanced'),
            (p_pro, 'ai_selection_analytics', 'advanced'),
            (p_pro, 'proactive_ai', 'advanced'),
            (p_pro, 'whatsapp_telegram', 'advanced'),
            (p_pro, 'multi_llm', 'advanced'),
            (p_pro, 'integrations', 'advanced'),
            (p_pro, 'rbac', 'advanced'),
            (p_pro, 'audit_trail', 'advanced'),
            (p_pro, 'api_access', 'basic'),
            (p_pro, 'advanced_automation', 'advanced'),
            (p_pro, 'enterprise_security', 'basic'),
            (p_pro, 'sso', 'none'),
            (p_pro, 'private_deployment', 'none'),
            (p_pro, 'dedicated_infrastructure', 'none'),
            (p_pro, 'sla_support', 'basic'),
            (p_pro, 'custom_ai_workforce', 'limited')
            ON CONFLICT (plan_id, facility_key) DO UPDATE SET level = EXCLUDED.level;
        END IF;

        IF p_ent IS NOT NULL THEN
            INSERT INTO plan_facility_matrix (plan_id, facility_key, level) VALUES
            (p_ent, 'orchestreeai_app', 'enterprise'),
            (p_ent, 'ai_workforce', 'enterprise'),
            (p_ent, 'ai_chief_of_staff', 'enterprise'),
            (p_ent, 'company_brain', 'enterprise'),
            (p_ent, 'semantic_memory', 'enterprise'),
            (p_ent, 'task_workflow', 'enterprise'),
            (p_ent, 'ai_selection_analytics', 'enterprise'),
            (p_ent, 'proactive_ai', 'enterprise'),
            (p_ent, 'whatsapp_telegram', 'enterprise'),
            (p_ent, 'multi_llm', 'enterprise'),
            (p_ent, 'integrations', 'enterprise'),
            (p_ent, 'rbac', 'enterprise'),
            (p_ent, 'audit_trail', 'enterprise'),
            (p_ent, 'api_access', 'enterprise'),
            (p_ent, 'advanced_automation', 'enterprise'),
            (p_ent, 'enterprise_security', 'enterprise'),
            (p_ent, 'sso', 'enterprise'),
            (p_ent, 'private_deployment', 'limited'),
            (p_ent, 'dedicated_infrastructure', 'limited'),
            (p_ent, 'sla_support', 'enterprise'),
            (p_ent, 'custom_ai_workforce', 'advanced')
            ON CONFLICT (plan_id, facility_key) DO UPDATE SET level = EXCLUDED.level;
        END IF;

        IF p_custom IS NOT NULL THEN
            INSERT INTO plan_facility_matrix (plan_id, facility_key, level) VALUES
            (p_custom, 'orchestreeai_app', 'custom'),
            (p_custom, 'ai_workforce', 'custom'),
            (p_custom, 'ai_chief_of_staff', 'custom'),
            (p_custom, 'company_brain', 'custom'),
            (p_custom, 'semantic_memory', 'custom'),
            (p_custom, 'task_workflow', 'custom'),
            (p_custom, 'ai_selection_analytics', 'custom'),
            (p_custom, 'proactive_ai', 'custom'),
            (p_custom, 'whatsapp_telegram', 'custom'),
            (p_custom, 'multi_llm', 'custom'),
            (p_custom, 'integrations', 'custom'),
            (p_custom, 'rbac', 'custom'),
            (p_custom, 'audit_trail', 'custom'),
            (p_custom, 'api_access', 'custom'),
            (p_custom, 'advanced_automation', 'custom'),
            (p_custom, 'enterprise_security', 'custom'),
            (p_custom, 'sso', 'custom'),
            (p_custom, 'private_deployment', 'custom'),
            (p_custom, 'dedicated_infrastructure', 'custom'),
            (p_custom, 'sla_support', 'custom'),
            (p_custom, 'custom_ai_workforce', 'custom')
            ON CONFLICT (plan_id, facility_key) DO UPDATE SET level = EXCLUDED.level;
        END IF;
    END $$;
    """)

    # Master AI Activity Types
    op.execute("""
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
    """)

    # Master Formula Factors
    op.execute("""
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
    """)

    # Master Top-up Packages
    op.execute("""
    INSERT INTO credit_topup_packages (name, credit_amount, price_idr, validity_days, is_active) VALUES
    ('Paket Kredit Micro 5,000', 5000.0000, 500000.00, 30, true),
    ('Paket Kredit Standar 25,000', 25000.0000, 2250000.00, 60, true),
    ('Paket Kredit Pro 75,000', 75000.0000, 6000000.00, 90, true),
    ('Paket Kredit Enterprise 250,000', 250000.0000, 18000000.00, 180, true);
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS credit_allocations CASCADE;
    DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
    DROP TABLE IF EXISTS credit_topup_packages CASCADE;
    DROP TABLE IF EXISTS credit_execution_factors CASCADE;
    DROP TABLE IF EXISTS credit_tool_factors CASCADE;
    DROP TABLE IF EXISTS credit_model_cost_factors CASCADE;
    DROP TABLE IF EXISTS credit_complexity_factors CASCADE;
    DROP TABLE IF EXISTS ai_activity_types CASCADE;
    DROP TABLE IF EXISTS plan_facility_matrix CASCADE;
    DROP TABLE IF EXISTS plan_facility_catalog CASCADE;
    ALTER TABLE credit_reservations DROP COLUMN IF EXISTS execution_ref;
    ALTER TABLE credit_reservations DROP COLUMN IF EXISTS cost_breakdown;
    ALTER TABLE credit_reservations DROP COLUMN IF EXISTS activity_type_id;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS display_order;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS is_custom_quote;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS trial_duration_days;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS is_trial;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS ai_agent_limit;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS human_staff_limit;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS ai_credit_allowance;
    ALTER TABLE subscription_plans DROP COLUMN IF EXISTS monthly_price_idr;
    """)
