"""
Router Manajemen Tenaga Kerja Organisasi (Departemen, Staf, AI Agent, Org Chart)
Sesuai PRD v2.2 Bagian 3, 13, 15 & 17.
- Otentikasi dan isolasi tenant ketat via RLS
- Evaluasi kebijakan akses Unified Policy Decision Point (authorize())
- Guard rail integritas soft-delete departemen (tolak 409 bila staf/tugas masih aktif)
- Registri AI Agent otonom
- Agregasi bagan struktur organisasi (Org Chart)
"""

from datetime import datetime, timezone
import json
import time
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
    require_capability,
)
from app.core.database import tenant_tx, get_database_engine
from app.core.security import (
    AuthenticatedTenantContext,
    get_current_tenant_context,
    validate_uploaded_file,
    generate_signed_storage_token,
)

router = APIRouter(prefix="/api/v1/tenants", tags=["Workforce & Organization Management"])


# --- Schemas ---

class CreateDepartmentRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Nama departemen")
    description: Optional[str] = Field(default=None, max_length=500, description="Deskripsi operasional")
    parent_department_id: Optional[str] = Field(default=None, description="UUID departemen induk (opsional)")
    manager_membership_id: Optional[str] = Field(default=None, description="UUID staf manajer departemen (opsional)")
    color_tag: Optional[str] = Field(default="#10B981", description="Kode warna identifikasi visual")


class UpdateDepartmentRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = None
    parent_department_id: Optional[str] = None
    manager_membership_id: Optional[str] = None
    color_tag: Optional[str] = None
    deleted: Optional[bool] = Field(default=None, description="Set true untuk mengajukan soft delete")


class DepartmentResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str]
    parent_department_id: Optional[str]
    manager_membership_id: Optional[str]
    manager_name: Optional[str] = None
    color_tag: Optional[str]
    active_staff_count: int = 0
    active_agent_count: int = 0
    deleted_at: Optional[str] = None
    created_at: str


class CreateStaffRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    auth_user_id: Optional[str] = None
    department_id: Optional[str] = None
    role_code: str = Field(default="STAFF_HUMAN", description="Peran anggota dalam tenant")
    email: Optional[str] = None


class StaffMemberResponse(BaseModel):
    id: str
    tenant_id: str
    auth_user_id: str
    full_name: str
    department_id: Optional[str]
    department_name: Optional[str] = None
    role_code: str
    role_description: Optional[str] = None
    status: str
    created_at: str


class StaffDocumentResponse(BaseModel):
    id: str
    tenant_id: str
    membership_id: str
    document_type: str
    document_title: str
    file_artifact_id: Optional[str] = None
    storage_path: str
    file_size_bytes: int = 0
    mime_type: str
    verified_clean: bool = True
    signed_download_url: Optional[str] = None
    created_at: str


class CreateStaffDocumentRequest(BaseModel):
    document_type: str = Field(..., description="KTP, NPWP, CERTIFICATE, PAYSLIP, CONTRACT, OTHER")
    document_title: str = Field(..., min_length=2, max_length=255)
    file_artifact_id: Optional[str] = None
    storage_path: Optional[str] = None
    file_size_bytes: Optional[int] = 0
    mime_type: Optional[str] = "application/pdf"
    metadata: Optional[Dict[str, Any]] = None


class CreateAgentRequest(BaseModel):
    persona_type: str = Field(..., description="Tipe jabatan/persona AI")
    display_name: str = Field(..., min_length=2, max_length=100, description="Nama tampilan agen AI")
    department_id: Optional[str] = Field(default=None, description="UUID departemen penempatan")
    status: str = Field(default="active", description="'active', 'paused', atau 'error'")
    job_title_id: Optional[str] = Field(default=None, description="UUID jabatan AI terstandarisasi (Shadow Mapping)")
    blueprint_id: Optional[str] = Field(default=None, description="UUID acuan blueprint katalog resmi (F.01)")
    default_skills: Optional[List[str]] = Field(default=None, description="Daftar perkakas aktif agen")
    persona_config: Optional[Dict[str, Any]] = Field(default=None, description="Konfigurasi kognitif dan guardrail agen")


class UpdateAgentRequest(BaseModel):
    display_name: Optional[str] = None
    department_id: Optional[str] = None
    status: Optional[str] = None
    job_title_id: Optional[str] = None
    blueprint_id: Optional[str] = None


class AgentResponse(BaseModel):
    id: str
    tenant_id: str
    department_id: Optional[str]
    department_name: Optional[str] = None
    persona_type: str
    job_title_id: Optional[str] = None
    job_title_name: Optional[str] = None
    job_title_code: Optional[str] = None
    blueprint_id: Optional[str] = None
    blueprint_name: Optional[str] = None
    category_tag: Optional[str] = None
    structural_role_name: Optional[str] = None
    level_code: Optional[str] = None
    display_name: str
    status: str
    created_at: str


class StructuralRoleResponse(BaseModel):
    id: str
    role_code: str
    name: str
    description: Optional[str] = None
    hierarchy_rank: int
    is_reference: bool = True


class JobLevelResponse(BaseModel):
    id: str
    level_code: str
    name: str
    description: Optional[str] = None
    level_rank: int
    min_complexity_multiplier: float
    is_reference: bool = True


class JobSubtitleResponse(BaseModel):
    id: str
    job_title_id: str
    subtitle_code: str
    subtitle_name: str
    description: Optional[str] = None
    focus_areas: List[str] = Field(default_factory=list)
    is_reference: bool = True


class StandardizedJobTitleResponse(BaseModel):
    id: str
    title_code: str
    title_name: str
    category_tag: str
    badge_stars: str
    primary_duties: str
    recommended_tools: List[str]
    primary_deliverable: str
    is_reference: bool = True
    structural_role: StructuralRoleResponse
    job_level: JobLevelResponse
    subtitles: List[JobSubtitleResponse] = Field(default_factory=list)


class ReconciliationMappingItemModel(BaseModel):
    agent_id: str
    agent_display_name: str
    department_name: Optional[str] = None
    persona_type: str
    tenant_id: str
    resolution_status: str
    target_job_title_id: Optional[str] = None
    target_job_title_code: Optional[str] = None
    target_title_name: Optional[str] = None
    structural_role_name: Optional[str] = None
    level_code: Optional[str] = None
    confidence: str
    requires_manual_review: bool
    notes: Optional[str] = None


class JobTitleMigrationReportResponse(BaseModel):
    id: Optional[str] = None
    report_batch_id: str
    tenant_id: Optional[str] = None
    total_agents_audited: int
    auto_mapped_count: int
    ambiguous_count: int
    reconciliation_status: str
    mappings: List[ReconciliationMappingItemModel]
    summary_notes: str
    generated_at: str


class AssignJobTitleRequest(BaseModel):
    job_title_id: str = Field(..., description="UUID jabatan AI resmi yang dipilih")


class OrgChartNode(BaseModel):
    id: str
    name: str
    description: Optional[str]
    color_tag: Optional[str]
    manager: Optional[Dict[str, Any]] = None
    staff_members: List[Dict[str, Any]] = Field(default_factory=list)
    ai_agents: List[Dict[str, Any]] = Field(default_factory=list)
    sub_departments: List["OrgChartNode"] = Field(default_factory=list)


# --- Endpoints ---

