-- ============================================================================
-- Migration: 20260926000004_trello_kanban_and_proactive_tasks.sql
-- Trello-Style Kanban Tasks, Checklists, Attachments & Proactive AI Omnichannel
-- (PRD v2.2 Bagian 3.5, 6.2, 6.3, 8.10, 8.13, 10.3, 15, 18.1)
-- ============================================================================

-- 1. Perluas tabel tasks dengan atribut Trello & Omnichannel
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

-- 2. Tabel task_checklists
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

-- 3. Tabel task_checklist_items
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

-- 4. RLS Security Policies
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

-- 5. Feature Capabilities
INSERT INTO feature_capabilities (capability_code, domain, description, is_active, min_tier)
VALUES
    ('tasks.checklist.manage', 'tasks', 'Pengelolaan daftar periksa dan progres kartu kanban', true, 'STAFF'),
    ('tasks.attachments.manage', 'tasks', 'Pengunggahan dan pengelolaan lampiran berkas tugas', true, 'STAFF'),
    ('tasks.proactive.create', 'tasks', 'Pembuatan tugas otomatis oleh AI Agent Proaktif lintas kanal', true, 'STAFF')
ON CONFLICT (capability_code) DO NOTHING;
