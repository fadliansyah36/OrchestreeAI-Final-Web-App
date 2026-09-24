"""
OrchestreeAI CRM & Leads Management Router (PRD v2.2 Bagian 11 & 12)
Endpoint:
- GET /api/v1/tenants/{tenant_id}/crm/pipeline
- GET /api/v1/tenants/{tenant_id}/crm/leads
- POST /api/v1/tenants/{tenant_id}/crm/leads
- GET /api/v1/tenants/{tenant_id}/crm/leads/{lead_id}
- GET /api/v1/tenants/{tenant_id}/crm/leads/{lead_id}/timeline
- PATCH /api/v1/tenants/{tenant_id}/crm/leads/{lead_id}/stage
- POST /api/v1/tenants/{tenant_id}/crm/leads/{lead_id}/qualification
- POST /api/v1/tenants/{tenant_id}/crm/leads/{lead_id}/recalculate
- GET /api/v1/tenants/{tenant_id}/crm/personas
- PATCH /api/v1/tenants/{tenant_id}/crm/personas/{agent_id}/config
- GET /api/v1/tenants/{tenant_id}/crm/persona-rules
- POST /api/v1/tenants/{tenant_id}/crm/persona-rules
- DELETE /api/v1/tenants/{tenant_id}/crm/persona-rules/{rule_id}
- GET /api/v1/tenants/{tenant_id}/crm/persona-handovers
- POST /api/v1/tenants/{tenant_id}/crm/persona-handovers
"""

from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_database_engine
from app.authz.pdp import require_capability
from app.domains.sales.lead_scoring import (
    determine_funnel_stage,
    calculate_lead_score,
    LEAD_STAGES,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["CRM & Leads Management"],
    dependencies=[Depends(require_capability("crm.leads.manage"))]
)


# --- Schemas ---

class CreateLeadRequest(BaseModel):
    title: str = Field(..., min_length=2)
    contact_name: str = Field(..., min_length=2)
    company_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    deal_value: float = Field(default=0.0, ge=0)
    channel_type: str = Field(default="whatsapp")
    source: str = Field(default="INBOUND_CHAT")


class UpdateLeadStageRequest(BaseModel):
    stage: str


class QualificationAnswerRequest(BaseModel):
    question_key: str
    question_text: str
    answer_text: str
    score_weight: float = 12.5


class PersonaConfigRequest(BaseModel):
    tone: Optional[str] = None
    qualification_questions: Optional[List[str]] = None
    score_triggers: Optional[Dict[str, Any]] = None
    handoff_instruction: Optional[str] = None


class CreatePersonaRuleRequest(BaseModel):
    rule_name: str
    source_agent_id: Optional[str] = None
    target_agent_id: Optional[str] = None
    condition_type: str
    condition_params: Optional[Dict[str, Any]] = None
    priority: int = 10
    is_active: bool = True


class TestHandoverRequest(BaseModel):
    conversation_id: str
    source_agent_id: Optional[str] = None
    target_agent_id: Optional[str] = None
    handover_reason: str
    summary_context: str


# --- Endpoints Leads & Pipeline ---

