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
from app.core.database import tenant_tx

logger = logging.getLogger("orchestree.analytics.rollup")


def compute_daily_rollup(target_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Menjalankan kalkulasi agregasi harian untuk platform dan seluruh organisasi tenant
    berdasarkan data mentah operasional nyata (Job Celery Beat / Trigger Super Admin).
    """
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    raise RuntimeError("Platform-wide analytics rollup must execute through the audited cross-tenant DB function boundary (R1-B.3).")
    with tenant_tx("00000000-0000-0000-0000-000000000000") as conn:
        # 1. Pastikan tabel rollup ada
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS platform_analytics_daily_rollup (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                rollup_date date NOT NULL UNIQUE,
                total_tenants int NOT NULL DEFAULT 0,
                active_tenants int NOT NULL DEFAULT 0,
                trial_tenants int NOT NULL DEFAULT 0,
                total_human_staff int NOT NULL DEFAULT 0,
                total_ai_agents_active int NOT NULL DEFAULT 0,
                total_transactions int NOT NULL DEFAULT 0,
                total_revenue_idr numeric(18,2) NOT NULL DEFAULT 0.00,
                total_repeat_orders int NOT NULL DEFAULT 0,
                total_llm_cost_usd numeric(18,6) NOT NULL DEFAULT 0.000000,
                total_credit_consumed numeric(18,4) NOT NULL DEFAULT 0.0000,
                computed_at timestamptz NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS tenant_analytics_daily_rollup (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                rollup_date date NOT NULL,
                transaction_count int NOT NULL DEFAULT 0,
                revenue_idr numeric(18,2) NOT NULL DEFAULT 0.00,
                credit_consumed numeric(18,4) NOT NULL DEFAULT 0.0000,
                credit_available numeric(18,4) NOT NULL DEFAULT 0.0000,
                active_ai_agent_count int NOT NULL DEFAULT 0,
                active_human_staff_count int NOT NULL DEFAULT 0,
                computed_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT uq_tenant_analytics_daily_rollup UNIQUE (tenant_id, rollup_date)
            );
        """))

        # 2. Hitung Metrik Platform untuk target_date
        # Tenant counts
        tenant_counts = conn.execute(sa.text("""
            SELECT
                COUNT(*) AS total_tenants,
                COUNT(*) FILTER (WHERE LOWER(status) = 'active') AS active_tenants,
                COUNT(*) FILTER (WHERE LOWER(status) = 'trial') AS trial_tenants
            FROM tenants
            WHERE created_at::date <= :target_date;
        """), {"target_date": target_date}).mappings().first()

        total_tenants = int(tenant_counts["total_tenants"] or 0) if tenant_counts else 0
        active_tenants = int(tenant_counts["active_tenants"] or 0) if tenant_counts else 0
        trial_tenants = int(tenant_counts["trial_tenants"] or 0) if tenant_counts else 0

        # Human staff count
        staff_row = conn.execute(sa.text("""
            SELECT COUNT(DISTINCT user_id) AS total_human_staff
            FROM tenant_memberships
            WHERE (status IS NULL OR LOWER(status) = 'active')
              AND created_at::date <= :target_date;
        """), {"target_date": target_date}).mappings().first()
        total_human_staff = int(staff_row["total_human_staff"] or 0) if staff_row else 0

        # AI agents active count
        agents_row = conn.execute(sa.text("""
            SELECT COUNT(*) AS total_ai_agents_active
            FROM ai_agents
            WHERE LOWER(status) = 'active'
              AND created_at::date <= :target_date;
        """), {"target_date": target_date}).mappings().first()
        total_ai_agents_active = int(agents_row["total_ai_agents_active"] or 0) if agents_row else 0

        # Orders & Revenue on target_date
        order_metrics = conn.execute(sa.text("""
            SELECT
                COUNT(*) AS total_transactions,
                COALESCE(SUM(total_amount), 0) AS total_revenue_idr,
                COUNT(*) FILTER (
                    WHERE customer_id IN (
                        SELECT customer_id
                        FROM orders prev
                        WHERE prev.tenant_id = orders.tenant_id
                          AND UPPER(prev.payment_status) = 'PAID'
                          AND prev.created_at < orders.created_at
                    )
                ) AS total_repeat_orders
            FROM orders
            WHERE UPPER(payment_status) = 'PAID'
              AND created_at::date = :target_date;
        """), {"target_date": target_date}).mappings().first()

        order_trans = int(order_metrics["total_transactions"] or 0) if order_metrics else 0
        order_rev = float(order_metrics["total_revenue_idr"] or 0.0) if order_metrics else 0.0
        repeat_orders = int(order_metrics["total_repeat_orders"] or 0) if order_metrics else 0

        # Invoices on target_date
        invoice_metrics = conn.execute(sa.text("""
            SELECT
                COUNT(*) AS total_invoices,
                COALESCE(SUM(amount), 0) AS total_invoice_revenue
            FROM invoices
            WHERE LOWER(status) = 'paid'
              AND COALESCE(paid_at, created_at)::date = :target_date;
        """), {"target_date": target_date}).mappings().first()

        inv_count = int(invoice_metrics["total_invoices"] or 0) if invoice_metrics else 0
        inv_rev = float(invoice_metrics["total_invoice_revenue"] or 0.0) if invoice_metrics else 0.0

        total_transactions = order_trans + inv_count
        total_revenue_idr = order_rev + inv_rev

        # LLM cost on target_date
        llm_metrics = conn.execute(sa.text("""
            SELECT COALESCE(SUM(cost_usd), 0) AS total_llm_cost_usd
            FROM llm_usage_logs
            WHERE created_at::date = :target_date;
        """), {"target_date": target_date}).mappings().first()
        total_llm_cost_usd = float(llm_metrics["total_llm_cost_usd"] or 0.0) if llm_metrics else 0.0

        # Credit consumed on target_date
        credit_metrics = conn.execute(sa.text("""
            SELECT COALESCE(SUM(ABS(amount)), 0) AS total_credit_consumed
            FROM tenant_credit_transactions
            WHERE transaction_type = 'consumed'
              AND created_at::date = :target_date;
        """), {"target_date": target_date}).mappings().first()
        total_credit_consumed = float(credit_metrics["total_credit_consumed"] or 0.0) if credit_metrics else 0.0

        # Upsert platform_analytics_daily_rollup
        conn.execute(sa.text("""
            INSERT INTO platform_analytics_daily_rollup (
                rollup_date,
                total_tenants,
                active_tenants,
                trial_tenants,
                total_human_staff,
                total_ai_agents_active,
                total_transactions,
                total_revenue_idr,
                total_repeat_orders,
                total_llm_cost_usd,
                total_credit_consumed,
                computed_at
            ) VALUES (
                :rollup_date,
                :total_tenants,
                :active_tenants,
                :trial_tenants,
                :total_human_staff,
                :total_ai_agents_active,
                :total_transactions,
                :total_revenue_idr,
                :total_repeat_orders,
                :total_llm_cost_usd,
                :total_credit_consumed,
                now()
            )
            ON CONFLICT (rollup_date) DO UPDATE SET
                total_tenants = EXCLUDED.total_tenants,
                active_tenants = EXCLUDED.active_tenants,
                trial_tenants = EXCLUDED.trial_tenants,
                total_human_staff = EXCLUDED.total_human_staff,
                total_ai_agents_active = EXCLUDED.total_ai_agents_active,
                total_transactions = EXCLUDED.total_transactions,
                total_revenue_idr = EXCLUDED.total_revenue_idr,
                total_repeat_orders = EXCLUDED.total_repeat_orders,
                total_llm_cost_usd = EXCLUDED.total_llm_cost_usd,
                total_credit_consumed = EXCLUDED.total_credit_consumed,
                computed_at = now();
        """), {
            "rollup_date": target_date,
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "trial_tenants": trial_tenants,
            "total_human_staff": total_human_staff,
            "total_ai_agents_active": total_ai_agents_active,
            "total_transactions": total_transactions,
            "total_revenue_idr": total_revenue_idr,
            "total_repeat_orders": repeat_orders,
            "total_llm_cost_usd": total_llm_cost_usd,
            "total_credit_consumed": total_credit_consumed,
        })

        # 3. Hitung dan Upsert Tenant Rollup untuk seluruh organisasi tenant
        tenants_list = conn.execute(sa.text("""
            SELECT id FROM tenants;
        """)).fetchall()

        tenant_rollups_computed = 0
        for trow in tenants_list:
            tid = trow[0]
            # Transaction count & revenue for tenant
            tenant_orders = conn.execute(sa.text("""
                SELECT
                    COUNT(*) AS t_count,
                    COALESCE(SUM(total_amount), 0) AS t_rev
                FROM orders
                WHERE tenant_id = :tid
                  AND UPPER(payment_status) = 'PAID'
                  AND created_at::date = :target_date;
            """), {"tid": tid, "target_date": target_date}).mappings().first()

            tenant_invoices = conn.execute(sa.text("""
                SELECT
                    COUNT(*) AS i_count,
                    COALESCE(SUM(amount), 0) AS i_rev
                FROM invoices
                WHERE tenant_id = :tid
                  AND LOWER(status) = 'paid'
                  AND COALESCE(paid_at, created_at)::date = :target_date;
            """), {"tid": tid, "target_date": target_date}).mappings().first()

            t_count = (int(tenant_orders["t_count"] or 0) if tenant_orders else 0) + (int(tenant_invoices["i_count"] or 0) if tenant_invoices else 0)
            t_rev = (float(tenant_orders["t_rev"] or 0.0) if tenant_orders else 0.0) + (float(tenant_invoices["i_rev"] or 0.0) if tenant_invoices else 0.0)

            # Credit consumed
            t_credit = conn.execute(sa.text("""
                SELECT COALESCE(SUM(ABS(amount)), 0) AS consumed
                FROM tenant_credit_transactions
                WHERE tenant_id = :tid
                  AND transaction_type = 'consumed'
                  AND created_at::date = :target_date;
            """), {"tid": tid, "target_date": target_date}).scalar() or 0.0

            # Credit available (wallet)
            t_wallet = conn.execute(sa.text("""
                SELECT COALESCE(balance, 0) AS balance
                FROM tenant_credit_wallet
                WHERE tenant_id = :tid;
            """), {"tid": tid}).scalar() or 0.0

            # Active AI agents
            t_agents = conn.execute(sa.text("""
                SELECT COUNT(*) FROM ai_agents
                WHERE tenant_id = :tid
                  AND LOWER(status) = 'active'
                  AND created_at::date <= :target_date;
            """), {"tid": tid, "target_date": target_date}).scalar() or 0

            # Active human staff
            t_staff = conn.execute(sa.text("""
                SELECT COUNT(DISTINCT user_id) FROM tenant_memberships
                WHERE tenant_id = :tid
                  AND (status IS NULL OR LOWER(status) = 'active')
                  AND created_at::date <= :target_date;
            """), {"tid": tid, "target_date": target_date}).scalar() or 0

            conn.execute(sa.text("""
                INSERT INTO tenant_analytics_daily_rollup (
                    tenant_id,
                    rollup_date,
                    transaction_count,
                    revenue_idr,
                    credit_consumed,
                    credit_available,
                    active_ai_agent_count,
                    active_human_staff_count,
                    computed_at
                ) VALUES (
                    :tid,
                    :rollup_date,
                    :transaction_count,
                    :revenue_idr,
                    :credit_consumed,
                    :credit_available,
                    :active_ai_agent_count,
                    :active_human_staff_count,
                    now()
                )
                ON CONFLICT (tenant_id, rollup_date) DO UPDATE SET
                    transaction_count = EXCLUDED.transaction_count,
                    revenue_idr = EXCLUDED.revenue_idr,
                    credit_consumed = EXCLUDED.credit_consumed,
                    credit_available = EXCLUDED.credit_available,
                    active_ai_agent_count = EXCLUDED.active_ai_agent_count,
                    active_human_staff_count = EXCLUDED.active_human_staff_count,
                    computed_at = now();
            """), {
                "tid": tid,
                "rollup_date": target_date,
                "transaction_count": t_count,
                "revenue_idr": t_rev,
                "credit_consumed": float(t_credit),
                "credit_available": float(t_wallet),
                "active_ai_agent_count": int(t_agents),
                "active_human_staff_count": int(t_staff),
            })
            tenant_rollups_computed += 1

    logger.info(f"Rollup selesai untuk {target_date}: {tenant_rollups_computed} tenant tercatat.")
    return {
        "rollup_date": str(target_date),
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_transactions": total_transactions,
        "total_revenue_idr": total_revenue_idr,
        "tenant_rollups_computed": tenant_rollups_computed,
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
    end_str: Optional[str] = None
) -> Dict[str, Any]:
    """
    Mengambil data tren time-series dan ringkasan KPI platform dari platform_analytics_daily_rollup.
    """
    start_date, end_date = parse_date_range(range_str, start_str, end_str)

    with tenant_tx(tenant_id) as conn:
        # Cek apakah rollup sudah ada
        rows = conn.execute(sa.text("""
            SELECT
                rollup_date,
                total_tenants,
                active_tenants,
                trial_tenants,
                total_human_staff,
                total_ai_agents_active,
                total_transactions,
                total_revenue_idr,
                total_repeat_orders,
                total_llm_cost_usd,
                total_credit_consumed,
                computed_at
            FROM platform_analytics_daily_rollup
            WHERE rollup_date >= :start_date AND rollup_date <= :end_date
            ORDER BY rollup_date ASC;
        """), {"start_date": start_date, "end_date": end_date}).mappings().all()

        # Bila baris kosong untuk rentang terpilih, komputasi otomatis hari ini
        if not rows:
            try:
                compute_daily_rollup(end_date)
                rows = conn.execute(sa.text("""
                    SELECT
                        rollup_date,
                        total_tenants,
                        active_tenants,
                        trial_tenants,
                        total_human_staff,
                        total_ai_agents_active,
                        total_transactions,
                        total_revenue_idr,
                        total_repeat_orders,
                        total_llm_cost_usd,
                        total_credit_consumed,
                        computed_at
                    FROM platform_analytics_daily_rollup
                    WHERE rollup_date >= :start_date AND rollup_date <= :end_date
                    ORDER BY rollup_date ASC;
                """), {"start_date": start_date, "end_date": end_date}).mappings().all()
            except Exception as e:
                logger.warning(f"Gagal komputasi otomatis rollup saat data kosong: {e}")

        time_series = []
        sum_transactions = 0
        sum_revenue_idr = 0.0
        sum_repeat_orders = 0
        sum_llm_cost_usd = 0.0
        sum_credit_consumed = 0.0

        latest_total_tenants = 0
        latest_active_tenants = 0
        latest_trial_tenants = 0
        latest_human_staff = 0
        latest_ai_agents = 0

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

            latest_total_tenants = int(r["total_tenants"] or 0)
            latest_active_tenants = int(r["active_tenants"] or 0)
            latest_trial_tenants = int(r["trial_tenants"] or 0)
            latest_human_staff = int(r["total_human_staff"] or 0)
            latest_ai_agents = int(r["total_ai_agents_active"] or 0)

            time_series.append({
                "date": str(r["rollup_date"]),
                "transactions": t_count,
                "revenue_idr": t_rev,
                "repeat_orders": t_rep,
                "llm_cost_usd": t_llm,
                "credit_consumed": t_cred,
                "total_tenants": latest_total_tenants,
                "active_tenants": latest_active_tenants,
                "trial_tenants": latest_trial_tenants,
                "human_staff": latest_human_staff,
                "ai_agents": latest_ai_agents,
            })

        # Jika masih kosong, ambil metrik live dari tabel tenants
        if not rows:
            live_tenant_row = conn.execute(sa.text("""
                SELECT
                    COUNT(*) AS total_tenants,
                    COUNT(*) FILTER (WHERE LOWER(status) = 'active') AS active_tenants,
                    COUNT(*) FILTER (WHERE LOWER(status) = 'trial') AS trial_tenants
                FROM tenants;
            """)).mappings().first()
            if live_tenant_row:
                latest_total_tenants = int(live_tenant_row["total_tenants"] or 0)
                latest_active_tenants = int(live_tenant_row["active_tenants"] or 0)
                latest_trial_tenants = int(live_tenant_row["trial_tenants"] or 0)

        # Sparklines data (ekstrak 7 titik data terakhir atau seluruhnya)
        sparklines = {
            "transactions": [pt["transactions"] for pt in time_series[-14:]] if time_series else [],
            "revenue": [pt["revenue_idr"] for pt in time_series[-14:]] if time_series else [],
            "tenants": [pt["active_tenants"] for pt in time_series[-14:]] if time_series else [],
            "human_staff": [pt["human_staff"] for pt in time_series[-14:]] if time_series else [],
            "ai_agents": [pt["ai_agents"] for pt in time_series[-14:]] if time_series else [],
            "repeat_orders": [pt["repeat_orders"] for pt in time_series[-14:]] if time_series else [],
            "llm_cost": [pt["llm_cost_usd"] for pt in time_series[-14:]] if time_series else [],
            "credit_consumed": [pt["credit_consumed"] for pt in time_series[-14:]] if time_series else [],
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
                    "total": latest_total_tenants,
                    "active": latest_active_tenants,
                    "trial": latest_trial_tenants,
                },
                "total_human_staff": latest_human_staff,
                "total_ai_agents_active": latest_ai_agents,
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
    """
    Mengembalikan ranking tenant dari tenant_analytics_daily_rollup dan status live tenant.
    """
    valid_sorts = {
        "revenue": "revenue_idr",
        "credit_usage": "credit_consumed",
        "staff_count": "active_human_staff_count",
        "ai_agent_count": "active_ai_agent_count",
        "transaction_count": "transaction_count",
    }
    sort_col = valid_sorts.get(sort_by, "revenue_idr")
    dir_str = "DESC" if order.lower() == "desc" else "ASC"

    raise RuntimeError("Platform-wide analytics read must execute through the audited cross-tenant DB function boundary (R1-B.3).")
    with tenant_tx("00000000-0000-0000-0000-000000000000") as conn:
        query = sa.text(f"""
            WITH latest_rollup AS (
                SELECT DISTINCT ON (tenant_id)
                    tenant_id,
                    rollup_date,
                    transaction_count,
                    revenue_idr,
                    credit_consumed,
                    credit_available,
                    active_ai_agent_count,
                    active_human_staff_count
                FROM tenant_analytics_daily_rollup
                ORDER BY tenant_id, rollup_date DESC
            ),
            tenant_totals AS (
                SELECT
                    tenant_id,
                    COALESCE(SUM(transaction_count), 0) AS total_trans,
                    COALESCE(SUM(revenue_idr), 0) AS total_rev,
                    COALESCE(SUM(credit_consumed), 0) AS total_credit_used
                FROM tenant_analytics_daily_rollup
                GROUP BY tenant_id
            )
            SELECT
                t.id AS tenant_id,
                t.legal_name,
                t.display_name,
                t.status,
                t.created_at,
                p.plan_code,
                COALESCE(w.balance, lr.credit_available, 0) AS credit_available,
                COALESCE(tt.total_trans, lr.transaction_count, 0) AS transaction_count,
                COALESCE(tt.total_rev, lr.revenue_idr, 0) AS revenue_idr,
                COALESCE(tt.total_credit_used, lr.credit_consumed, 0) AS credit_consumed,
                COALESCE(lr.active_ai_agent_count, (
                    SELECT COUNT(*) FROM ai_agents a WHERE a.tenant_id = t.id AND LOWER(a.status) = 'active'
                )) AS active_ai_agent_count,
                COALESCE(lr.active_human_staff_count, (
                    SELECT COUNT(DISTINCT m.user_id) FROM tenant_memberships m WHERE m.tenant_id = t.id
                )) AS active_human_staff_count
            FROM tenants t
            LEFT JOIN subscription_plans p ON p.id = t.subscription_plan_id
            LEFT JOIN tenant_credit_wallet w ON w.tenant_id = t.id
            LEFT JOIN latest_rollup lr ON lr.tenant_id = t.id
            LEFT JOIN tenant_totals tt ON tt.tenant_id = t.id
            ORDER BY {sort_col} {dir_str}, t.created_at DESC
            LIMIT :limit;
        """)

        rows = conn.execute(query, {"limit": limit}).mappings().all()
        results = []
        for r in rows:
            results.append({
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
            })
        return results


