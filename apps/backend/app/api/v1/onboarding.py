"""
Endpoint API Onboarding & Registrasi Mandiri (PRD v2.2 Bagian 13.4 & Fase 1).
- Registrasi Tenant Baru (Self-Service Tenant Creation / Owner)
- Validasi & Submit Registrasi Staf (Join via Company Code)
"""

from datetime import datetime, timezone
import json
from typing import Optional
import uuid
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine, tenant_tx
from app.services.company_code import hash_company_code

router = APIRouter(prefix="/api/v1/onboarding", tags=["Onboarding"])


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


@router.post(
    "/register-tenant",
    response_model=RegisterTenantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrasi Tenant Baru (Self-Service Tenant Creation)"
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
        except Exception:
            pass

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
    "/join-company",
    response_model=JoinCompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Validasi & Submit Registrasi Staf (via Company Code)"
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
        except Exception:
            pass

    return JoinCompanyResponse(
        status="pending",
        queue_id=new_queue_id,
        tenant_id=tenant_id,
        message="Pendaftaran berhasil diajukan dan saat ini menunggu persetujuan HR atau Administrator."
    )
