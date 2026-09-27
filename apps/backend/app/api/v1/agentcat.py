"""
API Router untuk F.01-AGENTCAT: Super Admin Managed AI Agent Blueprint Catalog & Staged Rollout (PRD v2.2 Bagian 11.3 & F.01).
- Otentikasi dan isolasi peran ketat via PDP authorize() dan require_capability()
- Pendaftaran blueprint manual-assisted tanpa paparan nama rujukan luar
- Validasi ketat integritas perkakas terhadap mcp_tools
- Transisi rilis bertingkat (internal_review -> beta_tenant -> general_availability -> deprecated)
- Audit log & riwayat adopsi nyata
"""

from typing import Optional, List, Dict, Any
import uuid
from fastapi import APIRouter, HTTPException, Query, status, Depends, Request
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.authz.pdp import require_capability, authorize, SubjectContext, ResourceContext
from app.core.database import get_database_engine
from app.core.security import AuthenticatedTenantContext, get_current_tenant_context
from app.skills.f01_agentcat.skill_ingest import (
    validate_blueprint_tools,
    propose_blueprint_from_reference,
    promote_blueprint_stage,
    get_blueprint_adoption_stats,
    get_job_title_coverage_stats,
    OFFICIAL_BUILTIN_TOOLS,
    VALID_ROLLOUT_STAGES,
)
from app.skills.f01_agentcat.catalog import (
    RolloutStage,
    PolicyScanStatus,
    PolicyScanRequiredError,
    InvalidBlueprintPackageError,
    get_agentcat_catalog,
)

admin_router = APIRouter(
    tags=["Agent Blueprint Library Admin"],
    dependencies=[Depends(require_capability("agentcat.admin.manage"))]
)

tenant_router = APIRouter(
    tags=["Agent Blueprint Library Tenant"],
    dependencies=[Depends(require_capability("agentcat.tenant.view"))]
)


# --- Request & Response Models ---

class ProposeBlueprintRequest(BaseModel):
    industry_category: str = Field(..., description="Kategori industri, misal: retail, finance, logistics, technology")
    display_name: str = Field(..., min_length=3, max_length=150, description="Nama fungsional netral blueprint")
    description: str = Field(..., min_length=10, description="Deskripsi fungsional yang ditulis ulang sendiri")
    job_title_id: str = Field(..., description="UUID 15 Jabatan Utama katalog resmi")
    structural_role_id: Optional[str] = Field(default=None, description="UUID peran struktural pendukung (opsional)")
    default_skill_summary: str = Field(default="", description="Ringkasan skill default")
    recommended_tool_keys: List[str] = Field(default_factory=list, description="Daftar nama perkakas mcp_tools aktif")
    recommended_model_capability: Optional[str] = Field(default="text_reasoning", description="Kapabilitas model yang direkomendasikan")
    blueprint_code: Optional[str] = Field(default=None, description="Kode blueprint unik (opsional)")
    reference_identity: Optional[str] = Field(default=None, description="Identitas rujukan (hanya untuk hash deduplikasi satu arah)")


class RolloutStageTransitionRequest(BaseModel):
    to_stage: str = Field(..., description="Tahap rilis tujuan: internal_review, beta_tenant, general_availability, deprecated")
    reason: str = Field(..., min_length=5, description="Alasan transisi tahap rilis untuk audit ledger")
    changed_by: Optional[str] = Field(default=None, description="UUID keanggotaan Super Admin yang melakukan perubahan")


class BlueprintDetailResponse(BaseModel):
    id: str
    blueprint_code: str
    display_name: str
    description: str
    industry_category: str
    job_title_id: str
    job_title_name: Optional[str] = None
    job_title_code: Optional[str] = None
    structural_role_id: Optional[str] = None
    structural_role_name: Optional[str] = None
    structural_role_code: Optional[str] = None
    default_skill_summary: str
    recommended_tool_keys: List[str]
    recommended_model_capability: Optional[str]
    rollout_stage: str
    created_at: str
    updated_at: Optional[str] = None
    adoption_count: int = 0


