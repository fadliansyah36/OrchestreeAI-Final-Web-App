-- Skema Sistem Rekonsiliasi Pembayaran Gateway & Audit Webhook (PRD v2.2 Bagian 2, 3.5, 12.5, 14.3)
-- 1. Tabel payment_reconciliation_cases
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

-- 2. RLS Policies
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
INSERT INTO feature_capabilities (capability_code, domain, description, is_active, min_tier)
VALUES
    ('admin.commercial.reconciliation.view', 'commercial', 'Melihat daftar dan status kasus rekonsiliasi pembayaran gateway', true, 'ENTERPRISE'),
    ('admin.commercial.reconciliation.manage', 'commercial', 'Menjalankan re-check status gateway dan penyelesaian manual kasus rekonsiliasi', true, 'ENTERPRISE'),
    ('billing.reconciliation.view', 'billing', 'Melihat status verifikasi rekonsiliasi pembayaran milik tenant', true, 'STARTER')
ON CONFLICT (capability_code) DO NOTHING;
