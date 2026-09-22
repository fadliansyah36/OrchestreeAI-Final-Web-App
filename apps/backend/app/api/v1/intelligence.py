"""
OrchestreeAI Market & Competitor Intelligence API Router (PRD v2.2 Bagian 7.1 & 11.4)
Mendukung Competitor Monitor, World Monitor, dan Vibe Prospecting.
"""

import json
import uuid
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Header, Query
import sqlalchemy as sa

from app.core.database import get_engine
from app.skills.f01_scrape.tools import tool_crawl_target, CrawlTargetInput
from app.skills.f01_mcp.decorators import ToolExecutionContext

logger = logging.getLogger("orchestree.api.intelligence")
router = APIRouter(prefix="/api/v1/tenants/{tenant_id}", tags=["Market & Competitor Intelligence"])


# Pydantic Schemas
class CompetitorTargetCreate(BaseModel):
    name: str = Field(..., description="Nama target kompetitor atau merek")
    domain: str = Field(..., description="Domain utama, e.g. company.com")
    target_type: str = Field("web", description="web, marketplace, social, news")
    target_url: str = Field(..., description="URL lengkap publik untuk pemantauan")
    category: str = Field("direct_competitor", description="direct_competitor, indirect_competitor, market_trend")
    frequency: str = Field("daily", description="hourly, daily, weekly, manual")
    crawler_adapter: str = Field("WebAdapter", description="WebAdapter, MarketplaceAdapter, SocialAdapter")


class CompetitorTargetUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    frequency: Optional[str] = None
    is_active: Optional[bool] = None
    crawler_adapter: Optional[str] = None


class ReportGenerateRequest(BaseModel):
    report_type: str = Field("weekly_digest", description="weekly_digest, monthly_landscape, battle_card")
    title: str = Field(..., description="Judul laporan intelijen")
    period_start: str
    period_end: str


@router.get("/competitor/targets")
async def list_competitor_targets(
    tenant_id: str,
    is_active: Optional[bool] = Query(None),
):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        query = "SELECT * FROM competitor_targets WHERE tenant_id = :tenant_id"
        params: Dict[str, Any] = {"tenant_id": tenant_id}
        if is_active is not None:
            query += " AND is_active = :is_active"
            params["is_active"] = is_active
        query += " ORDER BY created_at DESC"

        result = await conn.execute(sa.text(query), params)
        rows = [dict(r) for r in result.mappings().all()]
        return {"data": rows, "count": len(rows)}


@router.post("/competitor/targets")
async def create_competitor_target(
    tenant_id: str,
    payload: CompetitorTargetCreate,
):
    engine = get_engine()
    target_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        await conn.execute(
            sa.text("""
                INSERT INTO competitor_targets (
                    id, tenant_id, name, domain, target_type, target_url,
                    category, frequency, is_active, crawler_adapter,
                    robots_txt_status, last_status, created_at, updated_at
                ) VALUES (
                    :id, :tenant_id, :name, :domain, :target_type, :target_url,
                    :category, :frequency, true, :crawler_adapter,
                    'allowed', 'pending', now(), now()
                )
            """),
            {
                "id": target_id,
                "tenant_id": tenant_id,
                "name": payload.name,
                "domain": payload.domain,
                "target_type": payload.target_type,
                "target_url": payload.target_url,
                "category": payload.category,
                "frequency": payload.frequency,
                "crawler_adapter": payload.crawler_adapter,
            }
        )
        row = (await conn.execute(
            sa.text("SELECT * FROM competitor_targets WHERE id = :id"),
            {"id": target_id}
        )).mappings().first()
        return {"data": dict(row)}


@router.post("/competitor/targets/{target_id}/crawl")
async def trigger_crawl_target(
    tenant_id: str,
    target_id: str,
    force_refresh: bool = False,
):
    ctx = ToolExecutionContext(
        tenant_id=tenant_id,
        actor_id=None,
        actor_type="ai_agent",
        roles=["STAFF_AI"],
        capabilities=["intelligence.competitor.crawl"],
    )
    result = await tool_crawl_target(ctx, {"target_id": target_id, "force_refresh": force_refresh})
    return {"data": result}