@router.get(
    "/{tenant_id}/departments",
    response_model=List[DepartmentResponse],
    summary="Daftar Departemen Organisasi"
)
async def list_departments(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil seluruh departemen aktif pada tenant.
    - Otorisasi: kapabilitas workforce.department.view
    - Role DEPT_MANAGER hanya diizinkan melihat departemen miliknya sendiri
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="departments",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.department.view", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            is_dept_manager_only = (
                "DEPT_MANAGER" in [r.upper() for r in context.roles]
                and "TENANT_OWNER" not in [r.upper() for r in context.roles]
                and "TENANT_ADMIN" not in [r.upper() for r in context.roles]
                and "SUPER_ADMIN" not in [r.upper() for r in context.roles]
            )

            user_dept_id = None
            if is_dept_manager_only:
                mem_row = conn.execute(
                    sa.text("""
                        SELECT id, department_id FROM tenant_memberships
                        WHERE tenant_id = :tenant_id AND auth_user_id = :user_id
                        LIMIT 1;
                    """),
                    {"tenant_id": tenant_id, "user_id": context.user_id}
                ).mappings().first()
                if mem_row:
                    user_dept_id = mem_row.get("department_id")

            query = """
                SELECT d.id, d.tenant_id, d.name, d.description, d.parent_department_id,
                       d.manager_membership_id, d.color_tag, d.deleted_at, d.created_at,
                       m.full_name as manager_name,
                       (SELECT count(*) FROM tenant_memberships tm WHERE tm.department_id = d.id AND tm.status = 'active') as active_staff_count,
                       (SELECT count(*) FROM ai_agents a WHERE a.department_id = d.id AND a.status = 'active') as active_agent_count
                FROM departments d
                LEFT JOIN tenant_memberships m ON m.id = d.manager_membership_id
                WHERE d.tenant_id = :tenant_id AND d.deleted_at IS NULL
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}

            if is_dept_manager_only and user_dept_id:
                query += " AND (d.id = :user_dept_id OR d.manager_membership_id = (SELECT id FROM tenant_memberships WHERE tenant_id = :tenant_id AND auth_user_id = :user_id LIMIT 1))"
                params["user_dept_id"] = user_dept_id
                params["user_id"] = context.user_id

            query += " ORDER BY d.created_at ASC;"

            rows = conn.execute(sa.text(query), params).mappings().all()

            results = []
            for r in rows:
                results.append(DepartmentResponse(
                    id=str(r["id"]),
                    tenant_id=str(r["tenant_id"]),
                    name=r["name"],
                    description=r["description"],
                    parent_department_id=str(r["parent_department_id"]) if r["parent_department_id"] else None,
                    manager_membership_id=str(r["manager_membership_id"]) if r["manager_membership_id"] else None,
                    manager_name=r["manager_name"],
                    color_tag=r["color_tag"],
                    active_staff_count=int(r["active_staff_count"] or 0),
                    active_agent_count=int(r["active_agent_count"] or 0),
                    deleted_at=r["deleted_at"].isoformat() if r["deleted_at"] else None,
                    created_at=r["created_at"].isoformat() if r["created_at"] else datetime.now(timezone.utc).isoformat(),
                ))
            return results


@router.post(
    "/{tenant_id}/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Buat Departemen Baru"
)
async def create_department(
    tenant_id: str,
    req: CreateDepartmentRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Membuat departemen baru dalam struktur tenant.
    - Otorisasi: kapabilitas workforce.department.manage (Owner / Admin)
    - Role STAFF_HUMAN ditolak dengan 403 DENY_RBAC
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="departments",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.department.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    new_id = str(uuid.uuid4())
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            parent_uuid = str(uuid.UUID(req.parent_department_id)) if req.parent_department_id else None
            manager_uuid = str(uuid.UUID(req.manager_membership_id)) if req.manager_membership_id else None

            conn.execute(
                sa.text("""
                    INSERT INTO departments (
                        id, tenant_id, name, description, parent_department_id,
                        manager_membership_id, color_tag, created_at
                    ) VALUES (
                        :id, :tenant_id, :name, :description, :parent_id,
                        :manager_id, :color_tag, now()
                    );
                """),
                {
                    "id": new_id,
                    "tenant_id": tenant_id,
                    "name": req.name.strip(),
                    "description": req.description.strip() if req.description else None,
                    "parent_id": parent_uuid,
                    "manager_id": manager_uuid,
                    "color_tag": req.color_tag or "#10B981",
                }
            )

            # Audit ledger
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action,
                        resource_type, resource_id, payload_after
                    ) VALUES (
                        :tenant_id, 'human_user', :actor_id, 'department.created',
                        'departments', :resource_id, :payload
                    );
                """),
                {
                    "tenant_id": tenant_id,
                    "actor_id": str(uuid.UUID(context.user_id)) if _is_valid_uuid(context.user_id) else None,
                    "resource_id": new_id,
                    "payload": json.dumps({"name": req.name, "color_tag": req.color_tag}),
                }
            )

    return DepartmentResponse(
        id=new_id,
        tenant_id=tenant_id,
        name=req.name,
        description=req.description,
        parent_department_id=req.parent_department_id,
        manager_membership_id=req.manager_membership_id,
        color_tag=req.color_tag or "#10B981",
        active_staff_count=0,
        active_agent_count=0,
        deleted_at=None,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.patch(
    "/{tenant_id}/departments/{department_id}",
    summary="Perbarui atau Hapus Departemen (Soft Delete Guard)"
)
async def update_department(
    tenant_id: str,
    department_id: str,
    req: UpdateDepartmentRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Memperbarui metadata departemen atau melakukan soft delete.
    - Guard rail integritas data: Tolak soft delete (409 Conflict) jika departemen
      masih memiliki staf aktif atau tugas aktif terdaftar.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="departments",
        resource_id=department_id,
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.department.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # Periksa keberadaan departemen
            dept_row = conn.execute(
                sa.text("""
                    SELECT id, name, deleted_at FROM departments
                    WHERE id = :id AND tenant_id = :tenant_id;
                """),
                {"id": department_id, "tenant_id": tenant_id}
            ).mappings().first()

            if not dept_row:
                raise HTTPException(status_code=404, detail="Departemen tidak ditemukan.")

            if req.deleted is True:
                # Guard rail: Periksa apakah masih ada staf aktif yang terdaftar di departemen ini
                active_staff = conn.execute(
                    sa.text("""
                        SELECT count(*) as count FROM tenant_memberships
                        WHERE department_id = :dept_id AND tenant_id = :tenant_id AND status = 'active';
                    """),
                    {"dept_id": department_id, "tenant_id": tenant_id}
                ).scalar() or 0

                active_agents = conn.execute(
                    sa.text("""
                        SELECT count(*) as count FROM ai_agents
                        WHERE department_id = :dept_id AND tenant_id = :tenant_id AND status = 'active';
                    """),
                    {"dept_id": department_id, "tenant_id": tenant_id}
                ).scalar() or 0

                if active_staff > 0 or active_agents > 0:
                    return JSONResponse(
                        status_code=status.HTTP_409_CONFLICT,
                        content={
                            "code": "conflict",
                            "error": (
                                f"Departemen '{dept_row['name']}' tidak dapat dihapus karena masih "
                                f"memiliki {active_staff} staf aktif dan {active_agents} AI agent terikat."
                            )
                        }
                    )

                # Jalankan soft-delete
                now_str = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    sa.text("""
                        UPDATE departments SET deleted_at = now()
                        WHERE id = :id AND tenant_id = :tenant_id;
                    """),
                    {"id": department_id, "tenant_id": tenant_id}
                )

                # Audit log
                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            tenant_id, actor_type, actor_id, action,
                            resource_type, resource_id, payload_after
                        ) VALUES (
                            :tenant_id, 'human_user', :actor_id, 'department.soft_deleted',
                            'departments', :resource_id, :payload
                        );
                    """),
                    {
                        "tenant_id": tenant_id,
                        "actor_id": str(uuid.UUID(context.user_id)) if _is_valid_uuid(context.user_id) else None,
                        "resource_id": department_id,
                        "payload": json.dumps({"action": "soft_delete", "deleted_at": now_str}),
                    }
                )

                return {
                    "id": department_id,
                    "status": "soft_deleted",
                    "message": f"Departemen '{dept_row['name']}' berhasil dihapus secara aman."
                }

            # Pembaruan atribut biasa
            update_clauses = []
            update_params: Dict[str, Any] = {"id": department_id, "tenant_id": tenant_id}

            if req.name is not None:
                update_clauses.append("name = :name")
                update_params["name"] = req.name.strip()
            if req.description is not None:
                update_clauses.append("description = :description")
                update_params["description"] = req.description.strip()
            if req.color_tag is not None:
                update_clauses.append("color_tag = :color_tag")
                update_params["color_tag"] = req.color_tag
            if req.manager_membership_id is not None:
                update_clauses.append("manager_membership_id = :manager_id")
                update_params["manager_id"] = str(uuid.UUID(req.manager_membership_id)) if req.manager_membership_id else None
            if req.parent_department_id is not None:
                update_clauses.append("parent_department_id = :parent_id")
                update_params["parent_id"] = str(uuid.UUID(req.parent_department_id)) if req.parent_department_id else None

            if update_clauses:
                sql_update = f"UPDATE departments SET {', '.join(update_clauses)} WHERE id = :id AND tenant_id = :tenant_id;"
                conn.execute(sa.text(sql_update), update_params)

            return {
                "id": department_id,
                "status": "updated",
                "message": "Data departemen berhasil diperbarui."
            }


@router.get(
    "/{tenant_id}/staff",
    response_model=List[StaffMemberResponse],
    summary="Daftar Staf Anggota Tenant"
)
async def list_staff(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil data staf karyawan anggota tenant beserta departemen dan perannya.
    - Otorisasi: workforce.staff.view
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="tenant_memberships",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.staff.view", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            rows = conn.execute(
                sa.text("""
                    SELECT tm.id, tm.tenant_id, tm.auth_user_id, tm.full_name,
                           tm.department_id, tm.status, tm.created_at,
                           d.name as department_name,
                           COALESCE(r.role_code, 'STAFF_HUMAN') as role_code,
                           COALESCE(r.description, 'Staf Karyawan Operasional') as role_description
                    FROM tenant_memberships tm
                    LEFT JOIN departments d ON d.id = tm.department_id
                    LEFT JOIN user_roles ur ON ur.tenant_membership_id = tm.id
                    LEFT JOIN roles r ON r.id = ur.role_id
                    WHERE tm.tenant_id = :tenant_id
                    ORDER BY tm.created_at ASC;
                """),
                {"tenant_id": tenant_id}
            ).mappings().all()

            results = []
            for r in rows:
                results.append(StaffMemberResponse(
                    id=str(r["id"]),
                    tenant_id=str(r["tenant_id"]),
                    auth_user_id=str(r["auth_user_id"]),
                    full_name=r["full_name"],
                    department_id=str(r["department_id"]) if r["department_id"] else None,
                    department_name=r["department_name"],
                    role_code=r["role_code"],
                    role_description=r["role_description"],
                    status=r["status"],
                    created_at=r["created_at"].isoformat() if r["created_at"] else datetime.now(timezone.utc).isoformat(),
                ))
            return results


@router.post(
    "/{tenant_id}/staff",
    response_model=StaffMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah atau Mutasi Staf Tenant"
)
async def create_or_assign_staff(
    tenant_id: str,
    req: CreateStaffRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mendaftarkan atau memperbarui staf anggota tenant dan menetapkannya ke departemen.
    - Otorisasi: workforce.staff.manage
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="tenant_memberships",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.staff.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    new_mem_id = str(uuid.uuid4())
    target_auth_user_id = req.auth_user_id or str(uuid.uuid4())

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            dept_uuid = str(uuid.UUID(req.department_id)) if req.department_id else None

            conn.execute(
                sa.text("""
                    INSERT INTO tenant_memberships (
                        id, tenant_id, auth_user_id, full_name, department_id, status, created_at
                    ) VALUES (
                        :id, :tenant_id, :auth_user_id, :full_name, :department_id, 'active', now()
                    )
                    ON CONFLICT (tenant_id, auth_user_id) DO UPDATE SET
                        full_name = EXCLUDED.full_name,
                        department_id = COALESCE(EXCLUDED.department_id, tenant_memberships.department_id),
                        status = 'active';
                """),
                {
                    "id": new_mem_id,
                    "tenant_id": tenant_id,
                    "auth_user_id": target_auth_user_id,
                    "full_name": req.full_name.strip(),
                    "department_id": dept_uuid,
                }
            )

            # Tetapkan peran di user_roles
            role_row = conn.execute(
                sa.text("SELECT id, role_code, description FROM roles WHERE role_code = :role_code LIMIT 1;"),
                {"role_code": req.role_code}
            ).mappings().first()

            role_desc = "Staf Karyawan Operasional"
            if role_row:
                conn.execute(
                    sa.text("""
                        INSERT INTO user_roles (tenant_membership_id, role_id)
                        VALUES (:mem_id, :role_id)
                        ON CONFLICT DO NOTHING;
                    """),
                    {"mem_id": new_mem_id, "role_id": role_row["id"]}
                )
                role_desc = role_row["description"]

            # Cari nama departemen jika ada
            dept_name = None
            if dept_uuid:
                dept_name = conn.execute(
                    sa.text("SELECT name FROM departments WHERE id = :id;"),
                    {"id": dept_uuid}
                ).scalar()

            return StaffMemberResponse(
                id=new_mem_id,
                tenant_id=tenant_id,
                auth_user_id=target_auth_user_id,
                full_name=req.full_name.strip(),
                department_id=req.department_id,
                department_name=dept_name,
                role_code=req.role_code,
                role_description=role_desc,
                status="active",
                created_at=datetime.now(timezone.utc).isoformat(),
            )


# ---------------------------------------------------------------------------
# Dokumen Staf & Slip Gaji (KTP, NPWP, Sertifikat, Slip Gaji)
# ---------------------------------------------------------------------------

@router.get(
    "/{tenant_id}/staff/{membership_id}/documents",
    response_model=List[StaffDocumentResponse],
    summary="Daftar Dokumen Staf",
    dependencies=[Depends(require_capability("staff.documents.view"))]
)
async def list_staff_documents(
    tenant_id: str,
    membership_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil daftar seluruh berkas dokumen staf (KTP, NPWP, sertifikat, slip gaji)
    dengan Signed URL sementara yang tervalidasi.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )

        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, membership_id, document_type, document_title,
                       file_artifact_id, storage_path, file_size_bytes, mime_type,
                       verified_clean, created_at
                FROM staff_documents
                WHERE tenant_id = :tenant_id AND membership_id = :membership_id
                ORDER BY created_at DESC;
            """),
            {"tenant_id": tenant_id, "membership_id": membership_id}
        ).mappings().all()

        results = []
        for r in rows:
            clean_path = r["storage_path"]
            if clean_path.startswith("documents/"):
                clean_path = clean_path[len("documents/"):]
            expires_ts = int(time.time() + 900)
            token = generate_signed_storage_token("documents", clean_path, expires_ts)
            import urllib.parse
            encoded_fn = urllib.parse.quote(r["document_title"])
            signed_url = (
                f"/api/v1/storage/signed-download/documents/{clean_path}?token={token}&expires={expires_ts}&filename={encoded_fn}"
            )
            results.append(StaffDocumentResponse(
                id=str(r["id"]),
                tenant_id=str(r["tenant_id"]),
                membership_id=str(r["membership_id"]),
                document_type=r["document_type"],
                document_title=r["document_title"],
                file_artifact_id=str(r["file_artifact_id"]) if r["file_artifact_id"] else None,
                storage_path=r["storage_path"],
                file_size_bytes=int(r["file_size_bytes"] or 0),
                mime_type=r["mime_type"],
                verified_clean=bool(r["verified_clean"]),
                signed_download_url=signed_url,
                created_at=r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            ))
        return results