@router.get("/tenants/{tenant_id}/crm/pipeline")
async def get_crm_pipeline(tenant_id: str):
    """Mengambil matriks pipeline Kanban CRM dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, customer_id, title, company_name, contact_name,
                       contact_phone, contact_email, stage, lead_score, temperature,
                       funnel_stage, deal_value, currency, assigned_agent_id,
                       assigned_membership_id, channel_type, source, created_at, updated_at
                FROM leads
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC;
            """),
            {"tenant_id": tenant_id}
        ).mappings().fetchall()

        all_leads = [dict(r) for r in rows]
        
        stage_definitions = [
            ("NEW", "Lead Baru"),
            ("CONTACTED", "Terkontak"),
            ("QUALIFYING", "Kualifikasi"),
            ("QUALIFIED", "Terkualifikasi"),
            ("PROPOSAL", "Proposal"),
            ("NEGOTIATION", "Negosiasi"),
            ("WON", "Menang / Beli"),
            ("LOST", "Hilang / Batal"),
        ]

        stages_result = []
        total_leads = len(all_leads)
        total_val = 0.0
        hot_count = 0
        score_sum = 0.0

        for stage_code, stage_name in stage_definitions:
            stage_leads = [l for l in all_leads if (l.get("stage") or "NEW").upper() == stage_code]
            stage_val = sum(float(l.get("deal_value") or 0.0) for l in stage_leads)
            total_val += stage_val

            stages_result.append({
                "stage": stage_code,
                "name": stage_name,
                "count": len(stage_leads),
                "total_value": stage_val,
                "leads": stage_leads
            })

        for l in all_leads:
            score = float(l.get("lead_score") or 0.0)
            score_sum += score
            if score >= 70.0 or (l.get("temperature") or "").upper() == "HOT":
                hot_count += 1

        avg_score = round(score_sum / total_leads, 1) if total_leads > 0 else 0.0

        return {
            "status": "success",
            "data": {
                "stages": stages_result,
                "total_leads": total_leads,
                "total_pipeline_value": total_val,
                "hot_leads_count": hot_count,
                "average_score": avg_score
            }
        }


@router.get("/tenants/{tenant_id}/crm/leads")
async def list_leads(tenant_id: str, stage: Optional[str] = Query(None)):
    """Mengambil daftar leads bertenant dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        query = """
            SELECT id, tenant_id, customer_id, title, company_name, contact_name,
                   contact_phone, contact_email, stage, lead_score, temperature,
                   funnel_stage, deal_value, currency, assigned_agent_id,
                   assigned_membership_id, channel_type, source, created_at, updated_at
            FROM leads
            WHERE tenant_id = :tenant_id
        """
        params = {"tenant_id": tenant_id}
        if stage:
            query += " AND stage = :stage"
            params["stage"] = stage
        query += " ORDER BY created_at DESC;"
        rows = conn.execute(sa.text(query), params).mappings().fetchall()
        return {"status": "success", "data": [dict(r) for r in rows]}


@router.post("/tenants/{tenant_id}/crm/leads", status_code=status.HTTP_201_CREATED)
async def create_lead(tenant_id: str, payload: CreateLeadRequest):
    """Membuat lead baru di Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            lead_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO leads (
                        id, tenant_id, title, contact_name, company_name,
                        contact_phone, contact_email, deal_value, channel_type, source,
                        stage, lead_score, temperature, funnel_stage, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :title, :contact_name, :company_name,
                        :contact_phone, :contact_email, :deal_value, :channel_type, :source,
                        'NEW', 15.0, 'COLD', 'AWARENESS', now(), now()
                    );
                """),
                {
                    "id": lead_id,
                    "tenant_id": tenant_id,
                    "title": payload.title,
                    "contact_name": payload.contact_name,
                    "company_name": payload.company_name,
                    "contact_phone": payload.contact_phone,
                    "contact_email": payload.contact_email,
                    "deal_value": payload.deal_value,
                    "channel_type": payload.channel_type,
                    "source": payload.source,
                }
            )

            # Catat riwayat score awal
            conn.execute(
                sa.text("""
                    INSERT INTO lead_score_history (id, tenant_id, lead_id, old_score, new_score, trigger_event, reason, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :lead_id, 0.0, 15.0, 'LEAD_CREATED', 'Inisiasi lead baru', now());
                """),
                {"tenant_id": tenant_id, "lead_id": lead_id}
            )

            row = conn.execute(sa.text("SELECT * FROM leads WHERE id = :id;"), {"id": lead_id}).mappings().first()
            return {"status": "success", "data": dict(row)}


@router.get("/tenants/{tenant_id}/crm/leads/{lead_id}")
async def get_lead_detail(tenant_id: str, lead_id: str):
    """Mengambil rincian lead dan kualifikasi BANT dari basis data nyata."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        lead_row = conn.execute(
            sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id;"),
            {"id": lead_id, "tenant_id": tenant_id}
        ).mappings().first()

        if not lead_row:
            raise HTTPException(status_code=404, detail="Lead tidak ditemukan.")

        answers = conn.execute(
            sa.text("SELECT * FROM lead_qualification_answers WHERE lead_id = :lead_id ORDER BY created_at ASC;"),
            {"lead_id": lead_id}
        ).mappings().fetchall()

        data = dict(lead_row)
        data["qualification_answers"] = [dict(a) for a in answers]
        return {"status": "success", "data": data}


