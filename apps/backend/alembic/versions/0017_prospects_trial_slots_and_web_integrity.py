"""Implementasi Prospects, Trial Slots Atomic Allocation, dan Web Integrity Turnstile

Revision ID: 0017_prospects_trial_slots_and_web_integrity
Revises: 0016_third_party_integrations_and_sync
Create Date: 2026-09-22 23:30:00.000000

Skema Prospek, Slot Uji Coba, dan Web Integrity (PRD v2.2 Bagian 13.5 & 13.6):
- Tabel platform_settings: Kapasitas slot (awal 36) & durasi trial (7 hari) dinamis dari database
- Tabel prospects: Registrasi prospek publik dengan status alokasi, jadwal meeting, turnstile verification
- Tabel trial_slots: 36 slot awal untuk alokasi atomik konkurensi tinggi (anti-double booking)
- Tabel trial_activations: Aktivasi tenant uji coba dengan kuota kredit awal (1,000 credit)
- Tabel web_integrity_logs: Audit log Cloudflare Turnstile token validation
- FORCE ROW LEVEL SECURITY dan kebijakan bertenant / service role
- Hak akses DML penuh kepada role orchestree_app
- Registrasi feature capability PROSPECT_TRIAL_ALLOCATION_AND_INTEGRITY
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0017_prospects_trial_slots_and_web_integrity"
down_revision: Union[str, None] = "0016_third_party_integrations_and_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. platform_settings
    op.execute("""
    CREATE TABLE IF NOT EXISTS platform_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        description text,
        updated_by uuid,
        updated_at timestamptz DEFAULT now()
    );

    INSERT INTO platform_settings (key, value, description)
    VALUES 
        ('trial_slot_capacity', '{"capacity": 36}'::jsonb, 'Kapasitas maksimum slot uji coba aktif serentak'),
        ('trial_duration_days', '{"days": 7}'::jsonb, 'Durasi masa uji coba aktif per tenant dalam hari'),
        ('trial_initial_credits', '{"credits": 1000}'::jsonb, 'Jumlah kredit kerja awal yang dialokasikan untuk uji coba'),
        ('web_integrity_turnstile', '{"enforced": true, "tolerance_ms": 300000}'::jsonb, 'Kebijakan penegakan Cloudflare Turnstile pada endpoint publik')
    ON CONFLICT (key) DO NOTHING;
    """)

    # 2. prospects
    op.execute("""
    CREATE TABLE IF NOT EXISTS prospects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name text NOT NULL,
        work_email text NOT NULL,
        phone_number text,
        company_name text NOT NULL,
        company_scale text,
        interest_type text NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_status text NOT NULL DEFAULT 'REGISTERED';
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS meeting_status text NOT NULL DEFAULT 'NOT_SCHEDULED';
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_date timestamptz;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_link text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scheduled_meeting_notes text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_credits_allocated int NOT NULL DEFAULT 0;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trial_notes text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_slot_number int;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS web_integrity_verified boolean NOT NULL DEFAULT false;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS turnstile_token text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ip_address text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS user_agent text;
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_prospects_trial_status ON prospects(trial_status);
    CREATE INDEX IF NOT EXISTS idx_prospects_work_email ON prospects(work_email);
    CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON prospects(created_at DESC);
    """)

    # 3. trial_slots
    op.execute("""
    CREATE TABLE IF NOT EXISTS trial_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_number int UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'ALLOCATED', 'EXPIRED')),
        prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
        tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
        reserved_at timestamptz,
        allocated_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_trial_slots_status ON trial_slots(status);
    CREATE INDEX IF NOT EXISTS idx_trial_slots_slot_number ON trial_slots(slot_number);
    CREATE INDEX IF NOT EXISTS idx_trial_slots_prospect_id ON trial_slots(prospect_id);

    INSERT INTO trial_slots (slot_number, status)
    SELECT s, 'AVAILABLE'
    FROM generate_series(1, 36) AS s
    ON CONFLICT (slot_number) DO NOTHING;
    """)

    # 4. trial_activations
    op.execute("""
    CREATE TABLE IF NOT EXISTS trial_activations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id uuid NOT NULL REFERENCES trial_slots(id) ON DELETE RESTRICT,
        prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
        tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
        initial_credits int NOT NULL DEFAULT 1000,
        credits_remaining int NOT NULL DEFAULT 1000,
        started_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CONVERTED', 'SUSPENDED')),
        conversion_subscription_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
        activated_by uuid,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_trial_activations_status ON trial_activations(status);
    CREATE INDEX IF NOT EXISTS idx_trial_activations_tenant_id ON trial_activations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_trial_activations_prospect_id ON trial_activations(prospect_id);
    """)

    # 5. web_integrity_logs
    op.execute("""
    CREATE TABLE IF NOT EXISTS web_integrity_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint text NOT NULL,
        ip_address text,
        turnstile_token text,
        status text NOT NULL CHECK (status IN ('VERIFIED', 'REJECTED', 'BYPASSED', 'RATE_LIMITED')),
        error_code text,
        cf_timestamp timestamptz,
        hostname text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_web_integrity_endpoint ON web_integrity_logs(endpoint, status);
    CREATE INDEX IF NOT EXISTS idx_web_integrity_created_at ON web_integrity_logs(created_at DESC);
    """)

    # 6. RLS & Permissions
    op.execute("""
    ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE prospects FORCE ROW LEVEL SECURITY;
    ALTER TABLE trial_slots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE trial_slots FORCE ROW LEVEL SECURITY;
    ALTER TABLE trial_activations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE trial_activations FORCE ROW LEVEL SECURITY;
    ALTER TABLE web_integrity_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE web_integrity_logs FORCE ROW LEVEL SECURITY;
    ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE platform_settings FORCE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospects' AND policyname = 'prospects_service_role_all'
      ) THEN
        CREATE POLICY prospects_service_role_all ON prospects FOR ALL TO public
          USING (current_user IN ('postgres', 'service_role', 'orchestree_app') OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trial_slots' AND policyname = 'trial_slots_service_role_all'
      ) THEN
        CREATE POLICY trial_slots_service_role_all ON trial_slots FOR ALL TO public
          USING (current_user IN ('postgres', 'service_role', 'orchestree_app') OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trial_activations' AND policyname = 'trial_activations_service_role_all'
      ) THEN
        CREATE POLICY trial_activations_service_role_all ON trial_activations FOR ALL TO public
          USING (current_user IN ('postgres', 'service_role', 'orchestree_app') OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'web_integrity_logs' AND policyname = 'web_integrity_logs_service_role_all'
      ) THEN
        CREATE POLICY web_integrity_logs_service_role_all ON web_integrity_logs FOR ALL TO public
          USING (current_user IN ('postgres', 'service_role', 'orchestree_app') OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'platform_settings' AND policyname = 'platform_settings_service_role_all'
      ) THEN
        CREATE POLICY platform_settings_service_role_all ON platform_settings FOR ALL TO public
          USING (current_user IN ('postgres', 'service_role', 'orchestree_app') OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'SUPER_ADMIN');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospects' AND policyname = 'prospects_public_insert'
      ) THEN
        CREATE POLICY prospects_public_insert ON prospects FOR INSERT TO anon, authenticated WITH CHECK (true);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trial_slots' AND policyname = 'trial_slots_public_read'
      ) THEN
        CREATE POLICY trial_slots_public_read ON trial_slots FOR SELECT TO anon, authenticated USING (true);
      END IF;
    END $$;

    GRANT ALL ON TABLE prospects TO orchestree_app;
    GRANT ALL ON TABLE trial_slots TO orchestree_app;
    GRANT ALL ON TABLE trial_activations TO orchestree_app;
    GRANT ALL ON TABLE web_integrity_logs TO orchestree_app;
    GRANT ALL ON TABLE platform_settings TO orchestree_app;
    """)

    # 7. feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES 
      (gen_random_uuid(), 'PROSPECT_TRIAL_ALLOCATION_AND_INTEGRITY', 0, 'Manajemen Prospek, Alokasi Slot Trial Atomik & Web Integrity Turnstile')
    ON CONFLICT (capability_key) DO UPDATE SET 
      description = EXCLUDED.description;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key = 'PROSPECT_TRIAL_ALLOCATION_AND_INTEGRITY';
    DROP TABLE IF EXISTS web_integrity_logs CASCADE;
    DROP TABLE IF EXISTS trial_activations CASCADE;
    DROP TABLE IF EXISTS trial_slots CASCADE;
    """)