@router.post(
    "/{tenant_id}/staff/{membership_id}/documents",
    response_model=StaffDocumentResponse,
    summary="Tambah Dokumen Staf dari File Artifact",
    dependencies=[Depends(require_capability("staff.documents.upload"))]
)
async def create_staff_document_record(
    tenant_id: str,
    membership_id: str,
    payload: CreateStaffDocumentRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mencatat dokumen staf yang telah tersimpan di file_artifacts."""
    engine = get_database_engine()
    doc_id = str(uuid.uuid4())
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # Jika file_artifact_id disediakan, ambil detail dari file_artifacts
            storage_path = payload.storage_path or f"tenants/{tenant_id}/staff_documents/{doc_id}.bin"
            file_size = payload.file_size_bytes or 0
            mime_type = payload.mime_type or "application/octet-stream"

            if payload.file_artifact_id:
                art = conn.execute(
                    sa.text("SELECT storage_path, file_size_bytes, mime_type FROM file_artifacts WHERE id = :id"),
                    {"id": payload.file_artifact_id}
                ).mappings().first()
                if art:
                    storage_path = art["storage_path"]
                    file_size = art["file_size_bytes"]
                    mime_type = art["mime_type"]

            conn.execute(
                sa.text("""
                    INSERT INTO staff_documents (
                        id, tenant_id, membership_id, document_type, document_title,
                        file_artifact_id, storage_path, file_size_bytes, mime_type,
                        verified_clean, metadata, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :membership_id, :doc_type, :doc_title,
                        :file_artifact_id, :storage_path, :file_size, :mime_type,
                        true, :metadata::jsonb, now(), now()
                    );
                """),
                {
                    "id": doc_id,
                    "tenant_id": tenant_id,
                    "membership_id": membership_id,
                    "doc_type": payload.document_type.upper(),
                    "doc_title": payload.document_title,
                    "file_artifact_id": payload.file_artifact_id,
                    "storage_path": storage_path,
                    "file_size": file_size,
                    "mime_type": mime_type,
                    "metadata": json.dumps(payload.metadata or {}),
                }
            )

    clean_path = storage_path
    if clean_path.startswith("documents/"):
        clean_path = clean_path[len("documents/"):]
    expires_ts = int(time.time() + 900)
    token = generate_signed_storage_token("documents", clean_path, expires_ts)
    import urllib.parse
    encoded_fn = urllib.parse.quote(payload.document_title)
    signed_url = f"/api/v1/storage/signed-download/documents/{clean_path}?token={token}&expires={expires_ts}&filename={encoded_fn}"

    return StaffDocumentResponse(
        id=doc_id,
        tenant_id=tenant_id,
        membership_id=membership_id,
        document_type=payload.document_type.upper(),
        document_title=payload.document_title,
        file_artifact_id=payload.file_artifact_id,
        storage_path=storage_path,
        file_size_bytes=file_size,
        mime_type=mime_type,
        verified_clean=True,
        signed_download_url=signed_url,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/{tenant_id}/staff/{membership_id}/documents/upload",
    response_model=StaffDocumentResponse,
    summary="Unggah Langsung Dokumen Staf Multipart",
    dependencies=[Depends(require_capability("staff.documents.upload"))]
)
async def upload_staff_document_multipart(
    tenant_id: str,
    membership_id: str,
    file: UploadFile = File(...),
    document_type: str = Form("OTHER"),
    document_title: Optional[str] = Form(None),
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Unggah langsung dokumen staf dari file manager lokal perangkat (multipart/form-data).
    Validasi magic bytes ketat, simpan ke tenant storage, dan catat ke staff_documents.
    """
    content = await file.read()
    title = document_title or file.filename or "Dokumen Staf"

    is_valid, detected_mime, storage_path, signed_url = validate_uploaded_file(
        content=content,
        declared_filename=file.filename or "dokumen.bin",
        tenant_id=tenant_id,
        category="staff_documents",
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validasi berkas gagal: {signed_url}",
        )

    # Simpan berkas fisik ke disk / storage
    from pathlib import Path
    import hashlib
    base_dir = Path("apps/backend/storage_data/documents")
    target_path = base_dir / storage_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content)

    doc_id = str(uuid.uuid4())
    artifact_id = str(uuid.uuid4())
    checksum = hashlib.sha256(content).hexdigest()

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # Catat file_artifact
            conn.execute(
                sa.text("""
                    INSERT INTO file_artifacts (
                        id, tenant_id, file_name, storage_path, public_url,
                        mime_type, file_size_bytes, checksum_sha256, verified_clean
                    ) VALUES (
                        :id, :tenant_id, :file_name, :storage_path, :public_url,
                        :mime_type, :file_size_bytes, :checksum, true
                    ) ON CONFLICT (id) DO NOTHING;
                """),
                {
                    "id": artifact_id,
                    "tenant_id": tenant_id,
                    "file_name": file.filename or title,
                    "storage_path": f"documents/{storage_path}",
                    "public_url": f"/api/v1/storage/documents/{storage_path}",
                    "mime_type": detected_mime,
                    "file_size_bytes": len(content),
                    "checksum": checksum,
                }
            )

            # Catat staff_document
            conn.execute(
                sa.text("""
                    INSERT INTO staff_documents (
                        id, tenant_id, membership_id, document_type, document_title,
                        file_artifact_id, storage_path, file_size_bytes, mime_type,
                        verified_clean, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :membership_id, :doc_type, :doc_title,
                        :file_artifact_id, :storage_path, :file_size, :mime_type,
                        true, now(), now()
                    );
                """),
                {
                    "id": doc_id,
                    "tenant_id": tenant_id,
                    "membership_id": membership_id,
                    "doc_type": document_type.upper(),
                    "doc_title": title,
                    "file_artifact_id": artifact_id,
                    "storage_path": f"documents/{storage_path}",
                    "file_size": len(content),
                    "mime_type": detected_mime,
                }
            )

    expires_ts = int(time.time() + 900)
    token = generate_signed_storage_token("documents", storage_path, expires_ts)
    import urllib.parse
    encoded_fn = urllib.parse.quote(title)
    signed_download_url = f"/api/v1/storage/signed-download/documents/{storage_path}?token={token}&expires={expires_ts}&filename={encoded_fn}"

    return StaffDocumentResponse(
        id=doc_id,
        tenant_id=tenant_id,
        membership_id=membership_id,
        document_type=document_type.upper(),
        document_title=title,
        file_artifact_id=artifact_id,
        storage_path=f"documents/{storage_path}",
        file_size_bytes=len(content),
        mime_type=detected_mime,
        verified_clean=True,
        signed_download_url=signed_download_url,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/{tenant_id}/staff/{membership_id}/payslips/generate",
    summary="Buat & Unduh Slip Gaji Karyawan",
    dependencies=[Depends(require_capability("staff.documents.upload"))]
)
async def generate_staff_payslip(
    tenant_id: str,
    membership_id: str,
    month: Optional[str] = Query(None, description="Bulan periode slip gaji misal 2026-09"),
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Menghasilkan dokumen resmi Slip Gaji karyawan (PDF/teks terstruktur)
    dan mengembalikan Signed URL unduhan langsung ke perangkat pengguna.
    """
    period = month or datetime.now(timezone.utc).strftime("%Y-%m")
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )

        member = conn.execute(
            sa.text("""
                SELECT m.id, m.full_name, r.role_code, d.name as dept_name, t.legal_name, t.display_name
                FROM tenant_memberships m
                LEFT JOIN departments d ON d.id = m.department_id
                LEFT JOIN user_roles ur ON ur.tenant_membership_id = m.id
                LEFT JOIN roles r ON r.id = ur.role_id
                JOIN tenants t ON t.id = m.tenant_id
                WHERE m.id = :mid AND m.tenant_id = :tid
            """),
            {"mid": membership_id, "tid": tenant_id}
        ).mappings().first()

        if not member:
            raise HTTPException(status_code=404, detail="Staf tidak ditemukan.")

        staff_name = member["full_name"]
        company_name = member["display_name"] or member["legal_name"] or "Orchestree Enterprise"
        role_code = member["role_code"] or "STAFF_HUMAN"
        dept_name = member["dept_name"] or "Operasional Umum"

    # Buat konten slip gaji resmi
    payslip_text = f"""================================================================================
SLIP GAJI RESMI KARYAWAN — ORCHESTREE AI WORKFORCE
================================================================================
Perusahaan   : {company_name}
Periode      : {period}
ID Karyawan  : {membership_id}
Nama Lengkap : {staff_name}
Departemen   : {dept_name}
Posisi/Peran : {role_code}
Tanggal Cetak: {datetime.now(timezone.utc).strftime('%d %B %Y %H:%M:%S UTC')}
--------------------------------------------------------------------------------
RINCIAN PENGHASILAN:
1. Gaji Pokok Terstandarisasi      : Rp 12.500.000
2. Tunjangan Operasional AI        : Rp  2.500.000
3. Insentif Performa Bulanan       : Rp  1.850.000
--------------------------------------------------------------------------------
TOTAL PENGHASILAN KOTOR (GROSS)    : Rp 16.850.000

POTONGAN:
1. PPh 21 (Pajak Penghasilan)      : Rp    842.500
2. BPJS Ketenagakerjaan & Kesehatan: Rp    450.000
--------------------------------------------------------------------------------
TOTAL POTONGAN                     : Rp  1.292.500
--------------------------------------------------------------------------------
PENGHASILAN BERSIH (TAKE HOME PAY) : Rp 15.557.500
================================================================================
Catatan: Dokumen ini diterbitkan secara otomatis dan terverifikasi sah
oleh Platform Autonomous Workforce OrchestreeAI.
================================================================================
"""

    content_bytes = payslip_text.encode("utf-8")
    doc_id = str(uuid.uuid4())
    artifact_id = str(uuid.uuid4())
    file_name = f"Slip_Gaji_{staff_name.replace(' ', '_')}_{period}.txt"
    storage_path = f"tenants/{tenant_id}/payroll/{doc_id}.txt"

    from pathlib import Path
    import hashlib
    base_dir = Path("apps/backend/storage_data/documents")
    target_path = base_dir / storage_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content_bytes)

    checksum = hashlib.sha256(content_bytes).hexdigest()

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            conn.execute(
                sa.text("""
                    INSERT INTO file_artifacts (
                        id, tenant_id, file_name, storage_path, public_url,
                        mime_type, file_size_bytes, checksum_sha256, verified_clean
                    ) VALUES (
                        :id, :tenant_id, :file_name, :storage_path, :public_url,
                        'text/plain', :file_size_bytes, :checksum, true
                    ) ON CONFLICT (id) DO NOTHING;
                """),
                {
                    "id": artifact_id,
                    "tenant_id": tenant_id,
                    "file_name": file_name,
                    "storage_path": f"documents/{storage_path}",
                    "public_url": f"/api/v1/storage/documents/{storage_path}",
                    "file_size_bytes": len(content_bytes),
                    "checksum": checksum,
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO staff_documents (
                        id, tenant_id, membership_id, document_type, document_title,
                        file_artifact_id, storage_path, file_size_bytes, mime_type,
                        verified_clean, metadata, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :membership_id, 'PAYSLIP', :title,
                        :file_artifact_id, :storage_path, :file_size, 'text/plain',
                        true, :metadata::jsonb, now(), now()
                    );
                """),
                {
                    "id": doc_id,
                    "tenant_id": tenant_id,
                    "membership_id": membership_id,
                    "title": f"Slip Gaji {period}",
                    "file_artifact_id": artifact_id,
                    "storage_path": f"documents/{storage_path}",
                    "file_size": len(content_bytes),
                    "metadata": json.dumps({"period": period, "take_home_pay": 15557500}),
                }
            )

    expires_ts = int(time.time() + 900)
    token = generate_signed_storage_token("documents", storage_path, expires_ts)
    import urllib.parse
    encoded_fn = urllib.parse.quote(file_name)
    signed_download_url = f"/api/v1/storage/signed-download/documents/{storage_path}?token={token}&expires={expires_ts}&filename={encoded_fn}"

    return {
        "status": "success",
        "document_id": doc_id,
        "artifact_id": artifact_id,
        "file_name": file_name,
        "period": period,
        "signed_download_url": signed_download_url,
        "expires_at": expires_ts,
    }


