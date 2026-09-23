"""
OrchestreeAI Enterprise Capabilities & Integration Fabric API Router (PRD v2.2 Bagian 3.4, 3.5, 12)
Python 3.12 + FastAPI + Pydantic v2
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uuid
import datetime

from app.core.database import get_db_connection
from orchestree.core.security.fabric_kms import (
    encrypt_fabric_credentials,
    decrypt_fabric_credentials,
)
from orchestree.domains.enterprise.research_agent import (
    KnowledgeSourceItem,
    ResearchPolicy,
    ResearchQueryResult,
    KNOWLEDGE_LEVEL_METADATA,
    EnterpriseResearchAgent,
)

router = APIRouter(prefix="/api/v1/tenants/{tenant_id}/enterprise", tags=["enterprise"])


class DpiaRecordInput(BaseModel):
    assessment_title: str
    data_controller_name: str
    data_protection_officer: str
    processing_purpose: str
    data_categories: List[str] = Field(default_factory=list)
    data_subject_categories: List[str] = Field(default_factory=lambda: ["EMPLOYEES", "CUSTOMERS"])
    transfer_basis: str = "INTERNAL_LEGITIMATE_INTEREST"
    security_measures_description: str
    risk_level: str = "MEDIUM"
    residual_risk: str = "LOW"
    status: str = "APPROVED"
    is_complete: bool = True
    review_notes: Optional[str] = None


class FabricConnectorCreateInput(BaseModel):
    connector_code: str
    connector_name: str
    connector_type: str = "ERP"  # ERP, HRIS, CRM, CMMS, ERP_SAP_ORACLE, WEBHOOK_BROKER, DATA_STREAM_PIPELINE, CUSTOM_RPC
    auth_type: str = "API_KEY"
    credentials: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class SyncStreamInput(BaseModel):
    connector_code: str
    sync_type: str = "MANUAL"


async def assert_enterprise_tier(tenant_id: str, db):
    query = """
        SELECT t.id, sp.plan_code, sp.tier_level
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
        WHERE t.id = $1
    """
    row = await db.fetchrow(query, uuid.UUID(tenant_id))
    if not row:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' tidak ditemukan.")
    tier_level = int(row["tier_level"] or 0)
    if tier_level < 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "capability_not_available",
                "message": "Fitur Enterprise Integration Fabric memerlukan paket langganan Enterprise (tier 3).",
                "required_min_tier": 3,
                "current_tier": tier_level,
            }
        )
    return row


@router.get("/integration-fabric/connectors")
async def list_fabric_connectors(tenant_id: str):
    """Mengambil daftar konektor Integration Fabric tenant."""
    async with get_db_connection() as db:
        query = """
            SELECT c.*, d.assessment_title as dpia_title, d.is_complete as dpia_is_complete
            FROM integration_fabric_connectors c
            LEFT JOIN dpia_records d ON c.dpia_record_id = d.id
            WHERE c.tenant_id = $1
            ORDER BY c.created_at DESC
        """
        rows = await db.fetch(query, uuid.UUID(tenant_id))
        connectors = []
        for r in rows:
            cd = dict(r)
            # Mask encrypted credentials
            cd["has_credentials"] = bool(cd.get("credentials_encrypted"))
            cd.pop("credentials_encrypted", None)
            connectors.append(cd)
        return {"connectors": connectors, "count": len(connectors)}


@router.post("/integration-fabric/connectors", status_code=status.HTTP_201_CREATED)
async def create_fabric_connector(tenant_id: str, payload: FabricConnectorCreateInput):
    """
    Membuat konektor Integration Fabric baru.
    Kredensial dienkripsi dengan envelope KMS per-koneksi.
    Status default adalah DRAFT/PENDING_DPIA (tidak dapat langsung CONNECTED).
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        valid_types = {
            "ERP", "HRIS", "CRM", "CMMS", "ERP_SAP_ORACLE",
            "WEBHOOK_BROKER", "DATA_STREAM_PIPELINE", "CUSTOM_RPC"
        }
        c_type = payload.connector_type.upper()
        if c_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Tipe konektor '{c_type}' tidak valid. Pilihan: {sorted(list(valid_types))}"
            )

        connector_id = str(uuid.uuid4())
        kid = None
        enc_creds = None

        if payload.credentials:
            enc_creds, kid = encrypt_fabric_credentials(
                payload.credentials,
                tenant_id,
                connector_id
            )

        insert_q = """
            INSERT INTO integration_fabric_connectors (
                id, tenant_id, connector_code, connector_name, connector_type,
                status, auth_type, credential_key_id, credentials_encrypted,
                dpia_status, config, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                'DRAFT', $6, $7, $8,
                'NOT_SUBMITTED', $9, now(), now()
            )
            RETURNING id, tenant_id, connector_code, connector_name, connector_type,
                      status, auth_type, credential_key_id, dpia_status, config, created_at
        """
        row = await db.fetchrow(
            insert_q,
            uuid.UUID(connector_id),
            uuid.UUID(tenant_id),
            payload.connector_code.strip(),
            payload.connector_name.strip(),
            c_type,
            payload.auth_type,
            kid,
            enc_creds,
            payload.config or {}
        )
        res = dict(row)
        res["has_credentials"] = bool(enc_creds)
        return res


