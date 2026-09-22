"""
OrchestreeAI F.01-CRM Skill MCP Tools (PRD v2.2 Bagian 11.12.6 & 12.4)

Perkakas Manajemen CRM, Pipeline Penjualan, Kualifikasi BANT, dan Activity Timeline:
1. crm.lead.create: Membuat atau mendaftarkan peluang lead baru.
2. crm.lead.update_stage: Memperbarui tahap pipeline lead secara transaksional.
3. crm.lead.record_qualification: Mencatat jawaban kualifikasi BANT & memicu evaluasi skor.
4. crm.lead.recalculate_score: Memicu kalkulasi ulang skor lead dan update suhu (COLD/WARM/HOT).
5. crm.activity.get_timeline: Mengambil linimasa aktivitas terpadu (pesan, jawaban kualifikasi, skor, handover).
6. crm.pipeline.get_board: Mengambil status kolom Kanban pipeline penjualan.
"""

import json
import uuid
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine
from app.skills.f01_mcp.decorators import mcp_tool, ToolExecutionContext
from orchestree.domains.sales.lead_scoring import (
    determine_funnel_stage,
    calculate_lead_score,
    record_score_update_and_notify,
    LEAD_STAGES,
)

logger = logging.getLogger("orchestree.skills.f01_crm.tools")


# --- 1. Tool: crm.lead.create ---
class CrmLeadCreateInput(BaseModel):
    title: str = Field(..., description="Judul peluang penjualan atau nama proyek")
    contact_name: str = Field(..., description="Nama lengkap kontak utama")
    company_name: Optional[str] = Field(None, description="Nama perusahaan atau organisasi")
    contact_phone: Optional[str] = Field(None, description="Nomor telepon/WhatsApp kontak")
    contact_email: Optional[str] = Field(None, description="Email kerja kontak")
    deal_value: float = Field(0.0, ge=0.0, description="Estimasi nilai transaksi dalam Rupiah")
    customer_id: Optional[str] = Field(None, description="UUID customer bila sudah terafiliasi")
    channel_type: str = Field("whatsapp", description="Saluran asal lead (whatsapp, telegram, dsb)")
    source: str = Field("INBOUND_CHAT", description="Sumber perolehan lead")