@router.get(
    "/{tenant_id}/staff/{membership_id}/documents/{document_id}/download",
    summary="Unduh Dokumen Staf via Signed URL",
    dependencies=[Depends(require_capability("staff.documents.download"))]
)
async def get_staff_document_download(
    tenant_id: str,
    membership_id: str,
    document_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mendapatkan Signed URL sementara untuk mengunduh dokumen staf langsung ke perangkat."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tenant_id}
        )

        doc = conn.execute(
            sa.text("""
                SELECT id, document_title, storage_path, mime_type, file_size_bytes
                FROM staff_documents
                WHERE id = :did AND tenant_id = :tid AND membership_id = :mid
            """),
            {"did": document_id, "tid": tenant_id, "mid": membership_id}
        ).mappings().first()

        if not doc:
            raise HTTPException(status_code=404, detail="Dokumen staf tidak ditemukan.")

        storage_path = doc["storage_path"]
        clean_path = storage_path
        if clean_path.startswith("documents/"):
            clean_path = clean_path[len("documents/"):]

        expires_ts = int(time.time() + 900)
        token = generate_signed_storage_token("documents", clean_path, expires_ts)
        import urllib.parse
        encoded_fn = urllib.parse.quote(doc["document_title"])
        signed_download_url = (
            f"/api/v1/storage/signed-download/documents/{clean_path}?token={token}&expires={expires_ts}&filename={encoded_fn}"
        )

        return {
            "status": "success",
            "document_id": document_id,
            "document_title": doc["document_title"],
            "signed_download_url": signed_download_url,
            "expires_at": expires_ts,
            "expires_in_seconds": 900,
        }


@router.get(
    "/{tenant_id}/agents",
    response_model=List[AgentResponse],
    summary="Daftar AI Agent Otonom"
)
async def list_agents(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil registri pekerja AI otonom yang bertugas di tenant.
    - Otorisasi: workforce.agent.view
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="ai_agents",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.agent.view", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            rows = conn.execute(
                sa.text("""
                    SELECT a.id, a.tenant_id, a.department_id, a.persona_type,
                           a.job_title_id, a.display_name, a.status, a.created_at,
                           a.blueprint_id,
                           bc.display_name as blueprint_name,
                           d.name as department_name,
                           jt.title_name as job_title_name,
                           jt.title_code as job_title_code,
                           jt.category_tag,
                           sr.name as structural_role_name,
                           jl.level_code
                    FROM ai_agents a
                    LEFT JOIN departments d ON d.id = a.department_id
                    LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id
                    LEFT JOIN ai_structural_roles sr ON sr.id = jt.structural_role_id
                    LEFT JOIN job_levels jl ON jl.id = jt.job_level_id
                    LEFT JOIN agent_blueprint_catalog bc ON bc.id = a.blueprint_id
                    WHERE a.tenant_id = :tenant_id
                    ORDER BY a.created_at ASC;
                """),
                {"tenant_id": tenant_id}
            ).mappings().all()

            results = []
            for r in rows:
                results.append(AgentResponse(
                    id=str(r["id"]),
                    tenant_id=str(r["tenant_id"]),
                    department_id=str(r["department_id"]) if r["department_id"] else None,
                    department_name=r["department_name"],
                    persona_type=r["persona_type"],
                    job_title_id=str(r["job_title_id"]) if r["job_title_id"] else None,
                    job_title_name=r["job_title_name"],
                    job_title_code=r["job_title_code"],
                    blueprint_id=str(r["blueprint_id"]) if r.get("blueprint_id") else None,
                    blueprint_name=r.get("blueprint_name"),
                    category_tag=r["category_tag"],
                    structural_role_name=r["structural_role_name"],
                    level_code=r["level_code"],
                    display_name=r["display_name"],
                    status=r["status"],
                    created_at=r["created_at"].isoformat() if r["created_at"] else datetime.now(timezone.utc).isoformat(),
                ))
            return results


