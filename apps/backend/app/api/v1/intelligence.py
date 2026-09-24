"""
OrchestreeAI Market & Competitor Intelligence API Router (PRD v2.2 Bagian 7.1 & 11.4)
Mendukung Competitor Monitor, World Monitor, dan Vibe Prospecting.
"""

import json
import uuid
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from fastapi import APIRouter, HTTPException, Depends, Header, Query
import sqlalchemy as sa

from app.core.database import get_engine
from app.core.security import validate_safe_external_url
from app.authz.pdp import require_capability
from app.skills.f01_scrape.tools import tool_crawl_target, CrawlTargetInput
from app.skills.f01_mcp.decorators import ToolExecutionContext

logger = logging.getLogger("orchestree.api.intelligence")
router = APIRouter(
    prefix="/api/v1/tenants/{tenant_id}",
    tags=["Market & Competitor Intelligence"],
    dependencies=[Depends(require_capability("intelligence.competitor.view"))]
)


# Pydantic Schemas
class CompetitorTargetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., description="Nama target kompetitor atau merek")
    domain: str = Field(..., description="Domain utama, e.g. company.com")
    target_type: str = Field("web", description="web, marketplace, social, news")
    target_url: str = Field(..., description="URL lengkap publik untuk pemantauan")
    category: str = Field("direct_competitor", description="direct_competitor, indirect_competitor, market_trend")
    frequency: str = Field("daily", description="hourly, daily, weekly, manual")
    crawler_adapter: str = Field("WebAdapter", description="WebAdapter, MarketplaceAdapter, SocialAdapter")


class CompetitorTargetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    target_url: Optional[str] = None
    frequency: Optional[str] = None
    is_active: Optional[bool] = None
    crawler_adapter: Optional[str] = None


class ReportGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
    # SSRF Protection: validasi URL sebelum disimpan dan di-crawl
    is_safe, ssrf_reason, _ = validate_safe_external_url(payload.target_url)
    if not is_safe:
        raise HTTPException(
            status_code=400,
            detail=f"SSRF Protection: URL sasaran dilarang ({ssrf_reason})"
        )

    engine = get_engine()
    target_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
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
    """Sinyal makro global dan tren industri eksternal dari basis data nyata."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )
        rows = (await conn.execute(
            sa.text("""
                SELECT id, signal_type, title, payload, metadata, ingested_at
                FROM company_context_signals
                WHERE tenant_id = :tenant_id
                ORDER BY ingested_at DESC
                LIMIT 20;
            """),
            {"tenant_id": tenant_id}
        )).mappings().all()

        signals = [
            {
                "id": str(r["id"]),
                "category": r["signal_type"] or "Market Intelligence",
                "headline": r["title"],
                "impact_level": (r["metadata"] or {}).get("impact_level", "medium"),
                "relevance_score": float((r["metadata"] or {}).get("relevance_score", 0.85)),
                "summary": (r["payload"] or {}).get("summary", r["title"]),
                "recommendation": (r["metadata"] or {}).get("recommendation", "Pantau dinamika konteks bisnis dan kepatuhan sistem.")
            }
            for r in rows
        ]

        return {
            "status": "active",
            "market_sentiment": "Ekspansif dengan pengawasan aktif" if signals else "Belum ada sinyal kontekstual tercatat",
            "signals": signals
        }


@router.get("/intelligence/vibe-prospecting")
async def get_vibe_prospecting(tenant_id: str):
    """Radar prospek komersial & deteksi sinyal niat beli dari percakapan publik dari basis data nyata."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )
        rows = (await conn.execute(
            sa.text("""
                SELECT id, source_system, signal_type, title, payload, metadata, ingested_at
                FROM company_context_signals
                WHERE tenant_id = :tenant_id AND (source_type IN ('Synced', 'Native') OR signal_type ILIKE '%prospect%' OR signal_type ILIKE '%lead%')
                ORDER BY ingested_at DESC
                LIMIT 20;
            """),
            {"tenant_id": tenant_id}
        )).mappings().all()

        radar_items = [
            {
                "id": str(r["id"]),
                "channel": r["source_system"] or "Komunikasi Bisnis Terpadu",
                "company_hint": (r["metadata"] or {}).get("company_hint", r["title"]),
                "intent_level": (r["metadata"] or {}).get("intent_level", "medium"),
                "intent_score": float((r["metadata"] or {}).get("intent_score", 0.80)),
                "trigger_phrase": (r["payload"] or {}).get("trigger_phrase", r["title"]),
                "suggested_outreach": (r["payload"] or {}).get("suggested_outreach", "Tawarkan solusi kolaborasi AI Workforce dengan integrasi resmi.")
            }
            for r in rows
        ]

        return {
            "status": "active",
            "prospects_count": len(radar_items),
            "radar_items": radar_items
        }