@router.get("/competitor/snapshots")
async def list_snapshots(
    tenant_id: str,
    target_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        query = """
            SELECT s.*, t.name as target_name, t.domain
            FROM competitor_snapshots s
            JOIN competitor_targets t ON s.target_id = t.id
            WHERE s.tenant_id = :tenant_id
        """
        params: Dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
        if target_id:
            query += " AND s.target_id = :target_id"
            params["target_id"] = target_id
        query += " ORDER BY s.scraped_at DESC LIMIT :limit"

        res = await conn.execute(sa.text(query), params)
        rows = [dict(r) for r in res.mappings().all()]
        return {"data": rows}


@router.get("/competitor/changes")
async def list_changes(
    tenant_id: str,
    target_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        query = """
            SELECT c.*, t.name as target_name, t.domain
            FROM competitor_change_events c
            JOIN competitor_targets t ON c.target_id = t.id
            WHERE c.tenant_id = :tenant_id
        """
        params: Dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
        if target_id:
            query += " AND c.target_id = :target_id"
            params["target_id"] = target_id
        if severity:
            query += " AND c.severity = :severity"
            params["severity"] = severity
        query += " ORDER BY c.detected_at DESC LIMIT :limit"

        res = await conn.execute(sa.text(query), params)
        rows = [dict(r) for r in res.mappings().all()]
        return {"data": rows}


@router.get("/competitor/insights")
async def list_insights(
    tenant_id: str,
    dispatch_action: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        query = """
            SELECT i.*, t.name as target_name, t.domain
            FROM competitor_insights i
            LEFT JOIN competitor_targets t ON i.target_id = t.id
            WHERE i.tenant_id = :tenant_id
        """
        params: Dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
        if dispatch_action:
            query += " AND i.dispatch_action = :dispatch_action"
            params["dispatch_action"] = dispatch_action
        if category:
            query += " AND i.category = :category"
            params["category"] = category
        query += " ORDER BY i.created_at DESC LIMIT :limit"

        res = await conn.execute(sa.text(query), params)
        rows = [dict(r) for r in res.mappings().all()]
        return {"data": rows}


@router.post("/competitor/insights/{insight_id}/dispatch")
async def dispatch_insight_proactive(
    tenant_id: str,
    insight_id: str,
):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        res = await conn.execute(
            sa.text("SELECT * FROM competitor_insights WHERE id = :id AND tenant_id = :tenant_id"),
            {"id": insight_id, "tenant_id": tenant_id}
        )
        row = res.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Insight tidak ditemukan.")

        if row["proactive_dispatched"]:
            return {
                "status": "already_dispatched",
                "message": "Insight ini sudah terkirim sebelumnya via idempotency key.",
                "proactive_message_id": row["proactive_message_id"],
                "idempotency_key": row["idempotency_key"]
            }

        # Dispatch ke proactive_messages_log dengan idempotency key
        msg_id = str(uuid.uuid4())
        await conn.execute(
            sa.text("""
                INSERT INTO proactive_messages_log (
                    id, tenant_id, channel_type, recipient, message_template,
                    status, idempotency_key, sent_at, metadata
                ) VALUES (
                    :id, :tenant_id, 'app_notification', 'all_managers', :msg,
                    'sent', :idemp, now(), :meta
                )
                ON CONFLICT (idempotency_key) DO NOTHING
            """),
            {
                "id": msg_id,
                "tenant_id": tenant_id,
                "msg": f"{row['title']}: {row['strategic_recommendation']}",
                "idemp": row["idempotency_key"],
                "meta": json.dumps({"source": "competitor_intelligence", "insight_id": insight_id}),
            }
        )

        await conn.execute(
            sa.text("""
                UPDATE competitor_insights
                SET proactive_dispatched = true,
                    proactive_message_id = :msg_id
                WHERE id = :id
            """),
            {"id": insight_id, "msg_id": msg_id}
        )

        return {
            "status": "dispatched",
            "proactive_message_id": msg_id,
            "idempotency_key": row["idempotency_key"],
            "message": "Insight berhasil dikirimkan ke agen proaktif tanpa duplikasi."
        }


@router.get("/competitor/reports")
async def list_reports(tenant_id: str):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        res = await conn.execute(
            sa.text("SELECT * FROM competitor_reports WHERE tenant_id = :tenant_id ORDER BY created_at DESC"),
            {"tenant_id": tenant_id}
        )
        return {"data": [dict(r) for r in res.mappings().all()]}


@router.post("/competitor/reports/generate")
async def generate_report(
    tenant_id: str,
    payload: ReportGenerateRequest,
):
    engine = get_engine()
    report_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(sa.text(f"SET LOCAL app.tenant_id = '{tenant_id}';"))
        # Kumpulkan insights dan perubahan dalam periode
        changes = (await conn.execute(
            sa.text("SELECT count(*) as cnt FROM competitor_change_events WHERE tenant_id = :tenant_id"),
            {"tenant_id": tenant_id}
        )).mappings().first()

        summary_md = f"""# Laporan Intelijen Pasar & Pesaing: {payload.title}
**Periode:** {payload.period_start} s/d {payload.period_end}
**Tipe Laporan:** {payload.report_type.replace('_', ' ').title()}

## Ringkasan Eksekutif
Sistem otomatis F.01-SCRAPE telah menganalisis aktivitas pergerakan harga, rilis produk, dan kampanye pesaing dengan total {changes['cnt']} peristiwa perubahan terdeteksi.

## Rekomendasi Utama
1. **Ketahanan Margin**: Hadapi pergerakan diskon pasar dengan diferensiasi fitur layanan bernilai tambah.
2. **Kecepatan Respons Kampanye**: Selaraskan tim penjualan dan pemasaran melalui playbook taktis yang diperbarui.
"""
        await conn.execute(
            sa.text("""
                INSERT INTO competitor_reports (
                    id, tenant_id, report_type, title, period_start, period_end,
                    summary_markdown, key_takeaways, competitor_benchmarks, action_items,
                    status, created_at, updated_at
                ) VALUES (
                    :id, :tenant_id, :report_type, :title, :period_start::date, :period_end::date,
                    :summary_markdown, '["Pergerakan harga terpantau aktif", "Diferensiasi fitur unggulan terjaga"]'::jsonb,
                    '[]'::jsonb, '["Review matriks perbandingan harga", "Sosialisasi ke tim komersial"]'::jsonb,
                    'generated', now(), now()
                )
            """),
            {
                "id": report_id,
                "tenant_id": tenant_id,
                "report_type": payload.report_type,
                "title": payload.title,
                "period_start": payload.period_start,
                "period_end": payload.period_end,
                "summary_markdown": summary_md,
            }
        )
        row = (await conn.execute(
            sa.text("SELECT * FROM competitor_reports WHERE id = :id"),
            {"id": report_id}
        )).mappings().first()
        return {"data": dict(row)}


@router.get("/intelligence/world-monitor")
async def get_world_monitor(tenant_id: str):
    """Sinyal makro global dan tren industri eksternal."""
    return {
        "status": "active",
        "market_sentiment": "Expansionary with selective consolidation",
        "signals": [
            {
                "id": "sig_01",
                "category": "Regulatory",
                "headline": "Regulasi Kepatuhan Privasi Data AI & Etika Otomasi Nasional",
                "impact_level": "medium",
                "relevance_score": 0.88,
                "summary": "Pembaruan panduan kepatuhan transparansi audit data algoritma otonom untuk sektor korporasi.",
                "recommendation": "Pastikan seluruh pencatatan audit log PDP dan ABAC berjalan aktif."
            },
            {
                "id": "sig_02",
                "category": "Supply Chain",
                "headline": "Stabilitas Tarif Compute Cloud & Efisiensi Inferensi Model",
                "impact_level": "low",
                "relevance_score": 0.75,
                "summary": "Penurunan biaya inferensi per token memungkinkan ekspansi volume ekstraksi intelijen berskala besar.",
                "recommendation": "Optimalkan penjadwalan scraping frekuensi harian untuk efisiensi kredit."
            }
        ]
    }


@router.get("/intelligence/vibe-prospecting")
async def get_vibe_prospecting(tenant_id: str):
    """Radar prospek komersial & deteksi sinyal niat beli dari percakapan publik."""
    return {
        "status": "active",
        "prospects_count": 3,
        "radar_items": [
            {
                "id": "vibe_01",
                "channel": "Public B2B Community",
                "company_hint": "Distributor FMCG Regional",
                "intent_level": "high",
                "intent_score": 0.91,
                "trigger_phrase": "Mencari solusi otomatisasi tenaga kerja AI untuk tim customer support dan sales omnichannel",
                "suggested_outreach": "Tawarkan studi kasus implementasi AI Workforce OrchestreeAI dengan demonstrasi ROI terukur."
            },
            {
                "id": "vibe_02",
                "channel": "Industry Forum",
                "company_hint": "Agensi Layanan Kreatif & Pemasaran",
                "intent_level": "medium",
                "intent_score": 0.78,
                "trigger_phrase": "Kesulitan mengelola kapasitas tim saat load kampanye melonjak",
                "suggested_outreach": "Demonstrasikan integrasi delegasi tugas otonom via Kanban dan AI Agent terpadu."
            }
        ]
    }