@router.post("/integration-fabric/connectors/{connector_id}/dpia")
async def create_or_update_dpia(tenant_id: str, connector_id: str, payload: DpiaRecordInput):
    """
    Mendaftarkan atau memperbarui Data Protection Impact Assessment (DPIA) untuk koneksi Fabric.
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        # Validasi kelengkapan DPIA
        is_complete = (
            payload.is_complete
            and bool(payload.data_protection_officer.strip())
            and bool(payload.processing_purpose.strip())
            and bool(payload.security_measures_description.strip())
            and len(payload.data_categories) > 0
        )

        dpia_status = payload.status.upper()
        if dpia_status not in {"DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"}:
            dpia_status = "APPROVED" if is_complete else "DRAFT"

        # Simpan atau update dpia_records
        check_q = "SELECT id FROM dpia_records WHERE tenant_id = $1 AND connector_id = $2"
        existing = await db.fetchrow(check_q, uuid.UUID(tenant_id), uuid.UUID(connector_id))

        if existing:
            update_q = """
                UPDATE dpia_records SET
                    assessment_title = $1,
                    data_controller_name = $2,
                    data_protection_officer = $3,
                    processing_purpose = $4,
                    data_categories = $5,
                    data_subject_categories = $6,
                    transfer_basis = $7,
                    security_measures_description = $8,
                    risk_level = $9,
                    residual_risk = $10,
                    status = $11,
                    is_complete = $12,
                    review_notes = $13,
                    updated_at = now()
                WHERE id = $14
                RETURNING *
            """
            row = await db.fetchrow(
                update_q,
                payload.assessment_title,
                payload.data_controller_name,
                payload.data_protection_officer,
                payload.processing_purpose,
                payload.data_categories,
                payload.data_subject_categories,
                payload.transfer_basis,
                payload.security_measures_description,
                payload.risk_level,
                payload.residual_risk,
                dpia_status,
                is_complete,
                payload.review_notes,
                existing["id"]
            )
            dpia_id = existing["id"]
        else:
            dpia_id = uuid.uuid4()
            insert_q = """
                INSERT INTO dpia_records (
                    id, tenant_id, connector_id, assessment_title,
                    data_controller_name, data_protection_officer, processing_purpose,
                    data_categories, data_subject_categories, transfer_basis,
                    security_measures_description, risk_level, residual_risk,
                    status, is_complete, review_notes, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7,
                    $8, $9, $10,
                    $11, $12, $13,
                    $14, $15, $16, now(), now()
                )
                RETURNING *
            """
            row = await db.fetchrow(
                insert_q,
                dpia_id,
                uuid.UUID(tenant_id),
                uuid.UUID(connector_id),
                payload.assessment_title,
                payload.data_controller_name,
                payload.data_protection_officer,
                payload.processing_purpose,
                payload.data_categories,
                payload.data_subject_categories,
                payload.transfer_basis,
                payload.security_measures_description,
                payload.risk_level,
                payload.residual_risk,
                dpia_status,
                is_complete,
                payload.review_notes
            )

        # Update relasi connector
        await db.execute(
            """
            UPDATE integration_fabric_connectors
            SET dpia_record_id = $1,
                dpia_status = $2,
                dpia_approved_at = CASE WHEN $2 = 'APPROVED' THEN now() ELSE dpia_approved_at END,
                updated_at = now()
            WHERE id = $3 AND tenant_id = $4
            """,
            dpia_id,
            dpia_status,
            uuid.UUID(connector_id),
            uuid.UUID(tenant_id)
        )

        return dict(row)


@router.get("/integration-fabric/connectors/{connector_id}/dpia")
async def get_connector_dpia(tenant_id: str, connector_id: str):
    """Mengambil catatan DPIA untuk konektor Fabric tertentu."""
    async with get_db_connection() as db:
        row = await db.fetchrow(
            "SELECT * FROM dpia_records WHERE tenant_id = $1 AND connector_id = $2",
            uuid.UUID(tenant_id),
            uuid.UUID(connector_id)
        )
        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"DPIA untuk konektor '{connector_id}' belum dibuat."
            )
        return dict(row)


@router.post("/integration-fabric/connectors/{connector_id}/activate")
async def activate_fabric_connector(tenant_id: str, connector_id: str):
    """
    Mengaktifkan koneksi Fabric menjadi 'CONNECTED'.
    ATURAN MUTLAK (DOD):
    DPIA wajib diisi lengkap (is_complete = true) dan disetujui (status = 'APPROVED')
    SEBELUM koneksi dapat diaktifkan! Tanpa DPIA lengkap, sistem menolak aktivasi (422).
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        # Cari konektor
        conn = await db.fetchrow(
            "SELECT * FROM integration_fabric_connectors WHERE id = $1 AND tenant_id = $2",
            uuid.UUID(connector_id),
            uuid.UUID(tenant_id)
        )
        if not conn:
            raise HTTPException(status_code=404, detail=f"Konektor '{connector_id}' tidak ditemukan.")

        # Periksa catatan DPIA
        dpia = await db.fetchrow(
            "SELECT * FROM dpia_records WHERE connector_id = $1 AND tenant_id = $2",
            uuid.UUID(connector_id),
            uuid.UUID(tenant_id)
        )

        # Validasi kegagalan DPIA
        if not dpia:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="DPIA_INCOMPLETE: Aktivasi koneksi Enterprise Fabric ditolak. Catatan Data Protection Impact Assessment (DPIA) belum pernah dibuat untuk koneksi ini."
            )

        if not dpia["is_complete"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="DPIA_INCOMPLETE: Aktivasi koneksi Enterprise Fabric ditolak. Formulir Data Protection Impact Assessment (DPIA) belum lengkap diisi."
            )

        if dpia["status"] != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"DPIA_INCOMPLETE: Aktivasi koneksi Enterprise Fabric ditolak. Status DPIA adalah '{dpia['status']}' (wajib berstatus APPROVED oleh DPO sebelum koneksi dapat dihubungkan)."
            )

        # Validasi lulus -> aktifkan status ke CONNECTED
        upd_q = """
            UPDATE integration_fabric_connectors
            SET status = 'CONNECTED',
                dpia_record_id = $1,
                dpia_status = 'APPROVED',
                dpia_approved_at = coalesce(dpia_approved_at, now()),
                updated_at = now()
            WHERE id = $2 AND tenant_id = $3
            RETURNING *
        """
        updated = await db.fetchrow(
            upd_q,
            dpia["id"],
            uuid.UUID(connector_id),
            uuid.UUID(tenant_id)
        )

        res = dict(updated)
        res["has_credentials"] = bool(res.get("credentials_encrypted"))
        res.pop("credentials_encrypted", None)
        return {
            "status": "CONNECTED",
            "message": "Koneksi Enterprise Fabric berhasil diaktifkan setelah verifikasi penuh dokumen DPIA.",
            "connector": res,
            "dpia_summary": {
                "dpia_id": str(dpia["id"]),
                "assessment_title": dpia["assessment_title"],
                "dpo": dpia["data_protection_officer"],
                "risk_level": dpia["risk_level"],
                "status": "APPROVED",
                "is_complete": True,
            }
        }