@mcp_tool(
    name="crm.lead.create",
    description="Membuat peluang lead baru di CRM dan menginisialisasi skor kualifikasi awal",
    risk_tier="low",
    category="crm",
    is_idempotent=False,
    timeout_seconds=20.0,
    input_model=CrmLeadCreateInput,
)
async def tool_crm_lead_create(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine()
    tenant_id = context.tenant_id

    lead_id = str(uuid.uuid4())
    title = input_data["title"]
    contact_name = input_data["contact_name"]
    company_name = input_data.get("company_name")
    contact_phone = input_data.get("contact_phone")
    contact_email = input_data.get("contact_email")
    deal_value = float(input_data.get("deal_value") or 0.0)
    customer_id = input_data.get("customer_id")
    channel_type = input_data.get("channel_type", "whatsapp")
    source = input_data.get("source", "INBOUND_CHAT")

    # Hitung skor awal
    initial_score, temperature, breakdown = calculate_lead_score(
        lead_data={"stage": "NEW", "deal_value": deal_value},
        qualification_answers=[],
        messages=[],
    )
    funnel_stage = determine_funnel_stage(lead_stage="NEW", deal_value=deal_value)

    async with engine.begin() as conn:
        insert_query = sa.text("""
            INSERT INTO leads (
                id, tenant_id, customer_id, title, company_name, contact_name,
                contact_phone, contact_email, stage, funnel_stage, lead_score,
                temperature, deal_value, source, channel_type, last_activity_at,
                created_at, updated_at
            ) VALUES (
                :id, :tenant_id, :customer_id, :title, :company_name, :contact_name,
                :contact_phone, :contact_email, 'NEW', :funnel_stage, :lead_score,
                :temperature, :deal_value, :source, :channel_type, now(), now(), now()
            ) RETURNING id, created_at;
        """)
        res = await conn.execute(
            insert_query,
            {
                "id": lead_id,
                "tenant_id": tenant_id,
                "customer_id": customer_id,
                "title": title,
                "company_name": company_name,
                "contact_name": contact_name,
                "contact_phone": contact_phone,
                "contact_email": contact_email,
                "funnel_stage": funnel_stage,
                "lead_score": initial_score,
                "temperature": temperature,
                "deal_value": deal_value,
                "source": source,
                "channel_type": channel_type,
            },
        )
        row = res.mappings().first()

        # Rekam ke riwayat skor awal
        await record_score_update_and_notify(
            session=conn,
            tenant_id=tenant_id,
            lead_id=lead_id,
            previous_score=0.00,
            new_score=initial_score,
            trigger_event="INITIAL_CREATION",
            trigger_details={"breakdown": breakdown},
            lead_info={
                "title": title,
                "contact_name": contact_name,
                "company_name": company_name,
                "deal_value": deal_value,
            },
            qualification_answers=[],
        )

    return {
        "lead_id": lead_id,
        "title": title,
        "stage": "NEW",
        "funnel_stage": funnel_stage,
        "lead_score": initial_score,
        "temperature": temperature,
        "deal_value": deal_value,
        "created_at": str(row["created_at"]) if row else None,
    }


# --- 2. Tool: crm.lead.update_stage ---
class CrmLeadUpdateStageInput(BaseModel):
    lead_id: str = Field(..., description="UUID lead yang akan diubah tahapnya")
    new_stage: str = Field(..., description="Tahap baru: NEW, CONTACTED, QUALIFYING, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST")


@mcp_tool(
    name="crm.lead.update_stage",
    description="Memperbarui tahap pipeline lead dan menghitung ulang skor lead serta funnel stage",
    risk_tier="low",
    category="crm",
    is_idempotent=True,
    timeout_seconds=20.0,
    input_model=CrmLeadUpdateStageInput,
)
async def tool_crm_lead_update_stage(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine()
    tenant_id = context.tenant_id
    lead_id = input_data["lead_id"]
    new_stage = input_data["new_stage"].upper()

    if new_stage not in LEAD_STAGES:
        raise ValueError(f"Tahap tidak valid: {new_stage}. Pilihan: {LEAD_STAGES}")

    async with engine.begin() as conn:
        # 1. Ambil lead saat ini
        get_lead = sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id FOR UPDATE;")
        lead_res = await conn.execute(get_lead, {"id": lead_id, "tenant_id": tenant_id})
        lead_row = lead_res.mappings().first()
        if not lead_row:
            raise ValueError(f"Lead dengan ID '{lead_id}' tidak ditemukan pada tenant ini.")

        old_stage = lead_row["stage"]
        old_score = float(lead_row["lead_score"])

        # 2. Ambil jawaban kualifikasi
        ans_res = await conn.execute(
            sa.text("SELECT * FROM lead_qualification_answers WHERE lead_id = :lead_id AND tenant_id = :tenant_id;"),
            {"lead_id": lead_id, "tenant_id": tenant_id},
        )
        answers = [dict(r) for r in ans_res.mappings().all()]

        # 3. Hitung ulang skor & funnel stage
        new_score, new_temp, breakdown = calculate_lead_score(
            lead_data=dict(lead_row),
            qualification_answers=answers,
            stage=new_stage,
        )
        new_funnel = determine_funnel_stage(
            qualification_answers=answers,
            lead_stage=new_stage,
            deal_value=float(lead_row["deal_value"] or 0.0),
        )

        # 4. Update tabel leads
        update_query = sa.text("""
            UPDATE leads
            SET stage = :stage,
                funnel_stage = :funnel_stage,
                lead_score = :lead_score,
                temperature = :temperature,
                last_activity_at = now(),
                updated_at = now()
            WHERE id = :id AND tenant_id = :tenant_id;
        """)
        await conn.execute(
            update_query,
            {
                "stage": new_stage,
                "funnel_stage": new_funnel,
                "lead_score": new_score,
                "temperature": new_temp,
                "id": lead_id,
                "tenant_id": tenant_id,
            },
        )

        # 5. Rekam riwayat skor & notifikasi jika perlu
        await record_score_update_and_notify(
            session=conn,
            tenant_id=tenant_id,
            lead_id=lead_id,
            previous_score=old_score,
            new_score=new_score,
            trigger_event="STAGE_CHANGE",
            trigger_details={
                "from_stage": old_stage,
                "to_stage": new_stage,
                "breakdown": breakdown,
            },
            lead_info=dict(lead_row),
            qualification_answers=answers,
        )

    return {
        "lead_id": lead_id,
        "previous_stage": old_stage,
        "new_stage": new_stage,
        "funnel_stage": new_funnel,
        "previous_score": old_score,
        "new_score": new_score,
        "temperature": new_temp,
    }


# --- 3. Tool: crm.lead.record_qualification ---
class CrmLeadRecordQualificationInput(BaseModel):
    lead_id: str = Field(..., description="UUID lead")
    question_key: str = Field(..., description="Kunci kualifikasi: budget, authority, need, timeline, dsb")
    question_text: str = Field(..., description="Pertanyaan kualifikasi yang diajukan")
    answer_text: str = Field(..., description="Jawaban customer")
    score_weight: float = Field(10.0, ge=1.0, le=50.0, description="Bobot kualifikasi")
    conversation_id: Optional[str] = Field(None, description="ID percakapan asal jawaban kualifikasi")


@mcp_tool(
    name="crm.lead.record_qualification",
    description="Merekam jawaban kualifikasi BANT customer dan menghitung ulang skor serta funnel stage secara dinamis",
    risk_tier="low",
    category="crm",
    is_idempotent=False,
    timeout_seconds=20.0,
    input_model=CrmLeadRecordQualificationInput,
)
async def tool_crm_lead_record_qualification(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine()
    tenant_id = context.tenant_id
    lead_id = input_data["lead_id"]
    q_key = input_data["question_key"].lower().strip()
    q_text = input_data["question_text"]
    ans_text = input_data["answer_text"]
    score_weight = float(input_data.get("score_weight") or 10.0)
    conversation_id = input_data.get("conversation_id")

    async with engine.begin() as conn:
        get_lead = sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id FOR UPDATE;")
        lead_res = await conn.execute(get_lead, {"id": lead_id, "tenant_id": tenant_id})
        lead_row = lead_res.mappings().first()
        if not lead_row:
            raise ValueError(f"Lead dengan ID '{lead_id}' tidak ditemukan.")

        old_score = float(lead_row["lead_score"])

        # Upsert jawaban kualifikasi
        upsert_ans = sa.text("""
            INSERT INTO lead_qualification_answers (
                id, tenant_id, lead_id, question_key, question_text, answer_text,
                score_weight, verified, extracted_by, conversation_id, created_at
            ) VALUES (
                gen_random_uuid(), :tenant_id, :lead_id, :question_key, :question_text, :answer_text,
                :score_weight, true, 'AI_AGENT', :conversation_id, now()
            )
            ON CONFLICT (tenant_id, lead_id, question_key) DO UPDATE
            SET answer_text = EXCLUDED.answer_text,
                question_text = EXCLUDED.question_text,
                score_weight = EXCLUDED.score_weight,
                created_at = now();
        """)
        await conn.execute(
            upsert_ans,
            {
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "question_key": q_key,
                "question_text": q_text,
                "answer_text": ans_text,
                "score_weight": score_weight,
                "conversation_id": conversation_id,
            },
        )

        # Ambil semua jawaban terbaru untuk kualifikasi
        ans_res = await conn.execute(
            sa.text("SELECT * FROM lead_qualification_answers WHERE lead_id = :lead_id AND tenant_id = :tenant_id;"),
            {"lead_id": lead_id, "tenant_id": tenant_id},
        )
        all_answers = [dict(r) for r in ans_res.mappings().all()]

        # Hitung ulang skor & funnel stage
        new_score, new_temp, breakdown = calculate_lead_score(
            lead_data=dict(lead_row),
            qualification_answers=all_answers,
        )
        new_funnel = determine_funnel_stage(
            qualification_answers=all_answers,
            lead_stage=lead_row["stage"],
            deal_value=float(lead_row["deal_value"] or 0.0),
        )

        # Update lead
        await conn.execute(
            sa.text("""
                UPDATE leads
                SET lead_score = :lead_score,
                    temperature = :temperature,
                    funnel_stage = :funnel_stage,
                    last_activity_at = now(),
                    updated_at = now()
                WHERE id = :id AND tenant_id = :tenant_id;
            """),
            {
                "lead_score": new_score,
                "temperature": new_temp,
                "funnel_stage": new_funnel,
                "id": lead_id,
                "tenant_id": tenant_id,
            },
        )

        # Catat riwayat skor & buat notifikasi Sales jika HOT
        await record_score_update_and_notify(
            session=conn,
            tenant_id=tenant_id,
            lead_id=lead_id,
            previous_score=old_score,
            new_score=new_score,
            trigger_event="QUALIFICATION_ANSWER",
            trigger_details={
                "question_key": q_key,
                "answer_text": ans_text,
                "breakdown": breakdown,
            },
            lead_info=dict(lead_row),
            qualification_answers=all_answers,
        )

    return {
        "lead_id": lead_id,
        "question_key": q_key,
        "answer_text": ans_text,
        "previous_score": old_score,
        "new_score": new_score,
        "temperature": new_temp,
        "funnel_stage": new_funnel,
    }


# --- 4. Tool: crm.lead.recalculate_score ---
class CrmLeadRecalculateInput(BaseModel):
    lead_id: str = Field(..., description="UUID lead yang akan dihitung ulang skornya")


@mcp_tool(
    name="crm.lead.recalculate_score",
    description="Menghitung ulang skor lead secara manual dan memperbarui suhu lead serta funnel stage",
    risk_tier="low",
    category="crm",
    is_idempotent=True,
    timeout_seconds=20.0,
    input_model=CrmLeadRecalculateInput,
)
async def tool_crm_lead_recalculate_score(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine()
    tenant_id = context.tenant_id
    lead_id = input_data["lead_id"]

    async with engine.begin() as conn:
        get_lead = sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id FOR UPDATE;")
        lead_res = await conn.execute(get_lead, {"id": lead_id, "tenant_id": tenant_id})
        lead_row = lead_res.mappings().first()
        if not lead_row:
            raise ValueError(f"Lead dengan ID '{lead_id}' tidak ditemukan.")

        old_score = float(lead_row["lead_score"])

        ans_res = await conn.execute(
            sa.text("SELECT * FROM lead_qualification_answers WHERE lead_id = :lead_id AND tenant_id = :tenant_id;"),
            {"lead_id": lead_id, "tenant_id": tenant_id},
        )
        answers = [dict(r) for r in ans_res.mappings().all()]

        new_score, new_temp, breakdown = calculate_lead_score(
            lead_data=dict(lead_row),
            qualification_answers=answers,
        )
        new_funnel = determine_funnel_stage(
            qualification_answers=answers,
            lead_stage=lead_row["stage"],
            deal_value=float(lead_row["deal_value"] or 0.0),
        )

        await conn.execute(
            sa.text("""
                UPDATE leads
                SET lead_score = :lead_score,
                    temperature = :temperature,
                    funnel_stage = :funnel_stage,
                    last_activity_at = now(),
                    updated_at = now()
                WHERE id = :id AND tenant_id = :tenant_id;
            """),
            {
                "lead_score": new_score,
                "temperature": new_temp,
                "funnel_stage": new_funnel,
                "id": lead_id,
                "tenant_id": tenant_id,
            },
        )

        await record_score_update_and_notify(
            session=conn,
            tenant_id=tenant_id,
            lead_id=lead_id,
            previous_score=old_score,
            new_score=new_score,
            trigger_event="MANUAL_RECALC",
            trigger_details={"breakdown": breakdown},
            lead_info=dict(lead_row),
            qualification_answers=answers,
        )

    return {
        "lead_id": lead_id,
        "previous_score": old_score,
        "new_score": new_score,
        "temperature": new_temp,
        "funnel_stage": new_funnel,
        "breakdown": breakdown,
    }


# --- 5. Tool: crm.activity.get_timeline ---
class CrmActivityTimelineInput(BaseModel):
    lead_id: str = Field(..., description="UUID lead yang diminta linimasa aktivitasnya")
    limit: int = Field(50, ge=1, le=100, description="Jumlah aktivitas maksimum")


@mcp_tool(
    name="crm.activity.get_timeline",
    description="Mengambil linimasa aktivitas terpadu interaksi lead (perubahan skor, kualifikasi, transisi tahap, dan handover persona)",
    risk_tier="low",
    category="crm",
    is_idempotent=True,
    timeout_seconds=20.0,
    input_model=CrmActivityTimelineInput,
)
async def tool_crm_activity_get_timeline(context: ToolExecutionContext, input_data: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine()
    tenant_id = context.tenant_id
    lead_id = input_data["lead_id"]
    limit = input_data.get("limit", 50)

    events: List[Dict[str, Any]] = []

    async with engine.connect() as conn:
        # 1. Lead info
        get_lead = sa.text("SELECT * FROM leads WHERE id = :id AND tenant_id = :tenant_id;")
        lead_res = await conn.execute(get_lead, {"id": lead_id, "tenant_id": tenant_id})
        lead_row = lead_res.mappings().first()
        if not lead_row:
            raise ValueError(f"Lead '{lead_id}' tidak ditemukan.")

        events.append({
            "id": f"lead_created_{lead_row['id']}",
            "type": "LEAD_CREATED",
            "title": "Peluang Baru Didaftarkan",
            "description": f"Lead '{lead_row['title']}' dibuat via {lead_row['source']} ({lead_row['channel_type']})",
            "timestamp": str(lead_row["created_at"]),
            "metadata": {
                "contact_name": lead_row["contact_name"],
                "company_name": lead_row["company_name"],
                "deal_value": float(lead_row["deal_value"] or 0.0),
            },
        })

        # 2. Riwayat Skor
        score_res = await conn.execute(
            sa.text("SELECT * FROM lead_score_history WHERE lead_id = :lead_id AND tenant_id = :tenant_id ORDER BY created_at ASC;"),
            {"lead_id": lead_id, "tenant_id": tenant_id},
        )
        for row in score_res.mappings().all():
            events.append({
                "id": str(row["id"]),
                "type": "SCORE_UPDATE",
                "title": f"Skor Diperbarui: {float(row['new_score']):.1f} ({'+' if float(row['delta']) >= 0 else ''}{float(row['delta']):.1f})",
                "description": f"Kalkulasi ulang otomatis dipicu oleh event: {row['trigger_event']}",
                "timestamp": str(row["created_at"]),
                "metadata": {
                    "previous_score": float(row["previous_score"]),
                    "new_score": float(row["new_score"]),
                    "delta": float(row["delta"]),
                    "trigger_event": row["trigger_event"],
                    "trigger_details": row["trigger_details"],
                },
            })

        # 3. Jawaban Kualifikasi
        qual_res = await conn.execute(
            sa.text("SELECT * FROM lead_qualification_answers WHERE lead_id = :lead_id AND tenant_id = :tenant_id ORDER BY created_at ASC;"),
            {"lead_id": lead_id, "tenant_id": tenant_id},
        )
        for row in qual_res.mappings().all():
            events.append({
                "id": str(row["id"]),
                "type": "QUALIFICATION_ANSWER",
                "title": f"Kualifikasi BANT: {str(row['question_key']).upper()}",
                "description": f"Q: {row['question_text']} — A: {row['answer_text']}",
                "timestamp": str(row["created_at"]),
                "metadata": {
                    "question_key": row["question_key"],
                    "question_text": row["question_text"],
                    "answer_text": row["answer_text"],
                    "extracted_by": row["extracted_by"],
                },
            })

    # Sort descending by timestamp
    events.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "lead_id": lead_id,
        "total_events": len(events),
        "timeline": events[:limit],
    }


def register_crm_tools() -> None:
    """Registrasi perkakas F.01-CRM ke ToolRegistry global."""
    logger.info("F.01-CRM tools terdaftar di registry global MCP.")