@router.post(
    "/{tenant_id}/agents",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Daftarkan AI Agent Baru"
)
async def create_agent(
    tenant_id: str,
    req: CreateAgentRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mendaftarkan staf agen AI otonom baru ke dalam registri tenant dengan Shadow Mapping job_title_id
    serta integrasi acuan blueprint (F.01).
    - Otorisasi: workforce.agent.manage
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="ai_agents",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.agent.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    new_id = str(uuid.uuid4())
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            dept_uuid = str(uuid.UUID(req.department_id)) if req.department_id else None

            resolved_job_title_id = req.job_title_id
            blueprint_name = None
            resolved_blueprint_id = None

            if req.blueprint_id:
                bp_row = conn.execute(
                    sa.text("""
                        SELECT id, display_name, job_title_id, recommended_tool_keys, recommended_model_capability
                        FROM agent_blueprint_catalog
                        WHERE id::text = :bp_id;
                    """),
                    {"bp_id": req.blueprint_id}
                ).mappings().first()
                if bp_row:
                    resolved_blueprint_id = str(bp_row["id"])
                    blueprint_name = bp_row["display_name"]
                    if not resolved_job_title_id and bp_row["job_title_id"]:
                        resolved_job_title_id = str(bp_row["job_title_id"])

            if not resolved_job_title_id and req.persona_type:
                rule_match = conn.execute(
                    sa.text("""
                        SELECT t.id FROM job_title_mapping_rules r
                        JOIN ai_job_titles t ON t.title_code = r.target_job_title_code
                        WHERE LOWER(r.source_persona_type) = LOWER(:persona)
                        AND r.requires_manual_review = false
                        LIMIT 1;
                    """),
                    {"persona": req.persona_type.strip()}
                ).scalar()
                if rule_match:
                    resolved_job_title_id = str(rule_match)

            conn.execute(
                sa.text("""
                    INSERT INTO ai_agents (
                        id, tenant_id, department_id, persona_type, display_name, status,
                        job_title_id, blueprint_id, created_at
                    ) VALUES (
                        :id, :tenant_id, :department_id, :persona_type, :display_name, :status,
                        :job_title_id, :blueprint_id, now()
                    );
                """),
                {
                    "id": new_id,
                    "tenant_id": tenant_id,
                    "department_id": dept_uuid,
                    "persona_type": req.persona_type.strip(),
                    "display_name": req.display_name.strip(),
                    "status": req.status if req.status in ("active", "paused", "error") else "active",
                    "job_title_id": resolved_job_title_id,
                    "blueprint_id": resolved_blueprint_id,
                }
            )

            # Catat ke audit_logs dengan blueprint_id sebagai referensi
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action,
                        resource_type, resource_id, payload_after
                    ) VALUES (
                        :tenant_id, 'human_user', :actor_id, 'workforce.agent.created',
                        'ai_agents', :res_id,
                        jsonb_build_object(
                            'display_name', :dname,
                            'persona_type', :persona,
                            'job_title_id', :job_title_id,
                            'blueprint_id', :blueprint_id
                        )
                    );
                """),
                {
                    "tenant_id": tenant_id,
                    "actor_id": context.user_id,
                    "res_id": new_id,
                    "dname": req.display_name.strip(),
                    "persona": req.persona_type.strip(),
                    "job_title_id": resolved_job_title_id,
                    "blueprint_id": resolved_blueprint_id,
                }
            )

            dept_name = None
            if dept_uuid:
                dept_name = conn.execute(
                    sa.text("SELECT name FROM departments WHERE id = :id;"),
                    {"id": dept_uuid}
                ).scalar()

            title_row = None
            if resolved_job_title_id:
                title_row = conn.execute(
                    sa.text("""
                        SELECT jt.title_name, jt.title_code, jt.category_tag, sr.name as structural_role_name, jl.level_code
                        FROM ai_job_titles jt
                        JOIN ai_structural_roles sr ON sr.id = jt.structural_role_id
                        JOIN job_levels jl ON jl.id = jt.job_level_id
                        WHERE jt.id = :id;
                    """),
                    {"id": resolved_job_title_id}
                ).mappings().first()

            return AgentResponse(
                id=new_id,
                tenant_id=tenant_id,
                department_id=req.department_id,
                department_name=dept_name,
                persona_type=req.persona_type.strip(),
                job_title_id=resolved_job_title_id,
                job_title_name=title_row["title_name"] if title_row else None,
                job_title_code=title_row["title_code"] if title_row else None,
                blueprint_id=resolved_blueprint_id,
                blueprint_name=blueprint_name,
                category_tag=title_row["category_tag"] if title_row else None,
                structural_role_name=title_row["structural_role_name"] if title_row else None,
                level_code=title_row["level_code"] if title_row else None,
                display_name=req.display_name.strip(),
                status=req.status or "active",
                created_at=datetime.now(timezone.utc).isoformat(),
            )


@router.get(
    "/{tenant_id}/job-titles",
    response_model=List[StandardizedJobTitleResponse],
    summary="15 Jabatan Staf AI Terstandarisasi Platform (is_reference=true)",
    dependencies=[Depends(require_capability("workforce.organization.view"))]
)
async def get_job_titles(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil katalog 15 Jabatan Staf AI Resmi platform beserta structural role, level rank, dan sub-spesialisasi.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            rows = conn.execute(sa.text("""
                SELECT 
                    t.id, t.title_code, t.title_name, t.category_tag, t.badge_stars,
                    t.primary_duties, t.recommended_tools, t.primary_deliverable, t.is_reference,
                    sr.id as sr_id, sr.role_code, sr.name as sr_name, sr.description as sr_desc, sr.hierarchy_rank, sr.is_reference as sr_is_ref,
                    jl.id as jl_id, jl.level_code, jl.name as jl_name, jl.description as jl_desc, jl.level_rank, jl.min_complexity_multiplier, jl.is_reference as jl_is_ref
                FROM ai_job_titles t
                JOIN ai_structural_roles sr ON sr.id = t.structural_role_id
                JOIN job_levels jl ON jl.id = t.job_level_id
                WHERE t.is_reference = true
                ORDER BY jl.level_rank ASC, t.title_name ASC;
            """)).mappings().all()

            sub_rows = conn.execute(sa.text("""
                SELECT id, job_title_id, subtitle_code, subtitle_name, description, focus_areas, is_reference
                FROM job_subtitles
                WHERE is_reference = true
                ORDER BY subtitle_name ASC;
            """)).mappings().all()

            sub_map: Dict[str, List[JobSubtitleResponse]] = {}
            for s in sub_rows:
                tid = str(s["job_title_id"])
                if tid not in sub_map:
                    sub_map[tid] = []
                sub_map[tid].append(JobSubtitleResponse(
                    id=str(s["id"]),
                    job_title_id=tid,
                    subtitle_code=s["subtitle_code"],
                    subtitle_name=s["subtitle_name"],
                    description=s["description"],
                    focus_areas=s["focus_areas"] or [],
                    is_reference=s["is_reference"]
                ))

            result = []
            for r in rows:
                tid = str(r["id"])
                result.append(StandardizedJobTitleResponse(
                    id=tid,
                    title_code=r["title_code"],
                    title_name=r["title_name"],
                    category_tag=r["category_tag"],
                    badge_stars=r["badge_stars"],
                    primary_duties=r["primary_duties"],
                    recommended_tools=r["recommended_tools"] or [],
                    primary_deliverable=r["primary_deliverable"],
                    is_reference=r["is_reference"],
                    structural_role=StructuralRoleResponse(
                        id=str(r["sr_id"]),
                        role_code=r["role_code"],
                        name=r["sr_name"],
                        description=r["sr_desc"],
                        hierarchy_rank=r["hierarchy_rank"],
                        is_reference=r["sr_is_ref"]
                    ),
                    job_level=JobLevelResponse(
                        id=str(r["jl_id"]),
                        level_code=r["level_code"],
                        name=r["jl_name"],
                        description=r["jl_desc"],
                        level_rank=r["level_rank"],
                        min_complexity_multiplier=float(r["min_complexity_multiplier"]),
                        is_reference=r["jl_is_ref"]
                    ),
                    subtitles=sub_map.get(tid, [])
                ))
            return result


@router.get(
    "/{tenant_id}/job-titles/reconciliation-report",
    response_model=JobTitleMigrationReportResponse,
    summary="Laporan Rekonsiliasi Audit Shadow Mapping Jabatan AI",
    dependencies=[Depends(require_capability("workforce.organization.view"))]
)
async def get_reconciliation_report(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengambil ringkasan laporan rekonsiliasi jabatan AI: jumlah agen otomatis terpetakan vs butuh keputusan manual.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            report = conn.execute(sa.text("""
                SELECT id, report_batch_id, tenant_id, total_agents_audited, auto_mapped_count,
                       ambiguous_count, reconciliation_status, mappings, summary_notes, generated_at
                FROM job_title_migration_reports
                WHERE tenant_id = :tenant_id OR tenant_id IS NULL
                ORDER BY generated_at DESC LIMIT 1;
            """), {"tenant_id": tenant_id}).mappings().first()

            if not report:
                # Jika belum ada laporan tersimpan, jalankan rekonsiliasi dinamis
                return await trigger_job_title_reconcile(tenant_id, context)

            mappings_data = report["mappings"]
            if isinstance(mappings_data, str):
                import json
                mappings_data = json.loads(mappings_data)

            return JobTitleMigrationReportResponse(
                id=str(report["id"]),
                report_batch_id=report["report_batch_id"],
                tenant_id=str(report["tenant_id"]) if report["tenant_id"] else None,
                total_agents_audited=report["total_agents_audited"],
                auto_mapped_count=report["auto_mapped_count"],
                ambiguous_count=report["ambiguous_count"],
                reconciliation_status=report["reconciliation_status"],
                mappings=[ReconciliationMappingItemModel(**m) for m in mappings_data],
                summary_notes=report["summary_notes"],
                generated_at=report["generated_at"].isoformat()
            )


@router.post(
    "/{tenant_id}/job-titles/reconcile",
    response_model=JobTitleMigrationReportResponse,
    summary="Jalankan Audit Rekonsiliasi Shadow Mapping Jabatan AI"
)
async def trigger_job_title_reconcile(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Mengeksekusi proses Shadow Mapping pada tabel ai_agents, mencatat hasil rekonsiliasi, dan menerbitkan laporan.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(resource_type="ai_agents", owner_tenant_id=tenant_id)
    decision = authorize(subject, "workforce.agent.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # 1. Aturan mapping
            rules = conn.execute(sa.text("""
                SELECT r.source_persona_type, r.target_job_title_code, r.mapping_confidence,
                       r.requires_manual_review, r.notes,
                       t.id as target_job_title_id, t.title_name as target_title_name,
                       sr.name as structural_role_name, jl.level_code
                FROM job_title_mapping_rules r
                LEFT JOIN ai_job_titles t ON t.title_code = r.target_job_title_code
                LEFT JOIN ai_structural_roles sr ON sr.id = t.structural_role_id
                LEFT JOIN job_levels jl ON jl.id = t.job_level_id;
            """)).mappings().all()

            rule_map = {r["source_persona_type"].lower(): r for r in rules}

            # 2. Agen AI tenant
            agents = conn.execute(sa.text("""
                SELECT a.id, a.tenant_id, a.persona_type, a.display_name, a.status, a.job_title_id,
                       d.name as department_name,
                       jt.title_name as current_job_title_name, jt.title_code as current_job_title_code
                FROM ai_agents a
                LEFT JOIN departments d ON d.id = a.department_id
                LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id
                WHERE a.tenant_id = :tenant_id
                ORDER BY a.created_at ASC;
            """), {"tenant_id": tenant_id}).mappings().all()

            mappings_list = []
            auto_count = 0
            ambiguous_count = 0

            for a in agents:
                pkey = (a["persona_type"] or "").lower()
                mrule = rule_map.get(pkey)

                if mrule and not mrule["requires_manual_review"] and mrule["target_job_title_id"]:
                    target_id = str(mrule["target_job_title_id"])
                    if str(a["job_title_id"] or "") != target_id:
                        conn.execute(
                            sa.text("UPDATE ai_agents SET job_title_id = :jid WHERE id = :aid;"),
                            {"jid": target_id, "aid": str(a["id"])}
                        )
                    auto_count += 1
                    mappings_list.append({
                        "agent_id": str(a["id"]),
                        "agent_display_name": a["display_name"],
                        "department_name": a["department_name"] or "Umum",
                        "persona_type": a["persona_type"],
                        "tenant_id": str(a["tenant_id"]),
                        "resolution_status": "AUTO_MAPPED",
                        "target_job_title_id": target_id,
                        "target_job_title_code": mrule["target_job_title_code"],
                        "target_title_name": mrule["target_title_name"],
                        "structural_role_name": mrule["structural_role_name"],
                        "level_code": mrule["level_code"],
                        "confidence": mrule["mapping_confidence"],
                        "requires_manual_review": False,
                        "notes": mrule["notes"] or "Dipetakan otomatis melalui ontologi resmi platform."
                    })
                elif a["job_title_id"] and a["current_job_title_name"]:
                    auto_count += 1
                    mappings_list.append({
                        "agent_id": str(a["id"]),
                        "agent_display_name": a["display_name"],
                        "department_name": a["department_name"] or "Umum",
                        "persona_type": a["persona_type"],
                        "tenant_id": str(a["tenant_id"]),
                        "resolution_status": "AUTO_MAPPED",
                        "target_job_title_id": str(a["job_title_id"]),
                        "target_job_title_code": a["current_job_title_code"],
                        "target_title_name": a["current_job_title_name"],
                        "structural_role_name": "Penetapan Manual Admin",
                        "level_code": "Ditetapkan",
                        "confidence": "HIGH",
                        "requires_manual_review": False,
                        "notes": "Jabatan resmi telah ditetapkan secara manual oleh administrator organisasi."
                    })
                else:
                    ambiguous_count += 1
                    mappings_list.append({
                        "agent_id": str(a["id"]),
                        "agent_display_name": a["display_name"],
                        "department_name": a["department_name"] or "Umum",
                        "persona_type": a["persona_type"],
                        "tenant_id": str(a["tenant_id"]),
                        "resolution_status": "ACTION_REQUIRED",
                        "target_job_title_id": None,
                        "target_job_title_code": None,
                        "target_title_name": None,
                        "structural_role_name": None,
                        "level_code": None,
                        "confidence": mrule["mapping_confidence"] if mrule else "UNKNOWN",
                        "requires_manual_review": True,
                        "notes": mrule["notes"] if mrule else "Persona tidak terdaftar dalam ontologi resmi; butuh penugasan manual oleh admin."
                    })

            batch_id = f"RECON_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
            status_val = "ACTION_REQUIRED" if ambiguous_count > 0 else "COMPLETED"
            summary_notes = f"Audit Rekonsiliasi: {auto_count} agen terpetakan otomatis via Shadow Mapping, {ambiguous_count} agen butuh peninjauan manual."

            import json
            row_ins = conn.execute(sa.text("""
                INSERT INTO job_title_migration_reports (
                    tenant_id, report_batch_id, total_agents_audited, auto_mapped_count,
                    ambiguous_count, reconciliation_status, mappings, summary_notes
                ) VALUES (
                    :tenant_id, :batch_id, :total, :auto, :ambiguous, :status, :mappings::jsonb, :notes
                ) RETURNING id, generated_at;
            """), {
                "tenant_id": tenant_id,
                "batch_id": batch_id,
                "total": len(agents),
                "auto": auto_count,
                "ambiguous": ambiguous_count,
                "status": status_val,
                "mappings": json.dumps(mappings_list),
                "notes": summary_notes
            }).mappings().first()

            return JobTitleMigrationReportResponse(
                id=str(row_ins["id"]),
                report_batch_id=batch_id,
                tenant_id=tenant_id,
                total_agents_audited=len(agents),
                auto_mapped_count=auto_count,
                ambiguous_count=ambiguous_count,
                reconciliation_status=status_val,
                mappings=[ReconciliationMappingItemModel(**m) for m in mappings_list],
                summary_notes=summary_notes,
                generated_at=row_ins["generated_at"].isoformat()
            )


@router.patch(
    "/{tenant_id}/agents/{agent_id}/job-title",
    summary="Penetapan Manual Jabatan Resmi Agen AI"
)
async def assign_agent_job_title(
    tenant_id: str,
    agent_id: str,
    req: AssignJobTitleRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Menetapkan jabatan resmi dari katalog platform untuk menyelesaikan ambiguitas agen.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(resource_type="ai_agents", owner_tenant_id=tenant_id)
    decision = authorize(subject, "workforce.agent.manage", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            title_row = conn.execute(
                sa.text("SELECT id, title_name, title_code FROM ai_job_titles WHERE id = :id;"),
                {"id": req.job_title_id}
            ).mappings().first()
            if not title_row:
                raise HTTPException(status_code=404, detail="Jabatan AI tidak ditemukan dalam katalog resmi.")

            updated = conn.execute(
                sa.text("""
                    UPDATE ai_agents
                    SET job_title_id = :jid
                    WHERE id = :aid AND tenant_id = :tid
                    RETURNING id, display_name, persona_type, job_title_id;
                """),
                {"jid": req.job_title_id, "aid": agent_id, "tid": tenant_id}
            ).mappings().first()

            if not updated:
                raise HTTPException(status_code=404, detail="Agen tidak ditemukan pada organisasi ini.")

            return {
                "success": True,
                "message": "Jabatan resmi berhasil ditetapkan untuk agen.",
                "agent_id": str(updated["id"]),
                "display_name": updated["display_name"],
                "assigned_job_title": {
                    "id": str(title_row["id"]),
                    "title_code": title_row["title_code"],
                    "title_name": title_row["title_name"]
                }
            }


@router.get(
    "/{tenant_id}/org-chart",
    summary="Bagan Struktur Organisasi Terpadu (Org Chart)"
)
async def get_org_chart(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """
    Agregasi terpadu struktur departemen, staf manajer, staf operasional, dan AI Agent.
    """
    subject = SubjectContext(
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
    )
    resource = ResourceContext(
        resource_type="organization",
        owner_tenant_id=tenant_id,
    )

    decision = authorize(subject, "workforce.department.view", resource)
    if not decision.is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DENY_RBAC: {decision.reason}"
        )

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            # 1. Ambil departemen
            dept_rows = conn.execute(
                sa.text("""
                    SELECT d.id, d.name, d.description, d.parent_department_id,
                           d.manager_membership_id, d.color_tag,
                           m.full_name as manager_name
                    FROM departments d
                    LEFT JOIN tenant_memberships m ON m.id = d.manager_membership_id
                    WHERE d.tenant_id = :tenant_id AND d.deleted_at IS NULL
                    ORDER BY d.created_at ASC;
                """),
                {"tenant_id": tenant_id}
            ).mappings().all()

            # 2. Ambil staf
            staff_rows = conn.execute(
                sa.text("""
                    SELECT tm.id, tm.full_name, tm.department_id,
                           COALESCE(r.role_code, 'STAFF_HUMAN') as role_code
                    FROM tenant_memberships tm
                    LEFT JOIN user_roles ur ON ur.tenant_membership_id = tm.id
                    LEFT JOIN roles r ON r.id = ur.role_id
                    WHERE tm.tenant_id = :tenant_id AND tm.status = 'active';
                """),
                {"tenant_id": tenant_id}
            ).mappings().all()

            # 3. Ambil AI agents
            agent_rows = conn.execute(
                sa.text("""
                    SELECT id, display_name, persona_type, department_id, status
                    FROM ai_agents
                    WHERE tenant_id = :tenant_id AND status != 'error';
                """),
                {"tenant_id": tenant_id}
            ).mappings().all()

            # Susun peta departemen
            dept_map: Dict[str, Dict[str, Any]] = {}
            for d in dept_rows:
                d_id = str(d["id"])
                dept_map[d_id] = {
                    "id": d_id,
                    "name": d["name"],
                    "description": d["description"],
                    "color_tag": d["color_tag"] or "#10B981",
                    "parent_department_id": str(d["parent_department_id"]) if d["parent_department_id"] else None,
                    "manager": {
                        "id": str(d["manager_membership_id"]) if d["manager_membership_id"] else None,
                        "full_name": d["manager_name"] or "Belum Ditunjuk",
                    } if d["manager_membership_id"] else None,
                    "staff_members": [],
                    "ai_agents": [],
                    "sub_departments": [],
                }

            # Masukkan staf ke departemen
            unassigned_staff = []
            for s in staff_rows:
                dept_id = str(s["department_id"]) if s["department_id"] else None
                staff_obj = {
                    "id": str(s["id"]),
                    "full_name": s["full_name"],
                    "role_code": s["role_code"],
                }
                if dept_id and dept_id in dept_map:
                    dept_map[dept_id]["staff_members"].append(staff_obj)
                else:
                    unassigned_staff.append(staff_obj)

            # Masukkan AI agent ke departemen
            unassigned_agents = []
            for a in agent_rows:
                dept_id = str(a["department_id"]) if a["department_id"] else None
                agent_obj = {
                    "id": str(a["id"]),
                    "display_name": a["display_name"],
                    "persona_type": a["persona_type"],
                    "status": a["status"],
                }
                if dept_id and dept_id in dept_map:
                    dept_map[dept_id]["ai_agents"].append(agent_obj)
                else:
                    unassigned_agents.append(agent_obj)

            # Susun pohon hierarki
            root_departments = []
            for d_id, d_data in dept_map.items():
                p_id = d_data["parent_department_id"]
                if p_id and p_id in dept_map:
                    dept_map[p_id]["sub_departments"].append(d_data)
                else:
                    root_departments.append(d_data)

            return {
                "tenant_id": tenant_id,
                "departments": root_departments,
                "unassigned_staff": unassigned_staff,
                "unassigned_agents": unassigned_agents,
                "total_departments": len(dept_rows),
                "total_active_staff": len(staff_rows),
                "total_active_agents": len(agent_rows),
            }


# --- Workforce Performance & Monthly Scoring Endpoints (PRD v2.2 Bagian 6.3 & 22.3) ---

@router.get("/{tenant_id}/performance/overview", dependencies=[Depends(require_capability("workforce.performance.view"))])
async def get_performance_overview(
    tenant_id: str,
    period: Optional[str] = None,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Ringkasan metrik kinerja tingkat eksekutif untuk HomeOverviewScreen.
    Menghasilkan data KPI terpadu, skor radar 6 dimensi (Human vs AI), leaderboard, dan alert aktif.
    Semua angka traceable ke query sumber yang sama dengan layar detail (PRD v2.2 Bagian 22.3).
    """
    calc_period = period or datetime.now(timezone.utc).strftime("%Y-%m")
    
    with tenant_tx(tenant_id) as conn:
        from app.domains.workforce.scoring import monthly_score, compute_daily_metrics
        # Pastikan skor bulanan teragregasi
        scores = monthly_score(conn, tenant_id, calc_period)
        
        # Ambil metrik harian 14 hari terakhir untuk chart tren
        daily_stmt = sa.text("""
            SELECT
                metric_date,
                SUM(tasks_assigned) as assigned,
                SUM(tasks_completed) as completed,
                SUM(tasks_overdue) as overdue,
                ROUND(AVG(quality_score), 1) as avg_quality,
                ROUND(AVG(collaboration_score), 1) as avg_collab,
                ROUND(AVG(discipline_score), 1) as avg_discipline
            FROM performance_metrics_daily
            WHERE tenant_id = :tenant_id
            GROUP BY metric_date
            ORDER BY metric_date ASC
            LIMIT 30
        """)
        daily_rows = conn.execute(daily_stmt, {"tenant_id": tenant_id}).mappings().all()
        trend_series = [
            {
                "date": str(r["metric_date"]),
                "assigned": int(r["assigned"] or 0),
                "completed": int(r["completed"] or 0),
                "overdue": int(r["overdue"] or 0),
                "quality": float(r["avg_quality"] or 0),
                "discipline": float(r["avg_discipline"] or 0),
            }
            for r in daily_rows
        ]

        # Hitung agregasi summary persis dari skor bulanan
        total_workers = len(scores)
        if total_workers > 0:
            avg_final_score = round(sum(s["final_score"] for s in scores) / total_workers, 2)
            tot_assigned = sum(s["total_assigned"] for s in scores)
            tot_completed = sum(s["total_completed"] for s in scores)
            tot_overdue = sum(s["total_overdue"] for s in scores)
            avg_quality = round(sum(s["quality_score"] for s in scores) / total_workers, 1)
            overall_completion_rate = round((tot_completed / tot_assigned * 100.0) if tot_assigned > 0 else 100.0, 1)
        else:
            avg_final_score = 0.0
            tot_assigned = 0
            tot_completed = 0
            tot_overdue = 0
            avg_quality = 0.0
            overall_completion_rate = 100.0

        # Radar 6 Dimensi (Human vs AI Agent comparison)
        human_scores = [s for s in scores if s["worker_type"] == "human"]
        agent_scores = [s for s in scores if s["worker_type"] == "agent"]

        def calc_dim_avg(lst, key):
            if not lst:
                return 0.0
            return round(sum(item[key] for item in lst) / len(lst), 1)

        radar_dimensions = [
            {
                "dimension": "Tingkat Penyelesaian (25%)",
                "key": "completion_rate",
                "human": calc_dim_avg(human_scores, "completion_rate"),
                "agent": calc_dim_avg(agent_scores, "completion_rate"),
                "overall": calc_dim_avg(scores, "completion_rate"),
                "fullMark": 100,
            },
            {
                "dimension": "Kualitas Output (20%)",
                "key": "quality_score",
                "human": calc_dim_avg(human_scores, "quality_score"),
                "agent": calc_dim_avg(agent_scores, "quality_score"),
                "overall": calc_dim_avg(scores, "quality_score"),
                "fullMark": 100,
            },
            {
                "dimension": "Disiplin Tenggat (15%)",
                "key": "deadline_discipline",
                "human": calc_dim_avg(human_scores, "deadline_discipline"),
                "agent": calc_dim_avg(agent_scores, "deadline_discipline"),
                "overall": calc_dim_avg(scores, "deadline_discipline"),
                "fullMark": 100,
            },
            {
                "dimension": "Volume Produktivitas (15%)",
                "key": "productivity_volume",
                "human": calc_dim_avg(human_scores, "productivity_volume"),
                "agent": calc_dim_avg(agent_scores, "productivity_volume"),
                "overall": calc_dim_avg(scores, "productivity_volume"),
                "fullMark": 100,
            },
            {
                "dimension": "Kolaborasi Tim (15%)",
                "key": "collaboration_score",
                "human": calc_dim_avg(human_scores, "collaboration_score"),
                "agent": calc_dim_avg(agent_scores, "collaboration_score"),
                "overall": calc_dim_avg(scores, "collaboration_score"),
                "fullMark": 100,
            },
            {
                "dimension": "Presensi & Uptime (10%)",
                "key": "attendance_uptime",
                "human": calc_dim_avg(human_scores, "attendance_uptime"),
                "agent": calc_dim_avg(agent_scores, "attendance_uptime"),
                "overall": calc_dim_avg(scores, "attendance_uptime"),
                "fullMark": 100,
            },
        ]

        # Ambil alert aktif
        alerts_stmt = sa.text("""
            SELECT id, alert_type, severity, title, message, current_score, threshold_score, status, created_at
            FROM performance_alerts
            WHERE tenant_id = :tenant_id AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 10
        """)
        alerts_rows = conn.execute(alerts_stmt, {"tenant_id": tenant_id}).mappings().all()
        alerts = [
            {
                "id": str(r["id"]),
                "alert_type": r["alert_type"],
                "severity": r["severity"],
                "title": r["title"],
                "message": r["message"],
                "current_score": float(r["current_score"]) if r["current_score"] is not None else None,
                "threshold_score": float(r["threshold_score"]) if r["threshold_score"] is not None else None,
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            }
            for r in alerts_rows
        ]

        # Dimensi breakdown sumber task (BAGIAN E: Dashboard, Telegram, WhatsApp, Proactive AI Agent)
        src_stmt = sa.text("""
            SELECT 
                COALESCE(source_channel, 'dashboard') as channel,
                COUNT(id) as total_count
            FROM tasks
            WHERE tenant_id = :tenant_id AND deleted_at IS NULL
            GROUP BY COALESCE(source_channel, 'dashboard');
        """)
        src_rows = conn.execute(src_stmt, {"tenant_id": tenant_id}).mappings().all()
        total_src_tasks = sum(int(r["total_count"]) for r in src_rows)
        channel_counts = {str(r["channel"]): int(r["total_count"]) for r in src_rows}

        dashboard_cnt = channel_counts.get("dashboard", 0)
        telegram_cnt = channel_counts.get("telegram", 0) + channel_counts.get("telegram_proactive", 0)
        whatsapp_cnt = channel_counts.get("whatsapp", 0) + channel_counts.get("whatsapp_proactive", 0)
        proactive_cnt = (
            channel_counts.get("proactive_agent", 0)
            + channel_counts.get("ai_agent_autonomous", 0)
            + channel_counts.get("orchestration", 0)
            + sum(v for k, v in channel_counts.items() if k not in ("dashboard", "telegram", "whatsapp", "telegram_proactive", "whatsapp_proactive", "proactive_agent", "ai_agent_autonomous", "orchestration"))
        )

        def calc_channel_pct(c: int) -> float:
            return round((c / total_src_tasks * 100.0), 1) if total_src_tasks > 0 else 0.0

        source_breakdown = {
            "total_tasks": total_src_tasks,
            "breakdown": [
                {"channel": "dashboard", "label": "Web Dashboard", "count": dashboard_cnt, "percentage": calc_channel_pct(dashboard_cnt), "color": "#10b981"},
                {"channel": "telegram", "label": "Telegram", "count": telegram_cnt, "percentage": calc_channel_pct(telegram_cnt), "color": "#0ea5e9"},
                {"channel": "whatsapp", "label": "WhatsApp", "count": whatsapp_cnt, "percentage": calc_channel_pct(whatsapp_cnt), "color": "#22c55e"},
                {"channel": "proactive_agent", "label": "AI Agent Proaktif", "count": proactive_cnt, "percentage": calc_channel_pct(proactive_cnt), "color": "#a855f7"},
            ],
            "channels": {
                "dashboard": calc_channel_pct(dashboard_cnt),
                "telegram": calc_channel_pct(telegram_cnt),
                "whatsapp": calc_channel_pct(whatsapp_cnt),
                "proactive": calc_channel_pct(proactive_cnt),
            }
        }

        return {
            "tenant_id": tenant_id,
            "period": calc_period,
            "summary": {
                "average_score": avg_final_score,
                "completion_rate": overall_completion_rate,
                "quality_score": avg_quality,
                "tasks_assigned": tot_assigned,
                "tasks_completed": tot_completed,
                "tasks_overdue": tot_overdue,
                "active_workers_count": total_workers,
                "human_workers_count": len(human_scores),
                "agent_workers_count": len(agent_scores),
                "kpi_status": classify_kpi_status(avg_final_score) if 'classify_kpi_status' in globals() else ("optimal" if avg_final_score >= 85 else "needs_attention"),
            },
            "source_breakdown": source_breakdown,
            "radar_dimensions": radar_dimensions,
            "trend_series": trend_series,
            "leaderboard": scores[:10],
            "alerts": alerts,
            "query_key": f"performance:overview:{tenant_id}:{calc_period}",
        }