# --- Super Admin Endpoints (F.01 & Master Data) ---

@admin_router.post(
    "/api/v1/admin/agent-blueprints",
    status_code=status.HTTP_201_CREATED,
    summary="Usulkan Blueprint AI Agent Baru (Manual-Assisted Ingest)"
)
async def propose_blueprint(payload: ProposeBlueprintRequest):
    """
    Super Admin mendaftarkan blueprint AI Agent baru dengan input manual terstruktur.
    Teks deskripsi ditulis ulang sendiri tanpa salinan verbatim atau brand luar.
    Status rilis awal adalah 'internal_review'.
    """
    try:
        res = await propose_blueprint_from_reference(
            industry_category=payload.industry_category,
            display_name=payload.display_name,
            description=payload.description,
            job_title_id=payload.job_title_id,
            structural_role_id=payload.structural_role_id,
            default_skill_summary=payload.default_skill_summary,
            recommended_tool_keys=payload.recommended_tool_keys,
            recommended_model_capability=payload.recommended_model_capability or "text_reasoning",
            blueprint_code=payload.blueprint_code,
            reference_identity=payload.reference_identity,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mendaftarkan blueprint: {str(e)}")


@admin_router.get(
    "/api/v1/admin/agent-blueprints",
    summary="Katalog Lengkap Blueprint AI Agent untuk Super Admin"
)
async def list_admin_blueprints(
    industry: Optional[str] = Query(None),
    job_title_id: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """
    Mengambil katalog seluruh blueprint yang terdaftar di platform
    dengan filter per kategori industri, jabatan utama, atau tahap rilis.
    """
    engine = get_database_engine()
    filters = ["1=1"]
    params: Dict[str, Any] = {}

    if industry and industry.upper() != "ALL":
        filters.append("bc.industry_category = :industry")
        params["industry"] = industry

    if job_title_id and job_title_id.upper() != "ALL":
        filters.append("bc.job_title_id::text = :job_title_id")
        params["job_title_id"] = job_title_id

    if stage and stage.upper() != "ALL":
        filters.append("bc.rollout_stage = :stage")
        params["stage"] = stage.lower()

    if search:
        filters.append("(bc.display_name ILIKE :search OR bc.description ILIKE :search OR bc.blueprint_code ILIKE :search)")
        params["search"] = f"%{search}%"

    where_clause = " AND ".join(filters)

    with engine.connect() as conn:
        query = sa.text(f"""
            SELECT bc.id, bc.blueprint_code, bc.display_name, bc.description, bc.industry_category,
                   bc.job_title_id, bc.structural_role_id, bc.default_skill_summary,
                   bc.recommended_tool_keys, bc.recommended_model_capability, bc.rollout_stage,
                   bc.created_at, bc.updated_at,
                   jt.title_name as job_title_name, jt.title_code as job_title_code,
                   sr.name as structural_role_name, sr.role_code as structural_role_code,
                   (SELECT count(*) FROM ai_agents a WHERE a.blueprint_id = bc.id AND a.status = 'active') as active_agents_count
            FROM agent_blueprint_catalog bc
            JOIN ai_job_titles jt ON jt.id = bc.job_title_id
            LEFT JOIN ai_structural_roles sr ON sr.id = bc.structural_role_id
            WHERE {where_clause}
            ORDER BY bc.created_at DESC;
        """)
        rows = conn.execute(query, params).mappings().all()

        results = []
        for r in rows:
            results.append({
                "id": str(r["id"]),
                "blueprint_code": r["blueprint_code"],
                "display_name": r["display_name"],
                "description": r["description"],
                "industry_category": r["industry_category"],
                "job_title_id": str(r["job_title_id"]),
                "job_title_name": r["job_title_name"],
                "job_title_code": r["job_title_code"],
                "structural_role_id": str(r["structural_role_id"]) if r["structural_role_id"] else None,
                "structural_role_name": r["structural_role_name"],
                "structural_role_code": r["structural_role_code"],
                "default_skill_summary": r["default_skill_summary"],
                "recommended_tool_keys": r["recommended_tool_keys"] or [],
                "recommended_model_capability": r["recommended_model_capability"],
                "rollout_stage": r["rollout_stage"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                "adoption_count": int(r["active_agents_count"] or 0),
            })
        return results


@admin_router.get(
    "/api/v1/admin/agent-blueprints/job-title-coverage",
    summary="Indikator Sebaran Blueprint per 15 Jabatan Utama"
)
async def get_job_title_coverage():
    """
    Mengembalikan indikator jumlah blueprint per Jabatan Utama
    untuk membantu Super Admin memantau kelengkapan pilihan template.
    """
    return await get_job_title_coverage_stats()


@admin_router.get(
    "/api/v1/admin/agent-blueprints/{blueprint_id}",
    summary="Detail Blueprint AI Agent"
)
async def get_admin_blueprint_detail(blueprint_id: str):
    """Mengambil detail satu blueprint termasuk adopsi dan perkakas rekomendasi."""
    engine = get_database_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("""
                SELECT bc.id, bc.blueprint_code, bc.display_name, bc.description, bc.industry_category,
                       bc.job_title_id, bc.structural_role_id, bc.default_skill_summary,
                       bc.recommended_tool_keys, bc.recommended_model_capability, bc.rollout_stage,
                       bc.created_at, bc.updated_at,
                       jt.title_name as job_title_name, jt.title_code as job_title_code,
                       sr.name as structural_role_name, sr.role_code as structural_role_code,
                       (SELECT count(*) FROM ai_agents a WHERE a.blueprint_id = bc.id AND a.status = 'active') as active_agents_count
                FROM agent_blueprint_catalog bc
                JOIN ai_job_titles jt ON jt.id = bc.job_title_id
                LEFT JOIN ai_structural_roles sr ON sr.id = bc.structural_role_id
                WHERE bc.id::text = :id OR bc.blueprint_code = :id;
            """),
            {"id": blueprint_id}
        ).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Blueprint tidak ditemukan.")

        return {
            "id": str(row["id"]),
            "blueprint_code": row["blueprint_code"],
            "display_name": row["display_name"],
            "description": row["description"],
            "industry_category": row["industry_category"],
            "job_title_id": str(row["job_title_id"]),
            "job_title_name": row["job_title_name"],
            "job_title_code": row["job_title_code"],
            "structural_role_id": str(row["structural_role_id"]) if row["structural_role_id"] else None,
            "structural_role_name": row["structural_role_name"],
            "structural_role_code": row["structural_role_code"],
            "default_skill_summary": row["default_skill_summary"],
            "recommended_tool_keys": row["recommended_tool_keys"] or [],
            "recommended_model_capability": row["recommended_model_capability"],
            "rollout_stage": row["rollout_stage"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "adoption_count": int(row["active_agents_count"] or 0),
        }


@admin_router.post(
    "/api/v1/admin/agent-blueprints/{blueprint_id}/rollout",
    summary="Promosikan atau Ubah Tahap Rilis Blueprint"
)
async def transition_blueprint_rollout(
    blueprint_id: str,
    payload: RolloutStageTransitionRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Mentransisikan tahap rollout (internal_review -> beta_tenant -> general_availability / deprecated).
    Wajib menyertakan alasan perubahan untuk pencatatan audit log.
    """
    try:
        actor_id = payload.changed_by or context.user_id
        updated = await promote_blueprint_stage(
            blueprint_id=blueprint_id,
            to_stage=payload.to_stage.lower().strip(),
            reason=payload.reason,
            changed_by=actor_id,
        )
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mentransisikan tahap rilis: {str(e)}")


@admin_router.get(
    "/api/v1/admin/agent-blueprints/{blueprint_id}/adoption-stats",
    summary="Statistik Adopsi Nyata Blueprint AI Agent"
)
async def get_blueprint_adoption(blueprint_id: str):
    """Mengambil metrik adopsi nyata blueprint dari database (jumlah agen, tenant pengguna, riwayat)."""
    try:
        return await get_blueprint_adoption_stats(blueprint_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memuat statistik adopsi: {str(e)}")


@admin_router.get(
    "/api/v1/admin/mcp-tools",
    summary="Registri Perkakas MCP Aktif untuk Pemilihan Blueprint"
)
async def list_admin_mcp_tools():
    """Mengambil daftar perkakas MCP aktif yang sah untuk dipilih pada formulir pembuatan blueprint."""
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT id, COALESCE(tool_name, name) as key_name, description, risk_tier, is_active
                FROM mcp_tools
                WHERE is_active = true
                ORDER BY key_name ASC;
            """)
        ).mappings().all()

        tools = [
            {
                "id": str(r["id"]),
                "key_name": r["key_name"],
                "description": r["description"] or "",
                "risk_tier": r["risk_tier"],
                "is_active": r["is_active"],
            }
            for r in rows
        ]

        if not tools:
            # Fallback ke daftar perkakas bawaan resmi platform jika tabel belum terpopulasi
            tools = [
                {
                    "id": f"tool-{k.replace('.', '-')}",
                    "key_name": k,
                    "description": f"Perkakas resmi {k}",
                    "risk_tier": "low",
                    "is_active": True,
                }
                for k in sorted(OFFICIAL_BUILTIN_TOOLS)
            ]

        return tools


@admin_router.get(
    "/api/v1/admin/job-titles",
    summary="Daftar 15 Katalog Jabatan AI Resmi untuk Master Data Blueprint"
)
async def list_admin_job_titles():
    """Mengambil 15 Jabatan Utama beserta Peran Struktural untuk pemilihan di form Super Admin."""
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT jt.id, jt.title_code, jt.title_name, jt.category_tag,
                       jt.primary_deliverable, jt.primary_duties,
                       sr.id as structural_role_id, sr.role_code as structural_role_code, sr.name as structural_role_name,
                       jl.level_code, jl.name as level_name
                FROM ai_job_titles jt
                JOIN ai_structural_roles sr ON sr.id = jt.structural_role_id
                JOIN job_levels jl ON jl.id = jt.job_level_id
                ORDER BY jt.title_name ASC;
            """)
        ).mappings().all()

        return [
            {
                "id": str(r["id"]),
                "title_code": r["title_code"],
                "title_name": r["title_name"],
                "category_tag": r["category_tag"],
                "primary_deliverable": r["primary_deliverable"],
                "structural_role": {
                    "id": str(r["structural_role_id"]),
                    "role_code": r["structural_role_code"],
                    "name": r["structural_role_name"],
                },
                "job_level": {
                    "level_code": r["level_code"],
                    "name": r["level_name"],
                }
            }
            for r in rows
        ]


# --- Tenant Endpoints (F.01 & Alur Pembuatan Agen) ---

@tenant_router.get(
    "/api/v1/tenants/{tenant_id}/agent-blueprints",
    summary="Daftar Blueprint AI Agent Tersedia untuk Tenant"
)
async def list_tenant_blueprints(
    tenant_id: str,
    job_title_id: Optional[str] = Query(None),
    structural_role_id: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Mengambil daftar blueprint yang tersedia untuk tenant:
    - Paket 'general_availability' selalu tampil untuk seluruh tenant
    - Paket 'beta_tenant' hanya tampil jika tenant terdaftar dalam program beta
    - Dapat difilter berdasarkan job_title_id atau structural_role_id saat pembuatan agen
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        # Cek kelayakan program beta tenant
        is_beta_tenant = False
        try:
            beta_check = conn.execute(
                sa.text("""
                    SELECT (capability_overrides->>'beta_program')::boolean as is_beta
                    FROM tenant_capability_overrides
                    WHERE tenant_id::text = :tid;
                """),
                {"tid": tenant_id}
            ).scalar()
            is_beta_tenant = bool(beta_check)
        except Exception:
            is_beta_tenant = False

        allowed_stages = ["general_availability"]
        if is_beta_tenant:
            allowed_stages.append("beta_tenant")

        filters = ["bc.rollout_stage = ANY(:stages)"]
        params: Dict[str, Any] = {"stages": allowed_stages}

        if job_title_id and job_title_id.upper() != "ALL":
            filters.append("bc.job_title_id::text = :job_title_id")
            params["job_title_id"] = job_title_id

        if structural_role_id and structural_role_id.upper() != "ALL":
            filters.append("bc.structural_role_id::text = :structural_role_id")
            params["structural_role_id"] = structural_role_id

        if industry and industry.upper() != "ALL":
            filters.append("bc.industry_category = :industry")
            params["industry"] = industry

        where_clause = " AND ".join(filters)

        query = sa.text(f"""
            SELECT bc.id, bc.blueprint_code, bc.display_name, bc.description, bc.industry_category,
                   bc.job_title_id, bc.structural_role_id, bc.default_skill_summary,
                   bc.recommended_tool_keys, bc.recommended_model_capability, bc.rollout_stage,
                   jt.title_name as job_title_name, jt.title_code as job_title_code,
                   sr.name as structural_role_name, sr.role_code as structural_role_code
            FROM agent_blueprint_catalog bc
            JOIN ai_job_titles jt ON jt.id = bc.job_title_id
            LEFT JOIN ai_structural_roles sr ON sr.id = bc.structural_role_id
            WHERE {where_clause}
            ORDER BY bc.display_name ASC;
        """)

        rows = conn.execute(query, params).mappings().all()

        return [
            {
                "id": str(r["id"]),
                "blueprint_code": r["blueprint_code"],
                "display_name": r["display_name"],
                "description": r["description"],
                "industry_category": r["industry_category"],
                "job_title_id": str(r["job_title_id"]),
                "job_title_name": r["job_title_name"],
                "job_title_code": r["job_title_code"],
                "structural_role_id": str(r["structural_role_id"]) if r["structural_role_id"] else None,
                "structural_role_name": r["structural_role_name"],
                "structural_role_code": r["structural_role_code"],
                "default_skill_summary": r["default_skill_summary"],
                "recommended_tool_keys": r["recommended_tool_keys"] or [],
                "recommended_model_capability": r["recommended_model_capability"],
                "rollout_stage": r["rollout_stage"],
            }
            for r in rows
        ]


@tenant_router.get(
    "/api/v1/tenants/{tenant_id}/agent-blueprints/unused-suggestions",
    summary="Saran Blueprint Tersedia untuk Jabatan yang Belum Dipakai (Discoverability)"
)
async def get_unused_blueprint_suggestions(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Menemukan blueprint yang tersedia untuk Jabatan Utama yang BELUM pernah diaktifkan
    oleh tenant ini (dihitung dari query nyata COUNT blueprint per job_title_id yang belum dipakai).
    Mendorong penemuan fitur di Hub Tenaga Kerja.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        # Cek kelayakan beta
        is_beta_tenant = False
        try:
            beta_check = conn.execute(
                sa.text("""
                    SELECT (capability_overrides->>'beta_program')::boolean
                    FROM tenant_capability_overrides
                    WHERE tenant_id::text = :tid;
                """),
                {"tid": tenant_id}
            ).scalar()
            is_beta_tenant = bool(beta_check)
        except Exception:
            is_beta_tenant = False

        allowed_stages = ["general_availability"]
        if is_beta_tenant:
            allowed_stages.append("beta_tenant")

        # Query jabatan yang belum memiliki agen aktif pada tenant ini
        query = sa.text("""
            WITH deployed_job_titles AS (
                SELECT DISTINCT job_title_id
                FROM ai_agents
                WHERE tenant_id::text = :tid
                  AND status = 'active'
                  AND job_title_id IS NOT NULL
            )
            SELECT jt.id as job_title_id,
                   jt.title_name,
                   jt.title_code,
                   jt.category_tag,
                   count(bc.id) as blueprint_count,
                   json_agg(
                       json_build_object(
                           'id', bc.id,
                           'blueprint_code', bc.blueprint_code,
                           'display_name', bc.display_name,
                           'description', bc.description,
                           'industry_category', bc.industry_category,
                           'recommended_tool_keys', bc.recommended_tool_keys
                       )
                   ) as blueprints
            FROM ai_job_titles jt
            JOIN agent_blueprint_catalog bc ON bc.job_title_id = jt.id AND bc.rollout_stage = ANY(:stages)
            WHERE jt.id NOT IN (SELECT job_title_id FROM deployed_job_titles)
            GROUP BY jt.id, jt.title_name, jt.title_code, jt.category_tag
            ORDER BY count(bc.id) DESC, jt.title_name ASC
            LIMIT 5;
        """)

        rows = conn.execute(query, {"tid": tenant_id, "stages": allowed_stages}).mappings().all()

        results = []
        for r in rows:
            results.append({
                "job_title_id": str(r["job_title_id"]),
                "title_name": r["title_name"],
                "title_code": r["title_code"],
                "category_tag": r["category_tag"],
                "blueprint_count": int(r["blueprint_count"]),
                "blueprints": r["blueprints"] or [],
            })
        return results


# --- Legacy / Backwards Compatibility Endpoints ---

class LegacyBlueprintIngestRequest(BaseModel):
    package_id: str
    name: str
    version: str = "1.0.0"
    description: str
    category: str = "operations"
    system_prompt_template: str
    required_capabilities: List[str] = Field(default_factory=list)
    tool_definitions: List[Dict[str, Any]] = Field(default_factory=list)
    default_config: Dict[str, Any] = Field(default_factory=dict)
    operator: Optional[str] = "Super Admin"


class LegacyRolloutTransitionRequest(BaseModel):
    target_stage: str
    allowed_tenant_ids: Optional[List[str]] = Field(default_factory=list)
    operator: Optional[str] = "Super Admin"


@admin_router.post("/api/v1/admin/agent-catalog/ingest", status_code=status.HTTP_201_CREATED)
async def legacy_ingest_skill_package(payload: LegacyBlueprintIngestRequest):
    catalog = get_agentcat_catalog()
    try:
        result = await catalog.ingest_package(payload.model_dump(), operator=payload.operator or "Super Admin")
        return result
    except InvalidBlueprintPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses paket blueprint: {str(e)}")


@admin_router.post("/api/v1/admin/agent-catalog/blueprints/{blueprint_id}/rollout")
async def legacy_transition_rollout_stage(blueprint_id: str, payload: LegacyRolloutTransitionRequest):
    catalog = get_agentcat_catalog()
    try:
        stage_enum = RolloutStage(payload.target_stage)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tahap rollout tidak valid: {payload.target_stage}")

    try:
        updated = await catalog.transition_rollout(
            identifier=blueprint_id,
            target_stage=stage_enum,
            allowed_tenant_ids=payload.allowed_tenant_ids,
            operator=payload.operator or "Super Admin",
        )
        return updated
    except PolicyScanRequiredError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except (InvalidBlueprintPackageError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mentransisikan tahap rollout: {str(e)}")


@admin_router.get("/api/v1/admin/agent-catalog/blueprints")
async def legacy_list_all_blueprints(
    stage: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    policy_status: Optional[str] = Query(None),
):
    catalog = get_agentcat_catalog()
    return await catalog.list_blueprints(stage=stage, category=category, policy_status=policy_status)


@admin_router.get("/api/v1/admin/agent-catalog/blueprints/{blueprint_id}")
async def legacy_get_blueprint_detail(blueprint_id: str):
    catalog = get_agentcat_catalog()
    bp = await catalog.get_blueprint(blueprint_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Blueprint tidak ditemukan.")
    return bp


@tenant_router.get("/api/v1/tenants/{tenant_id}/agent-catalog/available")
async def legacy_list_available_blueprints_for_tenant(
    tenant_id: str,
    category: Optional[str] = Query(None),
):
    catalog = get_agentcat_catalog()
    return await catalog.list_available_for_tenant(tenant_id=tenant_id, category=category)
