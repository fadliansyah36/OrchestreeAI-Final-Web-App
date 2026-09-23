"""
Router Manajemen Tenant, Company Code & HR Approval Queue (PRD v2.2 Bagian 13.4 & Fase 1).
- Pengambilan Konteks Tenant & Anti-Spoofing
- Pembuatan Company Code CSPRNG (Owner/Admin)
- Manajemen Antrean HR Approval (Review Pendaftaran Staf)
"""

from datetime import datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.core.database import tenant_tx
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context
from app.services.company_code import generate_company_code

router = APIRouter(prefix="/api/v1/tenant", tags=["Tenant Security & Operations"])


class CreateCompanyCodeRequest(BaseModel):
    expires_in_days: int = Field(default=30, ge=1, le=365, description="Masa berlaku kode dalam hari")
    max_uses: Optional[int] = Field(default=None, ge=1, description="Batas maksimum penggunaan (opsional)")


class CreateCompanyCodeResponse(BaseModel):
    code: str
    expires_at: Optional[str]
    max_uses: Optional[int]
    status: str
    created_at: str


class HRQueueItemResponse(BaseModel):
    id: str
    tenant_id: str
    requesting_auth_user_id: str
    company_code_id: Optional[str]
    submitted_profile: Dict[str, Any]
    status: str
    created_at: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class ReviewHRQueueRequest(BaseModel):
    decision: str = Field(..., description="'approved' atau 'rejected'")
    rejection_reason: Optional[str] = Field(default=None, description="Alasan jika ditolak")


class ReviewHRQueueResponse(BaseModel):
    queue_id: str
    status: str
    reviewed_at: str
    message: str


