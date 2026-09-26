"""payment reconciliation system

Revision ID: 0054_payment_reconciliation_system
Revises: 0053_platform_and_tenant_analytics_daily_rollup
Create Date: 2026-09-26 14:00:00.000000

Skema Sistem Rekonsiliasi Pembayaran Gateway & Audit Webhook (PRD v2.2 Bagian 2, 3.5, 12.5, 14.3):
1. Tabel payment_reconciliation_cases
2. RLS Policies & Indices
3. Pendaftaran capability admin.commercial.reconciliation.view, admin.commercial.reconciliation.manage, billing.reconciliation.view
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0054_payment_reconciliation_system'
down_revision: Union[str, None] = '0053_platform_and_tenant_analytics_daily_rollup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel payment_reconciliation_cases
    op.execute("""
    CREATE TABLE IF NOT EXISTS payment_reconciliation_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
        payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
        gateway_reference_id text NOT NULL,
        detected_status text NOT NULL CHECK (detected_status IN ('success','pending','error_confirm')),
        internal_status_before text NOT NULL,
        gateway_status_latest text,
        resolution_status text NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open','verified_matched','verified_mismatch_escalated','resolved','rejected')),
        resolved_by uuid,
        resolution_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_payment_rec_cases_tenant ON payment_reconciliation_cases(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_rec_cases_gateway_ref ON payment_reconciliation_cases(gateway_reference_id);
    CREATE INDEX IF NOT EXISTS idx_payment_rec_cases_resolution ON payment_reconciliation_cases(resolution_status);
    CREATE INDEX IF NOT EXISTS idx_payment_rec_cases_order ON payment_reconciliation_cases(order_id);
    CREATE INDEX IF NOT EXISTS idx_payment_rec_cases_invoice ON payment_reconciliation_cases(invoice_id);
    """)

    # 2. RLS Policies
    op.execute("""
    ALTER TABLE payment_reconciliation_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payment_reconciliation_cases FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS p_payment_reconciliation_cases_superadmin ON payment_reconciliation_cases;
    CREATE POLICY p_payment_reconciliation_cases_superadmin ON payment_reconciliation_cases
        FOR ALL
        USING (
            current_setting('app.tenant_id', true) = 'global'
            OR current_user = 'postgres'
            OR current_user = 'orchestree_app'
        )
        WITH CHECK (
            current_setting('app.tenant_id', true) = 'global'
            OR current_user = 'postgres'
            OR current_user = 'orchestree_app'
        );

    DROP POLICY IF EXISTS p_payment_reconciliation_cases_tenant_read ON payment_reconciliation_cases;
    CREATE POLICY p_payment_reconciliation_cases_tenant_read ON payment_reconciliation_cases
        FOR SELECT
        USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('app.tenant_id', true) = 'global'
            OR current_user = 'postgres'
            OR current_user = 'orchestree_app'
        );

    -- Pendaftaran kapabilitas rekonsiliasi pada feature_capabilities
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('admin.commercial.reconciliation.view', 3, 'Melihat daftar dan status kasus rekonsiliasi pembayaran gateway'),
        ('admin.commercial.reconciliation.manage', 3, 'Menjalankan re-check status gateway dan penyelesaian manual kasus rekonsiliasi'),
        ('billing.reconciliation.view', 1, 'Melihat status verifikasi rekonsiliasi pembayaran milik tenant')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'admin.commercial.reconciliation.view',
        'admin.commercial.reconciliation.manage',
        'billing.reconciliation.view'
    );
    DROP TABLE IF EXISTS payment_reconciliation_cases CASCADE;
    """)