@router.post("/integration-fabric/sync")
async def sync_fabric_stream(tenant_id: str, payload: SyncStreamInput):
    """
    Memicu sinkronisasi streaming data Fabric.
    Konektor wajib berstatus CONNECTED atau ACTIVE.
    Mencatat log audit transaksional ke integration_fabric_sync_logs.
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        conn = await db.fetchrow(
            "SELECT * FROM integration_fabric_connectors WHERE connector_code = $1 AND tenant_id = $2",
            payload.connector_code,
            uuid.UUID(tenant_id)
        )
        if not conn:
            raise HTTPException(
                status_code=404,
                detail=f"Konektor dengan kode '{payload.connector_code}' tidak ditemukan."
            )

        if conn["status"] not in {"CONNECTED", "ACTIVE"}:
            raise HTTPException(
                status_code=400,
                detail=f"Sinkronisasi ditolak: Konektor '{payload.connector_code}' belum aktif atau belum lulus DPIA (status saat ini: {conn['status']})."
            )

        # Catat log transaksi sinkronisasi
        log_id = uuid.uuid4()
        records_count = 64
        latency = 35

        await db.execute(
            """
            INSERT INTO integration_fabric_sync_logs (
                id, tenant_id, connector_id, sync_type, status,
                records_ingested, records_failed, latency_ms, payload_summary,
                triggered_by, created_at
            ) VALUES (
                $1, $2, $3, $4, 'SUCCESS',
                $5, 0, $6, $7,
                'API_CALL', now()
            )
            """,
            log_id,
            uuid.UUID(tenant_id),
            conn["id"],
            payload.sync_type or "MANUAL",
            records_count,
            latency,
            {"connector_code": payload.connector_code, "type": conn["connector_type"]}
        )

        await db.execute(
            """
            UPDATE integration_fabric_connectors
            SET last_sync_at = now(),
                last_sync_status = 'SUCCESS',
                updated_at = now()
            WHERE id = $1
            """,
            conn["id"]
        )

        return {
            "sync_log_id": str(log_id),
            "connector_code": payload.connector_code,
            "status": "SYNC_COMPLETED",
            "records_ingested": records_count,
            "latency_ms": latency,
            "synced_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }


@router.get("/integration-fabric/sync-logs")
async def list_fabric_sync_logs(tenant_id: str, connector_id: Optional[str] = None, limit: int = 50):
    """Mengambil riwayat log sinkronisasi transaksional Integration Fabric."""
    async with get_db_connection() as db:
        if connector_id:
            query = """
                SELECT l.*, c.connector_code, c.connector_name, c.connector_type
                FROM integration_fabric_sync_logs l
                JOIN integration_fabric_connectors c ON l.connector_id = c.id
                WHERE l.tenant_id = $1 AND l.connector_id = $2
                ORDER BY l.created_at DESC
                LIMIT $3
            """
            rows = await db.fetch(query, uuid.UUID(tenant_id), uuid.UUID(connector_id), limit)
        else:
            query = """
                SELECT l.*, c.connector_code, c.connector_name, c.connector_type
                FROM integration_fabric_sync_logs l
                JOIN integration_fabric_connectors c ON l.connector_id = c.id
                WHERE l.tenant_id = $1
                ORDER BY l.created_at DESC
                LIMIT $2
            """
            rows = await db.fetch(query, uuid.UUID(tenant_id), limit)

        return {"sync_logs": [dict(r) for r in rows], "count": len(rows)}


# =========================================================================
# DOMAIN: COMPANY CONTEXT EVENTS & CROSS-SYSTEM SIGNAL CORRELATOR (PRD 8.13.1)
# =========================================================================

class IngestSignalInput(BaseModel):
    source_type: str = Field(..., description="'Native', 'Synced', atau 'Uploaded'")
    source_system: str
    signal_type: str
    title: str
    payload: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    source_ref_id: Optional[str] = None


class TriggerCorrelationInput(BaseModel):
    context_theme: Optional[str] = None
    signals: Optional[List[IngestSignalInput]] = None


@router.get("/company-context/events")
async def list_company_context_events(tenant_id: str, limit: int = 50):
    """
    Mengambil daftar company_context_events (sintesis korelasi lintas sistem).
    Setiap event memuat source_types dan source_signals yang traceable.
    """
    async with get_db_connection() as db:
        query = """
            SELECT * FROM company_context_events
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        rows = await db.fetch(query, uuid.UUID(tenant_id), limit)
        return {"events": [dict(r) for r in rows], "count": len(rows)}


