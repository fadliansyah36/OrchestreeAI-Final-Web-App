"""Domain services for Super Admin platform overview.

API routers own transport/authentication. This module owns read-side SQL and
maps database state into domain response dictionaries. It never fabricates
healthy state when the canonical database is unavailable.
"""

from typing import Any, Dict, List
import sqlalchemy as sa

from app.core.database import get_database_engine


def get_platform_overview_data(model_router: Any, tool_registry: Any) -> Dict[str, Any]:
    engine = get_database_engine()
    with engine.connect() as conn:
        tenant_row = conn.execute(sa.text("""
            SELECT COUNT(*) AS total_tenants,
                   COUNT(*) FILTER (WHERE LOWER(status) = 'active') AS active_tenants,
                   COUNT(*) FILTER (WHERE LOWER(status) = 'trial') AS trial_tenants
            FROM tenants;
        """)).mappings().first()

        prospect_row = conn.execute(sa.text("""
            SELECT COUNT(*) AS total_prospects,
                   COUNT(*) FILTER (WHERE UPPER(COALESCE(trial_status, '')) = 'SELECTED') AS selected_prospects,
                   COUNT(*) FILTER (WHERE UPPER(COALESCE(trial_status, '')) IN ('SELECTED','ACTIVE_TRIAL')) AS active_trials,
                   COUNT(*) FILTER (WHERE scheduled_meeting_date IS NOT NULL) AS scheduled_meetings
            FROM prospects;
        """)).mappings().first()

        slot_row = conn.execute(sa.text("""
            SELECT COUNT(*) AS total_slots,
                   COUNT(*) FILTER (WHERE LOWER(status) = 'available') AS available_slots,
                   COUNT(*) FILTER (WHERE LOWER(status) = 'reserved') AS reserved_slots,
                   COUNT(*) FILTER (WHERE LOWER(status) = 'allocated') AS allocated_slots
            FROM trial_slots;
        """)).mappings().first()

        llm_health = model_router
        mcp_tools = tool_registry.list_tools()

        return {
            "tenants": {
                "total": int(tenant_row["total_tenants"] or 0) if tenant_row else 0,
                "active": int(tenant_row["active_tenants"] or 0) if tenant_row else 0,
                "trial": int(tenant_row["trial_tenants"] or 0) if tenant_row else 0,
            },
            "prospects": {
                "total": int(prospect_row["total_prospects"] or 0) if prospect_row else 0,
                "selected": int(prospect_row["selected_prospects"] or 0) if prospect_row else 0,
                "active_trials": int(prospect_row["active_trials"] or 0) if prospect_row else 0,
                "scheduled_meetings": int(prospect_row["scheduled_meetings"] or 0) if prospect_row else 0,
            },
            "trial_slots": {
                "capacity": int(slot_row["total_slots"] or 0) if slot_row else 0,
                "available": int(slot_row["available_slots"] or 0) if slot_row else 0,
                "reserved": int(slot_row["reserved_slots"] or 0) if slot_row else 0,
                "allocated": int(slot_row["allocated_slots"] or 0) if slot_row else 0,
                "duration_days": 0,
            },
            "llm": {
                "providers_healthy": sum(1 for item in llm_health if item.get("health_status") == "healthy"),
                "providers_total": len(llm_health),
            },
            "mcp": {"tools_total": len(mcp_tools)},
        }


def get_financial_command_center_data() -> Dict[str, Any]:
    engine = get_database_engine()
    with engine.connect() as conn:
        wallet_row = conn.execute(sa.text("""
            SELECT COALESCE(SUM(balance), 0) AS total_balance,
                   COALESCE(SUM(reserved_balance), 0) AS total_reserved
            FROM tenant_credit_wallet;
        """)).mappings().first()
        rev_row = conn.execute(sa.text("""
            SELECT COUNT(*) AS total_invoices_paid,
                   COALESCE(SUM(amount), 0) AS total_revenue
            FROM invoices
            WHERE LOWER(status) = 'paid';
        """)).mappings().first()

        wallet_balance = float(wallet_row["total_balance"]) if wallet_row else 0.0
        reserved_balance = float(wallet_row["total_reserved"]) if wallet_row else 0.0
        total_revenue = float(rev_row["total_revenue"]) if rev_row else 0.0
        paid_count = int(rev_row["total_invoices_paid"]) if rev_row else 0
        return {
            "wallet_balance": wallet_balance,
            "currency": "IDR",
            "total_revenue": total_revenue,
            "circulating_credits": wallet_balance,
            "reserved_credits": reserved_balance,
            "total_invoices_paid": paid_count,
            "status": "operational",
            "ledger_active": True,
        }


def list_platform_tenants(limit: int = 200) -> Dict[str, Any]:
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(sa.text("""
            SELECT t.id, t.legal_name, t.display_name, t.status, t.created_at,
                   p.plan_code
            FROM tenants t
            LEFT JOIN subscription_plans p ON p.id = t.subscription_plan_id
            ORDER BY t.created_at DESC
            LIMIT :limit;
        """), {"limit": limit}).mappings().all()
        results: List[Dict[str, Any]] = []
        for row in rows:
            results.append({
                "id": str(row["id"]),
                "legal_name": row["legal_name"],
                "display_name": row["display_name"],
                "status": str(row["status"]).lower(),
                "plan_code": row["plan_code"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            })
        return {"tenants": results, "total": len(results)}
