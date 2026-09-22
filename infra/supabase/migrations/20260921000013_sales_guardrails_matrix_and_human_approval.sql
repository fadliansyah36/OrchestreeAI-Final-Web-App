-- 20260921000013_sales_guardrails_matrix_and_human_approval.sql
-- Matriks Guardrail Sales, MCP Tool Registry High-Risk Mappings, Antrean Persetujuan Manusia, dan Perluasan Audit Ledger (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)

-- 1. Perluasan Audit Ledger: Kolom persona_type pada audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS persona_type text;

-- 2. Tabel sales_guardrail_rules (Matriks Guardrail & Batas Otonomi per Tenant)
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

-- 3. Tabel sales_guardrail_approvals (Antrean Persetujuan Manusia / Human-in-the-Loop)
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

-- 4. RLS Enforce & Policies
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

-- 5. Registrasi Capability RBAC di feature_capabilities
INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
VALUES
    (gen_random_uuid(), 'sales.discount.apply', 1, 'Otorisasi Aplikasi Diskon Penjualan & Eskalasi Guardrail ke Persetujuan Manusia'),
    (gen_random_uuid(), 'sales.refund.process', 1, 'Otorisasi Proses Pengembalian Dana (Refund) dengan Eskalasi Persetujuan Manusia'),
    (gen_random_uuid(), 'sales.order.cancel', 1, 'Otorisasi Pembatalan Pesanan dengan Eskalasi Persetujuan Manusia'),
    (gen_random_uuid(), 'sales.custom_contract.create', 1, 'Otorisasi Pembuatan Kontrak & Perjanjian Khusus dengan Eskalasi Persetujuan Manusia')
ON CONFLICT (capability_key) DO UPDATE
SET description = EXCLUDED.description,
    min_tier_level = EXCLUDED.min_tier_level;

-- 6. Registrasi MCP Tool Registry di mcp_tools (Seluruhnya risk_tier = 'high')
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

-- 7. Inisialisasi default 4 aturan guardrail untuk semua tenant aktif
INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
SELECT 
    t.id,
    'DISCOUNT',
    'high',
    true,
    10.00,
    0.00,
    'Diskon penjualan di atas batas toleransi 10.0% wajib melalui persetujuan staf manusia (HUMAN_APPROVAL)'
FROM tenants t
ON CONFLICT (tenant_id, action_type) DO NOTHING;

INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
SELECT 
    t.id,
    'REFUND',
    'high',
    true,
    0.00,
    0.00,
    'Setiap pengembalian dana (refund) wajib persetujuan staf manusia (risk_tier=high)'
FROM tenants t
ON CONFLICT (tenant_id, action_type) DO NOTHING;

INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
SELECT 
    t.id,
    'CANCEL_ORDER',
    'high',
    true,
    0.00,
    0.00,
    'Setiap pembatalan pesanan terkonfirmasi wajib persetujuan staf manusia (risk_tier=high)'
FROM tenants t
ON CONFLICT (tenant_id, action_type) DO NOTHING;

INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
SELECT 
    t.id,
    'CUSTOM_CONTRACT',
    'high',
    true,
    0.00,
    0.00,
    'Setiap klausul kontrak B2B / kesepakatan khusus wajib persetujuan staf manusia (risk_tier=high)'
FROM tenants t
ON CONFLICT (tenant_id, action_type) DO NOTHING;
