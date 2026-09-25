"""
Endpoint API Onboarding & Registrasi Mandiri (PRD v2.2 Bagian 13.4 & Fase 1).
- Registrasi Tenant Baru (Self-Service Tenant Creation / Owner)
- Validasi & Submit Registrasi Staf (Join via Company Code)
"""

from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
    public_endpoint,
)
from app.core.database import get_database_engine, tenant_tx
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context, revoke_token
from app.services.company_code import generate_company_code, hash_company_code

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/onboarding", tags=["Onboarding"])
auth_router = APIRouter(prefix="/api/v1/auth", tags=["Auth & Verification"])


@auth_router.get(
    "/verify-company-code",
    summary="Verifikasi Validitas Kode Akses Perusahaan",
    dependencies=[Depends(public_endpoint("auth.verify_code"))]
)
async def verify_company_code_endpoint(code: str):
    """
    Verifikasi kode perusahaan secara aman tanpa membocorkan data sensitif:
    - Normalisasi dan hitung SHA-256 hash
    - Cari kecocokan di tenant_company_codes
    - Kembalikan nama tampilan perusahaan bila valid
    """
    if not code or len(code.strip()) < 4:
        return {"valid": False, "error": "Format kode tidak valid."}

    code_hash = hash_company_code(code.strip().upper())
    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)

    try:
        with engine.connect() as conn:
            code_row = conn.execute(
                sa.text("""
                    SELECT c.id, c.tenant_id, c.expires_at, c.max_uses, c.use_count, c.status,
                           t.display_name, t.legal_name
                    FROM tenant_company_codes c
                    JOIN tenants t ON t.id = c.tenant_id
                    WHERE c.code_hash = :hash
                    LIMIT 1;
                """),
                {"hash": code_hash}
            ).mappings().first()

        if not code_row:
            return {"valid": False, "error": "Kode perusahaan tidak ditemukan atau tidak terdaftar."}

        if code_row["status"] != "active":
            return {"valid": False, "error": "Kode perusahaan sudah tidak aktif atau dicabut."}

        if code_row["expires_at"] and code_row["expires_at"] < now_dt:
            return {"valid": False, "error": "Kode perusahaan telah kedaluwarsa."}

        if code_row["max_uses"] is not None and code_row["use_count"] >= code_row["max_uses"]:
            return {"valid": False, "error": "Kode perusahaan telah mencapai batas maksimum penggunaan."}

        return {
            "valid": True,
            "tenant_id": str(code_row["tenant_id"]),
            "display_name": code_row["display_name"] or code_row["legal_name"],
            "legal_name": code_row["legal_name"],
            "message": "Kode valid dan terdaftar"
        }
    except Exception as e:
        logger.error(f"Error checking company code: {e}")
        return {"valid": False, "error": "Gagal memverifikasi kode perusahaan."}


