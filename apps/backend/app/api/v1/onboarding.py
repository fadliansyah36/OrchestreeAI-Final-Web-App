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
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header, Query
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
    session_id: Optional[str] = None
    onboarding_status: str = "in_progress"
    onboarding_required: bool = True


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

        # 5. Buat Sesi Onboarding Persona Baru untuk Owner
        new_session_id = str(uuid.uuid4())
        try:
            conn.execute(
                sa.text("""
                    INSERT INTO onboarding_persona_sessions (
                        id, tenant_id, initiated_by_membership_id, status, current_question_index, started_at
                    ) VALUES (
                        :id, :tenant_id, :membership_id, 'in_progress', 0, :started_at
                    );
                """),
                {
                    "id": new_session_id,
                    "tenant_id": new_tenant_id,
                    "membership_id": new_membership_id,
                    "started_at": now_dt,
                }
            )
        except Exception as e:
            logger.warning("Gagal membuat sesi onboarding_persona_sessions: %s", str(e))

        # 6. Audit Log
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
        session_id=new_session_id,
        onboarding_status="in_progress",
        onboarding_required=True,
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


# =============================================================================
# ONBOARDING PERSONA INTERAKTIF & COMPANY BRAIN GROUNDING (PRD v2.2 Bagian 1.3, 8.4, 14, 15)
# =============================================================================

class PersonaQuestionItem(BaseModel):
    id: str
    question_key: str
    question_text: str
    question_type: str
    options: Optional[List[Dict[str, Any]]] = None
    category: str
    display_order: int
    is_required: bool
    is_active: bool


class PersonaSessionResponse(BaseModel):
    session_id: str
    tenant_id: str
    status: str
    current_question_index: int
    memory_write_pending: bool
    total_questions: int
    answered_count: int
    questions: List[PersonaQuestionItem]
    responses: Dict[str, Any]
    started_at: str
    completed_at: Optional[str] = None


class SubmitPersonaAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer_value: Any
    next_index: Optional[int] = None
    skip_clarification: bool = False


class SubmitPersonaAnswerResponse(BaseModel):
    status: str
    session_id: str
    question_id: str
    current_question_index: int
    clarification_needed: bool = False
    clarification_question: Optional[str] = None
    answered_count: int
    total_questions: int


class CompletePersonaSessionRequest(BaseModel):
    session_id: str


class CompletePersonaSessionResponse(BaseModel):
    status: str
    session_id: str
    tenant_id: str
    redirect_to: str
    memory_write_pending: bool
    document_id: Optional[str] = None
    message: str


class RetryMemoryWriteRequest(BaseModel):
    session_id: str


class ActivateTrialRequest(BaseModel):
    tenant_id: Optional[str] = None


class ActivateTrialResponse(BaseModel):
    status: str
    plan_code: str
    plan_name: str
    trial_duration_days: int
    initial_credits: float
    redirect_to: str
    message: str


class PaidPlanCheckoutRequest(BaseModel):
    plan_code: str
    payment_gateway: str = "midtrans"
    tenant_id: Optional[str] = None


class PaidPlanCheckoutResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    amount: float
    currency: str
    plan_code: str
    plan_name: str
    payment_gateway: str
    payment_url: str
    client_key: Optional[str] = None
    status: str


class AdminCreateQuestionRequest(BaseModel):
    question_key: str = Field(..., min_length=2, max_length=100)
    question_text: str = Field(..., min_length=5)
    question_type: str = Field(..., pattern="^(single_choice|multi_choice|essay)$")
    options: Optional[List[Dict[str, Any]]] = None
    category: str = Field(..., pattern="^(company_profile|industry|target_market|pain_points|goals|team_structure|competitor_context|brand_voice)$")
    display_order: int = 0
    is_required: bool = True
    is_active: bool = True


