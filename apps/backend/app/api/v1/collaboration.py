"""
Router Kolaborasi Staf Human x AI Agent & Konfigurasi Access Tier (PRD v2.2 Bagian 3.5, 6.2, 8.10, 10.3, 10.6, 15)
Python 3.12 + FastAPI + Supabase Postgres
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.authz.pdp import require_capability
from app.domains.workforce.access_tier import (
    get_access_tier,
    get_membership_info,
    get_eligible_agents_for_collaboration,
    list_agent_collaborations,
    create_agent_collaboration,
    delete_agent_collaboration,
    update_role_access_tier,
    list_roles_with_access_tier,
    NotApplicableForExecutiveTierException,
)

logger = logging.getLogger("orchestree.api.collaboration")

router = APIRouter(
    prefix="/api/v1/tenants/{tenant_id}",
    tags=["Collaboration & Access Tier System"],
)


class CreateCollaborationPayload(BaseModel):
    ai_agent_id: str = Field(..., description="UUID AI Agent yang akan dikolaborasikan")
    is_primary: bool = Field(default=False, description="Apakah AI Agent ini kolaborator utama")
    membership_id: Optional[str] = Field(None, description="Opsional ID membership staf (default dari header/konteks)")


class UpdateRoleAccessTierPayload(BaseModel):
    access_tier: str = Field(..., pattern="^(staff|department_lead|executive)$", description="Tingkat akses baru")


def _resolve_membership_id(
    tenant_id: str,
    explicit_mid: Optional[str],
    header_mid: Optional[str],
    header_uid: Optional[str],
) -> str:
    """Mencari UUID tenant_membership_id dari parameter atau konteks login."""
    if explicit_mid:
        return explicit_mid
    if header_mid:
        return header_mid

    if header_uid:
        from app.core.database import get_database_engine
        import sqlalchemy as sa
        eng = get_database_engine()
        with eng.connect() as conn:
            row = conn.execute(
                sa.text("""
                    SELECT id FROM tenant_memberships
                    WHERE tenant_id = :tid AND (auth_user_id::text = :uid OR id::text = :uid) AND status = 'active'
                    LIMIT 1;
                """),
                {"tid": tenant_id, "uid": header_uid},
            ).fetchone()
            if row:
                return str(row[0])

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Header 'x-membership-id' atau parameter 'membership_id' wajib disediakan."
    )


# ==============================================================================
# 1. ELIGIBLE AGENTS FOR PROACTIVE COLLABORATION
# ==============================================================================

@router.get("/proactive/eligible-agents", summary="Daftar AI Agent Terseleksi untuk Kolaborasi Staf")
async def get_eligible_agents_endpoint(
    tenant_id: str,
    membership_id: Optional[str] = Query(None, description="UUID Membership staf pemohon"),
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    _auth=Depends(require_capability("proactive.messages.manage")),
):
    """
    Mengambil daftar AI Agent yang BOLEH dipilih oleh staf untuk kolaborasi proaktif harian.
    Dibatasi ketat pada lingkup departemen/kategori fungsional staf.
    AI Chief of Staff dan AI Company Intelligence (cross-department) TIDAK PERNAH muncul.
    Tier eksekutif ditolak dengan pesan jelas bahwa mereka otomatis didampingi AI Chief of Staff.
    """
    resolved_mid = _resolve_membership_id(tenant_id, membership_id, x_membership_id, x_user_id)
    agents = get_eligible_agents_for_collaboration(resolved_mid)
    return {
        "status": "ok",
        "tenant_id": tenant_id,
        "membership_id": resolved_mid,
        "count": len(agents),
        "data": agents,
    }


# ==============================================================================
# 2. PROACTIVE AGENT COLLABORATIONS CRUD
# ==============================================================================

@router.get("/proactive/collaborations", summary="Daftar Kolaborasi AI Agent Aktif Staf")
async def list_collaborations_endpoint(
    tenant_id: str,
    membership_id: Optional[str] = Query(None, description="UUID Membership staf pemohon"),
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    _auth=Depends(require_capability("proactive.messages.manage")),
):
    """Mengambil daftar kolaborasi AI Agent yang terdaftar untuk staf saat ini."""
    resolved_mid = _resolve_membership_id(tenant_id, membership_id, x_membership_id, x_user_id)
    collabs = list_agent_collaborations(tenant_id, resolved_mid)
    return {
        "status": "ok",
        "tenant_id": tenant_id,
        "membership_id": resolved_mid,
        "count": len(collabs),
        "data": collabs,
    }


@router.post("/proactive/collaborations", status_code=status.HTTP_201_CREATED, summary="Daftarkan Kolaborasi Staf x AI Agent")
async def create_collaboration_endpoint(
    tenant_id: str,
    payload: CreateCollaborationPayload,
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    _auth=Depends(require_capability("proactive.collaboration.manage")),
):
    """
    Mendaftarkan kolaborasi antara Staff Human dengan AI Agent.
    Validasi backend ketat: ai_agent_id WAJIB terdaftar pada hasil get_eligible_agents_for_collaboration().
    """
    resolved_mid = _resolve_membership_id(tenant_id, payload.membership_id, x_membership_id, x_user_id)
    collab = create_agent_collaboration(
        tenant_id=tenant_id,
        membership_id=resolved_mid,
        ai_agent_id=payload.ai_agent_id,
        is_primary=payload.is_primary,
        added_by=resolved_mid,
    )
    return {
        "status": "ok",
        "message": "Kolaborasi Staf x AI Agent berhasil didaftarkan.",
        "data": collab,
    }


@router.delete("/proactive/collaborations/{collaboration_id}", summary="Hapus Hubungan Kolaborasi Staf x AI Agent")
async def delete_collaboration_endpoint(
    tenant_id: str,
    collaboration_id: str,
    membership_id: Optional[str] = Query(None),
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    _auth=Depends(require_capability("proactive.collaboration.manage")),
):
    """Menghapus kolaborasi AI Agent milik staf."""
    resolved_mid = _resolve_membership_id(tenant_id, membership_id, x_membership_id, x_user_id)
    deleted = delete_agent_collaboration(tenant_id, resolved_mid, collaboration_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Kolaborasi tidak ditemukan atau akses ditolak.")
    return {
        "status": "ok",
        "message": "Kolaborasi berhasil dihapus.",
        "deleted": True,
    }


# ==============================================================================
# 3. ACCESS TIER CONFIGURATION (OWNER / HR GOVERNANCE)
# ==============================================================================

@router.get("/access-tier/roles", summary="Daftar Peran dan Tingkat Akses (Access Tier)")
async def list_access_tier_roles_endpoint(
    tenant_id: str,
    _auth=Depends(require_capability("enterprise.roles.manage")),
):
    """Mengambil master peran tenant beserta tingkat aksesnya (executive, department_lead, staff)."""
    roles = list_roles_with_access_tier()
    return {
        "status": "ok",
        "tenant_id": tenant_id,
        "data": roles,
    }


@router.patch("/access-tier/roles/{role_code}", summary="Ubah Tingkat Akses Peran (Audit Ledger)")
async def update_role_access_tier_endpoint(
    tenant_id: str,
    role_code: str,
    payload: UpdateRoleAccessTierPayload,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    _auth=Depends(require_capability("enterprise.roles.manage")),
):
    """
    Owner/Direksi mengubah access_tier peran (mis. TENANT_ADMIN menjadi department_lead).
    Perubahan dicatat secara permanen di audit log sistem.
    """
    actor_id = x_user_id or "system_owner"
    result = update_role_access_tier(
        tenant_id=tenant_id,
        role_code=role_code,
        new_tier=payload.access_tier,
        actor_id=actor_id,
    )
    return {
        "status": "ok",
        "message": f"Tingkat akses peran '{role_code}' berhasil diubah menjadi '{payload.access_tier}'.",
        "data": result,
    }
