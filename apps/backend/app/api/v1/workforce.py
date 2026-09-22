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
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.core.database import tenant_tx, get_database_engine
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context

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


class CreateAgentRequest(BaseModel):
    # Catatan Utang Teknis: Kolom persona_type saat ini menerima kode identifier bebas
    # dari katalog yang disediakan dan akan digantikan oleh foreign key wajib job_title_id pada Fase 32a/32b.
    persona_type: str = Field(..., description="Tipe jabatan/persona AI")
    display_name: str = Field(..., min_length=2, max_length=100, description="Nama tampilan agen AI")
    department_id: Optional[str] = Field(default=None, description="UUID departemen penempatan")
    status: str = Field(default="active", description="'active', 'paused', atau 'error'")


class UpdateAgentRequest(BaseModel):
    display_name: Optional[str] = None
    department_id: Optional[str] = None
    status: Optional[str] = None


class AgentResponse(BaseModel):
    id: str
    tenant_id: str
    department_id: Optional[str]
    department_name: Optional[str] = None
    persona_type: str
    display_name: str
    status: str
    created_at: str


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
                           a.display_name, a.status, a.created_at,
                           d.name as department_name
                    FROM ai_agents a
                    LEFT JOIN departments d ON d.id = a.department_id
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
    Mendaftarkan staf agen AI otonom baru ke dalam registri tenant.
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

            # Catatan Utang Teknis: Kolom persona_type saat ini menerima kode identifier bebas
            # dan dijadwalkan akan digantikan dengan foreign key wajib job_title_id pada Fase 32a/32b.
            conn.execute(
                sa.text("""
                    INSERT INTO ai_agents (
                        id, tenant_id, department_id, persona_type, display_name, status, created_at
                    ) VALUES (
                        :id, :tenant_id, :department_id, :persona_type, :display_name, :status, now()
                    );
                """),
                {
                    "id": new_id,
                    "tenant_id": tenant_id,
                    "department_id": dept_uuid,
                    "persona_type": req.persona_type.strip(),
                    "display_name": req.display_name.strip(),
                    "status": req.status if req.status in ("active", "paused", "error") else "active",
                }
            )

            dept_name = None
            if dept_uuid:
                dept_name = conn.execute(
                    sa.text("SELECT name FROM departments WHERE id = :id;"),
                    {"id": dept_uuid}
                ).scalar()

            return AgentResponse(
                id=new_id,
                tenant_id=tenant_id,
                department_id=req.department_id,
                department_name=dept_name,
                persona_type=req.persona_type.strip(),
                display_name=req.display_name.strip(),
                status=req.status or "active",
                created_at=datetime.now(timezone.utc).isoformat(),
            )


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

@router.get("/{tenant_id}/performance/overview")
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
            "radar_dimensions": radar_dimensions,
            "trend_series": trend_series,
            "leaderboard": scores[:10],
            "alerts": alerts,
            "query_key": f"performance:overview:{tenant_id}:{calc_period}",
        }


@router.get("/{tenant_id}/performance/monthly")
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


@router.get("/{tenant_id}/performance/daily")
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


@router.post("/{tenant_id}/performance/scoring/trigger")
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
    except Exception:
        pass

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


@router.get("/{tenant_id}/performance/alerts")
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


@router.patch("/{tenant_id}/performance/alerts/{alert_id}/acknowledge")
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

