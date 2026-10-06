"""FastAPI Endpoints untuk Generative Studio Hub & Image Router (PRD v2.2 Bagian 11.10, 13.2)"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

try:
    from orchestree.domains.generative.image_router import ImageRouterService
except ImportError:
    from apps.backend.orchestree.domains.generative.image_router import ImageRouterService
from app.domains.billing.credits import InsufficientCreditError
from app.authz.pdp import require_capability
from app.core.orchestration.engine import get_orchestration_engine, WorkflowDispatchRequest
from app.core.security import AuthenticatedTenantContext, get_trusted_request_context



def require_generative_tenant_scope(
    tenant_id: str,
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
) -> AuthenticatedTenantContext:
    """Prevent caller-controlled tenant_id from crossing the tenant boundary."""
    global_roles = {"SUPER_ADMIN", "PLATFORM_SUPER_ADMIN", "PLATFORM_SUPERADMIN"}
    if context.tenant_id != tenant_id and not (set(context.roles) & global_roles):
        raise HTTPException(status_code=403, detail="Tenant context tidak sesuai dengan sesi terautentikasi.")
    return context

router = APIRouter(
    prefix="/tenants/{tenant_id}/generative",
    tags=["Generative Studio Hub"],
    dependencies=[
        Depends(require_capability("generative.studio.manage")),
        Depends(require_capability("workflow.dispatch")),
        Depends(require_capability("workflow.node.execute")),
        Depends(require_generative_tenant_scope),
    ]
)


class PromptTemplateCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=120)
    category: str = Field(default="PRODUCT_SHOWCASE")
    template_body: str = Field(..., min_length=10)
    default_negative_prompt: Optional[str] = None
    recommended_aspect_ratio: str = Field(default="1:1")
    style_tags: List[str] = Field(default_factory=list)
    credit_estimate: float = Field(default=5.0, ge=0.0)


class BrandLockCreate(BaseModel):
    brand_name: str = Field(..., min_length=2, max_length=80)
    logo_url: Optional[str] = None
    primary_color: str = Field(default="#1FA35A")
    secondary_color: Optional[str] = Field(default="#0B1220")
    accent_color: Optional[str] = Field(default="#38BDF8")
    palette_hex_codes: List[str] = Field(default_factory=lambda: ["#1FA35A", "#0B1220", "#38BDF8"])
    typography_fonts: List[str] = Field(default_factory=lambda: ["Plus Jakarta Sans", "Inter"])
    brand_voice_guidelines: Optional[str] = None
    visual_style_keywords: List[str] = Field(default_factory=lambda: ["clean", "minimalist"])
    negative_style_keywords: List[str] = Field(default_factory=lambda: ["blurry", "low quality"])
    enforce_strict_palette: bool = True
    enforce_logo_presence: bool = False
    max_color_delta_e: float = Field(default=25.0, ge=5.0, le=100.0)
    is_active: bool = True


class GenerativeJobCreate(BaseModel):
    job_type: str = Field(default="IMAGE_GENERATION")
    prompt: str = Field(..., min_length=5)
    negative_prompt: Optional[str] = None
    aspect_ratio: str = Field(default="1:1")
    style_preset: Optional[str] = None
    model_used: Optional[str] = None
    brand_lock_id: Optional[str] = None
    template_id: Optional[str] = None
    credit_cost: float = Field(default=5.0, ge=1.0)
    force_fail_for_test: bool = False


class PromptCategoryCreate(BaseModel):
    category_code: str = Field(..., min_length=2, max_length=64)
    display_name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(..., min_length=3, max_length=500)
    icon_key: str = Field(default="layers")
    display_order: int = Field(default=0)


class PromptCategoryUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon_key: Optional[str] = None
    display_order: Optional[int] = None


class PromptStyleCreate(BaseModel):
    style_code: str = Field(..., min_length=2, max_length=64)
    display_name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(..., min_length=3, max_length=500)
    icon_key: str = Field(default="shapes")
    display_order: int = Field(default=0)


class PromptStyleUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon_key: Optional[str] = None
    display_order: Optional[int] = None


class SeedingBatchCreate(BaseModel):
    batch_label: str = Field(..., min_length=3, max_length=150)
    requested_template_count: int = Field(..., ge=1, le=200)
    estimated_total_credit: Optional[float] = Field(default=None, ge=0.0)
    plan_details: List[Dict[str, Any]] = Field(default_factory=list)


class SeedingBatchStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending_approval|approved|running|completed|failed)$")
    approved_by: Optional[str] = None


class AtomicPromptTemplateCreate(BaseModel):
    category_id: Optional[str] = None
    category_code: Optional[str] = None
    style_family_id: Optional[str] = None
    style_code: Optional[str] = None
    template_name: str = Field(..., min_length=3, max_length=150)
    concept_summary: str = Field(..., min_length=5, max_length=500)
    subject_field: str = Field(..., min_length=3)
    scene_context_field: Optional[str] = None
    lighting_field: Optional[str] = None
    material_texture_field: Optional[str] = None
    composition_layout_field: Optional[str] = None
    color_palette_field: Optional[str] = None
    style_reference_field: Optional[str] = None
    constraints_field: Optional[str] = None
    avoid_terms: List[str] = Field(default_factory=list)
    prefer_terms: List[str] = Field(default_factory=list)
    recommended_aspect_ratio: str = Field(default="1:1")
    recommended_platform: List[str] = Field(default_factory=list)
    is_global: bool = False


class AtomicPromptTemplateUpdate(BaseModel):
    category_id: Optional[str] = None
    category_code: Optional[str] = None
    style_family_id: Optional[str] = None
    style_code: Optional[str] = None
    template_name: Optional[str] = None
    concept_summary: Optional[str] = None
    subject_field: Optional[str] = None
    scene_context_field: Optional[str] = None
    lighting_field: Optional[str] = None
    material_texture_field: Optional[str] = None
    composition_layout_field: Optional[str] = None
    color_palette_field: Optional[str] = None
    style_reference_field: Optional[str] = None
    constraints_field: Optional[str] = None
    avoid_terms: Optional[List[str]] = None
    prefer_terms: Optional[List[str]] = None
    recommended_aspect_ratio: Optional[str] = None
    recommended_platform: Optional[List[str]] = None


class AtomicPromptComposeRequest(BaseModel):
    subject_field: Optional[str] = None
    scene_context_field: Optional[str] = None
    lighting_field: Optional[str] = None
    material_texture_field: Optional[str] = None
    composition_layout_field: Optional[str] = None
    color_palette_field: Optional[str] = None
    style_reference_field: Optional[str] = None
    constraints_field: Optional[str] = None
    recommended_aspect_ratio: Optional[str] = None
    avoid_terms: Optional[List[str]] = None
    prefer_terms: Optional[List[str]] = None


@router.get("/templates", response_model=Dict[str, Any])
async def list_templates(
    tenant_id: str,
    category: Optional[str] = Query(None, description="Filter berdasarkan kategori template"),
):
    try:
        items = ImageRouterService.list_prompt_templates(tenant_id, category)
        return {"status": "ok", "data": items}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/templates", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_template(
    tenant_id: str,
    payload: PromptTemplateCreate,
):
    try:
        item = ImageRouterService.create_prompt_template(tenant_id, payload.model_dump())
        return {"status": "ok", "data": item}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.get("/brand-locks", response_model=Dict[str, Any])
async def list_brand_locks(tenant_id: str):
    try:
        items = ImageRouterService.list_brand_locks(tenant_id)
        return {"status": "ok", "data": items}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/brand-locks", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_brand_lock(
    tenant_id: str,
    payload: BrandLockCreate,
):
    try:
        item = ImageRouterService.create_brand_lock(tenant_id, payload.model_dump())
        return {"status": "ok", "data": item}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.get("/jobs", response_model=Dict[str, Any])
async def list_jobs(
    tenant_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
):
    try:
        jobs = ImageRouterService.list_jobs(tenant_id, status_filter)
        return {"status": "ok", "data": jobs}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/jobs/{job_id}", response_model=Dict[str, Any])
async def get_job_detail(tenant_id: str, job_id: str):
    try:
        job = ImageRouterService.get_job_detail(tenant_id, job_id)
        return {"status": "ok", "data": job}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/jobs", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_and_execute_job(
    tenant_id: str,
    payload: GenerativeJobCreate,
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    try:
        orchestration = get_orchestration_engine()
        workflow_req = WorkflowDispatchRequest(
            tenant_id=tenant_id,
            intent_text=f"Generative Studio image generation: {payload.job_type}",
            actor_id=context.user_id,
            actor_type=context.actor_type,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
            execution_context="internal_dashboard",
            context_data={
                "workflow_kind": "generative_media",
                "generative_operation": "image_generation",
                "generative_job_payload": payload.model_dump(),
            },
        )
        workflow_result = await orchestration.dispatch(workflow_req)
        if workflow_result.status != "completed":
            raise RuntimeError(workflow_result.error_message or "Generative workflow did not complete.")
        generative_output = workflow_result.context_data.get("generative_output", {})
        result = generative_output.get("result") or workflow_result.output_payload.get("result") or {}
        return {
            "status": "ok",
            "execution_id": workflow_result.execution_id,
            "workflow_status": workflow_result.status,
            "data": result,
        }
    except InsufficientCreditError as err:
        raise HTTPException(status_code=402, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/artifacts", response_model=Dict[str, Any])
async def list_artifacts(
    tenant_id: str,
    verified_only: bool = Query(True),
):
    try:
        artifacts = ImageRouterService.list_artifacts(tenant_id, verified_only)
        return {"status": "ok", "data": artifacts}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/scrub-logs", response_model=Dict[str, Any])
async def list_scrub_logs(
    tenant_id: str,
    artifact_id: Optional[str] = Query(None),
):
    try:
        logs = ImageRouterService.list_scrub_logs(tenant_id, artifact_id)
        return {"status": "ok", "data": logs}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


# ==============================================================================
# PUSTAKA TEMPLATE PROMPT SIAP PAKAI (PRD v2.2 Bagian 11.10, 13.2, H.1)
# ==============================================================================

@router.get("/prompt-categories", response_model=Dict[str, Any])
async def list_prompt_categories(tenant_id: str):
    """Mengambil seluruh master data 8 kategori pustaka template prompt beserta jumlah template aktif."""
    try:
        categories = ImageRouterService.list_prompt_categories(tenant_id)
        return {"status": "ok", "data": categories}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/prompt-categories", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_prompt_category(
    tenant_id: str,
    payload: PromptCategoryCreate,
):
    """Menambahkan kategori template prompt master platform (Super Admin)."""
    try:
        created = ImageRouterService.create_prompt_category(payload.model_dump())
        return {"status": "ok", "data": created}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.put("/prompt-categories/{category_id}", response_model=Dict[str, Any])
async def update_prompt_category(
    tenant_id: str,
    category_id: str,
    payload: PromptCategoryUpdate,
):
    """Memperbarui metadata kategori template prompt (Super Admin)."""
    try:
        clean_payload = {k: v for k, v in payload.model_dump().items() if v is not None}
        updated = ImageRouterService.update_prompt_category(category_id, clean_payload)
        return {"status": "ok", "data": updated}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.delete("/prompt-categories/{category_id}", response_model=Dict[str, Any])
async def delete_prompt_category(
    tenant_id: str,
    category_id: str,
):
    """Menghapus kategori template prompt (Super Admin)."""
    try:
        ImageRouterService.delete_prompt_category(category_id)
        return {"status": "ok", "deleted": True}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


# ==============================================================================
# KELUARGA GAYA VISUAL (SUMBU KEDUA)
# ==============================================================================

@router.get("/prompt-styles", response_model=Dict[str, Any])
async def list_prompt_styles(tenant_id: str):
    """Mengambil master data 16 keluarga gaya visual beserta jumlah template aktif."""
    try:
        styles = ImageRouterService.list_prompt_styles(tenant_id)
        return {"status": "ok", "data": styles}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/prompt-styles", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_prompt_style(
    tenant_id: str,
    payload: PromptStyleCreate,
):
    """Menambahkan keluarga gaya visual baru (Super Admin)."""
    try:
        created = ImageRouterService.create_prompt_style(payload.model_dump())
        return {"status": "ok", "data": created}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.put("/prompt-styles/{style_id}", response_model=Dict[str, Any])
async def update_prompt_style(
    tenant_id: str,
    style_id: str,
    payload: PromptStyleUpdate,
):
    """Memperbarui metadata keluarga gaya visual (Super Admin)."""
    try:
        clean_payload = {k: v for k, v in payload.model_dump().items() if v is not None}
        updated = ImageRouterService.update_prompt_style(style_id, clean_payload)
        return {"status": "ok", "data": updated}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.delete("/prompt-styles/{style_id}", response_model=Dict[str, Any])
async def delete_prompt_style(
    tenant_id: str,
    style_id: str,
):
    """Menghapus keluarga gaya visual (Super Admin)."""
    try:
        ImageRouterService.delete_prompt_style(style_id)
        return {"status": "ok", "deleted": True}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


# ==============================================================================
# BATCH SEEDING KONTROL BIAYA
# ==============================================================================

@router.get("/seeding-batches", response_model=Dict[str, Any])
async def list_seeding_batches(tenant_id: str):
    """Mengambil riwayat job seeding massal template prompt beserta status dan biaya kredit."""
    try:
        batches = ImageRouterService.list_seeding_batches()
        return {"status": "ok", "data": batches}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/seeding-batches", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_seeding_batch(
    tenant_id: str,
    payload: SeedingBatchCreate,
):
    """Mendaftarkan rencana batch seeding massal baru dengan status pending_approval."""
    try:
        created = ImageRouterService.create_seeding_batch(payload.model_dump())
        return {"status": "ok", "data": created}
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.patch("/seeding-batches/{batch_id}/status", response_model=Dict[str, Any])
async def update_seeding_batch_status(
    tenant_id: str,
    batch_id: str,
    payload: SeedingBatchStatusUpdate,
):
    """Menyetujui (approve), menjalankan, atau membatalkan batch seeding massal (Super Admin)."""
    try:
        updated = ImageRouterService.update_seeding_batch_status(
            batch_id=batch_id,
            status_val=payload.status,
            approved_by=payload.approved_by,
        )
        return {"status": "ok", "data": updated}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.post("/seeding-batches/{batch_id}/execute", response_model=Dict[str, Any])
async def execute_seeding_batch(
    tenant_id: str,
    batch_id: str,
    context: AuthenticatedTenantContext = Depends(get_trusted_request_context),
):
    """
    Menjalankan batch seeding melalui canonical OrchestrationEngine.
    Domain service tetap menjadi pemilik operasi bisnis dan Model Router; API hanya transport/auth.
    """
    try:
        orchestration = get_orchestration_engine()
        workflow_req = WorkflowDispatchRequest(
            tenant_id=tenant_id,
            intent_text=f"Generative Studio batch seeding: {batch_id}",
            actor_id=context.user_id,
            actor_type=context.actor_type,
            roles=context.roles,
            capabilities=context.capabilities,
            is_mfa_verified=context.is_mfa_verified,
            execution_context="internal_dashboard",
            context_data={
                "workflow_kind": "generative_media",
                "generative_operation": "batch_seeding",
                "generative_job_payload": {"batch_id": batch_id},
            },
        )
        workflow_result = await orchestration.dispatch(workflow_req)
        if workflow_result.status != "completed":
            raise RuntimeError(workflow_result.error_message or "Generative batch workflow did not complete.")
        generative_output = workflow_result.context_data.get("generative_output", {})
        result = generative_output.get("result") or workflow_result.output_payload.get("result") or {}
        return {
            "status": "ok",
            "execution_id": workflow_result.execution_id,
            "workflow_status": workflow_result.status,
            "data": result,
        }
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))



# ==============================================================================
# PUSTAKA TEMPLATE PROMPT (FILTER DUA SUMBU & KEJUTKAN SAYA)
# ==============================================================================

@router.get("/prompt-templates", response_model=Dict[str, Any])
async def list_prompt_library_templates(
    tenant_id: str,
    category_code: Optional[str] = Query(None, description="Kode kategori (misal: social_media_post, product_photo)"),
    style_code: Optional[str] = Query(None, description="Kode gaya visual (misal: studio_realism, flat_vector)"),
    scope: str = Query("all", description="Cakupan template: 'all', 'global', atau 'private'"),
    search: Optional[str] = Query(None, description="Pencarian nama template, konsep, atau subjek"),
):
    """
    Mengambil daftar pustaka template prompt atomik dengan gambar contoh nyata.
    Mendukung taksonomi dua sumbu: Kebutuhan Bisnis (category_code) × Gaya Visual (style_code).
    Diurutkan secara cerdas: kategori yang paling sering digunakan tenant diprioritaskan di atas
    (rekomendasi berbasis riwayat pemakaian nyata), diikuti popularitas usage_count.
    """
    try:
        templates = ImageRouterService.list_prompt_library_templates(
            tenant_id=tenant_id,
            category_code=category_code,
            style_code=style_code,
            scope=scope,
            search=search,
        )
        return {"status": "ok", "data": templates}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/prompt-templates/surprise-me", response_model=Dict[str, Any])
async def surprise_me_prompt_template(
    tenant_id: str,
    category_code: Optional[str] = Query(None, description="Filter opsional kategori kebutuhan bisnis"),
    style_code: Optional[str] = Query(None, description="Filter opsional keluarga gaya visual"),
):
    """
    Mode 'Kejutkan Saya': Memilih satu template secara acak dari kombinasi yang
    BELUM pernah dipakai oleh tenant ini (NOT EXISTS terhadap prompt_template_usage_log).
    Mendorong eksplorasi gaya visual baru.
    """
    try:
        template = ImageRouterService.get_surprise_prompt_template(
            tenant_id=tenant_id,
            category_code=category_code,
            style_code=style_code,
        )
        return {"status": "ok", "data": template}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/prompt-templates/{template_id}", response_model=Dict[str, Any])
async def get_prompt_library_template(
    tenant_id: str,
    template_id: str,
):
    """Mengambil detail lengkap skema atomik satu template prompt."""
    try:
        template = ImageRouterService.get_prompt_library_template(tenant_id, template_id)
        return {"status": "ok", "data": template}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/prompt-templates", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_prompt_library_template(
    tenant_id: str,
    payload: AtomicPromptTemplateCreate,
):
    """
    Menyimpan hasil racikan prompt pengguna sebagai template privat organisasi (is_global=false),
    atau template global jika dieksekusi oleh super admin.
    """
    try:
        created = ImageRouterService.create_prompt_library_template(
            tenant_id=tenant_id,
            payload=payload.model_dump(),
            is_global=payload.is_global,
        )
        return {"status": "ok", "data": created}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.put("/prompt-templates/{template_id}", response_model=Dict[str, Any])
async def update_prompt_library_template(
    tenant_id: str,
    template_id: str,
    payload: AtomicPromptTemplateUpdate,
):
    """Memperbarui skema atomik template prompt privat milik tenant."""
    try:
        clean_payload = {k: v for k, v in payload.model_dump().items() if v is not None}
        updated = ImageRouterService.update_prompt_library_template(tenant_id, template_id, clean_payload)
        return {"status": "ok", "data": updated}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.delete("/prompt-templates/{template_id}", response_model=Dict[str, Any])
async def delete_prompt_library_template(
    tenant_id: str,
    template_id: str,
):
    """Menghapus template prompt privat milik organisasi."""
    try:
        res = ImageRouterService.delete_prompt_library_template(tenant_id, template_id)
        return {"status": "ok", "data": res}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/prompt-templates/{template_id}/compose", response_model=Dict[str, Any])
async def compose_prompt_from_template(
    tenant_id: str,
    template_id: str,
    payload: AtomicPromptComposeRequest,
):
    """
    Merangkai prompt final & negative prompt dari template atomik dengan overrides kustom pengguna
    melalui Universal Prompt Composer (F.01 Visual Composer Skill).
    """
    try:
        overrides = {k: v for k, v in payload.model_dump().items() if v is not None}
        composed = ImageRouterService.compose_prompt_from_template(
            tenant_id=tenant_id,
            template_id=template_id,
            overrides=overrides,
        )
        return {"status": "ok", "data": composed}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))