class AdminUpdateQuestionRequest(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None
    category: Optional[str] = None
    display_order: Optional[int] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get(
    "/persona/session",
    response_model=PersonaSessionResponse,
    summary="Ambil atau Lanjutkan Sesi Persona Onboarding"
)
async def get_or_resume_persona_session(
    tenant_id: Optional[str] = Query(None),
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil atau melanjutkan sesi onboarding persona (PRD v2.2 Bagian 1.3 & 15):
    - Jika sesi sebelumnya berstatus 'abandoned' (ditinggal > 24 jam), otomatis di-resume dari index terakhir (C.1).
    - Memuat daftar pertanyaan master dari onboarding_persona_questions.
    - Memuat seluruh jawaban yang telah tersimpan server-side (C.3).
    - Terlindungi otorisasi PDP onboarding.persona.participate.
    """
    target_tenant_id = tenant_id or context.tenant_id
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=target_tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_sessions",
        owner_tenant_id=target_tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    now_dt = datetime.now(timezone.utc)
    engine = get_database_engine()

    with engine.connect() as conn:
        with conn.begin():
            # Cari sesi onboarding persona aktif atau terakhir
            session_row = conn.execute(
                sa.text("""
                    SELECT id, tenant_id, initiated_by_membership_id, status,
                           current_question_index, memory_write_pending, started_at, completed_at
                    FROM onboarding_persona_sessions
                    WHERE tenant_id = :tid
                    ORDER BY started_at DESC
                    LIMIT 1;
                """),
                {"tid": target_tenant_id}
            ).mappings().first()

            # Jika belum ada sesi (misal tenant lama), buat sesi baru
            if not session_row:
                new_sid = str(uuid.uuid4())
                membership_row = conn.execute(
                    sa.text("SELECT id FROM tenant_memberships WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1;"),
                    {"tid": target_tenant_id}
                ).mappings().first()
                membership_id = str(membership_row["id"]) if membership_row else str(uuid.uuid4())

                conn.execute(
                    sa.text("""
                        INSERT INTO onboarding_persona_sessions (
                            id, tenant_id, initiated_by_membership_id, status, current_question_index, started_at
                        ) VALUES (
                            :id, :tid, :mid, 'in_progress', 0, :started_at
                        );
                    """),
                    {
                        "id": new_sid,
                        "tid": target_tenant_id,
                        "mid": membership_id,
                        "started_at": now_dt,
                    }
                )
                session_id = new_sid
                session_status = "in_progress"
                curr_index = 0
                mem_pending = False
                started_at_str = now_dt.isoformat()
                completed_at_str = None
            else:
                session_id = str(session_row["id"])
                session_status = session_row["status"]
                curr_index = int(session_row["current_question_index"] or 0)
                mem_pending = bool(session_row["memory_write_pending"])
                started_at_str = session_row["started_at"].isoformat() if hasattr(session_row["started_at"], "isoformat") else str(session_row["started_at"])
                completed_at_str = session_row["completed_at"].isoformat() if session_row["completed_at"] and hasattr(session_row["completed_at"], "isoformat") else None

                # Penanganan Risiko C.1: Sesi abandoned di-resume otomatis dari current_question_index terakhir
                if session_status == "abandoned":
                    conn.execute(
                        sa.text("UPDATE onboarding_persona_sessions SET status = 'in_progress' WHERE id = :sid;"),
                        {"sid": session_id}
                    )
                    session_status = "in_progress"

            # Ambil seluruh pertanyaan aktif
            q_rows = conn.execute(
                sa.text("""
                    SELECT id, question_key, question_text, question_type, options,
                           category, display_order, is_required, is_active
                    FROM onboarding_persona_questions
                    WHERE is_active = true
                    ORDER BY display_order ASC;
                """)
            ).mappings().all()

            questions_list = []
            for q in q_rows:
                opts = q["options"]
                if isinstance(opts, str):
                    try:
                        opts = json.loads(opts)
                    except Exception:
                        opts = None
                questions_list.append(PersonaQuestionItem(
                    id=str(q["id"]),
                    question_key=q["question_key"],
                    question_text=q["question_text"],
                    question_type=q["question_type"],
                    options=opts,
                    category=q["category"],
                    display_order=q["display_order"],
                    is_required=q["is_required"],
                    is_active=q["is_active"],
                ))

            # Ambil jawaban tersimpan
            resp_rows = conn.execute(
                sa.text("SELECT question_id, answer_value FROM onboarding_persona_responses WHERE session_id = :sid;"),
                {"sid": session_id}
            ).mappings().all()

            responses_map = {}
            for r in resp_rows:
                val = r["answer_value"]
                if isinstance(val, str):
                    try:
                        val = json.loads(val)
                    except Exception:
                        pass
                responses_map[str(r["question_id"])] = val

    return PersonaSessionResponse(
        session_id=session_id,
        tenant_id=target_tenant_id,
        status=session_status,
        current_question_index=curr_index,
        memory_write_pending=mem_pending,
        total_questions=len(questions_list),
        answered_count=len(responses_map),
        questions=questions_list,
        responses=responses_map,
        started_at=started_at_str,
        completed_at=completed_at_str,
    )


@router.post(
    "/persona/response",
    response_model=SubmitPersonaAnswerResponse,
    summary="Simpan Jawaban Kuesioner Persona Bertahap (Idempotent Server-Side)"
)
async def submit_persona_answer(
    req: SubmitPersonaAnswerRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Menyimpan jawaban per pertanyaan secara bertahap (PRD v2.2 Bagian C.2 & C.3):
    - Server-side state update setiap langkah (anti data-loss saat refresh).
    - Idempotent via UNIQUE (session_id, question_id).
    - Node 2 adaptif: menyusun pertanyaan klarifikasi jika jawaban esai ambigu/terlalu singkat.
    - Terlindungi otorisasi PDP onboarding.persona.participate.
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
        resource_type="onboarding_persona_responses",
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)
    clarification_needed = False
    clarification_question = None

    with engine.connect() as conn:
        with conn.begin():
            # Verifikasi kepemilikan sesi
            ses = conn.execute(
                sa.text("SELECT id, tenant_id, status FROM onboarding_persona_sessions WHERE id = :sid AND tenant_id = :tid;"),
                {"sid": req.session_id, "tid": context.tenant_id}
            ).mappings().first()

            if not ses:
                raise HTTPException(status_code=404, detail="Sesi onboarding persona tidak ditemukan pada tenant ini.")

            # Ambil data pertanyaan
            q_row = conn.execute(
                sa.text("SELECT id, question_key, question_text, question_type, is_required FROM onboarding_persona_questions WHERE id = :qid;"),
                {"qid": req.question_id}
            ).mappings().first()

            if not q_row:
                raise HTTPException(status_code=404, detail="Pertanyaan tidak ditemukan.")

            # Simpan jawaban (Idempotent ON CONFLICT DO UPDATE)
            answer_payload = req.answer_value
            if isinstance(answer_payload, (dict, list)):
                answer_json = json.dumps(answer_payload)
            else:
                answer_json = json.dumps(str(answer_payload))

            conn.execute(
                sa.text("""
                    INSERT INTO onboarding_persona_responses (
                        id, session_id, question_id, answer_value, answered_at
                    ) VALUES (
                        gen_random_uuid(), :sid, :qid, :val::jsonb, :answered_at
                    )
                    ON CONFLICT (session_id, question_id) DO UPDATE SET
                        answer_value = EXCLUDED.answer_value,
                        answered_at = EXCLUDED.answered_at;
                """),
                {
                    "sid": req.session_id,
                    "qid": req.question_id,
                    "val": answer_json,
                    "answered_at": now_dt,
                }
            )

            # Update current_question_index jika diberikan
            next_idx = req.next_index if req.next_index is not None else 0
            conn.execute(
                sa.text("""
                    UPDATE onboarding_persona_sessions
                    SET current_question_index = :nidx
                    WHERE id = :sid;
                """),
                {"nidx": next_idx, "sid": req.session_id}
            )

            # Hitung statistik
            answered_cnt = conn.execute(
                sa.text("SELECT count(*) FROM onboarding_persona_responses WHERE session_id = :sid;"),
                {"sid": req.session_id}
            ).scalar() or 0

            total_cnt = conn.execute(
                sa.text("SELECT count(*) FROM onboarding_persona_questions WHERE is_active = true;")
            ).scalar() or 0

    # Node 2 Adaptif (Opsional-Klarifikasi jika esai sangat singkat)
    if q_row["question_type"] == "essay" and not req.skip_clarification:
        ans_text = str(req.answer_value or "").strip()
        if ans_text and (len(ans_text) < 15 or len(ans_text.split()) < 3):
            try:
                from app.core.model_router.router import get_model_router, ModelRouterRequest
                model_router = get_model_router()
                llm_prompt = (
                    f"Pengguna sedang mengisi kuesioner onboarding perusahaan baru. Jawaban esai terkini mereka: \"{ans_text}\". "
                    f"Pertanyaan kuesionernya: \"{q_row['question_text']}\". "
                    f"Karena jawaban ini terlalu singkat atau ambigu, susunlah SATU pertanyaan klarifikasi lanjutan "
                    f"yang santun, ringkas (maksimal 1 kalimat), dan relevan agar profil Company Brain dapat diground dengan presisi."
                )
                llm_res = await model_router.route(
                    ModelRouterRequest(
                        tenant_id=context.tenant_id,
                        task_type="text_generation",
                        prompt=llm_prompt,
                        temperature=0.3,
                        max_tokens=80,
                    )
                )
                if llm_res.status == "success" and llm_res.content.strip():
                    clarification_needed = True
                    clarification_question = llm_res.content.strip()
            except Exception as e:
                logger.warning(f"Gagal generate pertanyaan klarifikasi persona: {e}")

    return SubmitPersonaAnswerResponse(
        status="saved",
        session_id=req.session_id,
        question_id=req.question_id,
        current_question_index=next_idx,
        clarification_needed=clarification_needed,
        clarification_question=clarification_question,
        answered_count=int(answered_cnt),
        total_questions=int(total_cnt),
    )


@router.post(
    "/persona/complete",
    response_model=CompletePersonaSessionResponse,
    summary="Selesaikan Persona Onboarding & Tulis ke Company Brain (Internal Only)"
)
async def complete_persona_session(
    req: CompletePersonaSessionRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Menyelesaikan sesi kuesioner onboarding persona (PRD v2.2 Bagian B & C):
    - Validasi seluruh pertanyaan is_required=true wajib terjawab.
    - Menjalankan Node 3 (TOOL_CALL: memory.write_persona_profile).
    - Menyimpan profil terstruktur ke memory_documents dengan audience_scope='internal_only'.
    - Membuat vector embedding nyata (1536 dimensi).
    - Biaya inferensi ditanggung platform (Credit Ledger: platform_cost).
    - Menandai sesi selesai dan menyiapkan sinyal redirect ke Pricing/Checkout.
    - Fallback jika LLM down: memory_write_pending=true, alur checkout tidak terhambat.
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
        resource_type="onboarding_persona_sessions",
        resource_id=req.session_id,
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Otorisasi ditolak: {authz.reason}"
        )

    # Eksekusi tool memory.write_persona_profile
    from app.skills.f01_mcp.decorators import get_tool_registry, ToolExecutionContext
    registry = get_tool_registry()

    tool_ctx = ToolExecutionContext(
        tenant_id=context.tenant_id,
        actor_id=context.user_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
        execution_context="internal_dashboard",
    )

    try:
        tool_result = await registry.invoke_tool(
            name="memory.write_persona_profile",
            context=tool_ctx,
            input_data={"session_id": req.session_id, "tenant_id": context.tenant_id},
        )
    except Exception as exc:
        logger.error(f"Gagal memproses write_persona_profile: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))

    is_pending = bool(tool_result.get("memory_write_pending", False))
    doc_id = tool_result.get("document_id")

    return CompletePersonaSessionResponse(
        status="completed",
        session_id=req.session_id,
        tenant_id=context.tenant_id,
        redirect_to="pricing_checkout",
        memory_write_pending=is_pending,
        document_id=doc_id,
        message=(
            "Profil perusahaan berhasil disimpan di Company Brain internal."
            if not is_pending
            else "Kuesioner persona selesai. Sinkronisasi Company Brain sedang dijadwalkan secara asinkron."
        ),
    )


@router.post(
    "/persona/retry-memory",
    summary="Jadwal Ulang Sinkronisasi Company Brain yang Tertunda"
)
async def retry_pending_memory_write(
    req: RetryMemoryWriteRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Retry job penulisan profil Company Brain jika sebelumnya tertunda karena LLM provider down (Bagian C.6)."""
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_sessions",
        resource_id=req.session_id,
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    from app.skills.f01_mcp.decorators import get_tool_registry, ToolExecutionContext
    registry = get_tool_registry()

    tool_ctx = ToolExecutionContext(
        tenant_id=context.tenant_id,
        actor_id=context.user_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
        execution_context="internal_dashboard",
    )

    result = await registry.invoke_tool(
        name="memory.write_persona_profile",
        context=tool_ctx,
        input_data={"session_id": req.session_id, "tenant_id": context.tenant_id},
    )
    return result


@router.post(
    "/checkout/trial",
    response_model=ActivateTrialResponse,
    summary="Aktivasi Langsung Paket Uji Coba (Tanpa Gateway Pembayaran)"
)
async def activate_trial_plan(
    req: ActivateTrialRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Aktivasi paket Trial langsung tanpa melibatkan gateway pembayaran Midtrans (Bagian C.5 & Prompt Commercial):
    - Mengatur paket langganan ke TRIAL.
    - Mengaktifkan status tenant ke 'active'.
    - Mengalokasikan 250,000 IDR kuota kredit AI awal.
    - Terlindungi otorisasi PDP.
    """
    target_tenant_id = req.tenant_id or context.tenant_id
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=target_tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="tenant_subscriptions",
        owner_tenant_id=target_tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    now_dt = datetime.now(timezone.utc)
    engine = get_database_engine()

    with engine.connect() as conn:
        with conn.begin():
            # Cari data plan trial
            p_row = conn.execute(
                sa.text("""
                    SELECT id, plan_code, display_name, ai_credit_allowance, trial_duration_days
                    FROM subscription_plans
                    WHERE is_trial = true OR plan_code = 'TRIAL'
                    LIMIT 1;
                """)
            ).mappings().first()

            if not p_row:
                raise HTTPException(status_code=404, detail="Paket uji coba (Trial) tidak ditemukan di katalog sistem.")

            plan_id = p_row["id"]
            plan_code = p_row["plan_code"]
            plan_name = p_row["display_name"]
            trial_days = int(p_row["trial_duration_days"] or 14)
            credit_allowance = float(p_row["ai_credit_allowance"] or 250000.0)

            # Update status tenant ke active
            conn.execute(
                sa.text("""
                    UPDATE tenants
                    SET subscription_plan_id = :pid,
                        status = 'active',
                        updated_at = now()
                    WHERE id = :tid;
                """),
                {"pid": plan_id, "tid": target_tenant_id}
            )

            # Buat / update subscription
            cycle_end = now_dt + timedelta(days=trial_days)
            conn.execute(
                sa.text("""
                    INSERT INTO tenant_subscriptions (
                        id, tenant_id, plan_id, status, billing_cycle_start, billing_cycle_end, created_at
                    ) VALUES (
                        gen_random_uuid(), :tid, :pid, 'trialing', :c_start, :c_end, now()
                    )
                    ON CONFLICT (tenant_id) DO UPDATE SET
                        plan_id = EXCLUDED.plan_id,
                        status = 'trialing',
                        billing_cycle_start = EXCLUDED.billing_cycle_start,
                        billing_cycle_end = EXCLUDED.billing_cycle_end;
                """),
                {
                    "tid": target_tenant_id,
                    "pid": plan_id,
                    "c_start": now_dt,
                    "c_end": cycle_end,
                }
            )

            # Inisialisasi / topup dompet kredit
            conn.execute(
                sa.text("""
                    INSERT INTO tenant_credit_wallet (
                        id, tenant_id, balance, reserved_balance, low_balance_threshold, currency
                    ) VALUES (
                        gen_random_uuid(), :tid, :bal, 0.0000, 50000.0000, 'IDR'
                    )
                    ON CONFLICT (tenant_id) DO UPDATE SET
                        balance = GREATEST(tenant_credit_wallet.balance, EXCLUDED.balance),
                        updated_at = now();
                """),
                {"tid": target_tenant_id, "bal": credit_allowance}
            )

            # Audit Log
            try:
                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            tenant_id, actor_type, actor_id, action, resource_type, resource_id, payload_after
                        ) VALUES (
                            :tid, 'human_user', :aid, 'subscription.trial_activated', 'tenant_subscriptions', :tid, :meta
                        );
                    """),
                    {
                        "tid": target_tenant_id,
                        "aid": context.user_id if _is_valid_uuid(context.user_id) else None,
                        "meta": json.dumps({"plan_code": plan_code, "trial_days": trial_days, "credits": credit_allowance}),
                    }
                )
            except Exception as audit_err:
                logger.warning(f"Gagal mencatat audit trial activation: {audit_err}")

    return ActivateTrialResponse(
        status="active",
        plan_code=plan_code,
        plan_name=plan_name,
        trial_duration_days=trial_days,
        initial_credits=credit_allowance,
        redirect_to="/overview",
        message="Paket uji coba berhasil diaktifkan. Selamat datang di OrchestreeAI!",
    )


@router.post(
    "/checkout/paid",
    response_model=PaidPlanCheckoutResponse,
    summary="Checkout Paket Langganan Berbayar Resmi (Midtrans)"
)
async def checkout_paid_plan(
    req: PaidPlanCheckoutRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Checkout paket langganan komersial berbayar (Starter, Professional, Enterprise):
    - Membuat faktur langganan resmi di tabel invoices.
    - Menghasilkan token dan redirect URL Midtrans Snap nyata.
    - Setelah pembayaran tervalidasi via webhook resmi, entitlement otomatis aktif.
    - Terlindungi otorisasi PDP.
    """
    target_tenant_id = req.tenant_id or context.tenant_id
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=target_tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="invoices",
        owner_tenant_id=target_tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.participate", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    target_code = req.plan_code.upper()
    engine = get_database_engine()

    with engine.connect() as conn:
        p_row = conn.execute(
            sa.text("""
                SELECT id, plan_code, display_name, monthly_price_idr, price_monthly, currency
                FROM subscription_plans
                WHERE plan_code = :pcode
                LIMIT 1;
            """),
            {"pcode": target_code}
        ).mappings().first()

    if not p_row:
        raise HTTPException(status_code=404, detail=f"Paket langganan '{target_code}' tidak ditemukan.")

    plan_id = str(p_row["id"])
    plan_name = p_row["display_name"]
    amount = float(p_row["monthly_price_idr"] or p_row["price_monthly"] or 0)
    currency = p_row["currency"] or "IDR"

    invoice_id = str(uuid.uuid4())
    order_id = f"INV-SUB-{uuid.uuid4().hex[:8].upper()}"

    from app.core.config import settings
    payment_url = f"https://app.sandbox.midtrans.com/snap/v2/vtweb/{order_id}"

    # Jika Midtrans Server Key tersedia, panggil Midtrans Snap API secara nyata
    if settings.MIDTRANS_SERVER_KEY and amount > 0:
        try:
            import httpx
            import base64
            auth_str = base64.b64encode(f"{settings.MIDTRANS_SERVER_KEY}:".encode()).decode()
            snap_endpoint = "https://app.sandbox.midtrans.com/snap/v1/transactions"
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    snap_endpoint,
                    headers={
                        "Authorization": f"Basic {auth_str}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "transaction_details": {
                            "order_id": order_id,
                            "gross_amount": int(amount),
                        },
                        "item_details": [
                            {
                                "id": plan_id,
                                "price": int(amount),
                                "quantity": 1,
                                "name": f"Langganan {plan_name}",
                            }
                        ],
                    },
                )
                if res.status_code in (200, 201):
                    snap_data = res.json()
                    payment_url = snap_data.get("redirect_url", payment_url)
        except Exception as snap_err:
            logger.warning(f"Gagal memanggil Midtrans Snap API, menggunakan fallback URL: {snap_err}")

    # Simpan faktur ke database
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(
                sa.text("""
                    INSERT INTO invoices (
                        id, tenant_id, invoice_number, amount, currency, status,
                        payment_gateway, payment_reference, payment_url, items
                    ) VALUES (
                        :id, :tid, :inv_num, :amt, :curr, 'pending',
                        :gw, :ref, :purl, :items
                    );
                """),
                {
                    "id": invoice_id,
                    "tid": target_tenant_id,
                    "inv_num": order_id,
                    "amt": amount,
                    "curr": currency,
                    "gw": req.payment_gateway,
                    "ref": order_id,
                    "purl": payment_url,
                    "items": json.dumps([{
                        "type": "subscription_cycle",
                        "plan_id": plan_id,
                        "plan_code": target_code,
                        "name": f"Langganan {plan_name}",
                        "amount": amount,
                        "qty": 1,
                    }]),
                }
            )

    return PaidPlanCheckoutResponse(
        invoice_id=invoice_id,
        invoice_number=order_id,
        amount=amount,
        currency=currency,
        plan_code=target_code,
        plan_name=plan_name,
        payment_gateway=req.payment_gateway,
        payment_url=payment_url,
        client_key=settings.MIDTRANS_CLIENT_KEY,
        status="pending",
    )


# =============================================================================
# SUPER ADMIN QUESTION CURATOR SCREEN CRUD (PRD v2.2 Bagian E & 18.2)
# =============================================================================

@router.get(
    "/questions/admin",
    summary="Super Admin: Ambil Semua Pertanyaan Persona Onboarding"
)
async def admin_list_persona_questions(
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengambil seluruh daftar pertanyaan persona onboarding termasuk yang non-aktif untuk Super Admin."""
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_questions",
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.manage", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT id, question_key, question_text, question_type, options,
                       category, display_order, is_required, is_active, created_at, updated_at
                FROM onboarding_persona_questions
                ORDER BY display_order ASC, created_at ASC;
            """)
        ).mappings().all()

        results = []
        for r in rows:
            opts = r["options"]
            if isinstance(opts, str):
                try:
                    opts = json.loads(opts)
                except Exception:
                    pass
            results.append({
                "id": str(r["id"]),
                "question_key": r["question_key"],
                "question_text": r["question_text"],
                "question_type": r["question_type"],
                "options": opts,
                "category": r["category"],
                "display_order": r["display_order"],
                "is_required": r["is_required"],
                "is_active": r["is_active"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                "updated_at": r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
            })
    return {"questions": results}


@router.post(
    "/questions/admin",
    summary="Super Admin: Tambah Pertanyaan Persona Onboarding Baru"
)
async def admin_create_persona_question(
    req: AdminCreateQuestionRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menambahkan pertanyaan persona onboarding baru ke repositori platform."""
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_questions",
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.manage", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    new_id = str(uuid.uuid4())
    engine = get_database_engine()

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(
                sa.text("""
                    INSERT INTO onboarding_persona_questions (
                        id, question_key, question_text, question_type, options,
                        category, display_order, is_required, is_active
                    ) VALUES (
                        :id, :key, :text, :qtype, :opts::jsonb,
                        :cat, :order, :req, :act
                    );
                """),
                {
                    "id": new_id,
                    "key": req.question_key.strip(),
                    "text": req.question_text.strip(),
                    "qtype": req.question_type,
                    "opts": json.dumps(req.options) if req.options else None,
                    "cat": req.category,
                    "order": req.display_order,
                    "req": req.is_required,
                    "act": req.is_active,
                }
            )

    return {"status": "created", "id": new_id, "message": "Pertanyaan persona baru berhasil ditambahkan."}


@router.put(
    "/questions/admin/{question_id}",
    summary="Super Admin: Update Pertanyaan Persona Onboarding"
)
async def admin_update_persona_question(
    question_id: str,
    req: AdminUpdateQuestionRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Memperbarui teks, urutan, atau opsi pertanyaan persona onboarding."""
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_questions",
        resource_id=question_id,
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.manage", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            q_row = conn.execute(
                sa.text("SELECT id FROM onboarding_persona_questions WHERE id = :qid;"),
                {"qid": question_id}
            ).fetchone()
            if not q_row:
                raise HTTPException(status_code=404, detail="Pertanyaan tidak ditemukan.")

            updates = []
            params: Dict[str, Any] = {"qid": question_id}

            if req.question_text is not None:
                updates.append("question_text = :text")
                params["text"] = req.question_text.strip()
            if req.question_type is not None:
                updates.append("question_type = :qtype")
                params["qtype"] = req.question_type
            if req.options is not None:
                updates.append("options = :opts::jsonb")
                params["opts"] = json.dumps(req.options)
            if req.category is not None:
                updates.append("category = :cat")
                params["cat"] = req.category
            if req.display_order is not None:
                updates.append("display_order = :order")
                params["order"] = req.display_order
            if req.is_required is not None:
                updates.append("is_required = :req")
                params["req"] = req.is_required
            if req.is_active is not None:
                updates.append("is_active = :act")
                params["act"] = req.is_active

            if updates:
                updates.append("updated_at = now()")
                sql = f"UPDATE onboarding_persona_questions SET {', '.join(updates)} WHERE id = :qid;"
                conn.execute(sa.text(sql), params)

    return {"status": "updated", "id": question_id, "message": "Pertanyaan berhasil diperbarui."}


@router.delete(
    "/questions/admin/{question_id}",
    summary="Super Admin: Hapus atau Nonaktifkan Pertanyaan Persona"
)
async def admin_delete_persona_question(
    question_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menonaktifkan pertanyaan persona agar tidak muncul di kuesioner tenant baru."""
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        actor_type=context.actor_type,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="onboarding_persona_questions",
        resource_id=question_id,
        owner_tenant_id=context.tenant_id,
    )
    authz = authorize(subject, "onboarding.persona.manage", resource)
    if not authz.is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Otorisasi ditolak: {authz.reason}")

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(
                sa.text("UPDATE onboarding_persona_questions SET is_active = false, updated_at = now() WHERE id = :qid;"),
                {"qid": question_id}
            )

    return {"status": "deactivated", "id": question_id, "message": "Pertanyaan dinonaktifkan."}


def _is_valid_uuid(val: Optional[str]) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


