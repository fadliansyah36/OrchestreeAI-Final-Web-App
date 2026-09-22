"""
Router pemeriksaan konteks tenant dan verifikasi keamanan RLS (PRD v2.2 Bagian 2.6).
"""

from fastapi import APIRouter, Depends
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context

router = APIRouter(prefix="/api/v1/tenant", tags=["Tenant Security"])


@router.get("/context", summary="Ambil Konteks Tenant Terotentikasi")
async def get_tenant_context(
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengembalikan konteks tenant yang telah divalidasi anti-spoofing.
    """
    return {
        "user_id": context.user_id,
        "tenant_id": context.tenant_id,
        "roles": context.roles,
        "status": "authenticated",
    }
