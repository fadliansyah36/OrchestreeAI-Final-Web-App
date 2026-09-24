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

router = APIRouter(
    prefix="/tenants/{tenant_id}/generative",
    tags=["Generative Studio Hub"],
    dependencies=[Depends(require_capability("generative.studio.manage"))]
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
    model_used: str = Field(default="gpt-image-2")
    brand_lock_id: Optional[str] = None
    credit_cost: float = Field(default=5.0, ge=1.0)
    force_fail_for_test: bool = False


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
):
    try:
        result = ImageRouterService.create_and_execute_job(tenant_id, payload.model_dump())
        return {"status": "ok", "data": result}
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
