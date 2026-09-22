import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL tidak disetel!');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL.');

  try {
    await client.query('BEGIN;');

    console.log('1. Menambahkan kolom persona_type ke audit_logs...');
    await client.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS persona_type text;');

    console.log('2. Membuat tabel sales_guardrail_rules...');
    await client.query(`
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
    `);

    console.log('3. Membuat tabel sales_guardrail_approvals...');
    await client.query(`
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
    `);

    console.log('4. Mengaktifkan RLS FORCE...');
    await client.query(`
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
    `);

    console.log('5. Mendaftarkan 4 capability ke feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
      VALUES
        (gen_random_uuid(), 'sales.discount.apply', 1, 'Otorisasi Aplikasi Diskon Penjualan & Eskalasi Guardrail ke Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.refund.process', 1, 'Otorisasi Proses Pengembalian Dana (Refund) dengan Eskalasi Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.order.cancel', 1, 'Otorisasi Pembatalan Pesanan dengan Eskalasi Persetujuan Manusia'),
        (gen_random_uuid(), 'sales.custom_contract.create', 1, 'Otorisasi Pembuatan Kontrak & Perjanjian Khusus dengan Eskalasi Persetujuan Manusia')
      ON CONFLICT (capability_key) DO UPDATE
      SET description = EXCLUDED.description,
          min_tier_level = EXCLUDED.min_tier_level;
    `);

    console.log('6. Mendaftarkan 4 tool MCP ke mcp_tools (risk_tier = high)...');
    await client.query(`
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
    `);

    console.log('7. Inisialisasi matriks guardrail default untuk seluruh tenant...');
    await client.query(`
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
    `);

    console.log('8. Mencatat alembic_version...');
    await client.query(`
      INSERT INTO alembic_version (version_num)
      VALUES ('0024_sales_guardrails_matrix_and_human_approval')
      ON CONFLICT (version_num) DO NOTHING;
    `);

    await client.query('COMMIT;');
    console.log('✅ Migrasi 0024 berhasil dijalankan dan tercatat di database.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Gagal menjalankan migrasi 0024:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
