-- Migrasi Reversible: 006_billing_credits_and_payments_rls.sql
-- Pengelolaan Saldo Kredit, Reservasi, Mutasi Transaksi, Faktur, dan Rekonsiliasi Pembayaran Gateway

BEGIN

-- 1. Tabel Bertenant: tenant_credit_wallet (Dompet Saldo Kredit Tenant)
CREATE TABLE IF NOT EXISTS tenant_credit_wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    balance numeric(18, 4) NOT NULL DEFAULT 0.0000 CHECK (balance >= 0),
    reserved_balance numeric(18, 4) NOT NULL DEFAULT 0.0000 CHECK (reserved_balance >= 0),
    low_balance_threshold numeric(18, 4) NOT NULL DEFAULT 50000.0000 CHECK (low_balance_threshold >= 0),
    currency text NOT NULL DEFAULT 'IDR',
    auto_topup_enabled boolean NOT NULL DEFAULT false,
    auto_topup_amount numeric(18, 4) NOT NULL DEFAULT 0.0000,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_tenant_credit_wallet_tenant ON tenant_credit_wallet(tenant_id);

-- 2. Tabel Bertenant: credit_reservations (Reservasi Kredit Sebelum Eksekusi Model/Tool)
CREATE TABLE IF NOT EXISTS credit_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    estimated_cost numeric(18, 4) NOT NULL CHECK (estimated_cost >= 0),
    actual_cost numeric(18, 4) DEFAULT NULL,
    status text NOT NULL CHECK (status IN ('reserved', 'consumed', 'refunded')),
    reference_type text NOT NULL, -- 'model_router', 'mcp_tool', 'agent_task'
    reference_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_credit_reservations_tenant ON credit_reservations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(status);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_ref ON credit_reservations(reference_type, reference_id);

-- 3. Tabel Bertenant: tenant_credit_transactions (Audit Mutasi Kredit Beruntun)
CREATE TABLE IF NOT EXISTS tenant_credit_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reservation_id uuid REFERENCES credit_reservations(id) ON DELETE SET NULL,
    transaction_type text NOT NULL CHECK (transaction_type IN ('reserved', 'consumed', 'refunded', 'topup', 'adjustment')),
    amount numeric(18, 4) NOT NULL,
    balance_after numeric(18, 4) NOT NULL CHECK (balance_after >= 0),
    reference_id text NOT NULL,
    description text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_credit_transactions_tenant ON tenant_credit_transactions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON tenant_credit_transactions(transaction_type);

-- 4. Tabel Bertenant: invoices (Faktur Pembayaran dan Tagihan Resmi)
CREATE TABLE IF NOT EXISTS invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number text NOT NULL UNIQUE,
    amount numeric(18, 4) NOT NULL CHECK (amount > 0),
    currency text NOT NULL DEFAULT 'IDR',
    status text NOT NULL CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
    payment_gateway text NOT NULL, -- 'midtrans', 'xendit'
    payment_reference text,
    payment_url text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
)

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- 5. Tabel Bertenant: payment_reconciliation_log (Audit Log Rekonsiliasi Webhook Gateway)
CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    gateway text NOT NULL,
    external_order_id text NOT NULL,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    signature_verified boolean NOT NULL DEFAULT false,
    processed_status text NOT NULL, -- 'settled', 'ignored', 'failed', 'invalid_signature'
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
)

CREATE INDEX IF NOT EXISTS idx_payment_rec_log_tenant ON payment_reconciliation_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_rec_log_order ON payment_reconciliation_log(external_order_id);

-- 6. Row Level Security (RLS) FORCE pada Seluruh Tabel Finansial
ALTER TABLE tenant_credit_wallet ENABLE ROW LEVEL SECURITY

ALTER TABLE tenant_credit_wallet FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tenant_credit_wallet ON tenant_credit_wallet;

CREATE POLICY tenant_isolation_tenant_credit_wallet ON tenant_credit_wallet
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE credit_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_credit_reservations ON credit_reservations;

CREATE POLICY tenant_isolation_credit_reservations ON credit_reservations
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_credit_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenant_credit_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tenant_credit_transactions ON tenant_credit_transactions;

CREATE POLICY tenant_isolation_tenant_credit_transactions ON tenant_credit_transactions
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;

CREATE POLICY tenant_isolation_invoices ON invoices
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE payment_reconciliation_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment_reconciliation_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_payment_reconciliation_log ON payment_reconciliation_log;

CREATE POLICY tenant_isolation_payment_reconciliation_log ON payment_reconciliation_log
    AS RESTRICTIVE
    USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Hak Akses DML ke runtime database role orchestree_app jika ada
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_credit_wallet TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON credit_reservations TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_credit_transactions TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON payment_reconciliation_log TO orchestree_app;
    END IF;
END $$

-- 7. Registrasi Feature Capabilities Baru untuk Penagihan & Kredit
INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
VALUES
    ('billing.credits.view', 0, 'Akses melihat saldo kredit dan riwayat mutasi transaksi organisasi'),
    ('billing.credits.manage', 1, 'Akses melakukan reservasi kredit dan transaksi top-up saldo'),
    ('billing.invoices.view', 0, 'Akses melihat daftar faktur pembayaran dan riwayat pembayaran resmi'),
    ('admin.financial.view', 3, 'Akses pusat kendali finansial dan rekonsiliasi gateway lintas organisasi')
ON CONFLICT (capability_key) DO NOTHING

-- 8. Pemetaan Hak Akses Role
INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'billing.credits.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
ON CONFLICT (role_id, capability_key) DO NOTHING

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'billing.credits.manage'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'billing.invoices.view'
FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER')
ON CONFLICT (role_id, capability_key) DO NOTHING;

INSERT INTO role_permissions (role_id, capability_key)
SELECT r.id, 'admin.financial.view'
FROM roles r WHERE r.role_code IN ('PLATFORM_SUPERADMIN')
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