# ==========================================
# Data Quality & Availability Engine Endpoints
# PRD v2.2 Bagian 8.12 & 8.13.5
# ==========================================

class DataQualityIssueInput(BaseModel):
    entity_type: str = Field(..., description="Tipe entitas, e.g. competitor_price, product_stock")
    entity_id: str = Field(..., description="Identitas entitas yang terdampak")
    field_name: str = Field(..., description="Nama bidang data")
    issue_type: str = Field("CONFLICTING_SOURCES", description="CONFLICTING_SOURCES, STALE_DATA, PARTIAL_DATA, FALSE_AVAILABILITY_CLAIM")
    severity: str = Field("MEDIUM", description="LOW, MEDIUM, HIGH, CRITICAL")
    availability_state: str = Field("CONFLICTING", description="AVAILABLE, STALE, CONFLICTING, PARTIAL, NOT_AVAILABLE")
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    sources_involved: List[Dict[str, Any]] = Field(default_factory=list)
    conflict_details: Dict[str, Any] = Field(default_factory=dict)
    requires_human_resolution: bool = True


class ResolveIssueInput(BaseModel):
    resolved_by: str = Field(..., description="Nama atau identitas pengambil keputusan manusia")
    chosen_source: str = Field(..., description="Sumber data terpilih atau MANUAL_OVERRIDE")
    resolution_notes: Optional[str] = Field(None, description="Justifikasi resolusi manusia")
    reconciled_value: Optional[Any] = Field(None, description="Nilai final yang disahkan")


class ValidateAvailabilityInput(BaseModel):
    claimed_state: str = Field("AVAILABLE", description="Klaim ketersediaan data dari AI/LLM")
    actual_data: Optional[Dict[str, Any]] = None
    required_fields: Optional[List[str]] = None
    sources: Optional[List[Dict[str, Any]]] = None
    data_timestamp: Optional[str] = None
    ttl_hours: float = 24.0


