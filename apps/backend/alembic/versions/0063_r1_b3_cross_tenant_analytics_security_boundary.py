"""R1-B.3 narrow SECURITY DEFINER boundary for cross-tenant analytics.

Revision ID: 0063_r1_b3_cross_tenant_analytics_security_boundary
Revises: 0062_r1_a_database_security_hardening
"""
from alembic import op

revision = "0063_r1_b3_cross_tenant_analytics_security_boundary"
down_revision = "0062_r1_a_database_security_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION public.superadmin_analytics_daily_rollup(p_target_date date)
    RETURNS TABLE(
        total_tenants bigint,
        active_tenants bigint,
        trial_tenants bigint,
        total_human_staff bigint,
        total_ai_agents_active bigint,
        total_transactions bigint,
        total_revenue_idr numeric,
        total_repeat_orders bigint,
        total_llm_cost_usd numeric,
        total_credit_consumed numeric
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
        IF current_user <> 'orchestree_app' THEN
            RAISE EXCEPTION 'forbidden';
        END IF;

        RETURN QUERY
        SELECT
            COUNT(DISTINCT t.id),
            COUNT(DISTINCT t.id) FILTER (WHERE lower(t.status) = 'active'),
            COUNT(DISTINCT t.id) FILTER (WHERE lower(t.status) = 'trial'),
            COUNT(DISTINCT tm.user_id),
            COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active'),
            COUNT(DISTINCT o.id),
            COALESCE(SUM(o.total_amount), 0)::numeric,
            COUNT(DISTINCT o.id) FILTER (WHERE o.is_repeat_order = true),
            COALESCE(SUM(l.cost_usd), 0)::numeric,
            COALESCE(SUM(c.amount), 0)::numeric
        FROM public.tenants t
        LEFT JOIN public.tenant_memberships tm ON tm.tenant_id = t.id
        LEFT JOIN public.ai_agents a ON a.tenant_id = t.id
        LEFT JOIN public.orders o ON o.tenant_id = t.id AND o.created_at::date = p_target_date
        LEFT JOIN public.llm_usage_logs l ON l.tenant_id = t.id AND l.created_at::date = p_target_date
        LEFT JOIN public.tenant_credit_transactions c ON c.tenant_id = t.id AND c.created_at::date = p_target_date;
    END;
    $$;

    REVOKE ALL ON FUNCTION public.superadmin_analytics_daily_rollup(date) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.superadmin_analytics_daily_rollup(date) TO orchestree_app;
    """)

    op.execute("""
    CREATE OR REPLACE FUNCTION public.superadmin_analytics_llm_usage(
        p_start_date date,
        p_end_date date
    )
    RETURNS TABLE(
        provider text,
        model text,
        total_calls bigint,
        total_tokens bigint,
        total_cost_usd numeric
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
        SELECT
            COALESCE(provider, 'unknown')::text,
            COALESCE(model, 'unknown')::text,
            COUNT(*)::bigint,
            COALESCE(SUM(total_tokens), 0)::bigint,
            COALESCE(SUM(cost_usd), 0)::numeric
        FROM public.llm_usage_logs
        WHERE created_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY provider, model
        ORDER BY total_cost_usd DESC;
    $$;

    REVOKE ALL ON FUNCTION public.superadmin_analytics_llm_usage(date, date) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.superadmin_analytics_llm_usage(date, date) TO orchestree_app;
    """)


def downgrade() -> None:
    op.execute("REVOKE ALL ON FUNCTION public.superadmin_analytics_daily_rollup(date) FROM PUBLIC, anon, authenticated, service_role, orchestree_app")
    op.execute("REVOKE ALL ON FUNCTION public.superadmin_analytics_llm_usage(date, date) FROM PUBLIC, anon, authenticated, service_role, orchestree_app")
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_analytics_daily_rollup(date)")
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_analytics_llm_usage(date, date)")