def get_tenant_analytics_detail(tenant_id: str) -> Dict[str, Any]:
    """
    Mengambil data mendalam (drill-down) satu organisasi tenant tertentu:
    - Profil organisasi & neraca dompet
    - Histori transaksi pesanan & invoice
    - Histori pemakaian kredit harian
    - Komposisi AI Agent aktif per Jabatan Utama
    - Komposisi Staf Manusia per Departemen
    """
    engine = get_database_engine()
    with engine.connect() as conn:
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
    """
    Mengambil rincian pemakaian dan biaya LLM nyata dari llm_usage_logs.
    Grup: provider | model | tenant
    """
    start_date, end_date = parse_date_range(range_str)

    engine = get_database_engine()
    with engine.connect() as conn:
        # Total cost & tokens
        summary = conn.execute(sa.text("""
            SELECT
                COUNT(*) AS total_calls,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
                COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
                COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
            FROM llm_usage_logs
            WHERE created_at::date >= :start_date AND created_at::date <= :end_date;
        """), {"start_date": start_date, "end_date": end_date}).mappings().first()

        total_cost_usd = float(summary["total_cost_usd"] or 0.0) if summary else 0.0
        total_tokens = int(summary["total_tokens"] or 0) if summary else 0
        total_calls = int(summary["total_calls"] or 0) if summary else 0
        avg_latency = float(summary["avg_latency_ms"] or 0.0) if summary else 0.0

        items = []
        if group_by == "model":
            rows = conn.execute(sa.text("""
                SELECT
                    model_id AS key_name,
                    provider_code,
                    COUNT(*) AS call_count,
                    COALESCE(SUM(total_tokens), 0) AS token_count,
                    COALESCE(SUM(cost_usd), 0) AS cost_usd,
                    COALESCE(AVG(latency_ms), 0) AS avg_latency
                FROM llm_usage_logs
                WHERE created_at::date >= :start_date AND created_at::date <= :end_date
                GROUP BY model_id, provider_code
                ORDER BY cost_usd DESC, token_count DESC;
            """), {"start_date": start_date, "end_date": end_date}).mappings().all()

            for r in rows:
                c_usd = float(r["cost_usd"] or 0.0)
                items.append({
                    "name": r["key_name"],
                    "provider": r["provider_code"],
                    "call_count": int(r["call_count"] or 0),
                    "token_count": int(r["token_count"] or 0),
                    "cost_usd": c_usd,
                    "avg_latency_ms": round(float(r["avg_latency"] or 0.0), 1),
                    "percentage": round((c_usd / total_cost_usd * 100), 2) if total_cost_usd > 0 else 0.0,
                })
        elif group_by == "tenant":
            rows = conn.execute(sa.text("""
                SELECT
                    t.display_name AS key_name,
                    t.id AS tenant_id,
                    COUNT(*) AS call_count,
                    COALESCE(SUM(l.total_tokens), 0) AS token_count,
                    COALESCE(SUM(l.cost_usd), 0) AS cost_usd,
                    COALESCE(AVG(l.latency_ms), 0) AS avg_latency
                FROM llm_usage_logs l
                JOIN tenants t ON t.id = l.tenant_id
                WHERE l.created_at::date >= :start_date AND l.created_at::date <= :end_date
                GROUP BY t.display_name, t.id
                ORDER BY cost_usd DESC
                LIMIT 20;
            """), {"start_date": start_date, "end_date": end_date}).mappings().all()

            for r in rows:
                c_usd = float(r["cost_usd"] or 0.0)
                items.append({
                    "name": r["key_name"],
                    "tenant_id": str(r["tenant_id"]),
                    "call_count": int(r["call_count"] or 0),
                    "token_count": int(r["token_count"] or 0),
                    "cost_usd": c_usd,
                    "avg_latency_ms": round(float(r["avg_latency"] or 0.0), 1),
                    "percentage": round((c_usd / total_cost_usd * 100), 2) if total_cost_usd > 0 else 0.0,
                })
        else:
            # Default group_by: provider
            rows = conn.execute(sa.text("""
                SELECT
                    provider_code AS key_name,
                    COUNT(*) AS call_count,
                    COALESCE(SUM(total_tokens), 0) AS token_count,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(cost_usd), 0) AS cost_usd,
                    COALESCE(AVG(latency_ms), 0) AS avg_latency
                FROM llm_usage_logs
                WHERE created_at::date >= :start_date AND created_at::date <= :end_date
                GROUP BY provider_code
                ORDER BY cost_usd DESC;
            """), {"start_date": start_date, "end_date": end_date}).mappings().all()

            for r in rows:
                c_usd = float(r["cost_usd"] or 0.0)
                items.append({
                    "name": r["key_name"],
                    "provider": r["key_name"],
                    "call_count": int(r["call_count"] or 0),
                    "token_count": int(r["token_count"] or 0),
                    "cost_usd": c_usd,
                    "avg_latency_ms": round(float(r["avg_latency"] or 0.0), 1),
                    "percentage": round((c_usd / total_cost_usd * 100), 2) if total_cost_usd > 0 else 0.0,
                })

        return {
            "group_by": group_by,
            "range": range_str,
            "total_cost_usd": total_cost_usd,
            "total_tokens": total_tokens,
            "total_calls": total_calls,
            "avg_latency_ms": round(avg_latency, 1),
            "breakdown": items,
        }
