"""Event Definitions & Knowledge Rules with Mandatory Human Approval (PRD v2.2 Bagian 8.13.6, 8.13.8)

Revision ID: 0034_event_definitions_and_knowledge_rules
Revises: 0033_task_execution_and_source_monitoring
Create Date: 2026-09-23 12:00:00.000000

Skema:
- Tabel event_definitions: Definisi event bisnis (cash flow deficit, supply breach, correlation triggers)
- Tabel knowledge_event_rules: Aturan pengetahuan yang menautkan node knowledge (dari AI Research Agent / manual) ke directive aksi
  - Mutlak: default approval_status = 'PENDING_HUMAN_APPROVAL', is_active = false
  - Wajib disetujui manusia eksplisit sebelum aktif di Event Engine
- RLS FORCE terisolasi per tenant
- Pendaftaran feature_capabilities untuk finance cash flow, knowledge fusion, dan enterprise event engine
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0034_event_definitions_and_knowledge_rules"
down_revision: Union[str, None] = "0033_task_execution_and_source_monitoring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel event_definitions
    op.execute("""
    CREATE TABLE IF NOT EXISTS event_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_code VARCHAR(100) NOT NULL,
        event_name VARCHAR(150) NOT NULL,
        dimension_code VARCHAR(50) NOT NULL DEFAULT 'FINANCIALS_AND_BUDGET' CHECK (dimension_code IN (
            'ORGANIZATIONAL_STRUCTURE',
            'STRATEGY_AND_OBJECTIVES',
            'PRODUCTS_AND_SERVICES',
            'PROCESSES_AND_SOPS',
            'BRAND_AND_IDENTITY',
            'FINANCIALS_AND_BUDGET',
            'COMPLIANCE_AND_LEGAL',
            'CUSTOMER_AND_MARKET'
        )),
        description TEXT,
        trigger_type VARCHAR(50) NOT NULL DEFAULT 'THRESHOLD_BREACH' CHECK (trigger_type IN (
            'THRESHOLD_BREACH',
            'CROSS_SYSTEM_CORRELATION',
            'ANOMALY_DETECTION',
            'SCHEDULED_AUDIT'
        )),
        trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
        target_department VARCHAR(100) NOT NULL DEFAULT 'FINANCE',
        severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        requires_human_approval BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_event_code UNIQUE (tenant_id, event_code)
    );

    CREATE INDEX IF NOT EXISTS idx_event_definitions_tenant
        ON event_definitions(tenant_id, is_active, dimension_code);
    """)

    # 2. Tabel knowledge_event_rules
    # DEFINITION OF DONE: Aturan dari AI Research Agent WAJIB default PENDING_HUMAN_APPROVAL dan is_active = false
    op.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_event_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_definition_id UUID REFERENCES event_definitions(id) ON DELETE CASCADE,
        rule_code VARCHAR(100) NOT NULL,
        rule_name VARCHAR(150) NOT NULL,
        rule_source VARCHAR(50) NOT NULL DEFAULT 'AI_RESEARCH_AGENT' CHECK (rule_source IN (
            'AI_RESEARCH_AGENT',
            'MANUAL_HUMAN',
            'ERP_IMPORT'
        )),
        source_node_id UUID REFERENCES company_context_knowledge_nodes(id) ON DELETE SET NULL,
        condition_logic JSONB NOT NULL DEFAULT '{}'::jsonb,
        directive_action JSONB NOT NULL DEFAULT '{}'::jsonb,
        approval_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_HUMAN_APPROVAL' CHECK (approval_status IN (
            'PENDING_HUMAN_APPROVAL',
            'APPROVED',
            'REJECTED'
        )),
        is_active BOOLEAN NOT NULL DEFAULT false,
        approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_knowledge_rule_code UNIQUE (tenant_id, rule_code)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_tenant_approval
        ON knowledge_event_rules(tenant_id, approval_status, is_active);
    """)

    # 3. RLS Isolation Policies
    op.execute("""
    ALTER TABLE event_definitions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE event_definitions FORCE ROW LEVEL SECURITY;

    CREATE POLICY event_definitions_tenant_isolation ON event_definitions
        FOR ALL TO authenticated
        USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid)
        WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid);

    ALTER TABLE knowledge_event_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knowledge_event_rules FORCE ROW LEVEL SECURITY;

    CREATE POLICY knowledge_event_rules_tenant_isolation ON knowledge_event_rules
        FOR ALL TO authenticated
        USING (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid)
        WITH CHECK (tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::uuid);
    """)

    # 4. Registrasi Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (
        code, domain, name, description, min_tier_level, requires_addon, metadata, created_at, updated_at
    ) VALUES 
        (
            'finance.cash_flow.view',
            'finance',
            'Cash Flow Analytics (Native All-Tier)',
            'Melihat proyeksi arus kas operasional dari data transaksi pesanan dan pembayaran native',
            1,
            false,
            '{"supported_tiers": ["STARTER", "GROWTH", "PRO", "ENTERPRISE"]}'::jsonb,
            now(),
            now()
        ),
        (
            'finance.cash_flow.erp_sync',
            'finance',
            'External ERP Cash Flow Harmonization (Enterprise Tier)',
            'Harmonisasi data arus kas langsung dari sistem ERP eksternal (SAP / NetSuite / Oracle)',
            3,
            false,
            '{"supported_tiers": ["ENTERPRISE"]}'::jsonb,
            now(),
            now()
        ),
        (
            'knowledge.fusion.view',
            'knowledge',
            'Context Fabric & Knowledge Fusion Engine',
            'Fusi pengetahuan terpadu 8 dimensi konteks perusahaan dengan penegakan hierarki prioritas',
            2,
            false,
            '{"supported_tiers": ["GROWTH", "PRO", "ENTERPRISE"]}'::jsonb,
            now(),
            now()
        ),
        (
            'enterprise.event_engine.manage',
            'enterprise',
            'Enterprise Event Engine & Knowledge Rule Execution',
            'Evaluasi event operasional otomatis dengan aturan pengetahuan terverifikasi',
            3,
            false,
            '{"supported_tiers": ["ENTERPRISE"]}'::jsonb,
            now(),
            now()
        ),
        (
            'enterprise.knowledge_rule.approve',
            'enterprise',
            'Human Approval for AI Knowledge Rules',
            'Persetujuan manusia eksplisit untuk mengaktifkan aturan pengetahuan baru dari AI Research Agent',
            3,
            false,
            '{"supported_tiers": ["ENTERPRISE"]}'::jsonb,
            now(),
            now()
        )
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        min_tier_level = EXCLUDED.min_tier_level,
        updated_at = now();
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE code IN (
        'finance.cash_flow.view',
        'finance.cash_flow.erp_sync',
        'knowledge.fusion.view',
        'enterprise.event_engine.manage',
        'enterprise.knowledge_rule.approve'
    );
    DROP TABLE IF EXISTS knowledge_event_rules CASCADE;
    DROP TABLE IF EXISTS event_definitions CASCADE;
    """)
