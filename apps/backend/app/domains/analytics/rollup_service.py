"""
Layanan Komputasi Rollup & Agregasi Analisis Platform (PRD v2.2 Bagian 14 & 18).
Menghitung agregasi harian secara berkala atau on-demand dari data mentah:
- tenants, tenant_memberships, ai_agents
- orders, payments, invoices
- tenant_credit_transactions, tenant_credit_wallet
- llm_usage_logs
"""

from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid
import sqlalchemy as sa
from app.core.database import platform_tx, tenant_tx

logger = logging.getLogger("orchestree.analytics.rollup")


def compute_daily_rollup(target_date: Optional[date] = None) -> Dict[str, Any]:
    """Execute the audited cross-tenant analytics rollup boundary."""
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    with platform_tx() as conn:
        # The function is SECURITY DEFINER, but EXECUTE is restricted to
        # orchestree_app. Audit context is generated server-side, never client supplied.
        conn.execute(sa.text("SELECT set_config('app.actor_type', 'system', true);"))
        conn.execute(
            sa.text("SELECT set_config('app.request_id', :request_id, true);"),
            {"request_id": f"analytics-rollup-{uuid.uuid4()}"},
        )
        row = conn.execute(
            sa.text("SELECT * FROM public.superadmin_compute_daily_rollup(:target_date);"),
            {"target_date": target_date},
        ).mappings().first()

    if not row:
        raise RuntimeError("Cross-tenant analytics rollup returned no aggregate.")

    return {
        "rollup_date": str(row["rollup_date"]),
        "total_tenants": int(row["total_tenants"] or 0),
        "active_tenants": int(row["active_tenants"] or 0),
        "total_transactions": int(row["total_transactions"] or 0),
        "total_revenue_idr": float(row["total_revenue_idr"] or 0.0),
        "tenant_rollups_computed": int(row["tenant_rollups_computed"] or 0),
    }


