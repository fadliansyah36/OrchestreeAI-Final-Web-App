"""
Health & Startup Gate Endpoints (PRD v2.2 Bagian 15.3 & Bagian 18.2.10)
"""

import asyncio
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Response, status
from app.core.startup_gate import startup_gate, StartupGateReport
from app.authz.pdp import public_endpoint

router = APIRouter(tags=["Health & Status"])
START_TIME = time.time()


@router.get("/health/live", dependencies=[Depends(public_endpoint("health.live"))])
async def health_live():
    """Verifikasi proses aktif (liveness probe)."""
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }


@router.get("/health/ready", dependencies=[Depends(public_endpoint("health.ready"))])
async def health_ready(response: Response):
    """Kesiapan layanan menerima beban trafik (readiness probe - Fail-Closed)."""
    report = await asyncio.to_thread(startup_gate.evaluate_all)
    db_check = next((c for c in report.checks if c.step_number == 2), None)
    db_status = db_check.status if db_check else "failed"
    is_ready = report.overall_passed and db_status == "passed"
    status_str = "ready" if is_ready else "not_ready"

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": status_str,
        "database": db_status,
        "redis": "not_implemented_yet",
        "storage": "passed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/startup", response_model=StartupGateReport, dependencies=[Depends(public_endpoint("health.startup"))])
async def health_startup():
    """Hasil pemeriksaan komprehensif 18 langkah Fail-Closed Startup Gate."""
    return await asyncio.to_thread(startup_gate.evaluate_all)

