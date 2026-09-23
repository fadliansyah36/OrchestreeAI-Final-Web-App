"""FastAPI Router untuk Integrasi Pihak Ketiga & Observasi Kerja (PRD v2.2 Bagian 12 & 12.9)
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
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

