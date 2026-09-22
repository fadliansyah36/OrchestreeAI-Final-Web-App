"""Perluasan Persona Config, Persona Handoff Rules, Leads Pipeline, Jawaban Kualifikasi, dan Riwayat Lead Score (PRD v2.2 Bagian 11 & 12)

Revision ID: 0019_persona_handoff_and_leads
Revises: 0018_omnichannel_customer_and_mtproto
Create Date: 2026-09-23 00:00:00.000000

Skema:
- Perluasan ai_agents dengan persona_config jsonb
- Tabel persona_handoff_rules
- Tabel leads
- Tabel lead_qualification_answers
- Tabel lead_score_history
- RLS FORCE bertenant pada seluruh tabel
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0019_persona_handoff_and_leads"
down_revision: Union[str, None] = "0018_omnichannel_customer_and_mtproto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Perluas ai_agents dengan persona_config jsonb
    op.execute("""
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS persona_config jsonb NOT NULL DEFAULT '{}'::jsonb;
    """)

    # 2. Tabel persona_handoff_rules
    op.execute("""
    CREATE TABLE IF NOT EXISTS persona_handoff_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_persona_type text NOT NULL,
        target_persona_type text NOT NULL,
        condition_type text NOT NULL CHECK (condition_type IN ('LEAD_SCORE_THRESHOLD', 'INTENT_MATCH', 'MANUAL_REQUEST', 'STAGE_CHANGE', 'UNANSWERED_THRESHOLD')),
        condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
        priority integer NOT NULL DEFAULT 100,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_persona_handoff_rule UNIQUE (tenant_id, source_persona_type, target_persona_type, condition_type)
    );

    CREATE INDEX IF NOT EXISTS idx_persona_handoff_tenant_active 
        ON persona_handoff_rules(tenant_id, is_active, priority ASC);
    """)

    # 3. Tabel leads
    op.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        title text NOT NULL,
        company_name text,
        contact_name text NOT NULL,
        contact_phone text,
        contact_email text,
        stage text NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW', 'CONTACTED', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
        funnel_stage text NOT NULL DEFAULT 'AWARENESS' CHECK (funnel_stage IN ('AWARENESS', 'INTEREST', 'DECISION', 'ACTION', 'RETENTION')),
        lead_score numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (lead_score >= 0.00 AND lead_score <= 100.00),
        temperature text NOT NULL DEFAULT 'COLD' CHECK (temperature IN ('COLD', 'WARM', 'HOT')),
        deal_value numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (deal_value >= 0.00),
        assigned_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        assigned_user_id uuid,
        source text NOT NULL DEFAULT 'INBOUND_CHAT',
        channel_type text NOT NULL DEFAULT 'whatsapp',
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_activity_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_leads_tenant_stage ON leads(tenant_id, stage, lead_score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_tenant_temp ON leads(tenant_id, temperature);
    CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id);
    """)

    # 4. Tabel lead_qualification_answers
    op.execute("""
    CREATE TABLE IF NOT EXISTS lead_qualification_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        question_key text NOT NULL,
        question_text text NOT NULL,
        answer_text text NOT NULL,
        score_weight numeric(5, 2) NOT NULL DEFAULT 10.00,
        verified boolean NOT NULL DEFAULT true,
        extracted_by text NOT NULL DEFAULT 'AI_AGENT',
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_lead_qualification_key UNIQUE (tenant_id, lead_id, question_key)
    );

    CREATE INDEX IF NOT EXISTS idx_lead_qual_tenant_lead ON lead_qualification_answers(tenant_id, lead_id);
    """)

    # 5. Tabel lead_score_history
    op.execute("""
    CREATE TABLE IF NOT EXISTS lead_score_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        previous_score numeric(5, 2) NOT NULL,
        new_score numeric(5, 2) NOT NULL,
        delta numeric(5, 2) NOT NULL,
        trigger_event text NOT NULL,
        trigger_details jsonb NOT NULL DEFAULT '{}'::jsonb,
        calculated_by text NOT NULL DEFAULT 'LEAD_SCORING_ENGINE',
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON lead_score_history(lead_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_score_history_tenant ON lead_score_history(tenant_id, created_at DESC);
    """)

    # 6. RLS FORCE bertenant
    tables = [
        "persona_handoff_rules",
        "leads",
        "lead_qualification_answers",
        "lead_score_history",
    ]

    for table in tables:
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON {table};
        CREATE POLICY tenant_isolation_policy ON {table}
            FOR ALL
            USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
        """)

    # 7. Registrasi feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('sales.lead_scoring', 1, 'Kalkulasi Skor Lead Dinamis - Perhitungan otomatis lead score dan funnel stage pada setiap event interaksi customer.'),
        ('sales.lead_pipeline', 1, 'Kanban Pipeline Lead F.01-CRM - Manajemen tahap peluang penjualan dan linimasa aktivitas real-time.'),
        ('sales.persona_handoff', 1, 'Handover Otomatis Antar Persona AI - Pengalihan konteks percakapan antar persona AI Agent secara mulus dalam satu thread tunggal.'),
        ('sales.crm_timeline', 1, 'Linimasa Riwayat Interaksi Lead - Riwayat komprehensif pesan, perubahan skor kualifikasi, dan transisi tahap lead.')
    ON CONFLICT (capability_key) DO UPDATE 
    SET description = EXCLUDED.description;
    """)


def downgrade() -> None:
    tables = [
        "lead_score_history",
        "lead_qualification_answers",
        "leads",
        "persona_handoff_rules",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
    
    op.execute("ALTER TABLE ai_agents DROP COLUMN IF EXISTS persona_config;")
    op.execute("""
    DELETE FROM feature_capabilities 
    WHERE capability_key IN ('sales.lead_scoring', 'sales.lead_pipeline', 'sales.persona_handoff', 'sales.crm_timeline');
    """)
