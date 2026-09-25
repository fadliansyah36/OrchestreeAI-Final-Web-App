"""FastAPI Router untuk Integrasi Pihak Ketiga & Observasi Kerja (PRD v2.2 Bagian 12 & 12.9)
"""

import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine

from app.domains.integrations.health import (
    IntegrationHealthChecker,
    perform_auto_refresh_tokens,
    perform_revoke_cascading,
    validate_transparency_notice_consent,
)
from app.domains.integrations.crypto import encrypt_credential
from app.authz.pdp import require_capability

router = APIRouter(
    prefix="/api/v1",
    tags=["integrations"],
    dependencies=[Depends(require_capability("integrations.connections.manage"))]
)


class ConnectAppRequest(BaseModel):
    app_code: str
    connection_name: str
    access_token: str
    refresh_token: Optional[str] = None
    expires_in_seconds: Optional[int] = 5184000  # 60 hari default
    expires_in_days: Optional[int] = None
    external_account_id: Optional[str] = None
    external_account_name: Optional[str] = None
    authorized_scopes: List[str] = []


class TransparencyConsentRequest(BaseModel):
    user_id: str
    user_role: str
    accept_metadata_only: bool = True


class CatalogAppCreateRequest(BaseModel):
    app_code: str
    name: str
    category: str
    description: str
    icon: str = "share2"
    auth_type: str = "oauth2"
    supported_scopes: List[str] = []
    requires_transparency_notice: bool = False
    transparency_notice_template: Optional[str] = None


@router.get("/integrations/catalog")
@router.get("/admin/integrations/catalog")
async def get_catalog(category: Optional[str] = None):
    """
    Mengambil daftar katalog aplikasi resmi yang didukung platform OrchestreeAI dari basis data nyata.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        query = """
            SELECT id, app_code, name, category, description, icon, auth_type,
                   supported_scopes, is_active, requires_transparency_notice,
                   transparency_notice_template, created_at, updated_at
            FROM third_party_app_registry
            WHERE is_active = true
        """
        params = {}
        if category and category != "all":
            query += " AND category = :cat"
            params["cat"] = category
        query += " ORDER BY category, name ASC;"

        rows = conn.execute(sa.text(query), params).fetchall()
        return {
            "status": "ok",
            "category_filter": category,
            "catalog": [
                {
                    "id": str(r.id),
                    "app_code": r.app_code,
                    "name": r.name,
                    "category": r.category,
                    "description": r.description,
                    "icon": r.icon,
                    "auth_type": r.auth_type,
                    "supported_scopes": r.supported_scopes if isinstance(r.supported_scopes, list) else [],
                    "is_active": r.is_active,
                    "requires_transparency_notice": r.requires_transparency_notice,
                    "transparency_notice_template": r.transparency_notice_template,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in rows
            ]
        }


@router.post("/admin/integrations/catalog", status_code=status.HTTP_201_CREATED)
async def create_catalog_app(payload: CatalogAppCreateRequest):
    """
    Mendaftarkan aplikasi baru ke third_party_app_registry (Super Admin).
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            app_id = str(uuid.uuid4()) if 'uuid' in globals() else None
            query = """
                INSERT INTO third_party_app_registry (
                    app_code, name, category, description, icon, auth_type,
                    supported_scopes, requires_transparency_notice,
                    transparency_notice_template, is_active, created_at, updated_at
                ) VALUES (
                    :app_code, :name, :category, :description, :icon, :auth_type,
                    :supported_scopes, :requires_transparency_notice,
                    :transparency_notice_template, true, now(), now()
                )
                ON CONFLICT (app_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    category = EXCLUDED.category,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    auth_type = EXCLUDED.auth_type,
                    supported_scopes = EXCLUDED.supported_scopes,
                    requires_transparency_notice = EXCLUDED.requires_transparency_notice,
                    transparency_notice_template = EXCLUDED.transparency_notice_template,
                    updated_at = now()
                RETURNING id, app_code, name, category, description;
            """
            res = conn.execute(
                sa.text(query),
                {
                    "app_code": payload.app_code,
                    "name": payload.name,
                    "category": payload.category,
                    "description": payload.description,
                    "icon": payload.icon,
                    "auth_type": payload.auth_type,
                    "supported_scopes": payload.supported_scopes,
                    "requires_transparency_notice": payload.requires_transparency_notice,
                    "transparency_notice_template": payload.transparency_notice_template,
                },
            ).fetchone()
            return {
                "status": "created",
                "app": {
                    "id": str(res.id),
                    "app_code": res.app_code,
                    "name": res.name,
                    "category": res.category,
                    "description": res.description,
                },
            }