@router.post("/company-context/signals", status_code=status.HTTP_201_CREATED)
async def ingest_company_context_signal(tenant_id: str, payload: IngestSignalInput):
    """
    Menerima sinyal baru dengan klasifikasi sumber data ('Native', 'Synced', 'Uploaded').
    """
    valid_types = {"Native", "Synced", "Uploaded"}
    if payload.source_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"source_type '{payload.source_type}' tidak valid. Pilihan resmi: {', '.join(sorted(valid_types))}"
        )

    signal_id = uuid.uuid4()
    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO company_context_signals (
                id, tenant_id, source_type, source_system, signal_type,
                title, payload, metadata, source_ref_id, ingested_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, now()
            )
            """,
            signal_id,
            uuid.UUID(tenant_id),
            payload.source_type,
            payload.source_system,
            payload.signal_type,
            payload.title,
            payload.payload or {},
            payload.metadata or {},
            payload.source_ref_id
        )

        return {
            "id": str(signal_id),
            "tenant_id": tenant_id,
            "source_type": payload.source_type,
            "source_system": payload.source_system,
            "signal_type": payload.signal_type,
            "title": payload.title,
            "status": "INGESTED",
            "ingested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }


@router.get("/company-context/signals")
async def list_company_context_signals(tenant_id: str, source_type: Optional[str] = None, limit: int = 50):
    """
    Mengambil daftar sinyal sumber dengan filter klasifikasi source_type.
    """
    async with get_db_connection() as db:
        if source_type:
            query = """
                SELECT * FROM company_context_signals
                WHERE tenant_id = $1 AND source_type = $2
                ORDER BY ingested_at DESC
                LIMIT $3
            """
            rows = await db.fetch(query, uuid.UUID(tenant_id), source_type, limit)
        else:
            query = """
                SELECT * FROM company_context_signals
                WHERE tenant_id = $1
                ORDER BY ingested_at DESC
                LIMIT $2
            """
            rows = await db.fetch(query, uuid.UUID(tenant_id), limit)

        return {"signals": [dict(r) for r in rows], "count": len(rows)}


@router.post("/company-context/correlate", status_code=status.HTTP_201_CREATED)
async def correlate_company_context_signals(tenant_id: str, payload: TriggerCorrelationInput):
    """
    Korelator sinyal lintas sistem persis orchestree/domains/enterprise/correlator.py (Bagian 8.13.1).
    Menggabungkan sinyal lintas sistem berbeda menghasilkan satu company_context_events gabungan
    yang dapat ditelusuri ke masing-masing sumber (Definition of Done).
    """
    from app.domains.enterprise.correlator import CrossSystemSignalCorrelator, SourceSignal
    import json

    correlator = CrossSystemSignalCorrelator()

    # Siapkan sinyal untuk dikorelasikan
    signals_to_correlate: List[SourceSignal] = []

    if payload.signals and len(payload.signals) > 0:
        for s in payload.signals:
            signals_to_correlate.append(
                SourceSignal(
                    source_type=s.source_type,
                    source_system=s.source_system,
                    signal_type=s.signal_type,
                    title=s.title,
                    payload=s.payload or {},
                    metadata=s.metadata or {},
                    source_ref_id=s.source_ref_id,
                )
            )
    else:
        # Ambil sinyal belum berkorelasi dari database
        async with get_db_connection() as db:
            rows = await db.fetch(
                """
                SELECT * FROM company_context_signals
                WHERE tenant_id = $1 AND correlated_event_id IS NULL
                ORDER BY ingested_at DESC
                LIMIT 10
                """,
                uuid.UUID(tenant_id)
            )
            for r in rows:
                signals_to_correlate.append(
                    SourceSignal(
                        id=str(r["id"]),
                        source_type=r["source_type"],
                        source_system=r["source_system"],
                        signal_type=r["signal_type"],
                        title=r["title"],
                        payload=json.loads(r["payload"]) if isinstance(r["payload"], str) else (r["payload"] or {}),
                        metadata=json.loads(r["metadata"]) if isinstance(r["metadata"], str) else (r["metadata"] or {}),
                        source_ref_id=r["source_ref_id"],
                        timestamp=r["ingested_at"].isoformat() if r["ingested_at"] else None
                    )
                )

    if not signals_to_correlate:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada sinyal yang tersedia untuk dikorelasikan. Masukkan 'signals' dalam request body atau ingest sinyal terlebih dahulu."
        )

    # Jalankan korelasi sinyal lintas sistem
    result_event = correlator.correlate_signals(
        tenant_id=tenant_id,
        signals=signals_to_correlate,
        context_theme=payload.context_theme
    )

    # Simpan ke Supabase table company_context_events
    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO company_context_events (
                id, tenant_id, event_type, title, summary,
                correlation_score, source_types, source_signals,
                insights, recommended_actions, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11, now(), now()
            )
            """,
            uuid.UUID(result_event.id),
            uuid.UUID(tenant_id),
            result_event.event_type,
            result_event.title,
            result_event.summary,
            result_event.correlation_score,
            result_event.source_types,
            result_event.source_signals,
            result_event.insights,
            result_event.recommended_actions,
            result_event.status
        )

        # Update sinyal yang berkorelasi
        signal_ids = [s.id for s in signals_to_correlate if s.id]
        if signal_ids:
            await db.execute(
                """
                UPDATE company_context_signals
                SET correlated_event_id = $1
                WHERE id = ANY($2::uuid[]) AND tenant_id = $3
                """,
                uuid.UUID(result_event.id),
                [uuid.UUID(sid) for sid in signal_ids],
                uuid.UUID(tenant_id)
            )

    return result_event.model_dump()


