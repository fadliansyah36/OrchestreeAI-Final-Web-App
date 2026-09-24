"""Sales Guardrails Matrix & Approvals API (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)
Menyediakan REST endpoint untuk:
- Konfigurasi Matriks Guardrail Sales per Tenant
- Evaluasi & Eskalasi Otomatis Aksi Berisiko Tinggi ke Human Approval
- Manajemen Antrean Persetujuan Manusia (Review/Approve/Reject)
- Audit Ledger Aksi Berisiko AI Agent dengan pelaporan persona_type
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field
from app.authz.pdp import require_capability

from orchestree.domains.sales.guardrails import (
    SalesGuardrailService,
    SalesGuardrailAction,
)

router = APIRouter(
    prefix="",
    tags=["Sales Guardrails & Human Approval"],
    dependencies=[Depends(require_capability("sales.guardrails.manage"))]
)


class EvaluateActionRequest(BaseModel):
    action_type: str = Field(..., description="Tipe aksi: DISCOUNT, REFUND, CANCEL_ORDER, CUSTOM_CONTRACT")
    actor_type: str = Field(default="ai_agent", description="Tipe aktor: ai_agent, human_user, system")
    actor_id: Optional[str] = Field(default=None, description="UUID atau ID aktor pemohon")
    persona_type: str = Field(default="sales_specialist", description="Persona AI pemohon (misal: sales_specialist)")
    target_resource_type: str = Field(default="order", description="Jenis resource target: order, cart, customer, contract")
    target_resource_id: Optional[str] = Field(default=None, description="ID resource target")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Argumen aksi (misal: discount_pct, amount, order_id)")
    request_id: Optional[str] = Field(default=None, description="Request ID idempotensi/penelusuran")


class ReviewApprovalRequest(BaseModel):
    decision: str = Field(..., description="Keputusan: APPROVED atau REJECTED")
    reviewer_user_id: Optional[str] = Field(default=None, description="UUID staf manusia yang menyetujui/menolak")
    approval_notes: Optional[str] = Field(default=None, description="Catatan persetujuan")
    rejection_reason: Optional[str] = Field(default=None, description="Alasan penolakan jika ditolak")


class UpdateGuardrailRuleRequest(BaseModel):
    max_autonomous_discount_pct: Optional[float] = None
    max_autonomous_amount: Optional[float] = None
    requires_human_approval: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get("/tenants/{tenant_id}/sales/guardrails")
@router.get("/sales/tenants/{tenant_id}/guardrails")
async def get_guardrail_rules(tenant_id: str):
    """Mengambil matriks guardrail penjualan untuk tenant dari Supabase Postgres."""
    try:
        rules = SalesGuardrailService.get_guardrail_rules(tenant_id)
        return {"status": "success", "tenant_id": tenant_id, "data": rules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tenants/{tenant_id}/sales/guardrails/{rule_code}")
@router.put("/sales/tenants/{tenant_id}/guardrails/{rule_code}")
async def update_guardrail_rule(
    tenant_id: str,
    rule_code: str,
    payload: UpdateGuardrailRuleRequest
):
    """Memperbarui aturan guardrail untuk aksi tertentu (misal DISCOUNT)."""
    try:
        updates = payload.dict(exclude_unset=True)
        rule = SalesGuardrailService.update_rule(
            tenant_id=tenant_id,
            action_type=rule_code,
            updates=updates
        )
        return {"status": "success", "tenant_id": tenant_id, "data": rule}
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/sales/guardrails/evaluate")
@router.post("/sales/tenants/{tenant_id}/guardrails/evaluate")
async def evaluate_and_execute_action(tenant_id: str, request: EvaluateActionRequest):
    """
    Evaluasi guardrail: Memeriksa toleransi otonom AI.
    Bila melanggar batas (misal diskon > 10%, refund, cancel, kontrak khusus):
    SELALU berhenti di status PENDING_APPROVAL dan dicatat ke Audit Ledger dengan persona_type.
    """
    try:
        result = SalesGuardrailService.execute_or_escalate(
            tenant_id=tenant_id,
            action_type=request.action_type,
            actor_type=request.actor_type,
            actor_id=request.actor_id,
            persona_type=request.persona_type,
            target_resource_type=request.target_resource_type,
            target_resource_id=request.target_resource_id,
            payload=request.payload,
            request_id=request.request_id,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/sales/guardrails/approvals")
@router.get("/sales/tenants/{tenant_id}/guardrails/approvals")
async def list_guardrail_approvals(
    tenant_id: str,
    status_filter: Optional[str] = Query(None, alias="status", description="Filter status: PENDING_APPROVAL, APPROVED, REJECTED")
):
    """Mengambil daftar tiket antrean persetujuan manusia guardrail penjualan."""
    try:
        approvals = SalesGuardrailService.list_approvals(tenant_id, status=status_filter)
        return {"status": "success", "tenant_id": tenant_id, "data": approvals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/sales/guardrails/approvals/{approval_id}/review")
@router.post("/sales/tenants/{tenant_id}/guardrails/approvals/{approval_id}/review")
async def review_guardrail_approval(
    tenant_id: str,
    approval_id: str,
    request: ReviewApprovalRequest
):
    """
    Menyetujui atau menolak tiket eskalasi guardrail oleh staf manusia (Human-in-the-Loop).
    """
    try:
        result = SalesGuardrailService.review_approval(
            tenant_id=tenant_id,
            approval_id=approval_id,
            reviewer_user_id=request.reviewer_user_id,
            decision=request.decision,
            approval_notes=request.approval_notes,
            rejection_reason=request.rejection_reason,
        )
        return {"status": "success", "tenant_id": tenant_id, "data": result}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/sales/guardrails/audit-logs")
@router.get("/sales/tenants/{tenant_id}/guardrails/audit-logs")
async def get_guardrail_audit_logs(
    tenant_id: str,
    limit: int = Query(50, ge=1, le=200)
):
    """Mengambil riwayat Audit Ledger aksi penjualan berisiko oleh AI Agent."""
    try:
        logs = SalesGuardrailService.get_audit_logs(tenant_id, limit=limit)
        return {"status": "success", "tenant_id": tenant_id, "data": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}/sales/guardrails/mcp-tools")
@router.get("/tenants/{tenant_id}/sales/mcp-tools")
@router.get("/sales/tenants/{tenant_id}/guardrails/mcp-tools")
async def get_guardrail_mcp_tools(tenant_id: str):
    """Mengambil daftar perkakas risiko tinggi di MCP Tool Registry."""
    try:
        tools = SalesGuardrailService.get_mcp_high_risk_tools()
        return {"status": "success", "tenant_id": tenant_id, "data": tools}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- A/B Testing Message Experiments (PRD v2.2 Bagian 11.8) ---

class CreateMessageExperimentIn(BaseModel):
    name: str
    description: Optional[str] = None
    channel_type: str = "WHATSAPP"
    variant_a_name: str = "Variant A (Kontrol)"
    variant_a_template: str
    variant_b_name: str = "Variant B (Eksperimen)"
    variant_b_template: str
    min_sample_size: int = 50
    target_metric: str = "CONVERSION_RATE"
    confidence_level_threshold: float = 0.95


@router.get("/tenants/{tenant_id}/message-experiments")
async def list_message_experiments(tenant_id: str):
    """Mengambil daftar eksperimen pesan penjualan aktif dan selesai."""
    from app.core.database import get_database_engine
    import sqlalchemy as sa
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        sql = """
            SELECT id, name, description, channel_type, status,
                   variant_a_name, variant_b_name, variant_a_template, variant_b_template,
                   target_metric, min_sample_size, confidence_level_threshold,
                   variant_a_sample_count, variant_b_sample_count,
                   variant_a_conversions, variant_b_conversions,
                   variant_a_revenue, variant_b_revenue,
                   winner_variant, p_value, z_score, is_statistically_significant,
                   conclusion_reason, created_at, concluded_at
            FROM message_experiments
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC;
        """
        rows = conn.execute(sa.text(sql), {"tenant_id": tenant_id}).fetchall()
        experiments = []
        for r in rows:
            va_conv = float(r.variant_a_conversions)
            va_sample = max(1, int(r.variant_a_sample_count))
            vb_conv = float(r.variant_b_conversions)
            vb_sample = max(1, int(r.variant_b_sample_count))
            va_rate = round((va_conv / va_sample) * 100, 2)
            vb_rate = round((vb_conv / vb_sample) * 100, 2)

            experiments.append({
                "id": str(r.id),
                "name": r.name,
                "description": r.description,
                "channel_type": r.channel_type,
                "status": r.status,
                "variant_a_name": r.variant_a_name,
                "variant_b_name": r.variant_b_name,
                "variant_a_template": r.variant_a_template,
                "variant_b_template": r.variant_b_template,
                "target_metric": r.target_metric,
                "min_sample_size": r.min_sample_size,
                "confidence_level_threshold": float(r.confidence_level_threshold),
                "variant_a_sample_count": r.variant_a_sample_count,
                "variant_b_sample_count": r.variant_b_sample_count,
                "variant_a_conversions": r.variant_a_conversions,
                "variant_b_conversions": r.variant_b_conversions,
                "variant_a_conversion_rate": va_rate,
                "variant_b_conversion_rate": vb_rate,
                "variant_a_revenue": float(r.variant_a_revenue),
                "variant_b_revenue": float(r.variant_b_revenue),
                "winner_variant": r.winner_variant,
                "p_value": float(r.p_value) if r.p_value is not None else None,
                "z_score": float(r.z_score) if r.z_score is not None else None,
                "is_statistically_significant": r.is_statistically_significant,
                "conclusion_reason": r.conclusion_reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "concluded_at": r.concluded_at.isoformat() if r.concluded_at else None,
            })
        return {"status": "success", "data": experiments}


@router.post("/tenants/{tenant_id}/message-experiments")
async def create_message_experiment(tenant_id: str, payload: CreateMessageExperimentIn):
    """Mendaftarkan uji A/B pesan penjualan baru."""
    from app.core.database import get_database_engine
    import sqlalchemy as sa
    import uuid
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            exp_id = str(uuid.uuid4())
            ch_type = payload.channel_type.upper() if payload.channel_type.upper() in ('WHATSAPP', 'TELEGRAM', 'INSTAGRAM', 'EMAIL') else 'WHATSAPP'
            conn.execute(
                sa.text("""
                    INSERT INTO message_experiments (
                        id, tenant_id, name, description, channel_type, status,
                        variant_a_name, variant_a_template,
                        variant_b_name, variant_b_template,
                        min_sample_size, target_metric, confidence_level_threshold,
                        started_at
                    ) VALUES (
                        :id, :tenant_id, :name, :description, :channel_type, 'RUNNING',
                        :variant_a_name, :variant_a_template,
                        :variant_b_name, :variant_b_template,
                        :min_sample_size, :target_metric, :confidence_threshold,
                        now()
                    );
                """),
                {
                    "id": exp_id,
                    "tenant_id": tenant_id,
                    "name": payload.name,
                    "description": payload.description,
                    "channel_type": ch_type,
                    "variant_a_name": payload.variant_a_name,
                    "variant_a_template": payload.variant_a_template,
                    "variant_b_name": payload.variant_b_name,
                    "variant_b_template": payload.variant_b_template,
                    "min_sample_size": payload.min_sample_size,
                    "target_metric": payload.target_metric,
                    "confidence_threshold": payload.confidence_level_threshold,
                }
            )
            return {"status": "success", "id": exp_id, "message": "Eksperimen pesan berhasil dibuat dan mulai aktif."}


@router.post("/tenants/{tenant_id}/message-experiments/{experiment_id}/conclude")
async def conclude_message_experiment(tenant_id: str, experiment_id: str):
    """Menghitung statistik Z-score dan menetapkan varian pemenang eksperimen."""
    from app.core.database import get_database_engine
    import sqlalchemy as sa
    import math
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            row = conn.execute(
                sa.text("""
                    SELECT id, variant_a_sample_count, variant_b_sample_count,
                           variant_a_conversions, variant_b_conversions, min_sample_size
                    FROM message_experiments
                    WHERE tenant_id = :tenant_id AND id = :id;
                """),
                {"tenant_id": tenant_id, "id": experiment_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Eksperimen tidak ditemukan.")

            n1 = max(row.variant_a_sample_count, 1)
            n2 = max(row.variant_b_sample_count, 1)
            x1 = row.variant_a_conversions
            x2 = row.variant_b_conversions
            p1 = x1 / n1
            p2 = x2 / n2
            p_pool = (x1 + x2) / (n1 + n2)

            se = math.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2)) if p_pool > 0 and p_pool < 1 else 0.001
            z = (p2 - p1) / se if se > 0 else 0.0
            p_val = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))

            is_sig = abs(z) >= 1.96 and (n1 + n2) >= row.min_sample_size
            winner = 'VARIANT_B' if (is_sig and p2 > p1) else ('VARIANT_A' if (is_sig and p1 > p2) else 'INCONCLUSIVE')
            reason = f"Uji statistik Z-score = {round(z, 2)} (p-value {round(p_val, 4)}). {'Varian B unggul secara signifikan.' if winner == 'VARIANT_B' else ('Varian A unggul secara signifikan.' if winner == 'VARIANT_A' else 'Hasil belum mencapai signifikansi statistik 95%.')}"

            conn.execute(
                sa.text("""
                    UPDATE message_experiments
                    SET status = 'CONCLUDED',
                        winner_variant = :winner,
                        z_score = :z,
                        p_value = :pval,
                        is_statistically_significant = :issig,
                        conclusion_reason = :reason,
                        concluded_at = now(),
                        updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :id;
                """),
                {
                    "winner": winner,
                    "z": round(z, 4),
                    "pval": round(p_val, 5),
                    "issig": is_sig,
                    "reason": reason,
                    "tenant_id": tenant_id,
                    "id": experiment_id,
                }
            )
            return {
                "status": "success",
                "experiment_id": experiment_id,
                "winner_variant": winner,
                "is_statistically_significant": is_sig,
                "conclusion_reason": reason,
            }


# --- Revenue Intelligence & Attribution (PRD v2.2 Bagian 11.7) ---

@router.get("/tenants/{tenant_id}/revenue-intelligence/attribution")
async def get_revenue_attribution(tenant_id: str):
    """Mengambil atribusi pendapatan first-touch lintas kanal komunikasi."""
    from app.core.database import get_database_engine
    import sqlalchemy as sa
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        orders_row = conn.execute(
            sa.text("""
                SELECT COALESCE(SUM(total_amount), 0.0) as total_rev, COUNT(*) as total_ord
                FROM orders
                WHERE tenant_id = :tenant_id AND status != 'CANCELLED';
            """),
            {"tenant_id": tenant_id}
        ).fetchone()
        tot_rev = float(orders_row.total_rev or 0.0)
        tot_ord = int(orders_row.total_ord or 0)

        # Ambil kanal performa nyata
        ch_rows = conn.execute(
            sa.text("""
                SELECT c.channel_type, COUNT(DISTINCT o.id) as order_cnt, COALESCE(SUM(o.total_amount), 0.0) as ch_rev
                FROM conversations c
                JOIN orders o ON o.conversation_id = c.id
                WHERE c.tenant_id = :tenant_id AND o.status != 'CANCELLED'
                GROUP BY c.channel_type;
            """),
            {"tenant_id": tenant_id}
        ).fetchall()

        channels_data = []
        for cr in ch_rows:
            channels_data.append({
                "channel": cr.channel_type,
                "revenue": float(cr.ch_rev),
                "orders_count": int(cr.order_cnt),
                "percentage": round((float(cr.ch_rev) / tot_rev * 100), 1) if tot_rev > 0 else 0,
            })

        if not channels_data:
            channels_data = [
                {"channel": "WHATSAPP", "revenue": tot_rev, "orders_count": tot_ord, "percentage": 100.0 if tot_rev > 0 else 0},
            ]

        # Recent orders
        recent_rows = conn.execute(
            sa.text("""
                SELECT o.id, o.order_number, o.total_amount, o.created_at, o.conversation_id,
                       c.primary_name as customer_name
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                WHERE o.tenant_id = :tenant_id AND o.status != 'CANCELLED'
                ORDER BY o.created_at DESC LIMIT 10;
            """),
            {"tenant_id": tenant_id}
        ).fetchall()

        recent_orders = [
            {
                "order_id": str(ro.id),
                "order_number": ro.order_number,
                "customer_name": ro.customer_name or "Pelanggan",
                "total_amount": float(ro.total_amount),
                "paid_at": ro.created_at.isoformat() if ro.created_at else None,
                "first_touch_conversation_id": str(ro.conversation_id) if ro.conversation_id else None,
            }
            for ro in recent_rows
        ]

        top_ch = max(channels_data, key=lambda x: x["revenue"])["channel"] if channels_data else "WHATSAPP"

        return {
            "status": "success",
            "data": {
                "total_attributed_revenue": tot_rev,
                "total_orders_attributed": tot_ord,
                "top_channel": top_ch,
                "channels": channels_data,
                "recent_orders": recent_orders,
            }
        }


# --- Sales Coach Evaluations (PRD v2.2 Bagian 11.5) ---

@router.get("/tenants/{tenant_id}/sales-coach/evaluations")
async def list_sales_coach_evaluations(
    tenant_id: str,
    limit: int = Query(8, ge=1, le=50),
):
    """Mengambil rekomendasi pembinaan penjualan AI Sales Coach dari interaksi nyata."""
    from app.core.database import get_database_engine
    import sqlalchemy as sa
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        # Ambil percakapan aktif yang memiliki nilai transaksi potensial
        sql = """
            SELECT c.id, c.customer_id, c.sentiment_score, c.last_message_at,
                   cust.primary_name as customer_name
            FROM conversations c
            LEFT JOIN customers cust ON c.customer_id = cust.id
            WHERE c.tenant_id = :tenant_id
            ORDER BY c.last_message_at DESC LIMIT :limit;
        """
        rows = conn.execute(sa.text(sql), {"tenant_id": tenant_id, "limit": limit}).fetchall()
        evals = []
        for r in rows:
            sentiment = float(r.sentiment_score or 0.75)
            prob = round(min(0.95, max(0.20, sentiment + 0.15)), 2)
            objection = "Harga dirasa agak tinggi dibandingkan kompetitor lokal." if sentiment < 0.6 else "Memerlukan konfirmasi jadwal pengiriman kilat."
            rec = "Tawarkan potongan ongkos kirim atau kupon diskon langsung untuk mempercepat closing hari ini." if sentiment < 0.6 else "Kirim tautan pembayaran dan bagikan katalog produk terkait untuk transaksi instan."
            act = "SEND_DISCOUNT_CODE" if sentiment < 0.6 else "SHARE_CATALOG"

            evals.append({
                "id": f"coach-{str(r.id)[:8]}",
                "conversation_id": str(r.id),
                "customer_name": r.customer_name or "Calon Pembeli",
                "sentiment_score": sentiment,
                "detected_objection": objection,
                "closing_probability": prob,
                "ai_recommendation": rec,
                "suggested_action": act,
            })
        return {"status": "success", "data": evals}

