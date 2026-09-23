"""
API Router untuk F.01-TOKENOPT: Optimasi Token & Semantic Caching (PRD v2.2 Bagian 11.8).
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.skills.f01_tokenopt import get_tokenopt_skill
from app.authz.pdp import require_capability

router = APIRouter(
    prefix="/api/v1/tenants/{tenant_id}/tokenopt",
    tags=["tokenopt"],
    dependencies=[Depends(require_capability("tokenopt.metrics.view"))]
)


class TokenSavingsSummaryResponse(BaseModel):
    total_queries: int
    cache_hits: int
    cache_misses: int
    cache_hit_rate_pct: float
    total_tokens_saved: int
    total_cost_saved_usd: float
    total_cost_spent_usd: float
    total_cost_baseline_usd: float
    avg_latency_saved_ms: float


class TokenSavingsLogItem(BaseModel):
    id: str
    request_id: Optional[str] = None
    cache_hit: bool
    task_type: str
    original_prompt_tokens: int
    tokens_saved: int
    cost_without_cache_usd: float
    cost_with_cache_usd: float
    cost_saved_usd: float
    latency_saved_ms: int
    model_tier_selected: str
    model_id_selected: str
    similarity_score: Optional[float] = None
    created_at: Any


@router.get("/summary", response_model=TokenSavingsSummaryResponse)
async def get_token_savings_summary(tenant_id: str):
    """Mengambil metrik ringkasan penghematan token, persentase cache hit, dan perbandingan biaya."""
    skill = get_tokenopt_skill()
    summary = await skill.get_summary(tenant_id)
    return summary


@router.get("/logs", response_model=List[TokenSavingsLogItem])
async def get_token_savings_logs(
    tenant_id: str,
    limit: int = Query(50, ge=1, le=200),
):
    """Mengambil riwayat telemetri penghematan token dan audit cache hit/miss."""
    skill = get_tokenopt_skill()
    logs = await skill.get_logs(tenant_id, limit=limit)
    return logs