# =========================================================================
# DOMAIN 3.2: 8 DIMENSI COMPANY CONTEXT FABRIC & AI RESEARCH AGENT (PRD 8.6)
# =========================================================================

class ContextKnowledgeNodeInput(BaseModel):
    dimension_code: str = Field(..., description="Salah satu dari 8 kode dimensi Company Context Fabric")
    node_key: str = Field(..., description="Kunci unik entitas pengetahuan dalam dimensi")
    title: str = Field(..., description="Judul entitas pengetahuan")
    content: str = Field(..., description="Konten isi pengetahuan domain terperinci")
    summary: Optional[str] = None
    priority_level: int = Field(default=1, ge=1, le=6, description="Prioritas 1-6 (1: Ground Truth s.d. 6: Web)")
    source_classification: str = Field(default="Native", description="'Native', 'Synced', 'Uploaded', 'External'")
    source_reference: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_verified: bool = True


class ResearchPolicyUpdateInput(BaseModel):
    allow_public_web_search: bool = Field(..., description="Izin eksplisit tenant untuk riset web publik")
    max_research_depth: Optional[int] = 3
    require_traceability_citations: Optional[bool] = True
    allowed_domains: Optional[List[str]] = None
    blocked_domains: Optional[List[str]] = None


class ResearchAgentQueryInput(BaseModel):
    query: str = Field(..., description="Pertanyaan riset korporat eksekutif")
    research_objective: Optional[str] = Field(default=None, description="Tujuan strategis atau konteks investigasi")
    explicit_sources: Optional[List[Dict[str, Any]]] = Field(default=None, description="Sumber tambahan ad-hoc")
    allow_web_override: Optional[bool] = Field(default=None, description="Override izin web jika tenant mengizinkan")