@router.get("/tenants/{tenant_id}/crm/leads/{lead_id}/timeline")
async def get_lead_timeline(tenant_id: str, lead_id: str):
    """Mengambil riwayat audit scoring dan timeline aktivitas lead."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        rows = conn.execute(
            sa.text("""
                SELECT id, trigger_event, old_score, new_score, reason, created_at
                FROM lead_score_history
                WHERE lead_id = :lead_id
                ORDER BY created_at DESC;
            """),
            {"lead_id": lead_id}
        ).mappings().fetchall()

        return {"status": "success", "data": [dict(r) for r in rows]}


@router.patch("/tenants/{tenant_id}/crm/leads/{lead_id}/stage")
async def update_lead_stage(tenant_id: str, lead_id: str, payload: UpdateLeadStageRequest):
    """Memperbarui tahap lead dan menghitung ulang tahap funnel."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            lead = conn.execute(
                sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": lead_id, "tenant_id": tenant_id}
            ).mappings().first()
            if not lead:
                raise HTTPException(status_code=404, detail="Lead tidak ditemukan.")

            new_funnel = determine_funnel_stage(
                lead_stage=payload.stage.upper(),
                deal_value=float(lead.get("deal_value") or 0.0)
            )

            conn.execute(
                sa.text("""
                    UPDATE leads
                    SET stage = :stage, funnel_stage = :funnel, updated_at = now()
                    WHERE id = :id;
                """),
                {"stage": payload.stage.upper(), "funnel": new_funnel, "id": lead_id}
            )

            conn.execute(
                sa.text("""
                    INSERT INTO lead_score_history (id, tenant_id, lead_id, old_score, new_score, trigger_event, reason, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :lead_id, :score, :score, 'STAGE_CHANGE', :reason, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "score": float(lead.get("lead_score") or 0.0),
                    "reason": f"Perubahan tahap pipeline ke {payload.stage.upper()}"
                }
            )

            updated = conn.execute(sa.text("SELECT * FROM leads WHERE id = :id;"), {"id": lead_id}).mappings().first()
            return {"status": "success", "data": dict(updated)}


@router.post("/tenants/{tenant_id}/crm/leads/{lead_id}/qualification")
async def record_lead_qualification(tenant_id: str, lead_id: str, payload: QualificationAnswerRequest):
    """Mencatat jawaban kualifikasi lead dan memperbarui skor secara matematis."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            lead = conn.execute(
                sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": lead_id, "tenant_id": tenant_id}
            ).mappings().first()
            if not lead:
                raise HTTPException(status_code=404, detail="Lead tidak ditemukan.")

            ans_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO lead_qualification_answers (
                        id, tenant_id, lead_id, question_key, question_text, answer_text, score_contribution, created_at
                    ) VALUES (
                        :id, :tenant_id, :lead_id, :key, :text, :ans, :weight, now()
                    );
                """),
                {
                    "id": ans_id,
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "key": payload.question_key,
                    "text": payload.question_text,
                    "ans": payload.answer_text,
                    "weight": payload.score_weight
                }
            )

            # Hitung total skor dari semua jawaban kualifikasi
            answers = conn.execute(
                sa.text("SELECT score_contribution, question_key FROM lead_qualification_answers WHERE lead_id = :lead_id;"),
                {"lead_id": lead_id}
            ).mappings().fetchall()

            raw_score = sum(float(a.get("score_contribution") or 0.0) for a in answers)
            base_score = 20.0
            new_score = min(100.0, base_score + raw_score)
            new_temp = "HOT" if new_score >= 70.0 else ("WARM" if new_score >= 40.0 else "COLD")
            new_funnel = "DECISION" if new_score >= 60.0 else ("INTEREST" if new_score >= 30.0 else "AWARENESS")

            old_score = float(lead.get("lead_score") or 0.0)
            conn.execute(
                sa.text("""
                    UPDATE leads
                    SET lead_score = :score, temperature = :temp, funnel_stage = :funnel, updated_at = now()
                    WHERE id = :id;
                """),
                {"score": new_score, "temp": new_temp, "funnel": new_funnel, "id": lead_id}
            )

            conn.execute(
                sa.text("""
                    INSERT INTO lead_score_history (id, tenant_id, lead_id, old_score, new_score, trigger_event, reason, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :lead_id, :old, :new, 'QUALIFICATION_ANSWER', :reason, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "old": old_score,
                    "new": new_score,
                    "reason": f"Jawaban kualifikasi: {payload.question_key}"
                }
            )

            updated = conn.execute(sa.text("SELECT * FROM leads WHERE id = :id;"), {"id": lead_id}).mappings().first()
            return {"status": "success", "data": dict(updated)}


