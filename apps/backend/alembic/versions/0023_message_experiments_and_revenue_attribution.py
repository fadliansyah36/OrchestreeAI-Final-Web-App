"""Message Experiments, AB Testing Results, Company Brain Product Catalog, Sales Coach, and Revenue Attribution (PRD v2.2)

Revision ID: 0023_message_experiments_and_revenue_attribution
Revises: 0022_service_requests_and_handover
Create Date: 2026-09-26 00:00:00.000000

Skema:
- Tabel message_experiments
- Tabel message_experiment_results
- RLS FORCE bertenant pada message_experiments & message_experiment_results
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0023_message_experiments_and_revenue_attribution"
down_revision: Union[str, None] = "0022_service_requests_and_handover"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel message_experiments
    op.execute("""
    CREATE TABLE IF NOT EXISTS message_experiments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        channel_type text NOT NULL CHECK (channel_type IN ('WHATSAPP', 'TELEGRAM', 'INSTAGRAM', 'EMAIL')),
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RUNNING', 'CONCLUDED', 'CANCELLED')),
        variant_a_template text NOT NULL,
        variant_b_template text NOT NULL,
        variant_a_name text NOT NULL DEFAULT 'Variant A (Kontrol)',
        variant_b_name text NOT NULL DEFAULT 'Variant B (Eksperimen)',
        target_metric text NOT NULL DEFAULT 'CONVERSION_RATE' CHECK (target_metric IN ('CLICK_RATE', 'REPLY_RATE', 'CONVERSION_RATE', 'REVENUE')),
        min_sample_size integer NOT NULL DEFAULT 100 CHECK (min_sample_size >= 10),
        confidence_level_threshold numeric(4, 3) NOT NULL DEFAULT 0.950,
        variant_a_sample_count integer NOT NULL DEFAULT 0,
        variant_b_sample_count integer NOT NULL DEFAULT 0,
        variant_a_conversions integer NOT NULL DEFAULT 0,
        variant_b_conversions integer NOT NULL DEFAULT 0,
        variant_a_revenue numeric(15, 2) NOT NULL DEFAULT 0.00,
        variant_b_revenue numeric(15, 2) NOT NULL DEFAULT 0.00,
        winner_variant text CHECK (winner_variant IN ('VARIANT_A', 'VARIANT_B', 'INCONCLUSIVE')),
        p_value numeric(6, 5),
        z_score numeric(8, 4),
        is_statistically_significant boolean NOT NULL DEFAULT false,
        conclusion_reason text,
        created_by_user_id uuid,
        started_at timestamptz,
        concluded_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_msg_exp_tenant_status ON message_experiments(tenant_id, status);
    """)

    # 2. Tabel message_experiment_results
    op.execute("""
    CREATE TABLE IF NOT EXISTS message_experiment_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        experiment_id uuid NOT NULL REFERENCES message_experiments(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        assigned_variant text NOT NULL CHECK (assigned_variant IN ('VARIANT_A', 'VARIANT_B')),
        message_sent_text text NOT NULL,
        is_delivered boolean NOT NULL DEFAULT false,
        delivered_at timestamptz,
        is_read boolean NOT NULL DEFAULT false,
        read_at timestamptz,
        has_replied boolean NOT NULL DEFAULT false,
        replied_at timestamptz,
        has_converted boolean NOT NULL DEFAULT false,
        converted_at timestamptz,
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        revenue_generated numeric(15, 2) NOT NULL DEFAULT 0.00,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_msg_exp_res_exp ON message_experiment_results(experiment_id, assigned_variant);
    CREATE INDEX IF NOT EXISTS idx_msg_exp_res_tenant ON message_experiment_results(tenant_id);
    """)

    # 3. RLS FORCE & Policies
    tables = [
        "message_experiments",
        "message_experiment_results",
    ]

    for table in tables:
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS {table}_tenant_isolation_policy ON {table};
        CREATE POLICY {table}_tenant_isolation_policy ON {table}
        AS RESTRICTIVE
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        """)

    # Grant to orchestree_app
    op.execute(f"""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON {", ".join(tables)} TO orchestree_app;
        END IF;
    END $$;
    """)

    # 4. Register Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES 
        (gen_random_uuid(), 'sales.message_experiments.manage', 1, 'Pengelolaan A/B Testing Template Pesan Penjualan dengan Uji Signifikansi Statistik Z-Score'),
        (gen_random_uuid(), 'sales.revenue_intelligence.view', 1, 'Visibilitas Analisis Pendapatan First-Touch Attribution Lintas Kanal dan Asisten AI'),
        (gen_random_uuid(), 'sales.coach.evaluate', 1, 'Evaluasi Sales Coach AI Terhadap Transkrip Percakapan dan Penutupan Penjualan'),
        (gen_random_uuid(), 'brain.catalog_sync.manage', 1, 'Sinkronisasi Otomatis Katalog Produk dan Inventori Real-Time ke Company Brain')
    ON CONFLICT (capability_key) DO UPDATE 
    SET description = EXCLUDED.description;
    """)


def downgrade() -> None:
    tables = [
        "message_experiment_results",
        "message_experiments",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'sales.message_experiments.manage',
        'sales.revenue_intelligence.view',
        'sales.coach.evaluate',
        'brain.catalog_sync.manage'
    );
    """)
