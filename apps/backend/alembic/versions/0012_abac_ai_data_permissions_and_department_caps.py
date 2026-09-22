"""Implementasi Kebijakan Izin Data Agen AI (ABAC), Permintaan Akses Data, dan Batas Anggaran Kredit Departemen

Revision ID: 0012_abac_ai_data_permissions
Revises: 0011_proactive_channels_chat
Create Date: 2026-09-22 15:30:00.000000

Skema ABAC & Department Budget Cap (PRD v2.2 Bagian 3.3, 3.5, 14.2 & 20.1):
- Tabel ai_data_permission_policies: Kebijakan izin akses data bertenant untuk Agen AI & Persona.
- Tabel ai_data_access_requests: Pengajuan izin akses data baru saat agen menghadapi DENIED_NO_POLICY.
- Kolom credit_cap dan credit_spent pada departments untuk membatasi konsumsi kredit per divisi.
- Penegakan RLS FORCE terisolasi bertenant pada seluruh tabel ABAC.
- Registrasi kapabilitas fitur ABAC dan pengelolaan anggaran departemen.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0012_abac_ai_data_permissions"
down_revision: Union[str, None] = "0011_proactive_channels_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel ai_data_permission_policies (ABAC Policy Engine)
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_data_permission_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
        agent_persona_type text,
        resource_type text NOT NULL,
        resource_identifier text NOT NULL,
        action text NOT NULL,
        data_classification text NOT NULL DEFAULT 'internal' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
        conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
        effect text NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
        priority int NOT NULL DEFAULT 100,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_data_policies_tenant ON ai_data_permission_policies(tenant_id, resource_type, resource_identifier);
    CREATE INDEX IF NOT EXISTS idx_ai_data_policies_agent ON ai_data_permission_policies(tenant_id, agent_id);
    """)

    # 2. Tabel ai_data_access_requests
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_data_access_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        requester_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        resource_type text NOT NULL,
        resource_identifier text NOT NULL,
        action text NOT NULL,
        data_classification text NOT NULL DEFAULT 'internal',
        reason text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
        decision_reason text,
        reviewed_by uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_data_requests_tenant ON ai_data_access_requests(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_ai_data_requests_agent ON ai_data_access_requests(tenant_id, agent_id);
    """)

    # 3. Kolom batas anggaran kredit pada departments
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'departments' AND column_name = 'credit_cap'
        ) THEN
            ALTER TABLE departments ADD COLUMN credit_cap numeric(18, 4) DEFAULT NULL;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'departments' AND column_name = 'credit_spent'
        ) THEN
            ALTER TABLE departments ADD COLUMN credit_spent numeric(18, 4) NOT NULL DEFAULT 0.0000;
        END IF;
    END $$;
    """)

    # 4. Row Level Security (RLS) FORCE terisolasi tenant
    op.execute("""
    ALTER TABLE ai_data_permission_policies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_data_permission_policies FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies;
    CREATE POLICY tenant_isolation_ai_data_permission_policies ON ai_data_permission_policies
        AS RESTRICTIVE
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE ai_data_access_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_data_access_requests FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_ai_data_access_requests ON ai_data_access_requests;
    CREATE POLICY tenant_isolation_ai_data_access_requests ON ai_data_access_requests
        AS RESTRICTIVE
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    """)

    # 5. Registrasi Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'abac.policies.manage', 1, 'Membuat, mengubah, dan menghapus kebijakan izin data ABAC untuk Agen AI'),
        (gen_random_uuid(), 'abac.policies.view', 1, 'Melihat daftar kebijakan izin data agen AI yang aktif'),
        (gen_random_uuid(), 'abac.requests.create', 0, 'Mengajukan permohonan akses data baru untuk agen'),
        (gen_random_uuid(), 'abac.requests.review', 1, 'Menyetujui atau menolak permohonan akses data agen'),
        (gen_random_uuid(), 'department.budget.manage', 1, 'Mengatur limit plafon kredit anggaran per departemen')
    ON CONFLICT (capability_key) DO UPDATE
    SET description = EXCLUDED.description,
        min_tier_level = EXCLUDED.min_tier_level;
    """)


def downgrade() -> None:
    # 1. Hapus kapabilitas
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN (
        'abac.policies.manage',
        'abac.policies.view',
        'abac.requests.create',
        'abac.requests.review',
        'department.budget.manage'
    );
    """)

    # 2. Hapus tabel & policies
    op.execute("""
    DROP TABLE IF EXISTS ai_data_access_requests CASCADE;
    DROP TABLE IF EXISTS ai_data_permission_policies CASCADE;
    """)

    # 3. Hapus kolom batas kredit departemen
    op.execute("""
    ALTER TABLE departments DROP COLUMN IF EXISTS credit_cap;
    ALTER TABLE departments DROP COLUMN IF EXISTS credit_spent;
    """)