@auth_router.post(
    "/logout",
    summary="Logout dan Pencabutan Sesi (Revocation Registry)",
    dependencies=[Depends(public_endpoint("auth.logout"))]
)
async def logout_endpoint(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """
    Mengakhiri sesi dan mencabut token secara permanen (PRD v2.2 Bagian 15 & 16):
    - Token dicatat ke blacklist revocation registry
    - Cookie otentikasi dihapus dengan atribut keamanan ketat
    """
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    cookie_token = (
        request.cookies.get("sb-access-token")
        or request.cookies.get("orchestree_auth_token")
        or request.cookies.get("orchestree_admin_token")
    )
    target_token = token or cookie_token
    if target_token:
        revoke_token(target_token, reason="user_logout")

    response = JSONResponse(
        content={
            "status": "success",
            "message": "Sesi berhasil diakhiri secara aman dan token telah dicabut.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    response.delete_cookie("sb-access-token", path="/")
    response.delete_cookie("orchestree_auth_token", path="/")
    response.delete_cookie("orchestree_admin_token", path="/")
    response.delete_cookie("orchestree_mfa_verified", path="/")
    return response


class RegisterTenantRequest(BaseModel):
    legal_name: str = Field(..., min_length=2, description="Nama hukum resmi perusahaan")
    display_name: str = Field(..., min_length=2, description="Nama tampilan tenant")
    owner_auth_user_id: str = Field(..., description="ID user otentikasi Supabase")
    owner_full_name: str = Field(..., min_length=2, description="Nama lengkap pemilik/owner")
    plan_code: str = Field(default="FREE_TRIAL", description="Kode paket langganan")


class RegisterTenantResponse(BaseModel):
    tenant_id: str
    legal_name: str
    display_name: str
    status: str
    membership_id: str
    role: str
    created_at: str


class JoinCompanyRequest(BaseModel):
    company_code: str = Field(..., min_length=6, max_length=16, description="Kode registrasi perusahaan")
    full_name: str = Field(..., min_length=2, description="Nama lengkap calon staf")
    email: str = Field(..., min_length=5, description="Email calon staf")
    auth_user_id: str = Field(..., description="ID user otentikasi Supabase")
    department_id: Optional[str] = Field(default=None, description="ID departemen pilihan (opsional)")


class JoinCompanyResponse(BaseModel):
    status: str
    queue_id: str
    tenant_id: str
    message: str


class CreateCompanyCodeOnboardingRequest(BaseModel):
    expires_in_days: int = Field(default=30, ge=1, le=365, description="Masa berlaku kode dalam hari")
    max_uses: Optional[int] = Field(default=None, ge=1, description="Batas maksimum penggunaan")


class CreateCompanyCodeOnboardingResponse(BaseModel):
    code: str
    expires_at: Optional[str]
    max_uses: Optional[int]
    status: str
    created_at: str


class ReviewHRApprovalRequest(BaseModel):
    decision: str = Field(..., description="'approved' atau 'rejected'")
    reason: Optional[str] = Field(default=None, description="Alasan review jika ditolak")


@router.post(
    "/tenants",
    response_model=RegisterTenantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrasi Tenant Baru (Self-Service Tenant Creation)",
    dependencies=[Depends(public_endpoint("onboarding.register"))]
)
@router.post(
    "/register-tenant",
    response_model=RegisterTenantResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
    dependencies=[Depends(public_endpoint("onboarding.register"))]
)
async def register_tenant(req: RegisterTenantRequest):
    """
    Mendaftarkan perusahaan/tenant baru secara mandiri:
    1. Mengatur konteks tenant baru via tenant_tx(new_tenant_id) untuk memenuhi kebijakan RLS.
    2. Membuat entri baru pada tabel `tenants`.
    3. Menghubungkan paket langganan awal (`subscription_plans`).
    4. Mendaftarkan user sebagai anggota pertama di `tenant_memberships`.
    5. Menetapkan role `TENANT_OWNER` di `user_roles`.
    6. Mencatat aksi di `audit_logs`.
    """
    now_dt = datetime.now(timezone.utc)
    new_tenant_id = str(uuid.uuid4())
    new_membership_id = str(uuid.uuid4())

    with tenant_tx(new_tenant_id, user_id=req.owner_auth_user_id) as conn:
        # 1. Ambil subscription_plan_id
        plan_row = conn.execute(
            sa.text("SELECT id FROM subscription_plans WHERE plan_code = :code LIMIT 1;"),
            {"code": req.plan_code}
        ).mappings().first()
        plan_id = plan_row["id"] if plan_row else None

        # 2. Buat Tenant baru
        conn.execute(
            sa.text("""
                INSERT INTO tenants (
                    id, legal_name, display_name, subscription_plan_id, status, created_at
                ) VALUES (
                    :id, :legal_name, :display_name, :plan_id, 'trial', :created_at
                );
            """),
            {
                "id": new_tenant_id,
                "legal_name": req.legal_name.strip(),
                "display_name": req.display_name.strip(),
                "plan_id": plan_id,
                "created_at": now_dt,
            }
        )

        # 3. Buat Membership Owner
        conn.execute(
            sa.text("""
                INSERT INTO tenant_memberships (
                    id, tenant_id, auth_user_id, full_name, status, created_at
                ) VALUES (
                    :id, :tenant_id, :auth_user_id, :full_name, 'active', :created_at
                );
            """),
            {
                "id": new_membership_id,
                "tenant_id": new_tenant_id,
                "auth_user_id": req.owner_auth_user_id,
                "full_name": req.owner_full_name.strip(),
                "created_at": now_dt,
            }
        )

        # 4. Ambil ID role TENANT_OWNER
        role_row = conn.execute(
            sa.text("SELECT id FROM roles WHERE role_code = 'TENANT_OWNER' LIMIT 1;")
        ).mappings().first()

        if role_row:
            conn.execute(
                sa.text("""
                    INSERT INTO user_roles (
                        tenant_membership_id, role_id
                    ) VALUES (
                        :membership_id, :role_id
                    ) ON CONFLICT (tenant_membership_id, role_id) DO NOTHING;
                """),
                {
                    "membership_id": new_membership_id,
                    "role_id": role_row["id"],
                }
            )

        # 5. Audit Log
        try:
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action, resource_type, resource_id, payload_after
                    ) VALUES (
                        :tenant_id, 'human_user', :actor_id, 'tenant.registered', 'tenant', :tenant_id, :payload
                    );
                """),
                {
                    "tenant_id": new_tenant_id,
                    "actor_id": req.owner_auth_user_id,
                    "payload": json.dumps({
                        "legal_name": req.legal_name,
                        "display_name": req.display_name,
                        "plan_code": req.plan_code
                    })
                }
            )
        except Exception as e:
            logger.warning("Failed to record tenant registration audit log: %s", str(e))

    return RegisterTenantResponse(
        tenant_id=new_tenant_id,
        legal_name=req.legal_name,
        display_name=req.display_name,
        status="trial",
        membership_id=new_membership_id,
        role="TENANT_OWNER",
        created_at=now_dt.isoformat(),
    )


@router.post(
    "/join",
    response_model=JoinCompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Validasi & Submit Registrasi Staf (via Company Code)",
    dependencies=[Depends(public_endpoint("onboarding.join"))]
)
@router.post(
    "/join-company",
    response_model=JoinCompanyResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
    dependencies=[Depends(public_endpoint("onboarding.join"))]
)
async def join_company(req: JoinCompanyRequest):
    """
    Calon staf mendaftar ke perusahaan menggunakan Company Code:
    1. Memvalidasi hash Company Code (aktif, belum kedaluwarsa, belum melampaui batas penggunaan).
    2. Menempatkan pendaftaran ke dalam `hr_approval_queue` dengan status 'pending'.
    3. Notifikasi in-app siap ditinjau oleh HR / Tenant Admin.
    """
    code_hash = hash_company_code(req.company_code)
    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)

    # 1. Cari kode perusahaan menggunakan koneksi runtime
    with engine.connect() as conn:
        code_row = conn.execute(
            sa.text("""
                SELECT id, tenant_id, expires_at, max_uses, use_count, status
                FROM tenant_company_codes
                WHERE code_hash = :hash
                LIMIT 1;
            """),
            {"hash": code_hash}
        ).mappings().first()

    if not code_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kode perusahaan tidak ditemukan atau tidak valid."
        )

    if code_row["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kode perusahaan sudah tidak aktif atau dicabut."
        )

    if code_row["expires_at"] and code_row["expires_at"] < now_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kode perusahaan telah kedaluwarsa."
        )

    if code_row["max_uses"] is not None and code_row["use_count"] >= code_row["max_uses"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kode perusahaan telah mencapai batas maksimum penggunaan."
        )

    tenant_id = str(code_row["tenant_id"])
    company_code_id = str(code_row["id"])

    # 2. Masukkan ke hr_approval_queue dalam konteks tenant_tx
    with tenant_tx(tenant_id, user_id=req.auth_user_id) as conn:
        existing_queue = conn.execute(
            sa.text("""
                SELECT id FROM hr_approval_queue
                WHERE tenant_id = :tenant_id AND requesting_auth_user_id = :user_id AND status = 'pending'
                LIMIT 1;
            """),
            {"tenant_id": tenant_id, "user_id": req.auth_user_id}
        ).scalar()

        if existing_queue:
            return JoinCompanyResponse(
                status="pending",
                queue_id=str(existing_queue),
                tenant_id=tenant_id,
                message="Pendaftaran Anda sebelumnya sudah berada di antrean HR dan sedang diproses."
            )

        new_queue_id = str(uuid.uuid4())
        profile_payload = {
            "full_name": req.full_name.strip(),
            "email": req.email.strip().lower(),
            "department_id": req.department_id,
            "submitted_at": now_dt.isoformat(),
        }

        conn.execute(
            sa.text("""
                INSERT INTO hr_approval_queue (
                    id, tenant_id, requesting_auth_user_id, company_code_id,
                    submitted_profile, status, created_at
                ) VALUES (
                    :id, :tenant_id, :auth_user_id, :code_id,
                    :profile, 'pending', :created_at
                );
            """),
            {
                "id": new_queue_id,
                "tenant_id": tenant_id,
                "auth_user_id": req.auth_user_id,
                "code_id": company_code_id,
                "profile": json.dumps(profile_payload),
                "created_at": now_dt,
            }
        )

        try:
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action, resource_type, resource_id, payload_after
                    ) VALUES (
                        :tenant_id, 'human_user', :actor_id, 'hr.queue.submitted', 'hr_approval_queue', :queue_id, :payload
                    );
                """),
                {
                    "tenant_id": tenant_id,
                    "actor_id": req.auth_user_id,
                    "queue_id": new_queue_id,
                    "payload": json.dumps(profile_payload)
                }
            )
        except Exception as e:
            logger.warning("Failed to record hr queue audit log: %s", str(e))

    return JoinCompanyResponse(
        status="pending",
        queue_id=new_queue_id,
        tenant_id=tenant_id,
        message="Pendaftaran berhasil diajukan dan saat ini menunggu persetujuan HR atau Administrator."
    )