def parse_date_range(range_str: str, start_str: Optional[str] = None, end_str: Optional[str] = None):
    today = datetime.now(timezone.utc).date()
    if range_str == "7d":
        start_date = today - timedelta(days=6)
        end_date = today
    elif range_str == "30d":
        start_date = today - timedelta(days=29)
        end_date = today
    elif range_str == "90d":
        start_date = today - timedelta(days=89)
        end_date = today
    elif range_str == "custom" and start_str and end_str:
        try:
            start_date = datetime.strptime(start_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
        except ValueError:
            start_date = today - timedelta(days=29)
            end_date = today
    else:
        start_date = today - timedelta(days=29)
        end_date = today
    return start_date, end_date


def get_platform_analytics_overview(
    range_str: str = "30d",
    start_str: Optional[str] = None,
    end_str: Optional[str] = None,
) -> Dict[str, Any]:
    """Read platform analytics only through the audited DB function boundary."""
    start_date, end_date = parse_date_range(range_str, start_str, end_str)

    with platform_tx() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT * FROM public.superadmin_platform_analytics_overview(
                    :start_date, :end_date
                );
            """),
            {"start_date": start_date, "end_date": end_date},
        ).mappings().all()

    if not rows:
        compute_daily_rollup(end_date)
        with platform_tx() as conn:
            rows = conn.execute(
                sa.text("""
                    SELECT * FROM public.superadmin_platform_analytics_overview(
                        :start_date, :end_date
                    );
                """),
                {"start_date": start_date, "end_date": end_date},
            ).mappings().all()

    time_series = []
    sum_transactions = 0
    sum_revenue_idr = 0.0
    sum_repeat_orders = 0
    sum_llm_cost_usd = 0.0
    sum_credit_consumed = 0.0

    latest = {
        "total_tenants": 0,
        "active_tenants": 0,
        "trial_tenants": 0,
        "total_human_staff": 0,
        "total_ai_agents_active": 0,
    }

    for r in rows:
        t_count = int(r["total_transactions"] or 0)
        t_rev = float(r["total_revenue_idr"] or 0.0)
        t_rep = int(r["total_repeat_orders"] or 0)
        t_llm = float(r["total_llm_cost_usd"] or 0.0)
        t_cred = float(r["total_credit_consumed"] or 0.0)

        sum_transactions += t_count
        sum_revenue_idr += t_rev
        sum_repeat_orders += t_rep
        sum_llm_cost_usd += t_llm
        sum_credit_consumed += t_cred

        latest = {
            "total_tenants": int(r["total_tenants"] or 0),
            "active_tenants": int(r["active_tenants"] or 0),
            "trial_tenants": int(r["trial_tenants"] or 0),
            "total_human_staff": int(r["total_human_staff"] or 0),
            "total_ai_agents_active": int(r["total_ai_agents_active"] or 0),
        }

        time_series.append({
            "date": str(r["rollup_date"]),
            "transactions": t_count,
            "revenue_idr": t_rev,
            "repeat_orders": t_rep,
            "llm_cost_usd": t_llm,
            "credit_consumed": t_cred,
            "total_tenants": latest["total_tenants"],
            "active_tenants": latest["active_tenants"],
            "trial_tenants": latest["trial_tenants"],
            "human_staff": latest["total_human_staff"],
            "ai_agents": latest["total_ai_agents_active"],
        })

    sparklines = {
        "transactions": [p["transactions"] for p in time_series[-14:]],
        "revenue": [p["revenue_idr"] for p in time_series[-14:]],
        "tenants": [p["active_tenants"] for p in time_series[-14:]],
        "human_staff": [p["human_staff"] for p in time_series[-14:]],
        "ai_agents": [p["ai_agents"] for p in time_series[-14:]],
        "repeat_orders": [p["repeat_orders"] for p in time_series[-14:]],
        "llm_cost": [p["llm_cost_usd"] for p in time_series[-14:]],
        "credit_consumed": [p["credit_consumed"] for p in time_series[-14:]],
    }

    return {
        "range": range_str,
        "start_date": str(start_date),
        "end_date": str(end_date),
        "kpi": {
            "total_transactions": sum_transactions,
            "total_revenue_idr": sum_revenue_idr,
            "total_repeat_orders": sum_repeat_orders,
            "total_llm_cost_usd": sum_llm_cost_usd,
            "total_credit_consumed": sum_credit_consumed,
            "tenants": {
                "total": latest["total_tenants"],
                "active": latest["active_tenants"],
                "trial": latest["trial_tenants"],
            },
            "total_human_staff": latest["total_human_staff"],
            "total_ai_agents_active": latest["total_ai_agents_active"],
        },
        "sparklines": sparklines,
        "time_series": time_series,
        "data_points_count": len(time_series),
    }


def get_tenant_rankings(
    sort_by: str = "revenue",
    order: str = "desc",
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Return tenant rankings through the audited cross-tenant function."""
    valid_sorts = {
        "revenue": "revenue_idr",
        "credit_usage": "credit_consumed",
        "staff_count": "active_human_staff_count",
        "ai_agent_count": "active_ai_agent_count",
        "transaction_count": "transaction_count",
    }
    sort_key = valid_sorts.get(sort_by, "revenue_idr")
    descending = order.lower() == "desc"

    with platform_tx() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT * FROM public.superadmin_tenant_rankings(
                    :sort_key, :descending, :limit
                );
            """),
            {"sort_key": sort_key, "descending": descending, "limit": limit},
        ).mappings().all()

    return [
        {
            "tenant_id": str(r["tenant_id"]),
            "legal_name": r["legal_name"],
            "display_name": r["display_name"] or r["legal_name"],
            "status": str(r["status"]).lower(),
            "plan_code": r["plan_code"] or "STANDARD",
            "transaction_count": int(r["transaction_count"] or 0),
            "revenue_idr": float(r["revenue_idr"] or 0.0),
            "credit_consumed": float(r["credit_consumed"] or 0.0),
            "credit_available": float(r["credit_available"] or 0.0),
            "active_ai_agent_count": int(r["active_ai_agent_count"] or 0),
            "active_human_staff_count": int(r["active_human_staff_count"] or 0),
            "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        }
        for r in rows
    ]


def get_tenant_analytics_detail(tenant_id: str) -> Dict[str, Any]:
    """
    Mengambil data mendalam (drill-down) satu organisasi tenant tertentu:
    - Profil organisasi & neraca dompet
    - Histori transaksi pesanan & invoice
    - Histori pemakaian kredit harian
    - Komposisi AI Agent aktif per Jabatan Utama
    - Komposisi Staf Manusia per Departemen
    """
    with tenant_tx(tenant_id) as conn:
        # 1. Info tenant
        t_row = conn.execute(sa.text("""
            SELECT t.id, t.legal_name, t.display_name, t.status, t.created_at,
                   p.plan_code, p.plan_name,
                   COALESCE(w.balance, 0) AS balance,
                   COALESCE(w.reserved_balance, 0) AS reserved_balance
            FROM tenants t
            LEFT JOIN subscription_plans p ON p.id = t.subscription_plan_id
            LEFT JOIN tenant_credit_wallet w ON w.tenant_id = t.id
            WHERE t.id = :tid;
        """), {"tid": tenant_id}).mappings().first()

        if not t_row:
            return {"error": "Tenant tidak ditemukan"}

        # 2. Histori transaksi (Orders + Invoices)
        orders_rows = conn.execute(sa.text("""
            SELECT
                o.id,
                o.order_number,
                o.total_amount,
                o.currency,
                o.payment_status,
                o.created_at
            FROM orders o
            WHERE o.tenant_id = :tid
            ORDER BY o.created_at DESC
            LIMIT 20;
        """), {"tid": tenant_id}).mappings().all()

        transactions = []
        for o in orders_rows:
            transactions.append({
                "id": str(o["id"]),
                "reference": o["order_number"],
                "type": "Pesanan Komersial",
                "amount": float(o["total_amount"]),
                "currency": o["currency"],
                "status": o["payment_status"],
                "date": o["created_at"].isoformat() if hasattr(o["created_at"], "isoformat") else str(o["created_at"]),
            })

        # 3. Histori pemakaian kredit harian (30 hari terakhir)
        credit_history_rows = conn.execute(sa.text("""
            SELECT
                rollup_date,
                credit_consumed,
                credit_available,
                transaction_count,
                revenue_idr
            FROM tenant_analytics_daily_rollup
            WHERE tenant_id = :tid
            ORDER BY rollup_date ASC
            LIMIT 30;
        """), {"tid": tenant_id}).mappings().all()

        daily_credit = []
        for c in credit_history_rows:
            daily_credit.append({
                "date": str(c["rollup_date"]),
                "consumed": float(c["credit_consumed"]),
                "available": float(c["credit_available"]),
                "transactions": int(c["transaction_count"]),
                "revenue": float(c["revenue_idr"]),
            })

        # 4. AI Agents aktif per Jabatan Utama
        agent_rows = conn.execute(sa.text("""
            SELECT
                COALESCE(jt.title_code, 'GENERAL_ASSISTANT') AS title_code,
                COALESCE(jt.official_title, 'Asisten AI Operasional') AS job_title,
                COUNT(a.id) AS agent_count
            FROM ai_agents a
            LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id OR jt.id = a.structural_job_title_id
            WHERE a.tenant_id = :tid AND LOWER(a.status) = 'active'
            GROUP BY jt.title_code, jt.official_title
            ORDER BY agent_count DESC;
        """), {"tid": tenant_id}).mappings().all()

        ai_agent_breakdown = []
        for a in agent_rows:
            ai_agent_breakdown.append({
                "title_code": a["title_code"],
                "job_title": a["job_title"],
                "count": int(a["agent_count"]),
            })

        # 5. Staf Manusia per Departemen
        dept_rows = conn.execute(sa.text("""
            SELECT
                COALESCE(d.name, 'Umum / Administrasi') AS department_name,
                COUNT(DISTINCT m.user_id) AS staff_count
            FROM tenant_memberships m
            LEFT JOIN departments d ON d.id = m.department_id
            WHERE m.tenant_id = :tid AND (m.status IS NULL OR LOWER(m.status) = 'active')
            GROUP BY d.name
            ORDER BY staff_count DESC;
        """), {"tid": tenant_id}).mappings().all()

        human_staff_breakdown = []
        for d in dept_rows:
            human_staff_breakdown.append({
                "department": d["department_name"],
                "count": int(d["staff_count"]),
            })

        return {
            "tenant": {
                "id": str(t_row["id"]),
                "legal_name": t_row["legal_name"],
                "display_name": t_row["display_name"] or t_row["legal_name"],
                "status": str(t_row["status"]).lower(),
                "plan_code": t_row["plan_code"] or "STANDARD",
                "plan_name": t_row["plan_name"] or "Paket Operasional Standar",
                "credit_balance": float(t_row["balance"]),
                "credit_reserved": float(t_row["reserved_balance"]),
                "created_at": t_row["created_at"].isoformat() if hasattr(t_row["created_at"], "isoformat") else str(t_row["created_at"]),
            },
            "transactions": transactions,
            "daily_credit_history": daily_credit,
            "ai_agent_breakdown": ai_agent_breakdown,
            "human_staff_breakdown": human_staff_breakdown,
        }


def get_llm_usage_breakdown(
    group_by: str = "provider",
    range_str: str = "30d",
) -> Dict[str, Any]:
    """Return cross-tenant LLM usage only through the audited DB function."""
    start_date, end_date = parse_date_range(range_str)

    with platform_tx() as conn:
        payload = conn.execute(
            sa.text("""
                SELECT public.superadmin_llm_usage_breakdown(
                    :group_by, :start_date, :end_date
                ) AS payload;
            """),
            {
                "group_by": group_by if group_by in {"provider", "model", "tenant"} else "provider",
                "start_date": start_date,
                "end_date": end_date,
            },
        ).scalar_one()

    if isinstance(payload, dict):
        return payload
    raise RuntimeError("Cross-tenant LLM analytics returned an invalid payload.")