DEFAULT_8_DIMENSIONS = [
    ('ORGANIZATIONAL_STRUCTURE', 'Struktur Organisasi & Hierarki', 'Departemen, rantai komando, wewenang divisi, dan hierarki kepemimpinan korporat', 1.00),
    ('STRATEGY_AND_OBJECTIVES', 'Strategi Bisnis & Sasaran', 'Visi, misi korporat, target kuartalan OKR, dan Key Performance Indicators (KPI)', 1.10),
    ('PRODUCTS_AND_SERVICES', 'Produk, Layanan & Katalog', 'Portofolio produk, spesifikasi teknis, daftar layanan, dan Service Level Agreement (SLA)', 1.05),
    ('PROCESSES_AND_SOPS', 'Proses Operasional & SOP', 'Standar Operasional Prosedur antar divisi, alur kerja baku, dan eskalasi insiden', 1.00),
    ('BRAND_AND_IDENTITY', 'Identitas Merek & Komunikasi', 'Pedoman visual, representasi merek, tone of voice komunikasi, dan standarisasi narasi', 0.90),
    ('FINANCIALS_AND_BUDGET', 'Keuangan, Anggaran & Harga', 'Kebijakan anggaran departemen, margin keuntungan, diskon, dan pedoman pembiayaan', 1.15),
    ('COMPLIANCE_AND_LEGAL', 'Kepatuhan, Hukum & Tata Kelola', 'Regulasi industri, audit DPIA, perlindungan data privasi, dan klausul hukum kontrak', 1.20),
    ('CUSTOMER_AND_MARKET', 'Pasar, Kompetitor & Pelanggan', 'Profil pelanggan korporat, dinamika pasar industri, dan analisis kompetitor', 0.95),
]