@router.post(
    "/company-codes",
    response_model=CreateCompanyCodeOnboardingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Pembuatan Kode Perusahaan Baru"
)
async def create_company_code_onboarding(
    req: CreateCompanyCodeOnboardingRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Membuat kode perusahaan baru, dilindungi otorisasi hr.company_code.manage."""
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

    return CreateCompanyCodeOnboardingResponse(
        code=plain_code,
        expires_at=expires_at_dt.isoformat(),
        max_uses=req.max_uses,
        status="active",
        created_at=now_dt.isoformat(),
    )


@router.get(
    "/hr-approvals",
    summary="Daftar Antrean HR Approval"
)
async def list_hr_approvals(
    queue_status: Optional[str] = "pending",
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengambil daftar permohonan pendaftaran staf, dilindungi hr.approval.review."""
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
            results.append({
                "id": str(r["id"]),
                "tenant_id": str(r["tenant_id"]),
                "requesting_auth_user_id": str(r["requesting_auth_user_id"]),
                "company_code_id": str(r["company_code_id"]) if r["company_code_id"] else None,
                "submitted_profile": r["submitted_profile"] if isinstance(r["submitted_profile"], dict) else json.loads(r["submitted_profile"] or "{}"),
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                "reviewed_at": r["reviewed_at"].isoformat() if hasattr(r["reviewed_at"], "isoformat") and r["reviewed_at"] else None,
                "reviewed_by": str(r["reviewed_by"]) if r["reviewed_by"] else None,
                "rejection_reason": r["rejection_reason"],
            })
        return results


@router.patch(
    "/hr-approvals/{id}/review",
    summary="Review Antrean HR Approval"
)
async def review_hr_approval(
    id: str,
    req: ReviewHRApprovalRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menyetujui atau menolak pendaftaran staf."""
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
        resource_id=id,
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
        queue_row = conn.execute(
            sa.text("""
                SELECT id, tenant_id, requesting_auth_user_id, company_code_id, submitted_profile, status
                FROM hr_approval_queue
                WHERE id = :id AND tenant_id = :tenant_id
                LIMIT 1;
            """),
            {"id": id, "tenant_id": context.tenant_id}
        ).mappings().first()

        if not queue_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Antrean pendaftaran tidak ditemukan pada tenant ini."
            )

        if queue_row["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Antrean ini sudah berstatus '{queue_row['status']}'."
            )

        target_auth_user_id = queue_row["requesting_auth_user_id"]
        company_code_id = queue_row["company_code_id"]
        profile_data = queue_row["submitted_profile"]
        if isinstance(profile_data, str):
            profile_data = json.loads(profile_data or "{}")

        if decision_val == "approved":
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

            conn.execute(
                sa.text("""
                    UPDATE hr_approval_queue
                    SET status = 'approved',
                        reviewed_at = :reviewed_at,
                        reviewed_by = :reviewed_by
                    WHERE id = :id;
                """),
                {"id": id, "reviewed_at": now_dt, "reviewed_by": reviewer_uuid}
            )

            if company_code_id:
                conn.execute(
                    sa.text("""
                        UPDATE tenant_company_codes
                        SET use_count = use_count + 1
                        WHERE id = :code_id;
                    """),
                    {"code_id": company_code_id}
                )

            message_out = "Pendaftaran staf berhasil disetujui dan akun telah aktif."
        else:
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
                    "id": id,
                    "reviewed_at": now_dt,
                    "reviewed_by": reviewer_uuid,
                    "rejection_reason": req.reason,
                }
            )
            message_out = "Pendaftaran staf telah ditolak."

    return {
        "queue_id": id,
        "status": decision_val,
        "reviewed_at": now_dt.isoformat(),
        "message": message_out,
    }


def _is_valid_uuid(val: Optional[str]) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False