@router.get("/context", summary="Ambil Konteks Tenant Terotentikasi")
async def get_tenant_context(
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengembalikan konteks tenant yang telah divalidasi anti-spoofing
    beserta peran dan kapabilitas terdaftar.
    """
    authz = authorize(
        action="tenant.settings.view",
        subject=SubjectContext(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
        ),
        resource=ResourceContext(
            tenant_id=context.tenant_id,
            resource_type="tenant"
        )
    )
    if not authz.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=authz.reason
        )

    return {
        "user_id": context.user_id,
        "tenant_id": context.tenant_id,
        "actor_type": context.actor_type,
        "roles": context.roles,
        "capabilities": context.capabilities,
        "is_mfa_verified": context.is_mfa_verified,
        "status": "authenticated",
    }


@router.post(
    "/company-codes",
    response_model=CreateCompanyCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Company Code (Owner / Tenant Admin)"
)
async def create_company_code(
    req: CreateCompanyCodeRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Membuat kode registrasi perusahaan baru (CSPRNG):
    - Plain-text kode hanya dikembalikan satu kali dalam respons API ini.
    - Hanya hash SHA-256 yang disimpan di database `tenant_company_codes`.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="tenant_company_codes",
        owner_tenant_id=context.tenant_id,
    )

    authz = authorize(subject, "hr.company_code.manage", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    plain_code, code_hash = generate_company_code()
    now_dt = datetime.now(timezone.utc)
    expires_at_dt = now_dt + timedelta(days=req.expires_in_days)
    new_id = str(uuid.uuid4())

    with tenant_tx(context.tenant_id, user_id=context.user_id) as conn:
        conn.execute(
            sa.text("""
                INSERT INTO tenant_company_codes (
                    id, tenant_id, code_hash, created_by, expires_at, max_uses, use_count, status, created_at
                ) VALUES (
                    :id, :tenant_id, :code_hash, :created_by, :expires_at, :max_uses, 0, 'active', :created_at
                );
            """),
            {
                "id": new_id,
                "tenant_id": context.tenant_id,
                "code_hash": code_hash,
                "created_by": context.user_id if _is_valid_uuid(context.user_id) else None,
                "expires_at": expires_at_dt,
                "max_uses": req.max_uses,
                "created_at": now_dt,
            }
        )

    return CreateCompanyCodeResponse(
        code=plain_code,
        expires_at=expires_at_dt.isoformat(),
        max_uses=req.max_uses,
        status="active",
        created_at=now_dt.isoformat(),
    )


@router.get(
    "/hr-queue",
    response_model=List[HRQueueItemResponse],
    summary="Daftar Antrean HR Approval (Owner / Admin / Manager)"
)
async def list_hr_queue(
    queue_status: Optional[str] = "pending",
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil daftar calon staf yang mengajukan pendaftaran ke perusahaan.
    Dilindungi oleh PDP dengan kapabilitas `hr.approval.review`.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="hr_approval_queue",
        owner_tenant_id=context.tenant_id,
    )

    authz = authorize(subject, "hr.approval.review", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    with tenant_tx(context.tenant_id, user_id=context.user_id) as conn:
        query_sql = """
            SELECT id, tenant_id, requesting_auth_user_id, company_code_id,
                   submitted_profile, status, created_at, reviewed_at, reviewed_by, rejection_reason
            FROM hr_approval_queue
            WHERE tenant_id = :tenant_id
        """
        params = {"tenant_id": context.tenant_id}

        if queue_status and queue_status != "all":
            query_sql += " AND status = :status"
            params["status"] = queue_status

        query_sql += " ORDER BY created_at DESC LIMIT 100;"

        rows = conn.execute(sa.text(query_sql), params).mappings().all()

        results = []
        for r in rows:
            results.append(
                HRQueueItemResponse(
                    id=str(r["id"]),
                    tenant_id=str(r["tenant_id"]),
                    requesting_auth_user_id=str(r["requesting_auth_user_id"]),
                    company_code_id=str(r["company_code_id"]) if r["company_code_id"] else None,
                    submitted_profile=r["submitted_profile"] if isinstance(r["submitted_profile"], dict) else json.loads(r["submitted_profile"] or "{}"),
                    status=r["status"],
                    created_at=r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    reviewed_at=r["reviewed_at"].isoformat() if hasattr(r["reviewed_at"], "isoformat") and r["reviewed_at"] else None,
                    reviewed_by=str(r["reviewed_by"]) if r["reviewed_by"] else None,
                    rejection_reason=r["rejection_reason"],
                )
            )

        return results


@router.post(
    "/hr-queue/{queue_id}/review",
    response_model=ReviewHRQueueResponse,
    summary="Review Antrean HR Approval (Approve / Reject Staf)"
)
async def review_hr_queue(
    queue_id: str,
    req: ReviewHRQueueRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Menyetujui atau menolak pendaftaran staf:
    - Jika 'approved': buat `tenant_memberships` (role `STAFF_HUMAN`), update queue jadi 'approved', update use_count kode.
    - Jika 'rejected': update status queue menjadi 'rejected' beserta alasan penolakan.
    """
    decision_val = req.decision.strip().lower()
    if decision_val not in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Keputusan review hanya boleh bernilai 'approved' atau 'rejected'."
        )

    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="hr_approval_queue",
        resource_id=queue_id,
        owner_tenant_id=context.tenant_id,
    )

    authz = authorize(subject, "hr.approval.review", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    now_dt = datetime.now(timezone.utc)
    reviewer_uuid = context.user_id if _is_valid_uuid(context.user_id) else None

    with tenant_tx(context.tenant_id, user_id=context.user_id) as conn:
        # 1. Ambil entri queue
        queue_row = conn.execute(
            sa.text("""
                SELECT id, tenant_id, requesting_auth_user_id, company_code_id, submitted_profile, status
                FROM hr_approval_queue
                WHERE id = :id AND tenant_id = :tenant_id
                LIMIT 1;
            """),
            {"id": queue_id, "tenant_id": context.tenant_id}
        ).mappings().first()

        if not queue_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Antrean pendaftaran tidak ditemukan pada tenant ini."
            )

        if queue_row["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Antrean ini sudah berstatus '{queue_row['status']}' sebelumnya."
            )

        target_auth_user_id = queue_row["requesting_auth_user_id"]
        company_code_id = queue_row["company_code_id"]
        profile_data = queue_row["submitted_profile"]
        if isinstance(profile_data, str):
            profile_data = json.loads(profile_data or "{}")

        if decision_val == "approved":
            # 2. Buat membership staf
            new_membership_id = str(uuid.uuid4())
            full_name = profile_data.get("full_name", "Staff Member")
            dept_id = profile_data.get("department_id")
            dept_uuid = dept_id if _is_valid_uuid(dept_id) else None

            conn.execute(
                sa.text("""
                    INSERT INTO tenant_memberships (
                        id, tenant_id, auth_user_id, department_id, full_name, status, created_at
                    ) VALUES (
                        :id, :tenant_id, :auth_user_id, :dept_id, :full_name, 'active', :created_at
                    ) ON CONFLICT (tenant_id, auth_user_id) DO UPDATE SET
                        status = 'active',
                        full_name = EXCLUDED.full_name;
                """),
                {
                    "id": new_membership_id,
                    "tenant_id": context.tenant_id,
                    "auth_user_id": target_auth_user_id,
                    "dept_id": dept_uuid,
                    "full_name": full_name,
                    "created_at": now_dt,
                }
            )

            # 3. Hubungkan role STAFF_HUMAN
            role_staff = conn.execute(
                sa.text("SELECT id FROM roles WHERE role_code = 'STAFF_HUMAN' LIMIT 1;")
            ).mappings().first()

            if role_staff:
                conn.execute(
                    sa.text("""
                        INSERT INTO user_roles (tenant_membership_id, role_id)
                        VALUES (:membership_id, :role_id)
                        ON CONFLICT (tenant_membership_id, role_id) DO NOTHING;
                    """),
                    {
                        "membership_id": new_membership_id,
                        "role_id": role_staff["id"],
                    }
                )

            # 4. Perbarui status queue
            conn.execute(
                sa.text("""
                    UPDATE hr_approval_queue
                    SET status = 'approved',
                        reviewed_at = :reviewed_at,
                        reviewed_by = :reviewed_by
                    WHERE id = :id;
                """),
                {
                    "id": queue_id,
                    "reviewed_at": now_dt,
                    "reviewed_by": reviewer_uuid,
                }
            )

            # 5. Naikkan use_count company code jika ada
            if company_code_id:
                conn.execute(
                    sa.text("""
                        UPDATE tenant_company_codes
                        SET use_count = use_count + 1
                        WHERE id = :code_id;
                    """),
                    {"code_id": company_code_id}
                )

            message_out = "Pendaftaran staf berhasil disetujui dan akun telah diaktifkan."

        else:
            # Ditolak
            conn.execute(
                sa.text("""
                    UPDATE hr_approval_queue
                    SET status = 'rejected',
                        reviewed_at = :reviewed_at,
                        reviewed_by = :reviewed_by,
                        rejection_reason = :rejection_reason
                    WHERE id = :id;
                """),
                {
                    "id": queue_id,
                    "reviewed_at": now_dt,
                    "reviewed_by": reviewer_uuid,
                    "rejection_reason": req.rejection_reason,
                }
            )
            message_out = "Pendaftaran staf telah ditolak."

    return ReviewHRQueueResponse(
        queue_id=queue_id,
        status=decision_val,
        reviewed_at=now_dt.isoformat(),
        message=message_out,
    )