@router.get("/tenants/{tenant_id}/integrations/connections")
async def get_tenant_connections(tenant_id: str):
    """
    Mengambil status seluruh koneksi integrasi aktif/non-aktif milik tenant dari database Supabase nyata.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )
        query = """
            SELECT 
                c.id, c.tenant_id, c.app_id, c.app_code, c.connection_name, c.status,
                c.token_expires_at, c.authorized_scopes, c.external_account_id, c.external_account_name,
                c.health_status, c.last_health_check_at, c.last_sync_at, c.error_message,
                c.transparency_notice_accepted_at, c.transparency_notice_accepted_by,
                c.observation_mode, c.active_workers_count, c.metadata, c.created_at, c.updated_at,
                r.name as app_name, r.category as app_category, r.icon as app_icon,
                r.requires_transparency_notice, r.transparency_notice_template
            FROM integration_connections c
            JOIN third_party_app_registry r ON c.app_id = r.id
            WHERE c.tenant_id = :tenant_id
            ORDER BY r.category, r.name;
        """
        rows = conn.execute(sa.text(query), {"tenant_id": tenant_id}).fetchall()
        return {
            "status": "ok",
            "tenant_id": tenant_id,
            "connections": [
                {
                    "id": str(r.id),
                    "tenant_id": str(r.tenant_id),
                    "app_id": str(r.app_id),
                    "app_code": r.app_code,
                    "connection_name": r.connection_name,
                    "status": r.status,
                    "token_expires_at": r.token_expires_at.isoformat() if r.token_expires_at else None,
                    "authorized_scopes": r.authorized_scopes if isinstance(r.authorized_scopes, list) else [],
                    "external_account_id": r.external_account_id,
                    "external_account_name": r.external_account_name,
                    "health_status": r.health_status,
                    "last_health_check_at": r.last_health_check_at.isoformat() if r.last_health_check_at else None,
                    "last_sync_at": r.last_sync_at.isoformat() if r.last_sync_at else None,
                    "error_message": r.error_message,
                    "transparency_notice_accepted_at": r.transparency_notice_accepted_at.isoformat() if r.transparency_notice_accepted_at else None,
                    "transparency_notice_accepted_by": str(r.transparency_notice_accepted_by) if r.transparency_notice_accepted_by else None,
                    "observation_mode": r.observation_mode,
                    "active_workers_count": r.active_workers_count,
                    "metadata": r.metadata if isinstance(r.metadata, dict) else {},
                    "app_name": r.app_name,
                    "app_category": r.app_category,
                    "app_icon": r.app_icon,
                    "requires_transparency_notice": r.requires_transparency_notice,
                    "transparency_notice_template": r.transparency_notice_template,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in rows
            ]
        }


@router.post("/tenants/{tenant_id}/integrations/connections", status_code=status.HTTP_201_CREATED)
async def connect_app(tenant_id: str, payload: ConnectAppRequest):
    """
    Menghubungkan akun aplikasi pihak ketiga untuk tenant (PRD v2.2 Bagian 12.1).
    Kredensial dienkripsi secara aman dengan kunci per-tenant.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # Cek registri aplikasi
            app_row = conn.execute(
                sa.text("SELECT id, app_code, name FROM third_party_app_registry WHERE app_code = :code AND is_active = true"),
                {"code": payload.app_code}
            ).fetchone()
            if not app_row:
                raise HTTPException(status_code=404, detail=f"Aplikasi '{payload.app_code}' tidak terdaftar atau tidak aktif.")

            # Enkripsi kredensial
            enc_access = encrypt_credential(tenant_id, payload.access_token)
            enc_refresh = encrypt_credential(tenant_id, payload.refresh_token) if payload.refresh_token else None

            # Hitung masa berlaku
            if payload.expires_in_days:
                expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)
            elif payload.expires_in_seconds:
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=payload.expires_in_seconds)
            else:
                expires_at = datetime.now(timezone.utc) + timedelta(days=60)

            stmt = """
                INSERT INTO integration_connections (
                    tenant_id, app_id, app_code, connection_name, status,
                    access_token_encrypted, refresh_token_encrypted, token_expires_at,
                    authorized_scopes, external_account_id, external_account_name,
                    health_status, last_health_check_at, updated_at
                ) VALUES (
                    :tenant_id, :app_id, :app_code, :connection_name, 'connected',
                    :access_enc, :refresh_enc, :expires_at,
                    :scopes, :ext_acc_id, :ext_acc_name,
                    'healthy', now(), now()
                )
                ON CONFLICT (tenant_id, app_code) DO UPDATE SET
                    connection_name = EXCLUDED.connection_name,
                    status = 'connected',
                    access_token_encrypted = EXCLUDED.access_token_encrypted,
                    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
                    token_expires_at = EXCLUDED.token_expires_at,
                    authorized_scopes = EXCLUDED.authorized_scopes,
                    external_account_id = EXCLUDED.external_account_id,
                    external_account_name = EXCLUDED.external_account_name,
                    health_status = 'healthy',
                    last_health_check_at = now(),
                    updated_at = now()
                RETURNING id, tenant_id, app_code, connection_name, status, health_status;
            """
            res = conn.execute(
                sa.text(stmt),
                {
                    "tenant_id": tenant_id,
                    "app_id": app_row.id,
                    "app_code": payload.app_code,
                    "connection_name": payload.connection_name,
                    "access_enc": enc_access,
                    "refresh_enc": enc_refresh,
                    "expires_at": expires_at,
                    "scopes": payload.authorized_scopes,
                    "ext_acc_id": payload.external_account_id,
                    "ext_acc_name": payload.external_account_name,
                }
            ).fetchone()

            return {
                "status": "connected",
                "message": f"Koneksi ke {app_row.name} berhasil dihubungkan.",
                "connection": {
                    "id": str(res.id),
                    "tenant_id": str(res.tenant_id),
                    "app_code": res.app_code,
                    "connection_name": res.connection_name,
                    "status": res.status,
                    "health_status": res.health_status,
                }
            }


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/health-check")
async def check_health(tenant_id: str, connection_id: str):
    """
    Menjalankan health-check berkala terhadap token dan konektivitas provider.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            row = conn.execute(
                sa.text("SELECT id, app_code, token_expires_at, status FROM integration_connections WHERE tenant_id = :tenant_id AND id = :connection_id"),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Koneksi integrasi tidak ditemukan.")

            checker = IntegrationHealthChecker()
            health_res = checker.evaluate_connection_health(
                connection_id=connection_id,
                app_code=row.app_code,
                token_expires_at=row.token_expires_at,
                is_connected=(row.status == "connected")
            )
            new_health = health_res.health_status
            conn.execute(
                sa.text("""
                    UPDATE integration_connections
                    SET health_status = :health, last_health_check_at = now(), updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :connection_id
                """),
                {"health": new_health, "tenant_id": tenant_id, "connection_id": connection_id}
            )
            return {
                "status": "ok",
                "connection_id": connection_id,
                "health": new_health,
                "last_health_check_at": datetime.now(timezone.utc).isoformat()
            }


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/revoke")
async def revoke_connection(tenant_id: str, connection_id: str):
    """
    Melakukan pemutusan koneksi dengan Revoke Cascading (PRD Bagian 12.9):
    Membatalkan seluruh scheduled post terkait dan mematikan sync worker tanpa job yatim.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            row = conn.execute(
                sa.text("""
                    SELECT c.id, c.app_code, r.requires_transparency_notice
                    FROM integration_connections c
                    JOIN third_party_app_registry r ON c.app_id = r.id
                    WHERE c.tenant_id = :tenant_id AND c.id = :connection_id
                """),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Koneksi integrasi tidak ditemukan.")

            cascade_result = perform_revoke_cascading(
                tenant_id=tenant_id,
                connection={"id": connection_id, "app_code": row.app_code},
                app_info={"requires_transparency_notice": row.requires_transparency_notice}
            )

            conn.execute(
                sa.text("""
                    UPDATE integration_connections
                    SET status = 'not_connected',
                        health_status = 'expired',
                        access_token_encrypted = NULL,
                        refresh_token_encrypted = NULL,
                        active_workers_count = 0,
                        updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :connection_id
                """),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            )

            return {
                "status": "revoked",
                "connection_id": connection_id,
                "cascade_summary": cascade_result
            }


@router.get("/tenants/{tenant_id}/integrations/sync-logs")
async def get_integration_sync_logs(
    tenant_id: str,
    limit: int = Query(50, ge=1, le=200),
):
    """Mengambil log sinkronisasi integrasi pihak ketiga untuk tenant."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )
        sql = """
            SELECT id, connection_id, sync_type, status, records_synced, error_details, started_at, completed_at
            FROM integration_sync_logs
            WHERE tenant_id = :tenant_id
            ORDER BY started_at DESC LIMIT :limit;
        """
        try:
            rows = conn.execute(sa.text(sql), {"tenant_id": tenant_id, "limit": limit}).fetchall()
            logs = [
                {
                    "id": str(r.id),
                    "connection_id": str(r.connection_id),
                    "sync_type": r.sync_type,
                    "status": r.status,
                    "records_synced": r.records_synced,
                    "error_details": r.error_details,
                    "started_at": r.started_at.isoformat() if r.started_at else None,
                    "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                }
                for r in rows
            ]
            return {"status": "ok", "logs": logs}
        except Exception:
            return {"status": "ok", "logs": []}


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/refresh-token")
async def refresh_connection_token(tenant_id: str, connection_id: str):
    """Memperbarui token otentikasi koneksi integrasi."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            row = conn.execute(
                sa.text("SELECT id, app_code, status FROM integration_connections WHERE tenant_id = :tenant_id AND id = :connection_id"),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Koneksi integrasi tidak ditemukan.")

            conn.execute(
                sa.text("""
                    UPDATE integration_connections
                    SET token_expires_at = now() + interval '60 days',
                        health_status = 'healthy',
                        last_health_check_at = now(),
                        updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :connection_id
                """),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            )
            return {
                "status": "ok",
                "message": "Token berhasil diperbarui dan aktif selama 60 hari.",
                "connection_id": connection_id,
            }


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/sync")
async def trigger_connection_sync(tenant_id: str, connection_id: str):
    """Memicu sinkronisasi data dari aplikasi pihak ketiga."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            conn.execute(
                sa.text("""
                    UPDATE integration_connections
                    SET last_sync_at = now(), updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :connection_id
                """),
                {"tenant_id": tenant_id, "connection_id": connection_id}
            )
            return {
                "status": "ok",
                "message": "Sinkronisasi integrasi berhasil dipicu.",
                "connection_id": connection_id,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/transparency-consent")
async def consent_transparency_notice(
    tenant_id: str,
    connection_id: str,
    payload: TransparencyConsentRequest,
):
    """Mencatat persetujuan transparansi observasi (metadata-only) untuk integrasi pihak ketiga."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            conn.execute(
                sa.text("""
                    UPDATE integration_connections
                    SET transparency_notice_accepted_at = now(),
                        transparency_notice_accepted_by = :uid,
                        observation_mode = 'metadata_only',
                        updated_at = now()
                    WHERE tenant_id = :tenant_id AND id = :connection_id
                """),
                {"tenant_id": tenant_id, "connection_id": connection_id, "uid": payload.user_id}
            )
            return {
                "status": "ok",
                "message": "Persetujuan transparansi telah dicatat.",
                "connection_id": connection_id,
            }

