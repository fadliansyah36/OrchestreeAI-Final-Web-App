"""Sales Guardrails Matrix, MCP Tool Registry High-Risk Mappings, Human Approval Queue, and Extended Audit Ledger (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)

Revision ID: 0024_sales_guardrails_matrix_and_human_approval
Revises: 0023_message_experiments_and_revenue_attribution
Create Date: 2026-09-27 00:00:00.000000

Skema:
- Penambahan kolom persona_type pada audit_logs untuk identifikasi eksplisit persona AI
- Tabel sales_guardrail_rules (Konfigurasi batas otonomi per tenant & matriks guardrail)
- Tabel sales_guardrail_approvals (Antrean Human-in-the-Loop Approval untuk aksi berisiko tinggi)
- RLS FORCE bertenant pada sales_guardrail_rules & sales_guardrail_approvals
- Registrasi 4 capabilities di feature_capabilities (sales.discount.apply, sales.refund.process, sales.order.cancel, sales.custom_contract.create)
- Registrasi 4 perkakas risiko tinggi di mcp_tools (risk_tier='high')
- Inisialisasi aturan guardrail default untuk seluruh tenant aktif
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0024_sales_guardrails_matrix_and_human_approval"
down_revision: Union[str, None] = "0023_message_experiments_and_revenue_attribution"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Perluasan Audit Ledger: Kolom persona_type pada audit_logs
    op.execute("""
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS persona_type text;
    """)

    # 2. Tabel sales_guardrail_rules (Matriks Guardrail & Batas Otonomi per Tenant)
    op.execute("""
    CREATE TABLE IF NOT EXISTS sales_guardrail_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        action_type text NOT NULL CHECK (action_type IN ('DISCOUNT', 'REFUND', 'CANCEL_ORDER', 'CUSTOM_CONTRACT')),
        risk_tier text NOT NULL DEFAULT 'high' CHECK (risk_tier IN ('low', 'medium', 'high', 'critical')),
        requires_human_approval boolean NOT NULL DEFAULT true,
        max_autonomous_discount_pct numeric(5, 2) NOT NULL DEFAULT 10.00,
        max_autonomous_amount numeric(15, 2) NOT NULL DEFAULT 0.00,
        is_active boolean NOT NULL DEFAULT true,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_sales_guardrail_tenant_action UNIQUE (tenant_id, action_type)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_guardrail_rules_tenant 
        ON sales_guardrail_rules(tenant_id, action_type);
    """)

    # 3. Tabel sales_guardrail_approvals (Antrean Persetujuan Manusia / Human-in-the-Loop)
    op.execute("""
    CREATE TABLE IF NOT EXISTS sales_guardrail_approvals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        action_type text NOT NULL CHECK (action_type IN ('DISCOUNT', 'REFUND', 'CANCEL_ORDER', 'CUSTOM_CONTRACT')),
        risk_tier text NOT NULL DEFAULT 'high' CHECK (risk_tier = 'high'),
        status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
        requested_by_actor_type text NOT NULL DEFAULT 'ai_agent' CHECK (requested_by_actor_type IN ('ai_agent', 'human_user', 'system')),
        requested_by_actor_id text,
        requested_by_persona_type text NOT NULL,
        target_resource_type text NOT NULL,
        target_resource_id text,
        request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        guardrail_violation_reason text NOT NULL,
        reviewed_by_user_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        rejection_reason text,
        approval_notes text,
        execution_result jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sales_guardrail_approvals_tenant_status 
        ON sales_guardrail_approvals(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_guardrail_approvals_persona 
        ON sales_guardrail_approvals(tenant_id, requested_by_persona_type);
    """)

    # 4. RLS Enforce & Policies
    op.execute("""
    ALTER TABLE sales_guardrail_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_guardrail_rules FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_sales_guardrail_rules ON sales_guardrail_rules;
    CREATE POLICY tenant_isolation_sales_guardrail_rules ON sales_guardrail_rules
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE sales_guardrail_approvals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_guardrail_approvals FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_sales_guardrail_approvals ON sales_guardrail_approvals;
    CREATE POLICY tenant_isolation_sales_guardrail_approvals ON sales_guardrail_approvals
        FOR ALL
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    """)

    # 5. Registrasi Capability RBAC di feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'sales.discount.apply', 1, 'Otorisasi Aplikasi Diskon Penjualan & Eskalasi Guardrail ke Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.refund.process', 1, 'Otorisasi Proses Pengembalian Dana (Refund) dengan Eskalasi Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.order.cancel', 1, 'Otorisasi Pembatalan Pesanan dengan Eskalasi Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.custom_contract.create', 1, 'Otorisasi Pembuatan Kontrak & Perjanjian Khusus dengan Eskalasi Persetujuan Manusia')
    ON CONFLICT (capability_key) DO UPDATE
    SET description = EXCLUDED.description,
        min_tier_level = EXCLUDED.min_tier_level;
    """)

    # 6. Registrasi MCP Tool Registry di mcp_tools (Seluruhnya risk_tier = 'high')
    op.execute("""
    INSERT INTO mcp_tools (id, tool_name, risk_tier, input_schema, output_schema, description, is_active)
    VALUES
        (
            'tool-sales-discount-apply',
            'sales.discount.apply',
            'high',
            '{"type": "object", "properties": {"order_id": {"type": "string"}, "discount_pct": {"type": "number"}, "reason": {"type": "string"}}, "required": ["order_id", "discount_pct"]}'::jsonb,
            '{"type": "object", "properties": {"executed": {"type": "boolean"}, "status": {"type": "string"}, "approval_id": {"type": "string"}}, "required": ["executed", "status"]}'::jsonb,
            'Menerapkan diskon penjualan ke pesanan/keranjang dengan validasi guardrail batas maksimal dan human approval',
            true
        ),
        (
            'tool-sales-refund-process',
            'sales.refund.process',
            'high',
            '{"type": "object", "properties": {"order_id": {"type": "string"}, "amount": {"type": "number"}, "reason": {"type": "string"}}, "required": ["order_id", "amount", "reason"]}'::jsonb,
            '{"type": "object", "properties": {"executed": {"type": "boolean"}, "status": {"type": "string"}, "approval_id": {"type": "string"}}, "required": ["executed", "status"]}'::jsonb,
            'Memproses permintaan pengembalian dana (refund) transaksi pelanggan dengan eskalasi wajib human approval',
            true
        ),
        (
            'tool-sales-order-cancel',
            'sales.order.cancel',
            'high',
            '{"type": "object", "properties": {"order_id": {"type": "string"}, "reason": {"type": "string"}}, "required": ["order_id", "reason"]}'::jsonb,
            '{"type": "object", "properties": {"executed": {"type": "boolean"}, "status": {"type": "string"}, "approval_id": {"type": "string"}}, "required": ["executed", "status"]}'::jsonb,
            'Membatalkan pesanan yang sudah dibuat dengan validasi guardrail dan eskalasi wajib human approval',
            true
        ),
        (
            'tool-sales-custom-contract',
            'sales.custom_contract.create',
            'high',
            '{"type": "object", "properties": {"customer_id": {"type": "string"}, "terms": {"type": "string"}, "estimated_value": {"type": "number"}}, "required": ["customer_id", "terms"]}'::jsonb,
            '{"type": "object", "properties": {"executed": {"type": "boolean"}, "status": {"type": "string"}, "approval_id": {"type": "string"}}, "required": ["executed", "status"]}'::jsonb,
            'Membuat pengajuan kontrak kerja sama khusus/perjanjian B2B non-standar dengan eskalasi wajib human approval',
            true
        )
    ON CONFLICT (tool_name) DO UPDATE
    SET risk_tier = EXCLUDED.risk_tier,
        input_schema = EXCLUDED.input_schema,
        output_schema = EXCLUDED.output_schema,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active;
    """)

    # 7. Inisialisasi Matriks Guardrail Default untuk seluruh Tenant
    op.execute("""
    INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
    SELECT
        t.id,
        actions.action_type,
        'high',
        true,
        CASE WHEN actions.action_type = 'DISCOUNT' THEN 10.00 ELSE 0.00 END,
        0.00,
        actions.description
    FROM tenants t
    CROSS JOIN (
        VALUES 
            ('DISCOUNT', 'Diskon di atas 10% wajib persetujuan manusia'),
            ('REFUND', 'Setiap pengembalian dana (refund) wajib persetujuan manusia'),
            ('CANCEL_ORDER', 'Setiap pembatalan pesanan terkonfirmasi wajib persetujuan manusia'),
            ('CUSTOM_CONTRACT', 'Setiap pembuatan kontrak kesepakatan khusus wajib persetujuan manusia')
    ) AS actions(action_type, description)
    ON CONFLICT (tenant_id, action_type) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM mcp_tools WHERE tool_name IN (
        'sales.discount.apply',
        'sales.refund.process',
        'sales.order.cancel',
        'sales.custom_contract.create'
    );

    DELETE FROM feature_capabilities WHERE capability_key IN (
        'sales.discount.apply',
        'sales.refund.process',
        'sales.order.cancel',
        'sales.custom_contract.create'
    );

    DROP TABLE IF EXISTS sales_guardrail_approvals CASCADE;
    DROP TABLE IF EXISTS sales_guardrail_rules CASCADE;
    """)
