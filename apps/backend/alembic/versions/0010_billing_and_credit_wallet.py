"""Inisialisasi Sistem Finansial, Dompet Kredit Tenant, dan Rekonsiliasi Gateway Pembayaran (PRD v2.2 Bagian 14)

Revision ID: 0010_billing_and_credit_wallet
Revises: 0009_continuous_learning
Create Date: 2026-09-22 14:00:00.000000

Skema Finansial & Dompet Kredit:
- Tabel tenant_credit_wallet: Dompet saldo kredit organisasi (balance, reserved_balance, low_balance_threshold).
- Tabel credit_reservations: Reservasi kredit sebelum eksekusi LLM / perkakas MCP.
- Tabel tenant_credit_transactions: Buku besar audit mutasi saldo kredit beruntun.
- Tabel invoices: Faktur pembayaran resmi dan tagihan langganan/top-up.
- Tabel payment_reconciliation_log: Catatan audit rekonsiliasi webhook gateway (Midtrans / Xendit).
- Penegakan RLS FORCE bertenant pada seluruh tabel finansial.
- Registrasi kapabilitas fitur finansial ke feature_capabilities dan role_permissions.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0010_billing_and_credit_wallet"
down_revision: Union[str, None] = "0009_continuous_learning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel tenant_credit_wallet
    op.execute("""
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
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_credit_wallet_tenant ON tenant_credit_wallet(tenant_id);
    """)

    # 2. Tabel credit_reservations
    op.execute("""
    CREATE TABLE IF NOT EXISTS credit_reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        estimated_cost numeric(18, 4) NOT NULL CHECK (estimated_cost >= 0),
        actual_cost numeric(18, 4) DEFAULT NULL,
        status text NOT NULL CHECK (status IN ('reserved', 'consumed', 'refunded')),
        reference_type text NOT NULL,
        reference_id text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_credit_reservations_tenant ON credit_reservations(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(status);
    CREATE INDEX IF NOT EXISTS idx_credit_reservations_ref ON credit_reservations(reference_type, reference_id);
    """)

    # 3. Tabel tenant_credit_transactions
    op.execute("""
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
    );

    CREATE INDEX IF NOT EXISTS idx_credit_transactions_tenant ON tenant_credit_transactions(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON tenant_credit_transactions(transaction_type);
    """)

    # 4. Tabel invoices
    op.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_number text NOT NULL UNIQUE,
        amount numeric(18, 4) NOT NULL CHECK (amount > 0),
        currency text NOT NULL DEFAULT 'IDR',
        status text NOT NULL CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
        payment_gateway text NOT NULL,
        payment_reference text,
        payment_url text,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        paid_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    """)

    # 5. Tabel payment_reconciliation_log
    op.execute("""
    CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        gateway text NOT NULL,
        external_order_id text NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        signature_verified boolean NOT NULL DEFAULT false,
        processed_status text NOT NULL,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_rec_log_tenant ON payment_reconciliation_log(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_rec_log_order ON payment_reconciliation_log(external_order_id);
    """)

    # 6. RLS FORCE bertenant
    op.execute("""
    ALTER TABLE tenant_credit_wallet ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_credit_wallet FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_tenant_credit_wallet ON tenant_credit_wallet;
    CREATE POLICY tenant_isolation_tenant_credit_wallet ON tenant_credit_wallet
        FOR ALL
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE credit_reservations FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_credit_reservations ON credit_reservations;
    CREATE POLICY tenant_isolation_credit_reservations ON credit_reservations
        FOR ALL
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE tenant_credit_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_credit_transactions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_tenant_credit_transactions ON tenant_credit_transactions;
    CREATE POLICY tenant_isolation_tenant_credit_transactions ON tenant_credit_transactions
        FOR ALL
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
    CREATE POLICY tenant_isolation_invoices ON invoices
        FOR ALL
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE payment_reconciliation_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payment_reconciliation_log FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_payment_reconciliation_log ON payment_reconciliation_log;
    CREATE POLICY tenant_isolation_payment_reconciliation_log ON payment_reconciliation_log
        FOR ALL
        USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_credit_wallet TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON credit_reservations TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_credit_transactions TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON payment_reconciliation_log TO orchestree_app;
        END IF;
    END $$;
    """)

    # 7. Registrasi kapabilitas fitur
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('billing.credits.view', 0, 'Akses melihat saldo kredit dan riwayat mutasi transaksi organisasi'),
        ('billing.credits.manage', 1, 'Akses melakukan reservasi kredit dan transaksi top-up saldo'),
        ('billing.invoices.view', 0, 'Akses melihat daftar faktur pembayaran dan riwayat pembayaran resmi'),
        ('admin.financial.view', 3, 'Akses pusat kendali finansial dan rekonsiliasi gateway lintas organisasi')
    ON CONFLICT (capability_key) DO NOTHING;

    INSERT INTO role_permissions (role_id, capability_key)
    SELECT r.id, 'billing.credits.view'
    FROM roles r WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'DEPT_MANAGER', 'STAFF_HUMAN')
    ON CONFLICT (role_id, capability_key) DO NOTHING;

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
    """)


def downgrade() -> None:
    tables = [
        "payment_reconciliation_log",
        "invoices",
        "tenant_credit_transactions",
        "credit_reservations",
        "tenant_credit_wallet",
    ]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{tbl} ON {tbl};")
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE;")

    op.execute("""
    DELETE FROM role_permissions WHERE capability_key IN (
        'billing.credits.view', 'billing.credits.manage', 'billing.invoices.view', 'admin.financial.view'
    );
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'billing.credits.view', 'billing.credits.manage', 'billing.invoices.view', 'admin.financial.view'
    );
    """)