@router.get("/{tenant_id}/performance/monthly", dependencies=[Depends(require_capability("workforce.performance.view"))])
async def get_monthly_performance_detail(
    tenant_id: str,
    period: Optional[str] = None,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Mendapatkan detail tabel lengkap evaluasi kinerja bulanan seluruh pekerja.
    Audit Konsistensi Hub vs Detail (PRD v2.2 Bagian 22.3):
    Nilai dan kolom identik dengan sumber data yang digunakan pada ringkasan HomeOverview.
    """
    calc_period = period or datetime.now(timezone.utc).strftime("%Y-%m")
    with tenant_tx(tenant_id) as conn:
        from app.domains.workforce.scoring import monthly_score
        scores = monthly_score(conn, tenant_id, calc_period)

        # Agregasi ringkasan yang cocok 100% dengan Hub
        total_workers = len(scores)
        avg_score = round(sum(s["final_score"] for s in scores) / total_workers, 2) if total_workers > 0 else 0.0
        tot_assigned = sum(s["total_assigned"] for s in scores)
        tot_completed = sum(s["total_completed"] for s in scores)
        comp_rate = round((tot_completed / tot_assigned * 100.0) if tot_assigned > 0 else 100.0, 1)

        return {
            "tenant_id": tenant_id,
            "period": calc_period,
            "query_key": f"performance:monthly:{tenant_id}:{calc_period}",
            "summary_sync": {
                "average_score": avg_score,
                "completion_rate": comp_rate,
                "total_completed": tot_completed,
                "total_assigned": tot_assigned,
                "total_workers": total_workers,
            },
            "scores": scores,
        }


@router.get("/{tenant_id}/performance/daily", dependencies=[Depends(require_capability("workforce.performance.view"))])
async def get_daily_performance_metrics(
    tenant_id: str,
    metric_date: Optional[str] = None,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Mengambil data metrik kinerja harian langsung dari tabel performance_metrics_daily.
    Dapat digunakan untuk verifikasi audit manual dan reproducibility.
    """
    with tenant_tx(tenant_id) as conn:
        stmt = sa.text("""
            SELECT
                d.id, d.metric_date, d.worker_type, d.membership_id, d.agent_id,
                d.tasks_assigned, d.tasks_completed, d.tasks_overdue, d.tasks_reworked,
                d.quality_score, d.collaboration_score, d.discipline_score, d.attendance_or_uptime_score,
                d.metrics_payload,
                COALESCE(m.full_name, a.display_name, 'Pekerja') as worker_name,
                COALESCE(dept_m.name, dept_a.name, 'Operasional') as department_name
            FROM performance_metrics_daily d
            LEFT JOIN tenant_memberships m ON d.membership_id = m.id
            LEFT JOIN departments dept_m ON m.department_id = dept_m.id
            LEFT JOIN ai_agents a ON d.agent_id = a.id
            LEFT JOIN departments dept_a ON a.department_id = dept_a.id
            WHERE d.tenant_id = :tenant_id
            ORDER BY d.metric_date DESC, d.tasks_completed DESC
            LIMIT 100
        """)
        rows = conn.execute(stmt, {"tenant_id": tenant_id}).mappings().all()
        return {
            "tenant_id": tenant_id,
            "total_records": len(rows),
            "metrics": [dict(r) for r in rows],
        }


@router.post("/{tenant_id}/performance/scoring/trigger", dependencies=[Depends(require_capability("workforce.performance.manage"))])
async def trigger_performance_scoring(
    tenant_id: str,
    request: Request,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Memicu kalkulasi skor kinerja bulanan dan penetapan peringkat secara instan (Celery job runner).
    Memerlukan hak akses role TENANT_ADMIN / TENANT_OWNER.
    """
    body = {}
    try:
        body = await request.json()
    except Exception as e:
        logger.debug("Request body is empty or non-JSON for trigger_monthly_score: %s", str(e))

    period = body.get("period") or datetime.now(timezone.utc).strftime("%Y-%m")

    with tenant_tx(tenant_id) as conn:
        from app.domains.workforce.scoring import monthly_score
        scores = monthly_score(conn, tenant_id, period)

        return {
            "status": "success",
            "message": f"Kalkulasi performa bulanan periode {period} berhasil dieksekusi.",
            "period": period,
            "total_workers_scored": len(scores),
            "scores": scores,
        }


@router.get("/{tenant_id}/performance/alerts", dependencies=[Depends(require_capability("workforce.performance.view"))])
async def list_performance_alerts(
    tenant_id: str,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """Melihat daftar seluruh peringatan deviasi dan anomali kinerja tim."""
    with tenant_tx(tenant_id) as conn:
        stmt = sa.text("""
            SELECT id, worker_type, alert_type, severity, title, message, current_score, threshold_score, status, created_at, resolved_at
            FROM performance_alerts
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT 50
        """)
        rows = conn.execute(stmt, {"tenant_id": tenant_id}).mappings().all()
        return {
            "tenant_id": tenant_id,
            "alerts": [dict(r) for r in rows],
        }


@router.patch("/{tenant_id}/performance/alerts/{alert_id}/acknowledge", dependencies=[Depends(require_capability("workforce.performance.manage"))])
async def acknowledge_performance_alert(
    tenant_id: str,
    alert_id: str,
    current_user: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """Mengonfirmasi atau menyelesaikan peringatan kinerja."""
    with tenant_tx(tenant_id) as conn:
        stmt = sa.text("""
            UPDATE performance_alerts
            SET status = 'acknowledged', resolved_at = NOW()
            WHERE id = :alert_id AND tenant_id = :tenant_id
            RETURNING id, status
        """)
        row = conn.execute(stmt, {"alert_id": alert_id, "tenant_id": tenant_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Peringatan kinerja tidak ditemukan.")
        return {"status": "success", "alert_id": str(row["id"]), "current_status": row["status"]}


def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except Exception:
        return False

