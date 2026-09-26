-- Migration: 20260926000005_onboarding_persona_and_company_brain.sql
-- Onboarding Persona, Company Brain Knowledge Grounding, dan Alur Pricing Checkout

-- 1. Tabel onboarding_persona_questions
CREATE TABLE IF NOT EXISTS onboarding_persona_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_key text NOT NULL UNIQUE,
    question_text text NOT NULL,
    question_type text NOT NULL CHECK (question_type IN ('single_choice', 'multi_choice', 'essay')),
    options jsonb,
    category text NOT NULL CHECK (category IN (
        'company_profile', 'industry', 'target_market', 'pain_points',
        'goals', 'team_structure', 'competitor_context', 'brand_voice'
    )),
    display_order int NOT NULL DEFAULT 0,
    is_required boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_questions_order ON onboarding_persona_questions(display_order);
CREATE INDEX IF NOT EXISTS idx_onboarding_questions_cat ON onboarding_persona_questions(category);
CREATE INDEX IF NOT EXISTS idx_onboarding_questions_active ON onboarding_persona_questions(is_active);

-- 2. Tabel onboarding_persona_sessions
CREATE TABLE IF NOT EXISTS onboarding_persona_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    initiated_by_membership_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    current_question_index int NOT NULL DEFAULT 0,
    memory_write_pending boolean NOT NULL DEFAULT false,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_persona_sessions_tenant ON onboarding_persona_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_persona_sessions_status ON onboarding_persona_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_persona_sessions_membership ON onboarding_persona_sessions(initiated_by_membership_id);

-- 3. Tabel onboarding_persona_responses
CREATE TABLE IF NOT EXISTS onboarding_persona_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES onboarding_persona_sessions(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES onboarding_persona_questions(id),
    answer_value jsonb NOT NULL,
    answered_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_responses_session ON onboarding_persona_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_persona_responses_question ON onboarding_persona_responses(question_id);

-- 4. RLS FORCE pada tabel sesi dan respon
ALTER TABLE onboarding_persona_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_persona_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persona_sessions_tenant_isolation ON onboarding_persona_sessions;
CREATE POLICY persona_sessions_tenant_isolation ON onboarding_persona_sessions
    FOR ALL
    USING (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    )
    WITH CHECK (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

ALTER TABLE onboarding_persona_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_persona_responses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persona_responses_tenant_isolation ON onboarding_persona_responses;
CREATE POLICY persona_responses_tenant_isolation ON onboarding_persona_responses
    FOR ALL
    USING (
        session_id IN (
            SELECT id FROM onboarding_persona_sessions
            WHERE tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    )
    WITH CHECK (
        session_id IN (
            SELECT id FROM onboarding_persona_sessions
            WHERE tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

ALTER TABLE onboarding_persona_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS persona_questions_read_policy ON onboarding_persona_questions;
CREATE POLICY persona_questions_read_policy ON onboarding_persona_questions
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS persona_questions_admin_manage ON onboarding_persona_questions;
CREATE POLICY persona_questions_admin_manage ON onboarding_persona_questions
    FOR ALL
    USING (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        OR current_setting('app.actor_type', true) = 'superadmin'
        OR current_setting('app.role_code', true) IN ('SUPER_ADMIN', 'PLATFORM_SUPERADMIN')
    );

-- 5. Perluasan source_type pada memory_documents
ALTER TABLE memory_documents DROP CONSTRAINT IF EXISTS memory_documents_source_type_check;
ALTER TABLE memory_documents ADD CONSTRAINT memory_documents_source_type_check
    CHECK (source_type IN ('manual', 'sop', 'workflow_execution', 'agent_reflection', 'conversation', 'document_upload', 'onboarding_persona'));

-- 6. Perluasan transaction_type pada tenant_credit_transactions
ALTER TABLE tenant_credit_transactions DROP CONSTRAINT IF EXISTS tenant_credit_transactions_transaction_type_check;
ALTER TABLE tenant_credit_transactions ADD CONSTRAINT tenant_credit_transactions_transaction_type_check
    CHECK (transaction_type IN ('reserved', 'consumed', 'refunded', 'topup', 'adjustment', 'platform_cost'));

-- 7. Kapabilitas Fitur
INSERT INTO feature_capabilities (capability_code, description, domain, risk_tier)
VALUES
    ('onboarding.persona.participate', 'Partisipasi Pengisian Kuesioner Persona Onboarding Organisasi', 'onboarding', 'low'),
    ('onboarding.persona.manage', 'Manajemen Repositori Pertanyaan Persona Onboarding Super Admin', 'admin', 'medium')
ON CONFLICT (capability_code) DO NOTHING;