def _is_valid_uuid(val: Optional[str]) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


@router.get(
    "/members",
    summary="Daftar Anggota Tenant Saat Ini"
)
async def list_current_tenant_members(
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengambil daftar anggota tenant beserta perannya."""
    authz = authorize(
        action="tenant.members.view",
        subject=SubjectContext(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
        ),
        resource=ResourceContext(
            tenant_id=context.tenant_id,
            resource_type="tenant"
        )
    )
    if not authz.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=authz.reason
        )
    return await list_tenant_members(tenant_id=context.tenant_id, context=context)


@router.get(
    "s/{tenant_id}/members",
    summary="Daftar Anggota Tenant (Spesifik)"
)
async def list_tenant_members(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil daftar anggota tenant beserta role yang aktif.
    Dilindungi otorisasi tenant.members.view dan isolasi tenant.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="tenant_memberships",
        owner_tenant_id=tenant_id,
    )
    authz = authorize(subject, "tenant.members.view", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    with tenant_tx(tenant_id, user_id=context.user_id) as conn:
        rows = conn.execute(
            sa.text("""
                SELECT tm.id, tm.tenant_id, tm.auth_user_id, tm.department_id,
                       tm.full_name, tm.status, tm.created_at,
                       COALESCE(r.role_code, 'STAFF_HUMAN') as role_code,
                       COALESCE(r.description, 'Staf Karyawan') as role_description
                FROM tenant_memberships tm
                LEFT JOIN user_roles ur ON ur.tenant_membership_id = tm.id
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE tm.tenant_id = :tenant_id
                ORDER BY tm.created_at ASC;
            """),
            {"tenant_id": tenant_id}
        ).mappings().all()

        results = []
        for r in rows:
            results.append({
                "membership_id": str(r["id"]),
                "tenant_id": str(r["tenant_id"]),
                "auth_user_id": str(r["auth_user_id"]),
                "department_id": str(r["department_id"]) if r["department_id"] else None,
                "full_name": r["full_name"],
                "status": r["status"],
                "role": r["role_code"],
                "role_description": r["role_description"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            })
        return results

