"""
API Router untuk F.01-AGENTCAT: Super Admin Managed AI Agent Blueprint Catalog & Staged Rollout (PRD v2.2 Bagian 11.3).
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.skills.f01_agentcat import (
    RolloutStage,
    PolicyScanStatus,
    PolicyScanRequiredError,
    InvalidBlueprintPackageError,
    get_agentcat_catalog,
)

admin_router = APIRouter(prefix="/api/v1/admin/agent-catalog", tags=["agent-catalog-admin"])
tenant_router = APIRouter(prefix="/api/v1/tenants/{tenant_id}/agent-catalog", tags=["agent-catalog-tenant"])


class BlueprintIngestRequest(BaseModel):
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


class RolloutTransitionRequest(BaseModel):
    target_stage: str
    allowed_tenant_ids: Optional[List[str]] = Field(default_factory=list)
    operator: Optional[str] = "Super Admin"


# --- Super Admin Endpoints ---

@admin_router.post("/ingest", status_code=status.HTTP_201_CREATED)
async def ingest_skill_package(payload: BlueprintIngestRequest):
    """
    Pipeline ingesti paket blueprint skill agen AI baru:
    Validasi struktur, jalankan policy scanner, dan simpan dengan status awal INTERNAL.
    """
    catalog = get_agentcat_catalog()
    try:
        result = await catalog.ingest_package(payload.model_dump(), operator=payload.operator or "Super Admin")
        return result
    except InvalidBlueprintPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses paket blueprint: {str(e)}")


@admin_router.post("/blueprints/{blueprint_id}/rollout")
async def transition_rollout_stage(blueprint_id: str, payload: RolloutTransitionRequest):
    """
    Mentransisikan status rollout blueprint (INTERNAL -> BETA_TENANT -> GENERAL_AVAILABILITY).
    Wajib lolos pemindai kebijakan ('PASSED') sebelum diizinkan melangkah.
    """
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


@admin_router.get("/blueprints")
async def list_all_blueprints(
    stage: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    policy_status: Optional[str] = Query(None),
):
    """Mengambil katalog lengkap seluruh blueprint skill agen untuk Super Admin."""
    catalog = get_agentcat_catalog()
    return await catalog.list_blueprints(stage=stage, category=category, policy_status=policy_status)


@admin_router.get("/blueprints/{blueprint_id}")
async def get_blueprint_detail(blueprint_id: str):
    """Mengambil detail satu blueprint agen berdasarkan ID atau package_id."""
    catalog = get_agentcat_catalog()
    bp = await catalog.get_blueprint(blueprint_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Blueprint tidak ditemukan.")
    return bp


# --- Tenant Endpoints ---

@tenant_router.get("/available")
async def list_available_blueprints_for_tenant(
    tenant_id: str,
    category: Optional[str] = Query(None),
):
    """
    Mengambil daftar template agen yang tersedia untuk tenant ini:
    - Paket GENERAL_AVAILABILITY
    - Paket BETA_TENANT yang mengizinkan tenant_id ini
    """
    catalog = get_agentcat_catalog()
    return await catalog.list_available_for_tenant(tenant_id=tenant_id, category=category)