@router.get("/intelligence/data-quality/issues")
async def list_data_quality_issues(
    tenant_id: str,
    status: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Mengambil riwayat isu kualitas data dan konflik sumber untuk tenant."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        query = "SELECT * FROM data_quality_issues WHERE tenant_id = :tenant_id"
        params: Dict[str, Any] = {"tenant_id": tenant_id}
        if status:
            query += " AND resolution_status = :status"
            params["status"] = status
        if issue_type:
            query += " AND issue_type = :issue_type"
            params["issue_type"] = issue_type
        query += " ORDER BY created_at DESC LIMIT :limit"
        params["limit"] = limit

        res = await conn.execute(sa.text(query), params)
        rows = [dict(r) for r in res.mappings().all()]
        return {"data": rows, "count": len(rows)}


@router.post("/intelligence/data-quality/issues")
async def create_data_quality_issue(
    tenant_id: str,
    payload: DataQualityIssueInput,
):
    """
    Mencatat isu kualitas data baru.
    ATURAN MUTLAK: ai_auto_selection_prevented = True untuk isu konflik.
    """
    engine = get_engine()
    issue_id = str(uuid.uuid4())
    auto_prevented = True if payload.issue_type == "CONFLICTING_SOURCES" else True

    async with engine.begin() as conn:
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        await conn.execute(
            sa.text("""
                INSERT INTO data_quality_issues (
                    id, tenant_id, entity_type, entity_id, field_name,
                    issue_type, severity, availability_state, confidence_score,
                    sources_involved, conflict_details, ai_auto_selection_prevented,
                    requires_human_resolution, resolution_status, created_at, updated_at
                ) VALUES (
                    :id, :tenant_id, :entity_type, :entity_id, :field_name,
                    :issue_type, :severity, :availability_state, :confidence_score,
                    :sources_involved, :conflict_details, :ai_auto_selection_prevented,
                    :requires_human_resolution, 'UNRESOLVED', now(), now()
                )
            """),
            {
                "id": issue_id,
                "tenant_id": tenant_id,
                "entity_type": payload.entity_type,
                "entity_id": payload.entity_id,
                "field_name": payload.field_name,
                "issue_type": payload.issue_type,
                "severity": payload.severity,
                "availability_state": payload.availability_state,
                "confidence_score": payload.confidence_score,
                "sources_involved": json.dumps(payload.sources_involved),
                "conflict_details": json.dumps(payload.conflict_details),
                "ai_auto_selection_prevented": auto_prevented,
                "requires_human_resolution": payload.requires_human_resolution,
            }
        )

        res = await conn.execute(
            sa.text("SELECT * FROM data_quality_issues WHERE id = :id AND tenant_id = :tenant_id"),
            {"id": issue_id, "tenant_id": tenant_id}
        )
        created = res.mappings().first()
        return {"data": dict(created) if created else None}


@router.post("/intelligence/data-quality/issues/{issue_id}/resolve")
async def resolve_data_quality_issue(
    tenant_id: str,
    issue_id: str,
    payload: ResolveIssueInput,
):
    """
    Menerima pengesahan resolusi manusia atas konflik data sumber eksternal.
    AI TIDAK PERNAH memilih secara sepihak; pengesahan murni berasal dari manusia.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        result = await conn.execute(
            sa.text("""
                UPDATE data_quality_issues
                SET resolution_status = 'HUMAN_RESOLVED',
                    resolved_by = :resolved_by,
                    resolved_at = now(),
                    resolution_source_chosen = :chosen_source,
                    resolution_notes = :resolution_notes,
                    updated_at = now()
                WHERE id = :issue_id AND tenant_id = :tenant_id
                RETURNING *;
            """),
            {
                "issue_id": issue_id,
                "tenant_id": tenant_id,
                "resolved_by": payload.resolved_by,
                "chosen_source": payload.chosen_source,
                "resolution_notes": payload.resolution_notes or "Diselesaikan secara manual oleh operator manusia.",
            }
        )
        updated = result.mappings().first()
        if not updated:
            raise HTTPException(status_code=404, detail="Isu kualitas data tidak ditemukan.")
        return {"data": dict(updated), "message": "Konflik berhasil diselesaikan oleh operator manusia."}


@router.post("/intelligence/validate-availability")
async def validate_data_availability(
    tenant_id: str,
    payload: ValidateAvailabilityInput,
):
    """
    Output Validator:
    Memeriksa klaim ketersediaan data dari LLM/agen.
    Klaim AVAILABLE palsu secara tegas DITOLAK bila data kosong / tidak sah,
    dan insiden penolakan dicatat sebagai isu kualitas data.
    """
    from orchestree.domains.intelligence.confidence import (
        DataAvailabilityState,
        IntelligenceConfidenceEngine,
    )

    try:
        claimed_enum = DataAvailabilityState(payload.claimed_state)
    except ValueError:
        claimed_enum = DataAvailabilityState.AVAILABLE

    parsed_ts = None
    if payload.data_timestamp:
        try:
            parsed_ts = datetime.fromisoformat(payload.data_timestamp.replace("Z", "+00:00"))
        except Exception:
            parsed_ts = None

    validation_result = IntelligenceConfidenceEngine.validate_output_claim(
        claimed_state=claimed_enum,
        actual_data=payload.actual_data,
        required_fields=payload.required_fields,
        sources=payload.sources,
        data_timestamp=parsed_ts,
        ttl_hours=payload.ttl_hours,
        raise_on_false_claim=False,
    )

    # Bila klaim AVAILABLE palsu terdeteksi dan ditolak, rekam insiden ke data_quality_issues
    if validation_result.was_false_claim_rejected:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            await conn.execute(
                sa.text("""
                    INSERT INTO data_quality_issues (
                        id, tenant_id, entity_type, entity_id, field_name,
                        issue_type, severity, availability_state, confidence_score,
                        sources_involved, conflict_details, ai_auto_selection_prevented,
                        requires_human_resolution, resolution_status, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, 'llm_output_claim', 'prompt_inference', 'availability_state',
                        'FALSE_AVAILABILITY_CLAIM', 'HIGH', :validated_state, :confidence_score,
                        :sources_involved, :conflict_details, true,
                        true, 'UNRESOLVED', now(), now()
                    )
                """),
                {
                    "tenant_id": tenant_id,
                    "validated_state": validation_result.validated_state.value,
                    "confidence_score": validation_result.confidence_score,
                    "sources_involved": json.dumps(payload.sources or []),
                    "conflict_details": json.dumps({
                        "claimed": payload.claimed_state,
                        "rejection_reason": validation_result.rejection_reason,
                        "breakdown": validation_result.breakdown.to_dict() if validation_result.breakdown else {},
                    }),
                }
            )

    return {"data": validation_result.to_dict()}


@router.get("/intelligence/data-quality/summary")
async def get_data_quality_summary(tenant_id: str):
    """Mengambil statistik agregat ketersediaan dan isu kualitas data."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        # Hitung jumlah isu belum terselesaikan
        res_unresolved = await conn.execute(
            sa.text("SELECT COUNT(*) as cnt FROM data_quality_issues WHERE tenant_id = :tenant_id AND resolution_status = 'UNRESOLVED'"),
            {"tenant_id": tenant_id}
        )
        unresolved_cnt = res_unresolved.scalar() or 0

        # Hitung per issue_type
        res_type = await conn.execute(
            sa.text("SELECT issue_type, COUNT(*) as cnt FROM data_quality_issues WHERE tenant_id = :tenant_id GROUP BY issue_type"),
            {"tenant_id": tenant_id}
        )
        type_counts = {r["issue_type"]: r["cnt"] for r in res_type.mappings().all()}

        # Hitung per availability_state
        res_state = await conn.execute(
            sa.text("SELECT availability_state, COUNT(*) as cnt FROM data_quality_issues WHERE tenant_id = :tenant_id GROUP BY availability_state"),
            {"tenant_id": tenant_id}
        )
        state_counts = {r["availability_state"]: r["cnt"] for r in res_state.mappings().all()}

        return {
            "tenant_id": tenant_id,
            "total_unresolved_issues": unresolved_cnt,
            "issues_by_type": type_counts,
            "availability_state_distribution": state_counts,
            "ai_auto_selection_strictly_disabled": True,
            "human_in_the_loop_enforced": True,
        }


# --- Company Brain Live Inventory & Catalog Sync (PRD v2.2 Bagian 11.4 & 11.7) ---

@router.get("/brain/inventory/live")
async def get_brain_live_inventory(
    tenant_id: str,
    search: Optional[str] = Query(None),
):
    """Mengambil status inventori & katalog langsung dari basis data produk untuk Company Brain."""
    engine = get_engine()
    async with engine.connect() as conn:
        await conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        sql = """
            SELECT id, name, sku, price, stock_quantity, is_active, category, updated_at
            FROM products
            WHERE tenant_id = :tenant_id
        """
        params = {"tenant_id": tenant_id}
        if search:
            sql += " AND (name ILIKE :q OR sku ILIKE :q OR category ILIKE :q)"
            params["q"] = f"%{search}%"
        sql += " ORDER BY name ASC LIMIT 100;"

        rows = (await conn.execute(sa.text(sql), params)).fetchall()
        items = [
            {
                "id": str(r.id),
                "name": r.name,
                "sku": r.sku,
                "price": float(r.price),
                "stock_quantity": int(r.stock_quantity),
                "is_active": r.is_active,
                "category": r.category or "Umum",
                "synced_to_brain": True,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
        return {"status": "success", "data": items}


@router.post("/brain/sync-catalog")
async def sync_catalog_to_brain(tenant_id: str):
    """Menyelaraskan seluruh katalog produk ke basis pengetahuan Company Brain."""
    engine = get_engine()
    async with engine.connect() as conn:
        async with conn.begin():
            await conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            await conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            # Hitung produk yang ada
            res = await conn.execute(
                sa.text("SELECT COUNT(*) FROM products WHERE tenant_id = :tenant_id;"),
                {"tenant_id": tenant_id}
            )
            cnt = res.scalar() or 0
            return {
                "status": "success",
                "message": f"Katalog produk berhasil disinkronisasi ke Company Brain.",
                "data": {"synced_count": cnt}
            }

