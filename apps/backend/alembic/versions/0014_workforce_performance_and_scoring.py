"""Implementasi Performance Metrics Daily, Performance Scores Monthly, Performance Alerts, dan RLS FORCE Bertenant

Revision ID: 0014_workforce_performance_and_scoring
Revises: 0013_memory_pgvector_hnsw_hybrid
Create Date: 2026-09-22 18:00:00.000000

Skema Workforce Performance & Scoring (PRD v2.2 Bagian 6.3 & 22.3):
- Tabel performance_metrics_daily: Metrik harian per worker (human / ai_agent) bertenant
- Tabel performance_scores_monthly: Skor komposit bulanan 6 dimensi berbobot dengan peringkat leaderboard
- Tabel performance_alerts: Notifikasi anomali dan alert KPI
- FORCE ROW LEVEL SECURITY bertenant pada seluruh tabel
- Hak akses DML penuh kepada role orchestree_app
- Registrasi feature capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0014_workforce_performance_and_scoring"
down_revision: Union[str, None] = "0013_memory_pgvector_hnsw_hybrid"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel performance_metrics_daily
    op.execute("""
    CREATE TABLE IF NOT EXISTS performance_metrics_daily (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        metric_date date NOT NULL,
        worker_type text NOT NULL CHECK (worker_type IN ('human', 'agent')),
        membership_id uuid REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
        tasks_assigned int NOT NULL DEFAULT 0,
        tasks_completed int NOT NULL DEFAULT 0,
        tasks_overdue int NOT NULL DEFAULT 0,
        tasks_reworked int NOT NULL DEFAULT 0,
        avg_completion_time_seconds numeric NOT NULL DEFAULT 0,
        quality_score numeric NOT NULL DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
        collaboration_score numeric NOT NULL DEFAULT 0 CHECK (collaboration_score >= 0 AND collaboration_score <= 100),
        discipline_score numeric NOT NULL DEFAULT 0 CHECK (discipline_score >= 0 AND discipline_score <= 100),
        attendance_or_uptime_score numeric NOT NULL DEFAULT 0 CHECK (attendance_or_uptime_score >= 0 AND attendance_or_uptime_score <= 100),
        metrics_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_perf_daily_target CHECK (
            (worker_type = 'human' AND membership_id IS NOT NULL AND agent_id IS NULL) OR
            (worker_type = 'agent' AND agent_id IS NOT NULL AND membership_id IS NULL)
        )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_daily_human ON performance_metrics_daily(tenant_id, metric_date, membership_id) WHERE worker_type = 'human';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_daily_agent ON performance_metrics_daily(tenant_id, metric_date, agent_id) WHERE worker_type = 'agent';
    CREATE INDEX IF NOT EXISTS idx_perf_daily_tenant_date ON performance_metrics_daily(tenant_id, metric_date DESC);
    """)

    # 2. Tabel performance_scores_monthly
    op.execute("""
    CREATE TABLE IF NOT EXISTS performance_scores_monthly (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period text NOT NULL,
        worker_type text NOT NULL CHECK (worker_type IN ('human', 'agent')),
        membership_id uuid REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
        total_assigned int NOT NULL DEFAULT 0,
        total_completed int NOT NULL DEFAULT 0,
        total_overdue int NOT NULL DEFAULT 0,
        total_reworked int NOT NULL DEFAULT 0,
        completion_rate numeric NOT NULL DEFAULT 0,
        quality_score numeric NOT NULL DEFAULT 0,
        deadline_discipline numeric NOT NULL DEFAULT 0,
        productivity_volume numeric NOT NULL DEFAULT 0,
        collaboration_score numeric NOT NULL DEFAULT 0,
        attendance_uptime numeric NOT NULL DEFAULT 0,
        final_score numeric NOT NULL DEFAULT 0,
        rank_position int,
        percentile numeric,
        kpi_status text NOT NULL DEFAULT 'optimal' CHECK (kpi_status IN ('optimal', 'needs_attention', 'underperforming', 'critical')),
        summary text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        calculated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_perf_monthly_target CHECK (
            (worker_type = 'human' AND membership_id IS NOT NULL AND agent_id IS NULL) OR
            (worker_type = 'agent' AND agent_id IS NOT NULL AND membership_id IS NULL)
        )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_monthly_human ON performance_scores_monthly(tenant_id, period, membership_id) WHERE worker_type = 'human';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_monthly_agent ON performance_scores_monthly(tenant_id, period, agent_id) WHERE worker_type = 'agent';
    CREATE INDEX IF NOT EXISTS idx_perf_monthly_tenant_period ON performance_scores_monthly(tenant_id, period, final_score DESC);
    """)

    # 3. Tabel performance_alerts
    op.execute("""
    CREATE TABLE IF NOT EXISTS performance_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        worker_type text NOT NULL CHECK (worker_type IN ('human', 'agent')),
        membership_id uuid REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
        alert_type text NOT NULL,
        severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
        title text NOT NULL,
        message text NOT NULL,
        current_score numeric,
        threshold_score numeric,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        CONSTRAINT chk_perf_alert_target CHECK (
            (worker_type = 'human' AND membership_id IS NOT NULL AND agent_id IS NULL) OR
            (worker_type = 'agent' AND agent_id IS NOT NULL AND membership_id IS NULL)
        )
    );

    CREATE INDEX IF NOT EXISTS idx_perf_alerts_tenant_status ON performance_alerts(tenant_id, status, created_at DESC);
    """)

    # 4. ROW LEVEL SECURITY & GRANT
    op.execute("""
    ALTER TABLE performance_metrics_daily ENABLE ROW LEVEL SECURITY;
    ALTER TABLE performance_metrics_daily FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_policy ON performance_metrics_daily;
    CREATE POLICY tenant_isolation_policy ON performance_metrics_daily
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE performance_scores_monthly ENABLE ROW LEVEL SECURITY;
    ALTER TABLE performance_scores_monthly FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_policy ON performance_scores_monthly;
    CREATE POLICY tenant_isolation_policy ON performance_scores_monthly
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE performance_alerts FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_policy ON performance_alerts;
    CREATE POLICY tenant_isolation_policy ON performance_alerts
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON performance_metrics_daily, performance_scores_monthly, performance_alerts TO orchestree_app;
        END IF;
    END $$;
    """)

    # 5. Registrasi feature capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('performance.metrics.read', 0, 'Melihat data performa harian tenaga kerja manusia dan AI'),
        ('performance.scores.read', 0, 'Melihat leaderboard, skor radar 6 dimensi, dan evaluasi bulanan'),
        ('performance.scoring.execute', 1, 'Menjalankan agregasi skor kinerja bulanan dan penetapan peringkat'),
        ('performance.alerts.manage', 1, 'Melihat, mengonfirmasi, dan menyelesaikan peringatan deviasi KPI')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities WHERE capability_key IN (
        'performance.metrics.read',
        'performance.scores.read',
        'performance.scoring.execute',
        'performance.alerts.manage'
    );
    DROP TABLE IF EXISTS performance_alerts CASCADE;
    DROP TABLE IF EXISTS performance_scores_monthly CASCADE;
    DROP TABLE IF EXISTS performance_metrics_daily CASCADE;
    """)
