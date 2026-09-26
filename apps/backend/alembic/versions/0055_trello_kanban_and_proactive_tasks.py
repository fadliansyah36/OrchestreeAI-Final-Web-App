"""trello kanban and proactive tasks

Revision ID: 0055_trello_kanban_and_proactive_tasks
Revises: 0054_payment_reconciliation_system
Create Date: 2026-09-26 14:30:00.000000

Trello-Style Kanban Tasks, Checklists, Attachments & Proactive AI Omnichannel Sourcing
(PRD v2.2 Bagian 3.5, 6.2, 6.3, 8.10, 8.13, 10.3, 15, 18.1):
1. Kolom tambahan pada tabel tasks:
   - labels text[] NOT NULL DEFAULT ARRAY[]::text[]
   - due_date timestamptz
   - cover_color text
   - progress_percentage int NOT NULL DEFAULT 0
   - deleted_at timestamptz
   - source_channel text NOT NULL DEFAULT 'dashboard' CHECK (source_channel IN ('dashboard', 'telegram', 'whatsapp', 'proactive_agent', 'orchestration'))
   - source_ref_id text
   - created_by_type text NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'ai_agent', 'system'))
   - created_by_id text
2. Tabel task_checklists: Daftar periksa tugas terstruktur
3. Tabel task_checklist_items: Item daftar periksa dengan penanda verifikasi selesai oleh Human atau AI Agent
4. RLS Policies & Indices pada seluruh tabel baru
5. Pendaftaran feature_capabilities untuk checklist dan proactive task creation
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0055_trello_kanban_and_proactive_tasks'
down_revision: Union[str, None] = '0054_payment_reconciliation_system'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Perluas tabel tasks dengan atribut Trello & Omnichannel
    op.execute("""
    ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS due_date timestamptz,
        ADD COLUMN IF NOT EXISTS cover_color text,
        ADD COLUMN IF NOT EXISTS progress_percentage int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
        ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'dashboard'
            CHECK (source_channel IN ('dashboard', 'telegram', 'whatsapp', 'proactive_agent', 'orchestration', 'telegram_proactive', 'whatsapp_proactive', 'ai_agent_autonomous')),
        ADD COLUMN IF NOT EXISTS source_ref_id text,
        ADD COLUMN IF NOT EXISTS created_by_type text NOT NULL DEFAULT 'user'
            CHECK (created_by_type IN ('user', 'ai_agent', 'system')),
        ADD COLUMN IF NOT EXISTS created_by_id text;

    CREATE INDEX IF NOT EXISTS idx_tasks_source_channel ON tasks(tenant_id, source_channel);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(tenant_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(tenant_id, deleted_at);

    -- Perluas task_events dengan source_channel audit (BAGIAN B)
    ALTER TABLE task_events
        ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'dashboard'
            CHECK (source_channel IN ('dashboard', 'telegram', 'whatsapp', 'proactive_agent', 'orchestration', 'telegram_proactive', 'whatsapp_proactive', 'ai_agent_autonomous'));
    CREATE INDEX IF NOT EXISTS idx_task_events_source_channel ON task_events(tenant_id, source_channel);

    -- Perluas task_comments dengan author_type dan author_agent_id (BAGIAN B)
    ALTER TABLE task_comments
        ADD COLUMN IF NOT EXISTS author_type text NOT NULL DEFAULT 'human'
            CHECK (author_type IN ('human', 'ai_agent', 'system', 'user')),
        ADD COLUMN IF NOT EXISTS author_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL;

    -- Perluas task_attachments dengan uploaded_by_type dan uploaded_by_id (BAGIAN B)
    ALTER TABLE task_attachments
        ADD COLUMN IF NOT EXISTS uploaded_by_type text NOT NULL DEFAULT 'human'
            CHECK (uploaded_by_type IN ('human', 'ai_agent', 'system', 'user')),
        ADD COLUMN IF NOT EXISTS uploaded_by_id text;
    """)

    # 2. Tabel task_checklists
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_checklists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title text NOT NULL,
        display_order int NOT NULL DEFAULT 0,
        position int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_task_checklists_task ON task_checklists(tenant_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_task_checklists_position ON task_checklists(task_id, position ASC);
    CREATE INDEX IF NOT EXISTS idx_task_checklists_display_order ON task_checklists(task_id, display_order ASC);
    """)

    # 3. Tabel task_checklist_items
    op.execute("""
    CREATE TABLE IF NOT EXISTS task_checklist_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        checklist_id uuid NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
        content text NOT NULL DEFAULT '',
        title text NOT NULL DEFAULT '',
        is_done boolean NOT NULL DEFAULT false,
        is_completed boolean NOT NULL DEFAULT false,
        completed_by_membership_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        completed_by_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        completed_by_type text CHECK (completed_by_type IN ('user', 'human', 'ai_agent', 'system')),
        completed_by_id text,
        completed_at timestamptz,
        display_order int NOT NULL DEFAULT 0,
        position int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_task_checklist_items_checklist ON task_checklist_items(tenant_id, checklist_id);
    CREATE INDEX IF NOT EXISTS idx_task_checklist_items_pos ON task_checklist_items(checklist_id, position ASC);
    CREATE INDEX IF NOT EXISTS idx_task_checklist_items_disp ON task_checklist_items(checklist_id, display_order ASC);
    CREATE INDEX IF NOT EXISTS idx_task_checklist_items_agent ON task_checklist_items(completed_by_agent_id);
    """)

    # 4. RLS Security Policies
    op.execute("""
    ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_checklists FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS p_task_checklists_tenant_isolation ON task_checklists;
    CREATE POLICY p_task_checklists_tenant_isolation ON task_checklists
        FOR ALL
        USING (
            current_user IN ('postgres', 'service_role')
            OR (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                AND (
                    current_setting('app.membership_id', true) IS NULL
                    OR current_setting('app.membership_id', true) = ''
                    OR fn_task_visible_to_membership(task_id, current_setting('app.membership_id', true)::uuid) = true
                )
            )
        )
        WITH CHECK (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );

    ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_checklist_items FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS p_task_checklist_items_tenant_isolation ON task_checklist_items;
    CREATE POLICY p_task_checklist_items_tenant_isolation ON task_checklist_items
        FOR ALL
        USING (
            current_user IN ('postgres', 'service_role')
            OR (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                AND (
                    current_setting('app.membership_id', true) IS NULL
                    OR current_setting('app.membership_id', true) = ''
                    OR EXISTS (
                        SELECT 1 FROM task_checklists tc
                        WHERE tc.id = task_checklist_items.checklist_id
                        AND fn_task_visible_to_membership(tc.task_id, current_setting('app.membership_id', true)::uuid) = true
                    )
                )
            )
        )
        WITH CHECK (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );

    GRANT ALL ON task_checklists, task_checklist_items TO authenticated, orchestree_app;
    """)

    # 5. Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES
        ('tasks.checklist.manage', 1, 'Pengelolaan daftar periksa dan progres kartu kanban'),
        ('tasks.attachments.manage', 1, 'Pengunggahan dan pengelolaan lampiran berkas tugas'),
        ('tasks.proactive.create', 1, 'Pembuatan tugas otomatis oleh AI Agent Proaktif lintas kanal')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN ('tasks.checklist.manage', 'tasks.attachments.manage', 'tasks.proactive.create');

    DROP TABLE IF EXISTS task_checklist_items CASCADE;
    DROP TABLE IF EXISTS task_checklists CASCADE;

    ALTER TABLE task_attachments
        DROP COLUMN IF EXISTS uploaded_by_type,
        DROP COLUMN IF EXISTS uploaded_by_id;

    ALTER TABLE task_comments
        DROP COLUMN IF EXISTS author_type,
        DROP COLUMN IF EXISTS author_agent_id;

    ALTER TABLE task_events
        DROP COLUMN IF EXISTS source_channel;

    ALTER TABLE tasks
        DROP COLUMN IF EXISTS labels,
        DROP COLUMN IF EXISTS due_date,
        DROP COLUMN IF EXISTS cover_color,
        DROP COLUMN IF EXISTS progress_percentage,
        DROP COLUMN IF EXISTS deleted_at,
        DROP COLUMN IF EXISTS source_channel,
        DROP COLUMN IF EXISTS source_ref_id,
        DROP COLUMN IF EXISTS created_by_type,
        DROP COLUMN IF EXISTS created_by_id;
    """)
