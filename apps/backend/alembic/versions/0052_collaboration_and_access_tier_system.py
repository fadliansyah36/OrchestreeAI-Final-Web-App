"""collaboration and access tier system

Revision ID: 0052_collaboration_and_access_tier_system
Revises: 0051_prompt_style_taxonomy_and_seeding_batches
Create Date: 2026-09-26 01:00:00.000000

Collaboration & Access Tier System (PRD v2.2 Bagian 3.5, 6.2, 8.10, 10.3, 10.6, 15, 18.1):
1. Kolom access_tier pada tabel roles ('staff', 'department_lead', 'executive')
2. Kolom department_category pada tabel departments
3. Kolom is_cross_department & relevant_department_category pada tabel ai_job_titles
4. Kolom department_id pada tabel boards
5. Kolom assignee_id / assigned_membership_id keselarasan pada tabel tasks
6. Tabel proactive_agent_collaborations (Kolaborasi Staf Human x AI Agent Proaktif)
7. Security Definer Functions:
   - fn_task_visible_to_membership(p_task_id uuid, p_membership_id uuid)
   - fn_board_visible_to_membership(p_board_id uuid, p_membership_id uuid)
8. RLS Policies pada tasks, boards, dan proactive_agent_collaborations
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0052_collaboration_and_access_tier_system'
down_revision: Union[str, None] = '0051_prompt_style_taxonomy_and_seeding_batches'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Access Tier pada Roles
    op.execute("""
    ALTER TABLE roles
        ADD COLUMN IF NOT EXISTS access_tier text NOT NULL DEFAULT 'staff'
        CHECK (access_tier IN ('staff', 'department_lead', 'executive'));

    UPDATE roles SET access_tier = 'executive' WHERE role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN');
    UPDATE roles SET access_tier = 'department_lead' WHERE role_code = 'DEPT_MANAGER';
    UPDATE roles SET access_tier = 'staff' WHERE role_code IN ('STAFF_HUMAN', 'AI_AGENT');
    """)

    # 2. Kategori Fungsional pada Departemen
    op.execute("""
    ALTER TABLE departments
        ADD COLUMN IF NOT EXISTS department_category text NOT NULL DEFAULT 'general'
        CHECK (department_category IN (
            'sales', 'marketing', 'customer_service', 'hr',
            'finance', 'operations', 'procurement', 'project',
            'research', 'general'
        ));
    CREATE INDEX IF NOT EXISTS idx_departments_category ON departments(department_category);
    """)

    # 3. Kolom is_cross_department & relevant_department_category pada ai_job_titles
    op.execute("""
    ALTER TABLE ai_job_titles
        ADD COLUMN IF NOT EXISTS is_cross_department boolean NOT NULL DEFAULT false;

    ALTER TABLE ai_job_titles
        ADD COLUMN IF NOT EXISTS relevant_department_category text;

    -- Update is_cross_department: true HANYA untuk AI Chief of Staff & AI Company Intelligence
    UPDATE ai_job_titles SET is_cross_department = true WHERE title_code IN ('AI_CHIEF_OF_STAFF', 'AI_COMPANY_INTELLIGENCE');
    UPDATE ai_job_titles SET is_cross_department = false WHERE title_code NOT IN ('AI_CHIEF_OF_STAFF', 'AI_COMPANY_INTELLIGENCE');

    -- Update relevant_department_category untuk 15 Jabatan Utama
    UPDATE ai_job_titles SET relevant_department_category = 'general' WHERE title_code = 'AI_CHIEF_OF_STAFF';
    UPDATE ai_job_titles SET relevant_department_category = 'research' WHERE title_code = 'AI_COMPANY_INTELLIGENCE';
    UPDATE ai_job_titles SET relevant_department_category = 'sales' WHERE title_code IN ('AI_SALES_DEAL_CLOSER', 'AI_CRM_LIFECYCLE');
    UPDATE ai_job_titles SET relevant_department_category = 'marketing' WHERE title_code = 'AI_MARKETING_BRANDING';
    UPDATE ai_job_titles SET relevant_department_category = 'customer_service' WHERE title_code = 'AI_CUSTOMER_SUCCESS';
    UPDATE ai_job_titles SET relevant_department_category = 'hr' WHERE title_code = 'AI_HR_PEOPLE_OPS';
    UPDATE ai_job_titles SET relevant_department_category = 'finance' WHERE title_code = 'AI_FINANCE_CASH_FLOW';
    UPDATE ai_job_titles SET relevant_department_category = 'operations' WHERE title_code IN ('AI_OPERATIONS_FLEET', 'AI_TASK_WORKFLOW');
    UPDATE ai_job_titles SET relevant_department_category = 'procurement' WHERE title_code = 'AI_PROCUREMENT_VENDOR';
    UPDATE ai_job_titles SET relevant_department_category = 'project' WHERE title_code = 'AI_PROJECT_MILESTONES';
    UPDATE ai_job_titles SET relevant_department_category = 'research' WHERE title_code IN ('AI_RESEARCH_INTELLIGENCE', 'AI_KNOWLEDGE_DOCUMENT', 'AI_REPORTING_BI_ANALYST');
    """)

    # 4. Kolom department_id pada boards
    op.execute("""
    ALTER TABLE boards
        ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_boards_department_id ON boards(department_id);
    """)

    # 5. Keselarasan kolom assignee pada tasks
    op.execute("""
    ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL;
    ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS assigned_membership_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL;

    UPDATE tasks SET assignee_id = assigned_membership_id WHERE assignee_id IS NULL AND assigned_membership_id IS NOT NULL;
    UPDATE tasks SET assigned_membership_id = assignee_id WHERE assigned_membership_id IS NULL AND assignee_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_membership_id ON tasks(assigned_membership_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent_id ON tasks(assigned_agent_id);
    """)

    # 6. Tabel proactive_agent_collaborations
    op.execute("""
    CREATE TABLE IF NOT EXISTS proactive_agent_collaborations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tenant_membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
        ai_agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
        is_primary boolean NOT NULL DEFAULT false,
        added_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_membership_id, ai_agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_proactive_collab_tenant ON proactive_agent_collaborations(tenant_id, tenant_membership_id);
    CREATE INDEX IF NOT EXISTS idx_proactive_collab_agent ON proactive_agent_collaborations(ai_agent_id);
    """)

    # 7. Security Definer Functions
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_board_visible_to_membership(
        p_board_id uuid, p_membership_id uuid
    ) RETURNS boolean AS $$
    DECLARE
        v_tier text;
        v_dept_id uuid;
        v_board_dept_id uuid;
    BEGIN
        IF p_membership_id IS NULL THEN
            IF current_setting('app.actor_type', true) IN ('super_admin', 'system')
               OR current_user IN ('postgres', 'service_role') THEN
                RETURN true;
            END IF;
            RETURN false;
        END IF;

        SELECT r.access_tier INTO v_tier FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            WHERE ur.tenant_membership_id = p_membership_id LIMIT 1;

        IF v_tier IS NULL THEN
            v_tier := 'staff';
        END IF;

        IF v_tier = 'executive' THEN
            RETURN true;
        END IF;

        SELECT department_id INTO v_dept_id FROM tenant_memberships
            WHERE id = p_membership_id;

        SELECT department_id INTO v_board_dept_id FROM boards
            WHERE id = p_board_id;

        IF v_board_dept_id IS NULL THEN
            RETURN true;
        END IF;

        RETURN v_board_dept_id = v_dept_id;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION fn_task_visible_to_membership(
        p_task_id uuid, p_membership_id uuid
    ) RETURNS boolean AS $$
    DECLARE
        v_tier text;
        v_dept_id uuid;
        v_task record;
    BEGIN
        IF p_membership_id IS NULL THEN
            IF current_setting('app.actor_type', true) IN ('super_admin', 'system')
               OR current_user IN ('postgres', 'service_role') THEN
                RETURN true;
            END IF;
            RETURN false;
        END IF;

        SELECT r.access_tier INTO v_tier FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            WHERE ur.tenant_membership_id = p_membership_id LIMIT 1;

        IF v_tier IS NULL THEN
            v_tier := 'staff';
        END IF;

        SELECT department_id INTO v_dept_id FROM tenant_memberships
            WHERE id = p_membership_id;

        SELECT t.*, b.department_id AS board_department_id
            INTO v_task FROM tasks t JOIN boards b ON b.id = t.board_id
            WHERE t.id = p_task_id;

        IF v_task IS NULL THEN
            RETURN false;
        END IF;

        IF v_tier = 'executive' THEN
            RETURN true;
        END IF;

        IF v_tier = 'department_lead' THEN
            RETURN (v_task.board_department_id IS NULL OR v_task.board_department_id = v_dept_id);
        END IF;

        -- tier = 'staff'
        RETURN
            COALESCE(v_task.assigned_membership_id, v_task.assignee_id) = p_membership_id
            OR (
                v_task.assigned_agent_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM proactive_agent_collaborations pac
                    WHERE pac.tenant_membership_id = p_membership_id
                      AND pac.ai_agent_id = v_task.assigned_agent_id
                )
            )
            OR (
                v_task.board_department_id = v_dept_id
                AND COALESCE(v_task.assigned_membership_id, v_task.assignee_id) IS NOT NULL
            );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)

    # 8. Row Level Security Policies
    op.execute("""
    ALTER TABLE proactive_agent_collaborations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE proactive_agent_collaborations FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS p_proactive_collab_tenant ON proactive_agent_collaborations;
    CREATE POLICY p_proactive_collab_tenant ON proactive_agent_collaborations
        FOR ALL
        USING (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = current_setting('app.tenant_id', true)::uuid
        )
        WITH CHECK (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = current_setting('app.tenant_id', true)::uuid
        );

    ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
    ALTER TABLE boards FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation ON boards;
    DROP POLICY IF EXISTS p_boards_tenant_and_tier_isolation ON boards;
    CREATE POLICY p_boards_tenant_and_tier_isolation ON boards
        FOR ALL
        USING (
            current_user IN ('postgres', 'service_role')
            OR (
                tenant_id = current_setting('app.tenant_id', true)::uuid
                AND (
                    current_setting('app.membership_id', true) IS NULL
                    OR current_setting('app.membership_id', true) = ''
                    OR fn_board_visible_to_membership(id, current_setting('app.membership_id', true)::uuid)
                )
            )
        )
        WITH CHECK (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = current_setting('app.tenant_id', true)::uuid
        );

    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation ON tasks;
    DROP POLICY IF EXISTS p_tasks_tenant_and_tier_isolation ON tasks;
    CREATE POLICY p_tasks_tenant_and_tier_isolation ON tasks
        FOR ALL
        USING (
            current_user IN ('postgres', 'service_role')
            OR (
                tenant_id = current_setting('app.tenant_id', true)::uuid
                AND (
                    current_setting('app.membership_id', true) IS NULL
                    OR current_setting('app.membership_id', true) = ''
                    OR fn_task_visible_to_membership(id, current_setting('app.membership_id', true)::uuid)
                )
            )
        )
        WITH CHECK (
            current_user IN ('postgres', 'service_role')
            OR tenant_id = current_setting('app.tenant_id', true)::uuid
        );

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON proactive_agent_collaborations TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON boards TO orchestree_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO orchestree_app;
        END IF;
    END $$;

    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description) VALUES
        (gen_random_uuid(), 'proactive.messages.manage', 1, 'Mengelola pesan dan saluran proaktif'),
        (gen_random_uuid(), 'proactive.collaboration.manage', 1, 'Mendaftarkan kolaborasi staf dengan AI agent'),
        (gen_random_uuid(), 'enterprise.roles.manage', 2, 'Mengelola tingkat akses dan peran enterprise')
    ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DROP POLICY IF EXISTS p_tasks_tenant_and_tier_isolation ON tasks;
    DROP POLICY IF EXISTS p_boards_tenant_and_tier_isolation ON boards;
    DROP POLICY IF EXISTS p_proactive_collab_tenant ON proactive_agent_collaborations;

    DROP FUNCTION IF EXISTS fn_task_visible_to_membership(uuid, uuid);
    DROP FUNCTION IF EXISTS fn_board_visible_to_membership(uuid, uuid);

    DROP TABLE IF EXISTS proactive_agent_collaborations CASCADE;

    ALTER TABLE boards DROP COLUMN IF EXISTS department_id;
    ALTER TABLE ai_job_titles DROP COLUMN IF EXISTS is_cross_department;
    ALTER TABLE ai_job_titles DROP COLUMN IF EXISTS relevant_department_category;
    ALTER TABLE departments DROP COLUMN IF EXISTS department_category;
    ALTER TABLE roles DROP COLUMN IF EXISTS access_tier;
    """)
