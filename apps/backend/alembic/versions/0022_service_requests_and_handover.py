"""Customer Service Intake, Service Requests, Handover Protocol, Indonesian Humanizer, Abandoned Cart (PRD v2.2 Bagian 11.9, 12.7, 13, 16)

Revision ID: 0022_service_requests_and_handover
Revises: 0021_campaigns_marketing_and_social_calendar
Create Date: 2026-09-25 00:00:00.000000

Skema:
- Tabel service_requests, service_request_attachments
- Tabel abandoned_cart_recoveries
- Tabel handover_records
- RLS FORCE bertenant pada seluruh 4 tabel baru
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0022_service_requests_and_handover"
down_revision: Union[str, None] = "0021_campaigns_marketing_and_social_calendar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Service Requests (Tiket Komplain, Refund, Return, Dukungan)
    op.execute("""
    CREATE TABLE IF NOT EXISTS service_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        ticket_number text NOT NULL,
        category text NOT NULL
            CHECK (category IN ('REFUND', 'RETURN', 'COMPLAINT', 'CANCELLATION', 'TECHNICAL_SUPPORT', 'GENERAL_INQUIRY')),
        priority text NOT NULL DEFAULT 'MEDIUM'
            CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        status text NOT NULL DEFAULT 'OPEN'
            CHECK (status IN ('OPEN', 'IN_INVESTIGATION', 'HUMAN_APPROVAL', 'APPROVED', 'REJECTED', 'RESOLVED', 'CLOSED')),
        subject text NOT NULL,
        description text NOT NULL,
        amount numeric(15, 2) NOT NULL DEFAULT 0.00,
        refund_reason text,
        return_tracking_number text,
        resolution_notes text,
        assigned_agent_id uuid,
        approved_by_user_id uuid,
        approved_at timestamptz,
        intake_channel text NOT NULL DEFAULT 'WHATSAPP',
        source_node text NOT NULL DEFAULT 'CUSTOMER_SERVICE_INTAKE',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_service_requests_tenant_ticket UNIQUE (tenant_id, ticket_number)
    );

    CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_status 
        ON service_requests(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_service_requests_customer 
        ON service_requests(tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_service_requests_order 
        ON service_requests(tenant_id, order_id);
    """)

    # 2. Service Request Attachments (Bukti Foto/Video Cacat/Resi)
    op.execute("""
    CREATE TABLE IF NOT EXISTS service_request_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        service_request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        file_url text NOT NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size_bytes bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sr_attachments_request 
        ON service_request_attachments(tenant_id, service_request_id);
    """)

    # 3. Abandoned Cart Recoveries (Pemulihan Keranjang Ditinggalkan)
    op.execute("""
    CREATE TABLE IF NOT EXISTS abandoned_cart_recoveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        channel text NOT NULL DEFAULT 'WHATSAPP',
        status text NOT NULL DEFAULT 'SCHEDULED'
            CHECK (status IN ('SCHEDULED', 'DISPATCHED', 'CONVERTED', 'EXPIRED', 'CANCELLED')),
        scheduled_at timestamptz NOT NULL,
        sent_at timestamptz,
        discount_code text,
        message_sent text,
        cart_value numeric(15, 2) NOT NULL DEFAULT 0.00,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_abandoned_cart_sched 
        ON abandoned_cart_recoveries(tenant_id, status, scheduled_at);
    """)

    # 4. Handover Records (Log Handoff ke CS / Sales Manusia)
    op.execute("""
    CREATE TABLE IF NOT EXISTS handover_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
        handover_reason text NOT NULL,
        trigger_type text NOT NULL,
        lead_score numeric(5, 2) NOT NULL DEFAULT 0.00,
        budget numeric(15, 2) NOT NULL DEFAULT 0.00,
        funnel_stage text NOT NULL DEFAULT 'AWARENESS',
        executive_summary text NOT NULL,
        actionable_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING', 'ACCEPTED', 'RESOLVED')),
        assigned_human_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_handover_records_tenant_status 
        ON handover_records(tenant_id, status);
    """)

    # Enforce RLS on all 4 new tables
    tables = [
        "service_requests",
        "service_request_attachments",
        "abandoned_cart_recoveries",
        "handover_records",
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

    # Register Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_name, description, module_name, is_active)
    VALUES 
        (gen_random_uuid(), 'CAP_CUSTOMER_SERVICE_INTAKE', 'Real Complaint, Refund, and Return Request Intake Node', 'service', true),
        (gen_random_uuid(), 'CAP_HANDOVER_PROTOCOL', 'Structured Sales and CS Handover Protocol Engine', 'sales', true),
        (gen_random_uuid(), 'CAP_HUMANIZE_ID', 'F.01-HUMANIZE-ID Indonesian Output Validator with Grounding Verification', 'skills', true),
        (gen_random_uuid(), 'CAP_ABANDONED_CART_RECOVERY', 'Scheduled Omnichannel Abandoned Cart Recovery Automation', 'commerce', true)
    ON CONFLICT (capability_name) DO UPDATE 
    SET description = EXCLUDED.description, is_active = true;
    """)


def downgrade() -> None:
    tables = [
        "handover_records",
        "abandoned_cart_recoveries",
        "service_request_attachments",
        "service_requests",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_name IN (
        'CAP_CUSTOMER_SERVICE_INTAKE',
        'CAP_HANDOVER_PROTOCOL',
        'CAP_HUMANIZE_ID',
        'CAP_ABANDONED_CART_RECOVERY'
    );
    """)
