"""
OrchestreeAI F.01-CRM Skill Implementation (PRD v2.2 Bagian 11.12.6 & 12.4)

Pusat koordinasi Pipeline Penjualan CRM, Kualifikasi BANT, Dynamic Lead Scoring,
Activity Timeline, dan Handover Persona AI.
"""

import logging
from typing import Optional, List, Dict, Any
import sqlalchemy as sa

from app.core.database import get_engine
from app.authz.pdp import SubjectContext
from orchestree.skills.f01_crm.tools import (
    register_crm_tools,
    tool_crm_lead_create,
    tool_crm_lead_update_stage,
    tool_crm_lead_record_qualification,
    tool_crm_lead_recalculate_score,
    tool_crm_activity_get_timeline,
)
from orchestree.domains.sales.lead_scoring import (
    determine_funnel_stage,
    calculate_lead_score,
    LEAD_STAGES,
    FUNNEL_STAGES,
)

logger = logging.getLogger("orchestree.skills.f01_crm.skill")


class F01CrmSkill:
    """
    Skill F.01-CRM:
    Mengelola pipeline penjualan Kanban, perhitungan skor lead terintegrasi event-driven,
    kualifikasi BANT customer, dan linimasa interaksi terpadu.
    """

    name: str = "f01_crm"
    version: str = "1.0.0"
    description: str = (
        "Perkakas Eksekutor Pipeline CRM, Manajemen Lead, Kualifikasi BANT, "
        "Dynamic Lead Scoring, dan Activity Timeline (PRD v2.2 Bagian 11.12.6)"
    )

    def register_tools(self) -> None:
        """Mendaftarkan perkakas CRM ke ToolRegistry MCP global."""
        register_crm_tools()

    async def get_pipeline_board(self, tenant_id: str) -> Dict[str, Any]:
        """
        Mengambil struktur kolom Kanban pipeline lead bertenant lengkap dengan
        rekapitulasi jumlah peluang dan total nilai deal per tahap.
        """
        engine = get_engine()
        stages_data: Dict[str, Dict[str, Any]] = {
            stage: {"stage": stage, "total_leads": 0, "total_deal_value": 0.0, "leads": []}
            for stage in LEAD_STAGES
        }

        async with engine.connect() as conn:
            query = sa.text("""
                SELECT 
                    l.id, l.title, l.company_name, l.contact_name, l.contact_phone,
                    l.contact_email, l.stage, l.funnel_stage, l.lead_score, l.temperature,
                    l.deal_value, l.source, l.channel_type, l.tags, l.last_activity_at,
                    l.created_at, a.display_name as assigned_agent_name
                FROM leads l
                LEFT JOIN ai_agents a ON a.id = l.assigned_agent_id
                WHERE l.tenant_id = :tenant_id
                ORDER BY l.lead_score DESC, l.last_activity_at DESC;
            """)
            res = await conn.execute(query, {"tenant_id": tenant_id})
            rows = [dict(r) for r in res.mappings().all()]

            for row in rows:
                st = row["stage"]
                if st in stages_data:
                    lead_dict = {
                        "id": str(row["id"]),
                        "title": row["title"],
                        "company_name": row["company_name"],
                        "contact_name": row["contact_name"],
                        "contact_phone": row["contact_phone"],
                        "contact_email": row["contact_email"],
                        "stage": row["stage"],
                        "funnel_stage": row["funnel_stage"],
                        "lead_score": float(row["lead_score"]),
                        "temperature": row["temperature"],
                        "deal_value": float(row["deal_value"] or 0.0),
                        "source": row["source"],
                        "channel_type": row["channel_type"],
                        "assigned_agent_name": row["assigned_agent_name"],
                        "last_activity_at": str(row["last_activity_at"]),
                        "created_at": str(row["created_at"]),
                    }
                    stages_data[st]["leads"].append(lead_dict)
                    stages_data[st]["total_leads"] += 1
                    stages_data[st]["total_deal_value"] += float(row["deal_value"] or 0.0)

        total_leads_count = sum(s["total_leads"] for s in stages_data.values())
        total_pipeline_val = sum(s["total_deal_value"] for s in stages_data.values())

        return {
            "tenant_id": tenant_id,
            "total_leads": total_leads_count,
            "total_pipeline_value": total_pipeline_val,
            "stages": list(stages_data.values()),
        }


def get_crm_skill() -> F01CrmSkill:
    return F01CrmSkill()
