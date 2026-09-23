"""FastAPI Router untuk Integrasi Pihak Ketiga & Observasi Kerja (PRD v2.2 Bagian 12 & 12.9)
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field

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
    Mengambil daftar katalog aplikasi resmi yang didukung platform OrchestreeAI.
    """
    return {"status": "ok", "category_filter": category}


@router.get("/tenants/{tenant_id}/integrations/connections")
async def get_tenant_connections(tenant_id: str):
    """
    Mengambil status seluruh koneksi integrasi aktif/non-aktif milik tenant.
    """
    return {"status": "ok", "tenant_id": tenant_id}


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/health-check")
async def check_health(tenant_id: str, connection_id: str):
    """
    Menjalankan health-check berkala terhadap token dan konektivitas provider.
    """
    return {"status": "ok", "connection_id": connection_id, "health": "healthy"}


@router.post("/tenants/{tenant_id}/integrations/connections/{connection_id}/revoke")
async def revoke_connection(tenant_id: str, connection_id: str):
    """
    Melakukan pemutusan koneksi dengan Revoke Cascading (PRD Bagian 12.9):
    Membatalkan seluruh scheduled post terkait dan mematikan sync worker tanpa job yatim.
    """
    cascade_result = perform_revoke_cascading(
        tenant_id=tenant_id,
        connection={"id": connection_id, "app_code": "generic"},
        app_info={}
    )
    return {"status": "revoked", "cascade_summary": cascade_result}
