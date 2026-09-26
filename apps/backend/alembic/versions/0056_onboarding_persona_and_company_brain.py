"""onboarding persona and company brain

Revision ID: 0056_onboarding_persona_and_company_brain
Revises: 0055_trello_kanban_and_proactive_tasks
Create Date: 2026-09-26 15:45:00.000000

Onboarding Persona, Company Brain Knowledge Grounding, dan Alur Pricing Checkout
(PRD v2.2 Bagian 1.3, 3.5, 8.4, 10.3, 14, 15, 18.2):
1. Tabel onboarding_persona_questions (Reference data platform, Super Admin CRUD)
2. Tabel onboarding_persona_sessions (Sesi persona bertenant dengan RLS FORCE)
3. Tabel onboarding_persona_responses (Jawaban per pertanyaan dengan RLS FORCE dan UNIQUE)
4. Modifikasi check constraint memory_documents.source_type (menambahkan 'onboarding_persona')
5. Modifikasi check constraint tenant_credit_transactions.transaction_type (menambahkan 'platform_cost')
6. Seeding 8 pertanyaan persona komprehensif lintas 8 kategori resmi
7. Registrasi kapabilitas onboarding.persona.manage dan onboarding.persona.participate
8. Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
import json
from alembic import op
import sqlalchemy as sa


revision: str = '0056_onboarding_persona_and_company_brain'
down_revision: Union[str, None] = '0055_trello_kanban_and_proactive_tasks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel onboarding_persona_questions
    op.execute("""
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
    """)

    # 2. Tabel onboarding_persona_sessions
    op.execute("""
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
    """)

    # 3. Tabel onboarding_persona_responses
    op.execute("""
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
    """)

    # 4. RLS FORCE pada onboarding_persona_sessions dan onboarding_persona_responses
    op.execute("""
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
    """)

    # 5. Perluasan source_type pada memory_documents
    op.execute("""
    ALTER TABLE memory_documents DROP CONSTRAINT IF EXISTS memory_documents_source_type_check;
    ALTER TABLE memory_documents ADD CONSTRAINT memory_documents_source_type_check
        CHECK (source_type IN ('manual', 'sop', 'workflow_execution', 'agent_reflection', 'conversation', 'document_upload', 'onboarding_persona'));
    """)

    # 6. Perluasan transaction_type pada tenant_credit_transactions
    op.execute("""
    ALTER TABLE tenant_credit_transactions DROP CONSTRAINT IF EXISTS tenant_credit_transactions_transaction_type_check;
    ALTER TABLE tenant_credit_transactions ADD CONSTRAINT tenant_credit_transactions_transaction_type_check
        CHECK (transaction_type IN ('reserved', 'consumed', 'refunded', 'topup', 'adjustment', 'platform_cost'));
    """)

    # 7. Seed 8 Pertanyaan Persona
    sample_questions = [
        (
            'company_overview',
            'Apa fokus utama bidang usaha dan deskripsi inti produk atau layanan bisnis Anda?',
            'essay',
            None,
            'company_profile',
            1,
            True,
            True,
        ),
        (
            'primary_industry',
            'Pilih sektor industri utama operasional bisnis Anda:',
            'single_choice',
            json.dumps([
                {"value": "ecommerce", "label": "Retail, E-Commerce & Perdagangan"},
                {"value": "saas", "label": "Software, SaaS & Teknologi Informasi"},
                {"value": "services", "label": "Jasa Profesional, Konsultan & Agensi"},
                {"value": "fnb", "label": "Food & Beverage (F&B) / Hospitality"},
                {"value": "manufacturing", "label": "Manufaktur, Logistik & Distribusi"},
                {"value": "health_finance", "label": "Kesehatan, Farmasi, atau Keuangan"},
            ]),
            'industry',
            2,
            True,
            True,
        ),
        (
            'target_market_type',
            'Siapa target pasar atau segmen pelanggan prioritas utama Anda?',
            'single_choice',
            json.dumps([
                {"value": "b2b_enterprise", "label": "B2B Enterprise / Korporasi Besar"},
                {"value": "b2b_sme", "label": "B2B UKM / Bisnis Menengah"},
                {"value": "b2c_mass", "label": "B2C Konsumen Massal / Retail"},
                {"value": "b2b2c_hybrid", "label": "Hybrid B2B2C / Distributor & Konsumen Akhir"},
            ]),
            'target_market',
            3,
            True,
            True,
        ),
        (
            'team_scale',
            'Berapa skala jumlah anggota tim kerja di organisasi Anda saat ini?',
            'single_choice',
            json.dumps([
                {"value": "under_10", "label": "1 - 10 Anggota Tim"},
                {"value": "11_50", "label": "11 - 50 Anggota Tim"},
                {"value": "51_200", "label": "51 - 200 Anggota Tim"},
                {"value": "above_200", "label": "Lebih dari 200 Anggota Tim"},
            ]),
            'team_structure',
            4,
            True,
            True,
        ),
        (
            'core_pain_points',
            'Tantangan operasional terbesar apa yang ingin segera Anda atasi bersama AI Workforce?',
            'multi_choice',
            json.dumps([
                {"value": "slow_response", "label": "Respons komunikasi calon pelanggan lambat di luar jam kerja"},
                {"value": "manual_tasks", "label": "Beban pekerjaan entri data dan follow-up tugas berulang sangat tinggi"},
                {"value": "sales_closing", "label": "Tingkat konversi prospek penjualan (leads) menjadi transaksi masih rendah"},
                {"value": "inconsistent_service", "label": "Standar layanan pelanggan tidak konsisten antar anggota staf"},
                {"value": "market_monitoring", "label": "Kesulitan memantau dinamika harga dan aktivitas kompetitor secara berkala"},
            ]),
            'pain_points',
            5,
            True,
            True,
        ),
        (
            'strategic_goals',
            'Jelaskan target capaian spesifik bisnis yang ingin dicapai dalam 3 hingga 6 bulan ke depan:',
            'essay',
            None,
            'goals',
            6,
            True,
            True,
        ),
        (
            'benchmark_competitors',
            'Sebutkan nama kompetitor utama atau merek yang Anda jadikan tolok ukur pasar saat ini:',
            'essay',
            None,
            'competitor_context',
            7,
            True,
            True,
        ),
        (
            'brand_voice_tone',
            'Bagaimana karakter nada bahasa dan gaya komunikasi merek yang ingin diwakili oleh Staf AI?',
            'single_choice',
            json.dumps([
                {"value": "formal_professional", "label": "Formal, Sopan, Terstruktur & Sangat Profesional"},
                {"value": "warm_friendly", "label": "Hangat, Solutif, Bersahabat & Santai"},
                {"value": "authoritative_expert", "label": "Otoritatif, Tegas, Presisi & Berbasis Data"},
                {"value": "creative_energetic", "label": "Kreatif, Penuh Semangat, Dinamis & Persuasif"},
            ]),
            'brand_voice',
            8,
            True,
            True,
        ),
    ]

    for q in sample_questions:
        op.execute(sa.text("""
        INSERT INTO onboarding_persona_questions (
            question_key, question_text, question_type, options, category, display_order, is_required, is_active
        ) VALUES (
            :key, :text, :qtype, :options, :cat, :order, :req, :act
        )
        ON CONFLICT (question_key) DO UPDATE SET
            question_text = EXCLUDED.question_text,
            question_type = EXCLUDED.question_type,
            options = EXCLUDED.options,
            category = EXCLUDED.category,
            display_order = EXCLUDED.display_order,
            is_required = EXCLUDED.is_required,
            is_active = EXCLUDED.is_active;
        """).bindparams(
            key=q[0],
            text=q[1],
            qtype=q[2],
            options=q[3],
            cat=q[4],
            order=q[5],
            req=q[6],
            act=q[7],
        ))

    # 8. Pendaftaran feature_capabilities
    capabilities = [
        ('onboarding.persona.participate', 1, 'Partisipasi Pengisian Kuesioner Persona Onboarding Organisasi'),
        ('onboarding.persona.manage', 3, 'Manajemen Repositori Pertanyaan Persona Onboarding Super Admin'),
    ]

    for cap in capabilities:
        op.execute(sa.text("""
        INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
        VALUES (:key, :tier, :desc)
        ON CONFLICT (capability_key) DO NOTHING;
        """).bindparams(key=cap[0], tier=cap[1], desc=cap[2]))


def downgrade() -> None:
    # 1. Hapus capabilities
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN ('onboarding.persona.participate', 'onboarding.persona.manage');
    """)

    # 2. Drop RLS policies & tabel
    op.execute("""
    DROP POLICY IF EXISTS persona_responses_tenant_isolation ON onboarding_persona_responses;
    DROP POLICY IF EXISTS persona_sessions_tenant_isolation ON onboarding_persona_sessions;
    DROP POLICY IF EXISTS persona_questions_read_policy ON onboarding_persona_questions;
    DROP POLICY IF EXISTS persona_questions_admin_manage ON onboarding_persona_questions;

    DROP TABLE IF EXISTS onboarding_persona_responses CASCADE;
    DROP TABLE IF EXISTS onboarding_persona_sessions CASCADE;
    DROP TABLE IF EXISTS onboarding_persona_questions CASCADE;
    """)

    # 3. Kembalikan constraints
    op.execute("""
    ALTER TABLE memory_documents DROP CONSTRAINT IF EXISTS memory_documents_source_type_check;
    ALTER TABLE memory_documents ADD CONSTRAINT memory_documents_source_type_check
        CHECK (source_type IN ('manual', 'sop', 'workflow_execution', 'agent_reflection', 'conversation', 'document_upload'));

    ALTER TABLE tenant_credit_transactions DROP CONSTRAINT IF EXISTS tenant_credit_transactions_transaction_type_check;
    ALTER TABLE tenant_credit_transactions ADD CONSTRAINT tenant_credit_transactions_transaction_type_check
        CHECK (transaction_type IN ('reserved', 'consumed', 'refunded', 'topup', 'adjustment'));
    """)
