"""R1-A database exposure and tenant-derived RLS hardening.

Revision ID: 0062_r1_a_database_security_hardening
Revises: 0061_auth_token_revocation
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0062_r1_a_database_security_hardening"
down_revision: Union[str, None] = "0061_auth_token_revocation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REFERENCE_TABLES = (
    "roles",
    "role_permissions",
    "subscription_plans",
    "feature_capabilities",
    "llm_providers",
    "llm_models",
    "mcp_tools",
    "tool_health_checks",
    "ai_structural_roles",
    "job_levels",
    "ai_job_titles",
    "job_subtitles",
    "job_title_mapping_rules",
)


def upgrade() -> None:
    # Global platform/reference catalogs are backend-only; they are not
    # tenant rows and must not be exposed through the Supabase Data API.
    for table_name in REFERENCE_TABLES:
        op.execute(
            f"REVOKE ALL ON TABLE public.{table_name} FROM anon, authenticated, PUBLIC"
        )

    # Migration metadata is not application runtime data.
    op.execute(
        "REVOKE ALL ON TABLE public.alembic_version "
        "FROM orchestree_app, anon, authenticated, service_role, PUBLIC"
    )

    # workflow_nodes has no tenant_id of its own; tenant scope is inherited
    # through its parent workflow_definition.
    op.execute("ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.workflow_nodes FORCE ROW LEVEL SECURITY")
    op.execute(
        "DROP POLICY IF EXISTS workflow_nodes_tenant_isolation "
        "ON public.workflow_nodes"
    )
    op.execute(
        """
        CREATE POLICY workflow_nodes_tenant_isolation
        ON public.workflow_nodes
        FOR ALL
        TO orchestree_app
        USING (
            EXISTS (
                SELECT 1
                FROM public.workflow_definitions wd
                WHERE wd.id = workflow_nodes.workflow_definition_id
                  AND wd.tenant_id =
                      NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1
                FROM public.workflow_definitions wd
                WHERE wd.id = workflow_nodes.workflow_definition_id
                  AND wd.tenant_id =
                      NULLIF(current_setting('app.tenant_id', true), '')::uuid
            )
        )
        """
    )

    # Narrow SECURITY DEFINER surfaces and make lookup resolution explicit.
    op.execute(
        "REVOKE ALL ON FUNCTION public.fn_board_visible_to_membership(uuid, uuid) "
        "FROM PUBLIC, anon, authenticated"
    )
    op.execute(
        "REVOKE ALL ON FUNCTION public.fn_task_visible_to_membership(uuid, uuid) "
        "FROM PUBLIC, anon, authenticated"
    )
    op.execute(
        "REVOKE ALL ON FUNCTION public.rls_auto_enable() "
        "FROM PUBLIC, anon, authenticated"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.fn_board_visible_to_membership(uuid, uuid) "
        "TO orchestree_app"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.fn_task_visible_to_membership(uuid, uuid) "
        "TO orchestree_app"
    )
    op.execute(
        "ALTER FUNCTION public.fn_board_visible_to_membership(uuid, uuid) "
        "SET search_path = pg_catalog, public"
    )
    op.execute(
        "ALTER FUNCTION public.fn_task_visible_to_membership(uuid, uuid) "
        "SET search_path = pg_catalog, public"
    )
    op.execute(
        "ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog"
    )
    op.execute(
        "ALTER FUNCTION public.validate_blueprint_recommended_tools() "
        "SET search_path = pg_catalog, public"
    )


def downgrade() -> None:
    # Security-preserving downgrade: never return public Data API grants and
    # never disable RLS on a tenant-derived table. Removing the policy while
    # keeping FORCE RLS leaves the table fail-closed until a reviewed policy
    # is restored.
    op.execute(
        "DROP POLICY IF EXISTS workflow_nodes_tenant_isolation "
        "ON public.workflow_nodes"
    )
    op.execute("ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.workflow_nodes FORCE ROW LEVEL SECURITY")

    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.fn_board_visible_to_membership(uuid, uuid) "
        "FROM orchestree_app"
    )
    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.fn_task_visible_to_membership(uuid, uuid) "
        "FROM orchestree_app"
    )