@router.post("/tenants/{tenant_id}/crm/leads/{lead_id}/recalculate")
async def recalculate_lead_score(tenant_id: str, lead_id: str):
    """Menghitung ulang skor lead dari parameter database terkini."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            lead = conn.execute(
                sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": lead_id, "tenant_id": tenant_id}
            ).mappings().first()
            if not lead:
                raise HTTPException(status_code=404, detail="Lead tidak ditemukan.")

            answers = conn.execute(
                sa.text("SELECT score_contribution FROM lead_qualification_answers WHERE lead_id = :lead_id;"),
                {"lead_id": lead_id}
            ).mappings().fetchall()

            raw_score = sum(float(a.get("score_contribution") or 0.0) for a in answers)
            new_score = min(100.0, 20.0 + raw_score)
            new_temp = "HOT" if new_score >= 70.0 else ("WARM" if new_score >= 40.0 else "COLD")

            conn.execute(
                sa.text("UPDATE leads SET lead_score = :score, temperature = :temp, updated_at = now() WHERE id = :id;"),
                {"score": new_score, "temp": new_temp, "id": lead_id}
            )

            updated = conn.execute(sa.text("SELECT * FROM leads WHERE id = :id;"), {"id": lead_id}).mappings().first()
            return {"status": "success", "data": dict(updated)}


# --- Endpoints Persona & Handover Rules ---

@router.get("/tenants/{tenant_id}/crm/personas")
async def list_crm_personas(tenant_id: str):
    """Mengambil daftar persona AI Agent dan konfigurasinya dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, display_name, persona_type, status, persona_config, created_at, updated_at
                FROM ai_agents
                WHERE tenant_id = :tenant_id
                ORDER BY display_name ASC;
            """),
            {"tenant_id": tenant_id}
        ).mappings().fetchall()

        return {"status": "success", "data": [dict(r) for r in rows]}


@router.patch("/tenants/{tenant_id}/crm/personas/{agent_id}/config")
async def update_persona_config(tenant_id: str, agent_id: str, payload: PersonaConfigRequest):
    """Memperbarui konfigurasi persona AI Agent (tone, pertanyaan BANT, score triggers)."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            cfg_dict = payload.model_dump(exclude_unset=True)
            conn.execute(
                sa.text("""
                    UPDATE ai_agents
                    SET persona_config = :config, updated_at = now()
                    WHERE id = :id AND tenant_id = :tenant_id;
                """),
                {"config": json.dumps(cfg_dict), "id": agent_id, "tenant_id": tenant_id}
            )

            row = conn.execute(
                sa.text("SELECT id, tenant_id, display_name, persona_type, status, persona_config FROM ai_agents WHERE id = :id;"),
                {"id": agent_id}
            ).mappings().first()
            return {"status": "success", "data": dict(row)}


@router.get("/tenants/{tenant_id}/crm/persona-rules")
async def list_persona_rules(tenant_id: str):
    """Mengambil daftar aturan handover antar persona dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, source_persona_type, target_persona_type,
                       condition_type, condition_config, priority, is_active, created_at, updated_at
                FROM persona_handoff_rules
                WHERE tenant_id = :tenant_id
                ORDER BY priority ASC, created_at DESC;
            """),
            {"tenant_id": tenant_id}
        ).mappings().fetchall()

        return {"status": "success", "data": [dict(r) for r in rows]}


