"""
Retroactive Boundary Classification & Audit Script (PRD v2.2 Bagian C).

Menjalankan klasifikasi retroaktif untuk:
1. memory_documents:
   - Kategori publik (Product Catalog, FAQ, Pricing Policy) -> customer_facing_safe
   - Kategori internal (SOP, HR, Finance, Competitive Intelligence) -> internal_only (default aman)
   - Dokumen ambigu ditandai untuk peninjauan Admin (tidak diubah otomatis)
2. ai_agents:
   - Ditandai sesuai assignment aktif (channel_accounts -> customer_facing; Proactive -> internal)
   - Memeriksa apakah ada agen yang ter-assign ke KEDUANYA (konflik dual-context)
3. mcp_tools:
   - Mengklasifikasikan context_scope per tool (customer_facing_allowed vs internal_only)
"""

import os
import json
import logging
from typing import Dict, Any, List, Tuple
import sqlalchemy as sa

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("orchestree.retroactive_classification")


def run_retroactive_boundary_audit(db_engine=None, dry_run: bool = True) -> Dict[str, Any]:
    """Menjalankan audit dan klasifikasi retroaktif strict boundary."""
    if db_engine is None:
        from app.core.database import get_database_engine
        db_engine = get_database_engine()

    report: Dict[str, Any] = {
        "dry_run": dry_run,
        "memory_classification": {
            "customer_facing_safe": [],
            "internal_only": [],
            "ambiguous_pending_admin_review": [],
        },
        "ai_agents_audit": {
            "customer_facing": [],
            "internal": [],
            "dual_context_conflicts": [],
        },
        "mcp_tools_classification": {
            "customer_facing_allowed": [],
            "internal_only": [],
        },
    }

    CUSTOMER_SAFE_CATEGORIES = {
        "product_catalog",
        "product",
        "catalog",
        "faq",
        "public_pricing",
        "public_policy",
        "shipping_rates",
    }

    INTERNAL_CATEGORIES = {
        "sop",
        "hr",
        "finance",
        "financial",
        "competitive_intelligence",
        "competitor",
        "staff_scoring",
        "internal_operations",
        "security",
        "management_query",
    }

    CUSTOMER_ALLOWED_TOOL_NAMES = {
        "knowledge.lookup",
        "crm.contact_verify",
        "product.recommend",
        "product.search",
        "product.catalog.view",
        "cart.create",
        "cart.update",
        "cart.view",
        "order.status_lookup",
    }

    with db_engine.begin() as conn:
        # =====================================================================
        # 1. Audit & Klasifikasi memory_documents
        # =====================================================================
        try:
            doc_rows = conn.execute(
                sa.text("""
                    SELECT id, tenant_id, title, category, data_classification, 
                           COALESCE(audience_scope, 'internal_only') as current_scope
                    FROM memory_documents
                """)
            ).mappings().all()

            for d in doc_rows:
                doc_id = str(d["id"])
                cat = (d["category"] or "").lower().strip()
                title = (d["title"] or "").lower().strip()
                classif = (d["data_classification"] or "").lower().strip()

                is_safe = cat in CUSTOMER_SAFE_CATEGORIES or "katalog" in title or "faq" in title or "harga" in title
                is_internal = cat in INTERNAL_CATEGORIES or classif in ("confidential", "restricted") or "gaji" in title or "sop" in title or "kinerja" in title

                if is_safe and not is_internal:
                    report["memory_classification"]["customer_facing_safe"].append({
                        "id": doc_id,
                        "title": d["title"],
                        "category": d["category"],
                        "assigned_scope": "customer_facing_safe",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE memory_documents SET audience_scope = 'customer_facing_safe' WHERE id = :id"),
                            {"id": doc_id},
                        )
                elif is_internal and not is_safe:
                    report["memory_classification"]["internal_only"].append({
                        "id": doc_id,
                        "title": d["title"],
                        "category": d["category"],
                        "assigned_scope": "internal_only",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE memory_documents SET audience_scope = 'internal_only' WHERE id = :id"),
                            {"id": doc_id},
                        )
                else:
                    # Dokumen ambigu: default aman internal_only dan tandai untuk review Admin
                    report["memory_classification"]["ambiguous_pending_admin_review"].append({
                        "id": doc_id,
                        "title": d["title"],
                        "category": d["category"],
                        "data_classification": d["data_classification"],
                        "current_scope": d["current_scope"],
                        "action_required": "Admin manual review needed",
                    })
        except Exception as e:
            logger.warning(f"Audit memory_documents dilewati / tabel belum siap: {e}")

        # =====================================================================
        # 2. Audit & Klasifikasi ai_agents
        # =====================================================================
        try:
            agent_rows = conn.execute(
                sa.text("""
                    SELECT id, tenant_id, name, persona_type, 
                           COALESCE(context_scope, 'internal') as current_scope
                    FROM ai_agents
                """)
            ).mappings().all()

            # Ambil agent yang terpasang di channel_accounts (Omnichannel)
            assigned_omni_agents = set()
            try:
                omni_rows = conn.execute(
                    sa.text("SELECT DISTINCT ai_persona_id FROM channel_account_persona_assignments")
                ).fetchall()
                assigned_omni_agents = {str(r[0]) for r in omni_rows}
            except Exception:
                pass

            # Ambil agent yang terpasang di Proactive channels / internal
            assigned_proactive_agents = set()
            try:
                proactive_rows = conn.execute(
                    sa.text("SELECT DISTINCT (metadata->>'assigned_agent_id') as agent_id FROM proactive_official_channels WHERE metadata->>'assigned_agent_id' IS NOT NULL")
                ).fetchall()
                assigned_proactive_agents = {str(r[0]) for r in proactive_rows if r[0]}
            except Exception:
                pass

            for a in agent_rows:
                agent_id = str(a["id"])
                is_in_omni = agent_id in assigned_omni_agents
                is_in_proactive = agent_id in assigned_proactive_agents
                persona = (a["persona_type"] or "").lower()

                if is_in_omni and is_in_proactive:
                    report["ai_agents_audit"]["dual_context_conflicts"].append({
                        "id": agent_id,
                        "name": a["name"],
                        "persona_type": a["persona_type"],
                        "violation": "DUAL_CONTEXT_CONFLICT: Agen terpasang di Omnichannel dan Proactive sekaligus. Wajib diduplikasi menjadi dua instance terpisah.",
                    })
                elif is_in_omni or "sales" in persona or "customer" in persona or "receptionist" in persona:
                    report["ai_agents_audit"]["customer_facing"].append({
                        "id": agent_id,
                        "name": a["name"],
                        "persona_type": a["persona_type"],
                        "assigned_scope": "customer_facing",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE ai_agents SET context_scope = 'customer_facing' WHERE id = :id"),
                            {"id": agent_id},
                        )
                else:
                    report["ai_agents_audit"]["internal"].append({
                        "id": agent_id,
                        "name": a["name"],
                        "persona_type": a["persona_type"],
                        "assigned_scope": "internal",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE ai_agents SET context_scope = 'internal' WHERE id = :id"),
                            {"id": agent_id},
                        )
        except Exception as e:
            logger.warning(f"Audit ai_agents dilewati / tabel belum siap: {e}")

        # =====================================================================
        # 3. Audit & Klasifikasi mcp_tools
        # =====================================================================
        try:
            tool_rows = conn.execute(
                sa.text("""
                    SELECT id, name, category, risk_tier, 
                           COALESCE(context_scope, 'internal_only') as current_scope
                    FROM mcp_tools
                """)
            ).mappings().all()

            for t in tool_rows:
                t_name = t["name"]
                if t_name in CUSTOMER_ALLOWED_TOOL_NAMES:
                    report["mcp_tools_classification"]["customer_facing_allowed"].append({
                        "name": t_name,
                        "category": t["category"],
                        "risk_tier": t["risk_tier"],
                        "assigned_scope": "customer_facing_allowed",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE mcp_tools SET context_scope = 'customer_facing_allowed' WHERE name = :name"),
                            {"name": t_name},
                        )
                else:
                    report["mcp_tools_classification"]["internal_only"].append({
                        "name": t_name,
                        "category": t["category"],
                        "risk_tier": t["risk_tier"],
                        "assigned_scope": "internal_only",
                    })
                    if not dry_run:
                        conn.execute(
                            sa.text("UPDATE mcp_tools SET context_scope = 'internal_only' WHERE name = :name"),
                            {"name": t_name},
                        )
        except Exception as e:
            logger.warning(f"Audit mcp_tools dilewati / tabel belum siap: {e}")

    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Retroactive Boundary Classification & Audit")
    parser.add_argument("--execute", action="store_true", help="Jalankan update nyata ke database (bukan dry-run)")
    args = parser.parse_args()

    res = run_retroactive_boundary_audit(dry_run=not args.execute)
    print(json.dumps(res, indent=2))
