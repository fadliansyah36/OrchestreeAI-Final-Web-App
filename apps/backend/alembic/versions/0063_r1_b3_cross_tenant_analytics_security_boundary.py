"""R1-B.3 narrow SECURITY DEFINER boundary for cross-tenant analytics.

Revision ID: 0063_r1_b3_cross_tenant_analytics_security_boundary
Revises: 0062_r1_a_database_security_hardening
"""
from alembic import op

revision = "0063_r1_b3_cross_tenant_analytics_security_boundary"
down_revision = "0062_r1_a_database_security_hardening"
branch_labels = None
depends_on = None

SQL = r"""
CREATE OR REPLACE FUNCTION public.superadmin_compute_daily_rollup(p_target_date date)
RETURNS TABLE(
    rollup_date date,
    total_tenants bigint,
    active_tenants bigint,
    trial_tenants bigint,
    total_human_staff bigint,
    total_ai_agents_active bigint,
    total_transactions bigint,
    total_revenue_idr numeric,
    total_repeat_orders bigint,
    total_llm_cost_usd numeric,
    total_credit_consumed numeric,
    tenant_rollups_computed bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tenant uuid;
    v_count bigint := 0;
BEGIN
    IF current_user <> 'orchestree_app' THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    INSERT INTO public.platform_analytics_daily_rollup (
        rollup_date,total_tenants,active_tenants,trial_tenants,total_human_staff,
        total_ai_agents_active,total_transactions,total_revenue_idr,total_repeat_orders,
        total_llm_cost_usd,total_credit_consumed,computed_at
    )
    SELECT
        p_target_date,
        COUNT(*)::bigint,
        COUNT(*) FILTER (WHERE lower(t.status) = 'active')::bigint,
        COUNT(*) FILTER (WHERE lower(t.status) = 'trial')::bigint,
        (SELECT COUNT(DISTINCT tm.auth_user_id)::bigint FROM public.tenant_memberships tm
         WHERE (tm.status IS NULL OR lower(tm.status) = 'active') AND tm.created_at::date <= p_target_date),
        (SELECT COUNT(*)::bigint FROM public.ai_agents a
         WHERE lower(a.status) = 'active' AND a.created_at::date <= p_target_date),
        COALESCE((
            SELECT COUNT(*)::bigint FROM public.orders o
            WHERE upper(o.payment_status) = 'PAID' AND o.created_at::date = p_target_date
        ),0) + COALESCE((
            SELECT COUNT(*)::bigint FROM public.invoices i
            WHERE lower(i.status) = 'paid' AND COALESCE(i.paid_at,i.created_at)::date = p_target_date
        ),0),
        COALESCE((
            SELECT SUM(o.total_amount)::numeric FROM public.orders o
            WHERE upper(o.payment_status) = 'PAID' AND o.created_at::date = p_target_date
        ),0) + COALESCE((
            SELECT SUM(i.amount)::numeric FROM public.invoices i
            WHERE lower(i.status) = 'paid' AND COALESCE(i.paid_at,i.created_at)::date = p_target_date
        ),0),
        COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.orders o
            WHERE upper(o.payment_status) = 'PAID'
              AND o.created_at::date = p_target_date
              AND o.customer_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.orders prev
                  WHERE prev.tenant_id = o.tenant_id
                    AND prev.customer_id = o.customer_id
                    AND upper(prev.payment_status) = 'PAID'
                    AND prev.created_at < o.created_at
              )
        ),0),
        COALESCE((
            SELECT SUM(l.total_tokens * (
                COALESCE(m.input_cost_per_million,0) * l.prompt_tokens
                + COALESCE(m.output_cost_per_million,0) * l.completion_tokens
            ) / 1000000.0)::numeric
            FROM public.llm_usage_logs l
            LEFT JOIN public.llm_models m ON m.id::text = l.model_id::text
            WHERE l.created_at::date = p_target_date
        ),0),
        COALESCE((
            SELECT SUM(abs(c.amount))::numeric
            FROM public.tenant_credit_transactions c
            WHERE c.transaction_type = 'consumed' AND c.created_at::date = p_target_date
        ),0),
        now()
    FROM public.tenants t
    WHERE t.created_at::date <= p_target_date
    ON CONFLICT (rollup_date) DO UPDATE SET
        total_tenants=EXCLUDED.total_tenants,
        active_tenants=EXCLUDED.active_tenants,
        trial_tenants=EXCLUDED.trial_tenants,
        total_human_staff=EXCLUDED.total_human_staff,
        total_ai_agents_active=EXCLUDED.total_ai_agents_active,
        total_transactions=EXCLUDED.total_transactions,
        total_revenue_idr=EXCLUDED.total_revenue_idr,
        total_repeat_orders=EXCLUDED.total_repeat_orders,
        total_llm_cost_usd=EXCLUDED.total_llm_cost_usd,
        total_credit_consumed=EXCLUDED.total_credit_consumed,
        computed_at=now();

    FOR v_tenant IN SELECT id FROM public.tenants LOOP
        INSERT INTO public.tenant_analytics_daily_rollup (
            tenant_id,rollup_date,transaction_count,revenue_idr,credit_consumed,
            credit_available,active_ai_agent_count,active_human_staff_count,computed_at
        )
        SELECT
            v_tenant,p_target_date,
            COALESCE((
                SELECT COUNT(*) FROM public.orders o
                WHERE o.tenant_id=v_tenant AND upper(o.payment_status)='PAID' AND o.created_at::date=p_target_date
            ),0) + COALESCE((
                SELECT COUNT(*) FROM public.invoices i
                WHERE i.tenant_id=v_tenant AND lower(i.status)='paid' AND COALESCE(i.paid_at,i.created_at)::date=p_target_date
            ),0),
            COALESCE((
                SELECT SUM(o.total_amount) FROM public.orders o
                WHERE o.tenant_id=v_tenant AND upper(o.payment_status)='PAID' AND o.created_at::date=p_target_date
            ),0) + COALESCE((
                SELECT SUM(i.amount) FROM public.invoices i
                WHERE i.tenant_id=v_tenant AND lower(i.status)='paid' AND COALESCE(i.paid_at,i.created_at)::date=p_target_date
            ),0),
            COALESCE((
                SELECT SUM(abs(c.amount)) FROM public.tenant_credit_transactions c
                WHERE c.tenant_id=v_tenant AND c.transaction_type='consumed' AND c.created_at::date=p_target_date
            ),0),
            COALESCE((SELECT w.balance FROM public.tenant_credit_wallet w WHERE w.tenant_id=v_tenant),0),
            COALESCE((SELECT COUNT(*) FROM public.ai_agents a WHERE a.tenant_id=v_tenant AND lower(a.status)='active' AND a.created_at::date<=p_target_date),0),
            COALESCE((SELECT COUNT(DISTINCT m.auth_user_id) FROM public.tenant_memberships m WHERE m.tenant_id=v_tenant AND (m.status IS NULL OR lower(m.status)='active') AND m.created_at::date<=p_target_date),0),
            now()
        ON CONFLICT (tenant_id,rollup_date) DO UPDATE SET
            transaction_count=EXCLUDED.transaction_count,
            revenue_idr=EXCLUDED.revenue_idr,
            credit_consumed=EXCLUDED.credit_consumed,
            credit_available=EXCLUDED.credit_available,
            active_ai_agent_count=EXCLUDED.active_ai_agent_count,
            active_human_staff_count=EXCLUDED.active_human_staff_count,
            computed_at=now();
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.audit_logs_2026_10 (
        id,tenant_id,actor_type,actor_id,action,resource_type,resource_id,
        payload_before,payload_after,request_id,created_at,persona_type
    ) VALUES (
        gen_random_uuid(),NULL,
        COALESCE(NULLIF(current_setting('app.actor_type',true),''),'system'),
        NULLIF(current_setting('app.user_id',true),'')::uuid,
        'analytics.cross_tenant_rollup','platform_analytics_daily_rollup',NULL,
        NULL,
        jsonb_build_object('rollup_date',p_target_date,'tenant_rollups_computed',v_count),
        NULLIF(current_setting('app.request_id',true),''),
        now(),'SYSTEM'
    );

    RETURN QUERY
    SELECT
        p_target_date,
        r.total_tenants,r.active_tenants,r.trial_tenants,r.total_human_staff,
        r.total_ai_agents_active,r.total_transactions,r.total_revenue_idr,
        r.total_repeat_orders,r.total_llm_cost_usd,r.total_credit_consumed,v_count
    FROM public.platform_analytics_daily_rollup r
    WHERE r.rollup_date=p_target_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_platform_analytics_overview(
    p_start_date date,
    p_end_date date
)
RETURNS TABLE(
    rollup_date date,total_tenants bigint,active_tenants bigint,trial_tenants bigint,
    total_human_staff bigint,total_ai_agents_active bigint,total_transactions bigint,
    total_revenue_idr numeric,total_repeat_orders bigint,total_llm_cost_usd numeric,
    total_credit_consumed numeric,computed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT rollup_date,total_tenants,active_tenants,trial_tenants,total_human_staff,
           total_ai_agents_active,total_transactions,total_revenue_idr,total_repeat_orders,
           total_llm_cost_usd,total_credit_consumed,computed_at
    FROM public.platform_analytics_daily_rollup
    WHERE rollup_date BETWEEN p_start_date AND p_end_date
    ORDER BY rollup_date ASC;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_tenant_rankings(
    p_sort_key text,
    p_desc boolean,
    p_limit integer
)
RETURNS TABLE(
    tenant_id uuid,legal_name text,display_name text,status text,created_at timestamptz,
    plan_code text,credit_available numeric,transaction_count bigint,revenue_idr numeric,
    credit_consumed numeric,active_ai_agent_count bigint,active_human_staff_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_sort_key NOT IN ('revenue_idr','credit_consumed','active_human_staff_count','active_ai_agent_count','transaction_count') THEN
        RAISE EXCEPTION 'invalid analytics sort key';
    END IF;
    RETURN QUERY EXECUTE format($q$
        WITH latest_rollup AS (
            SELECT DISTINCT ON (r.tenant_id) r.*
            FROM public.tenant_analytics_daily_rollup r
            ORDER BY r.tenant_id,r.rollup_date DESC
        ), totals AS (
            SELECT tenant_id,SUM(transaction_count)::bigint AS total_trans,
                   SUM(revenue_idr)::numeric AS total_rev,
                   SUM(credit_consumed)::numeric AS total_credit
            FROM public.tenant_analytics_daily_rollup
            GROUP BY tenant_id
        )
        SELECT t.id,t.legal_name,COALESCE(t.display_name,t.legal_name),t.status,t.created_at,
               COALESCE(p.plan_code,'STANDARD'),
               COALESCE(w.balance,lr.credit_available,0),
               COALESCE(tt.total_trans,lr.transaction_count,0),
               COALESCE(tt.total_rev,lr.revenue_idr,0),
               COALESCE(tt.total_credit,lr.credit_consumed,0),
               COALESCE(lr.active_ai_agent_count,0),
               COALESCE(lr.active_human_staff_count,0)
        FROM public.tenants t
        LEFT JOIN public.subscription_plans p ON p.id=t.subscription_plan_id
        LEFT JOIN public.tenant_credit_wallet w ON w.tenant_id=t.id
        LEFT JOIN latest_rollup lr ON lr.tenant_id=t.id
        LEFT JOIN totals tt ON tt.tenant_id=t.id
        ORDER BY %I %s,t.created_at DESC
        LIMIT $1
    $q$, p_sort_key, CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END)
    USING GREATEST(1,LEAST(COALESCE(p_limit,50),200));
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_llm_usage_breakdown(
    p_group_by text,
    p_start_date date,
    p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_total_tokens bigint;
    v_total_calls bigint;
    v_total_cost numeric;
    v_avg_latency numeric;
    v_items jsonb;
BEGIN
    IF p_group_by NOT IN ('provider','model','tenant') THEN
        RAISE EXCEPTION 'invalid analytics group';
    END IF;

    SELECT COUNT(*)::bigint,COALESCE(SUM(l.total_tokens),0)::bigint,
           COALESCE(SUM(
             (COALESCE(m.input_cost_per_million,0)*l.prompt_tokens
             +COALESCE(m.output_cost_per_million,0)*l.completion_tokens)/1000000.0
           ),0)::numeric,
           COALESCE(AVG(l.latency_ms),0)::numeric
    INTO v_total_calls,v_total_tokens,v_total_cost,v_avg_latency
    FROM public.llm_usage_logs l
    LEFT JOIN public.llm_models m ON m.id::text=l.model_id::text
    WHERE l.created_at::date BETWEEN p_start_date AND p_end_date;

    IF p_group_by='tenant' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'name',COALESCE(t.display_name,t.legal_name),'tenant_id',t.id,
            'call_count',x.call_count,'token_count',x.token_count,'cost_usd',x.cost_usd,
            'avg_latency_ms',round(x.avg_latency,1),
            'percentage',CASE WHEN v_total_cost>0 THEN round(x.cost_usd/v_total_cost*100,2) ELSE 0 END
        ) ORDER BY x.cost_usd DESC),'[]'::jsonb)
        INTO v_items
        FROM (
            SELECT l.tenant_id,COUNT(*)::bigint call_count,SUM(l.total_tokens)::bigint token_count,
                   SUM((COALESCE(m.input_cost_per_million,0)*l.prompt_tokens+COALESCE(m.output_cost_per_million,0)*l.completion_tokens)/1000000.0)::numeric cost_usd,
                   AVG(l.latency_ms)::numeric avg_latency
            FROM public.llm_usage_logs l
            LEFT JOIN public.llm_models m ON m.id::text=l.model_id::text
            WHERE l.created_at::date BETWEEN p_start_date AND p_end_date
            GROUP BY l.tenant_id
            ORDER BY cost_usd DESC LIMIT 20
        ) x JOIN public.tenants t ON t.id=x.tenant_id;
    ELSIF p_group_by='model' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'name',x.model_id,'provider',x.provider_id,'call_count',x.call_count,
            'token_count',x.token_count,'cost_usd',x.cost_usd,'avg_latency_ms',round(x.avg_latency,1),
            'percentage',CASE WHEN v_total_cost>0 THEN round(x.cost_usd/v_total_cost*100,2) ELSE 0 END
        ) ORDER BY x.cost_usd DESC),'[]'::jsonb)
        INTO v_items
        FROM (
            SELECT l.model_id,l.provider_id,COUNT(*)::bigint call_count,SUM(l.total_tokens)::bigint token_count,
                   SUM((COALESCE(m.input_cost_per_million,0)*l.prompt_tokens+COALESCE(m.output_cost_per_million,0)*l.completion_tokens)/1000000.0)::numeric cost_usd,
                   AVG(l.latency_ms)::numeric avg_latency
            FROM public.llm_usage_logs l LEFT JOIN public.llm_models m ON m.id::text=l.model_id::text
            WHERE l.created_at::date BETWEEN p_start_date AND p_end_date
            GROUP BY l.model_id,l.provider_id
        ) x;
    ELSE
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'name',x.provider_id,'provider',x.provider_id,'call_count',x.call_count,
            'token_count',x.token_count,'cost_usd',x.cost_usd,'avg_latency_ms',round(x.avg_latency,1),
            'percentage',CASE WHEN v_total_cost>0 THEN round(x.cost_usd/v_total_cost*100,2) ELSE 0 END
        ) ORDER BY x.cost_usd DESC),'[]'::jsonb)
        INTO v_items
        FROM (
            SELECT l.provider_id,COUNT(*)::bigint call_count,SUM(l.total_tokens)::bigint token_count,
                   SUM((COALESCE(m.input_cost_per_million,0)*l.prompt_tokens+COALESCE(m.output_cost_per_million,0)*l.completion_tokens)/1000000.0)::numeric cost_usd,
                   AVG(l.latency_ms)::numeric avg_latency
            FROM public.llm_usage_logs l LEFT JOIN public.llm_models m ON m.id::text=l.model_id::text
            WHERE l.created_at::date BETWEEN p_start_date AND p_end_date
            GROUP BY l.provider_id
        ) x;
    END IF;

    RETURN jsonb_build_object(
        'group_by',p_group_by,'total_cost_usd',v_total_cost,'total_tokens',v_total_tokens,
        'total_calls',v_total_calls,'avg_latency_ms',round(v_avg_latency,1),'breakdown',v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_compute_daily_rollup(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.superadmin_platform_analytics_overview(date,date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.superadmin_tenant_rankings(text,boolean,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.superadmin_llm_usage_breakdown(text,date,date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.superadmin_compute_daily_rollup(date) TO orchestree_app;
GRANT EXECUTE ON FUNCTION public.superadmin_platform_analytics_overview(date,date) TO orchestree_app;
GRANT EXECUTE ON FUNCTION public.superadmin_tenant_rankings(text,boolean,integer) TO orchestree_app;
GRANT EXECUTE ON FUNCTION public.superadmin_llm_usage_breakdown(text,date,date) TO orchestree_app;
"""

def upgrade() -> None:
    op.execute(SQL)

def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_compute_daily_rollup(date)")
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_platform_analytics_overview(date,date)")
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_tenant_rankings(text,boolean,integer)")
    op.execute("DROP FUNCTION IF EXISTS public.superadmin_llm_usage_breakdown(text,date,date)")
