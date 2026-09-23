"""Autonomous Task Execution from Signals & Workforce Closed-Loop Source Data Verification (PRD v2.2 Bagian 8.13.3-4)

Revision ID: 0033_task_execution_and_source_monitoring
Revises: 0032_report_data_points_and_management_query
Create Date: 2026-09-23 09:00:00.000000

Skema:
- Tabel task_source_verifications: Menghubungkan task hasil sinyal terdeteksi dengan aturan & bukti verifikasi data sumber nyata
- RLS FORCE bertenant terisolasi
- Registrasi feature_capabilities untuk pembuatan tugas otomatis dan verifikasi closed-loop sumber
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0033_task_execution_and_source_monitoring"
down_revision: Union[str, None] = "0032_report_data_points_and_management_query"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_source_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        source_signal_id UUID REFERENCES company_context_signals(id) ON DELETE SET NULL,
        source_event_id UUID REFERENCES company_context_events(id) ON DELETE SET NULL,
        source_system VARCHAR(100) NOT NULL,
        source_table VARCHAR(100) NOT NULL,
        source_record_id VARCHAR(255) NOT NULL,
        verification_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
        verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'IN_PROGRESS', 'VERIFIED_DONE', 'REJECTED_UNVERIFIED')),
        last_checked_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        verification_proof JSONB NOT NULL DEFAULT '{}'::jsonb,
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_task_source_verif_tenant_task
        ON task_source_verifications(tenant_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_task_source_verif_status
        ON task_source_verifications(tenant_id, verification_status);
    CREATE INDEX IF NOT EXISTS idx_task_source_verif_source
        ON task_source_verifications(tenant_id, source_table, source_record_id);

    ALTER TABLE task_source_verifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_source_verifications FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_task_source_verifications ON task_source_verifications;
    CREATE POLICY tenant_isolation_task_source_verifications ON task_source_verifications
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    GRANT ALL ON task_source_verifications TO authenticated, orchestree_app;

    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('enterprise.execution.auto_task', 3, 'Pembuatan tugas otomatis oleh AI dari sinyal terdeteksi'),
        ('workforce.monitoring.source_verify', 3, 'Pemantauan closed-loop task sampai selesai diverifikasi dari data sumber')
    ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN (
        'enterprise.execution.auto_task',
        'workforce.monitoring.source_verify'
    );

    DROP TABLE IF EXISTS task_source_verifications CASCADE;
    """)