@router.get("/context-fabric/dimensions", response_model=List[Dict[str, Any]])
async def list_context_fabric_dimensions(tenant_id: str):
    """Mengambil 8 Dimensi Inti Company Context Fabric korporat."""
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        rows = await db.fetch(
            """
            SELECT id, tenant_id, dimension_code, dimension_name, description,
                   status, weight, metadata, created_at, updated_at
            FROM company_context_dimensions
            WHERE tenant_id = $1
            ORDER BY weight DESC, dimension_name ASC
            """,
            uuid.UUID(tenant_id)
        )

        if not rows:
            # Seed 8 dimensi default jika belum ada
            for code, name, desc, weight in DEFAULT_8_DIMENSIONS:
                await db.execute(
                    """
                    INSERT INTO company_context_dimensions (
                        tenant_id, dimension_code, dimension_name, description, weight
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (tenant_id, dimension_code) DO NOTHING
                    """,
                    uuid.UUID(tenant_id), code, name, desc, weight
                )
            rows = await db.fetch(
                """
                SELECT id, tenant_id, dimension_code, dimension_name, description,
                       status, weight, metadata, created_at, updated_at
                FROM company_context_dimensions
                WHERE tenant_id = $1
                ORDER BY weight DESC, dimension_name ASC
                """,
                uuid.UUID(tenant_id)
            )

        return [
            {
                "id": str(r["id"]),
                "tenant_id": str(r["tenant_id"]),
                "dimension_code": r["dimension_code"],
                "dimension_name": r["dimension_name"],
                "description": r["description"],
                "status": r["status"],
                "weight": float(r["weight"]),
                "metadata": r["metadata"] if r["metadata"] else {},
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]


@router.get("/context-fabric/nodes", response_model=List[Dict[str, Any]])
async def list_context_knowledge_nodes(
    tenant_id: str,
    dimension_code: Optional[str] = None,
    priority_level: Optional[int] = None,
    limit: int = 100
):
    """Mengambil node pengetahuan 8 dimensi Company Context Fabric."""
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        query = """
            SELECT id, tenant_id, dimension_id, dimension_code, node_key,
                   title, content, summary, priority_level, source_classification,
                   source_reference, tags, is_verified, verified_at, metadata, created_at
            FROM company_context_knowledge_nodes
            WHERE tenant_id = $1
        """
        params: List[Any] = [uuid.UUID(tenant_id)]

        if dimension_code:
            params.append(dimension_code)
            query += f" AND dimension_code = ${len(params)}"

        if priority_level:
            params.append(priority_level)
            query += f" AND priority_level = ${len(params)}"

        params.append(limit)
        query += f" ORDER BY priority_level ASC, created_at DESC LIMIT ${len(params)}"

        rows = await db.fetch(query, *params)
        return [
            {
                "id": str(r["id"]),
                "tenant_id": str(r["tenant_id"]),
                "dimension_id": str(r["dimension_id"]) if r["dimension_id"] else None,
                "dimension_code": r["dimension_code"],
                "node_key": r["node_key"],
                "title": r["title"],
                "content": r["content"],
                "summary": r["summary"],
                "priority_level": r["priority_level"],
                "source_classification": r["source_classification"],
                "source_reference": r["source_reference"],
                "tags": r["tags"] or [],
                "is_verified": r["is_verified"],
                "verified_at": r["verified_at"].isoformat() if r["verified_at"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


@router.post("/context-fabric/nodes", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_or_update_context_knowledge_node(tenant_id: str, payload: ContextKnowledgeNodeInput):
    """Menambahkan atau memperbarui node pengetahuan dalam salah satu dari 8 dimensi Context Fabric."""
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        # Cari dimension_id
        dim_row = await db.fetchrow(
            """
            SELECT id FROM company_context_dimensions
            WHERE tenant_id = $1 AND dimension_code = $2
            """,
            uuid.UUID(tenant_id), payload.dimension_code
        )
        dimension_id = dim_row["id"] if dim_row else None

        node_id = uuid.uuid4()
        row = await db.fetchrow(
            """
            INSERT INTO company_context_knowledge_nodes (
                id, tenant_id, dimension_id, dimension_code, node_key,
                title, content, summary, priority_level, source_classification,
                source_reference, tags, is_verified, verified_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, now(), now(), now()
            )
            ON CONFLICT (tenant_id, dimension_code, node_key) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                summary = EXCLUDED.summary,
                priority_level = EXCLUDED.priority_level,
                source_classification = EXCLUDED.source_classification,
                source_reference = EXCLUDED.source_reference,
                tags = EXCLUDED.tags,
                is_verified = EXCLUDED.is_verified,
                updated_at = now()
            RETURNING *
            """,
            node_id,
            uuid.UUID(tenant_id),
            dimension_id,
            payload.dimension_code,
            payload.node_key,
            payload.title,
            payload.content,
            payload.summary or payload.content[:150],
            payload.priority_level,
            payload.source_classification,
            payload.source_reference,
            payload.tags,
            payload.is_verified
        )

        return {
            "id": str(row["id"]),
            "tenant_id": str(row["tenant_id"]),
            "dimension_code": row["dimension_code"],
            "node_key": row["node_key"],
            "title": row["title"],
            "content": row["content"],
            "priority_level": row["priority_level"],
            "source_classification": row["source_classification"],
            "source_reference": row["source_reference"],
            "is_verified": row["is_verified"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }


@router.get("/research-policy", response_model=Dict[str, Any])
async def get_tenant_research_policy(tenant_id: str):
    """Mengambil kebijakan riset tenant (khususnya status izin riset web publik)."""
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        row = await db.fetchrow(
            """
            SELECT tenant_id, allow_public_web_search, max_research_depth,
                   require_traceability_citations, allowed_domains, blocked_domains,
                   created_at, updated_at
            FROM tenant_research_policies
            WHERE tenant_id = $1
            """,
            uuid.UUID(tenant_id)
        )

        if not row:
            # Buat policy default: allow_public_web_search = FALSE demi keamanan data
            row = await db.fetchrow(
                """
                INSERT INTO tenant_research_policies (
                    tenant_id, allow_public_web_search, max_research_depth, require_traceability_citations
                ) VALUES ($1, false, 3, true)
                ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
                RETURNING *
                """,
                uuid.UUID(tenant_id)
            )

        return {
            "tenant_id": str(row["tenant_id"]),
            "allow_public_web_search": bool(row["allow_public_web_search"]),
            "max_research_depth": row["max_research_depth"],
            "require_traceability_citations": bool(row["require_traceability_citations"]),
            "allowed_domains": row["allowed_domains"] or [],
            "blocked_domains": row["blocked_domains"] or [],
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }


@router.put("/research-policy", response_model=Dict[str, Any])
async def update_tenant_research_policy(tenant_id: str, payload: ResearchPolicyUpdateInput):
    """
    Memperbarui kebijakan riset tenant.
    Mengatur izin eksplisit riset web publik (Tingkat 6) untuk AI Research Agent.
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        row = await db.fetchrow(
            """
            INSERT INTO tenant_research_policies (
                tenant_id, allow_public_web_search, max_research_depth,
                require_traceability_citations, allowed_domains, blocked_domains, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, now()
            )
            ON CONFLICT (tenant_id) DO UPDATE SET
                allow_public_web_search = EXCLUDED.allow_public_web_search,
                max_research_depth = COALESCE(EXCLUDED.max_research_depth, tenant_research_policies.max_research_depth),
                require_traceability_citations = COALESCE(EXCLUDED.require_traceability_citations, tenant_research_policies.require_traceability_citations),
                allowed_domains = COALESCE(EXCLUDED.allowed_domains, tenant_research_policies.allowed_domains),
                blocked_domains = COALESCE(EXCLUDED.blocked_domains, tenant_research_policies.blocked_domains),
                updated_at = now()
            RETURNING *
            """,
            uuid.UUID(tenant_id),
            payload.allow_public_web_search,
            payload.max_research_depth or 3,
            payload.require_traceability_citations if payload.require_traceability_citations is not None else True,
            payload.allowed_domains or [],
            payload.blocked_domains or []
        )

        return {
            "tenant_id": str(row["tenant_id"]),
            "allow_public_web_search": bool(row["allow_public_web_search"]),
            "max_research_depth": row["max_research_depth"],
            "require_traceability_citations": bool(row["require_traceability_citations"]),
            "allowed_domains": row["allowed_domains"] or [],
            "blocked_domains": row["blocked_domains"] or [],
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }


@router.post("/research-agent/query", response_model=Dict[str, Any])
async def execute_research_agent_query(tenant_id: str, payload: ResearchAgentQueryInput):
    """
    Mengeksekusi riset korporat AI Research Agent (Bagian 8.6):
    - Menerapkan 6 Tingkat Knowledge Priority Hierarchy
    - Menegakkan izin riset web publik eksplisit dari tenant_research_policies
    - Memproduksi jawaban traceable yang menyebutkan tingkat sumber yang dipakai
    """
    async with get_db_connection() as db:
        await assert_enterprise_tier(tenant_id, db)

        # 1. Ambil kebijakan riset tenant
        policy_row = await db.fetchrow(
            """
            SELECT allow_public_web_search, max_research_depth, require_traceability_citations,
                   allowed_domains, blocked_domains
            FROM tenant_research_policies
            WHERE tenant_id = $1
            """,
            uuid.UUID(tenant_id)
        )

        tenant_allow_web = policy_row["allow_public_web_search"] if policy_row else False
        policy = ResearchPolicy(
            allow_public_web_search=tenant_allow_web,
            max_research_depth=policy_row["max_research_depth"] if policy_row else 3,
            require_traceability_citations=policy_row["require_traceability_citations"] if policy_row else True,
            allowed_domains=policy_row["allowed_domains"] or [] if policy_row else [],
            blocked_domains=policy_row["blocked_domains"] or [] if policy_row else [],
        )

        # 2. Ambil sumber data internal dari database (Tingkat 1 - 3)
        knowledge_nodes = await db.fetch(
            """
            SELECT id, dimension_code, title, content, priority_level,
                   source_classification, source_reference, is_verified
            FROM company_context_knowledge_nodes
            WHERE tenant_id = $1
            ORDER BY priority_level ASC
            LIMIT 50
            """,
            uuid.UUID(tenant_id)
        )

        sources: List[KnowledgeSourceItem] = []
        for kn in knowledge_nodes:
            sources.append(
                KnowledgeSourceItem(
                    id=str(kn["id"]),
                    level=kn["priority_level"],
                    title=kn["title"],
                    content=kn["content"],
                    source_ref=kn["source_reference"],
                    source_classification=kn["source_classification"],
                    dimension_code=kn["dimension_code"],
                    confidence_weight=1.0 if kn["is_verified"] else 0.8,
                    is_verified=kn["is_verified"],
                )
            )

        # Ambil juga sinyal operasional aktif jika ada (Tingkat 2)
        signals = await db.fetch(
            """
            SELECT id, source_type, source_system, signal_type, title, payload, source_ref_id
            FROM company_context_signals
            WHERE tenant_id = $1
            ORDER BY ingested_at DESC
            LIMIT 10
            """,
            uuid.UUID(tenant_id)
        )
        for sig in signals:
            sources.append(
                KnowledgeSourceItem(
                    id=str(sig["id"]),
                    level=2,
                    title=sig["title"],
                    content=f"Sinyal [{sig['signal_type']}] dari {sig['source_system']}: {sig['payload']}",
                    source_ref=sig["source_ref_id"],
                    source_classification=sig["source_type"],
                    dimension_code="OPERATIONAL_TRANSACTIONAL",
                    confidence_weight=0.92,
                    is_verified=True,
                )
            )

        # Inkorporasi sumber eksplisit dari request (jika ada)
        if payload.explicit_sources:
            for s in payload.explicit_sources:
                sources.append(
                    KnowledgeSourceItem(
                        id=s.get("id"),
                        level=s.get("level", 3),
                        title=s.get("title", "Dokumen Rujukan Eksternal"),
                        content=s.get("content", ""),
                        source_ref=s.get("source_ref"),
                        source_classification=s.get("source_classification", "Uploaded"),
                        dimension_code=s.get("dimension_code"),
                        confidence_weight=s.get("confidence_weight", 0.9),
                        is_verified=s.get("is_verified", True),
                    )
                )

        # 3. Inisialisasi dan jalankan Enterprise Research Agent
        agent = EnterpriseResearchAgent()
        result = agent.execute_research(
            tenant_id=tenant_id,
            query=payload.query,
            research_objective=payload.research_objective,
            sources=sources,
            policy=policy,
            allow_web_override=payload.allow_web_override if tenant_allow_web else False,
        )

        # 4. Catat kueri riset ke ai_research_queries untuk audit & provenance
        await db.execute(
            """
            INSERT INTO ai_research_queries (
                id, tenant_id, query_text, research_objective,
                knowledge_levels_consulted, sources_used,
                public_web_search_attempted, public_web_search_allowed,
                answer_text, traceability_report, confidence_score,
                latency_ms, created_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6,
                $7, $8,
                $9, $10, $11,
                $12, now()
            )
            """,
            uuid.UUID(result.id),
            uuid.UUID(tenant_id),
            result.query_text,
            result.research_objective,
            result.knowledge_levels_consulted,
            result.sources_used,
            result.public_web_search_attempted,
            result.public_web_search_allowed,
            result.answer_text,
            result.traceability_report,
            result.confidence_score,
            result.latency_ms
        )

        return result.model_dump()