@router.post("/tenants/{tenant_id}/crm/persona-rules", status_code=status.HTTP_201_CREATED)
async def create_persona_rule(tenant_id: str, payload: CreatePersonaRuleRequest):
    """Membuat aturan handover baru di tabel persona_handoff_rules."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            rule_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO persona_handoff_rules (
                        id, tenant_id, source_persona_type, target_persona_type,
                        condition_type, condition_config, priority, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :source, :target,
                        :cond_type, :cond_cfg, :prio, :active, now(), now()
                    );
                """),
                {
                    "id": rule_id,
                    "tenant_id": tenant_id,
                    "source": payload.source_agent_id or "RECEPTIONIST",
                    "target": payload.target_agent_id or "SDR",
                    "cond_type": payload.condition_type,
                    "cond_cfg": json.dumps(payload.condition_params or {}),
                    "prio": payload.priority,
                    "active": payload.is_active
                }
            )

            row = conn.execute(sa.text("SELECT * FROM persona_handoff_rules WHERE id = :id;"), {"id": rule_id}).mappings().first()
            return {"status": "success", "data": dict(row)}


@router.delete("/tenants/{tenant_id}/crm/persona-rules/{rule_id}")
async def delete_persona_rule(tenant_id: str, rule_id: str):
    """Menghapus aturan handover persona dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            conn.execute(
                sa.text("DELETE FROM persona_handoff_rules WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": rule_id, "tenant_id": tenant_id}
            )
            return {"status": "success", "message": "Aturan handover berhasil dihapus."}


@router.get("/tenants/{tenant_id}/crm/persona-handovers")
async def list_persona_handovers(tenant_id: str, limit: int = Query(30, ge=1, le=100)):
    """Mengambil riwayat handover persona dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        # Ambil dari task_events atau log alur kerja
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, task_id as conversation_id, actor_id, payload, created_at
                FROM task_events
                WHERE tenant_id = :tenant_id AND event_type = 'persona_handover'
                ORDER BY created_at DESC
                LIMIT :limit;
            """),
            {"tenant_id": tenant_id, "limit": limit}
        ).mappings().fetchall()

        handovers = []
        for r in rows:
            p = r["payload"] if isinstance(r["payload"], dict) else {}
            handovers.append({
                "id": str(r["id"]),
                "conversation_id": str(r["conversation_id"]),
                "source_agent_name": p.get("from_agent", "Receptionist"),
                "target_agent_name": p.get("to_agent", "Sales Specialist"),
                "handover_reason": p.get("reason", "Kualifikasi tercapai"),
                "summary_context": p.get("summary_context", ""),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None
            })

        return {"status": "success", "data": handovers}


@router.post("/tenants/{tenant_id}/crm/persona-handovers")
async def test_or_dispatch_handover(tenant_id: str, payload: TestHandoverRequest):
    """Mengeksekusi handover persona dan mencatatnya ke audit ledger Supabase."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            event_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO task_events (
                        id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at
                    ) VALUES (
                        :id, :tenant_id, gen_random_uuid(), 'persona_handover', 'ai_agent', 'system', :payload, now()
                    );
                """),
                {
                    "id": event_id,
                    "tenant_id": tenant_id,
                    "payload": json.dumps({
                        "from_agent": payload.source_agent_id or "Receptionist",
                        "to_agent": payload.target_agent_id or "Sales Specialist",
                        "reason": payload.handover_reason,
                        "summary_context": payload.summary_context,
                        "conversation_id": payload.conversation_id,
                    })
                }
            )

    return {
        "status": "success",
        "message": "Handover persona berhasil dieksekusi.",
        "data": {
            "handover_id": event_id,
            "conversation_id": payload.conversation_id,
            "source_agent": payload.source_agent_id,
            "target_agent": payload.target_agent_id,
            "handover_reason": payload.handover_reason,
            "status": "DISPATCHED"
        }
    }
