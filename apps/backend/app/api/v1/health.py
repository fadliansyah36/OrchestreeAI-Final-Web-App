"""
Health & Startup Gate Endpoints (PRD v2.2 Bagian 15.3 & Bagian 18.2.10)
"""

import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
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
async def health_ready():
    """Kesiapan layanan menerima beban trafik (readiness probe)."""
    report = startup_gate.evaluate_all()
    status_str = "ready" if report.overall_passed else "not_ready"
    db_check = next((c for c in report.checks if c.step_number == 2), None)
    db_status = db_check.status if db_check else "failed"

    return {
        "status": status_str,
        "database": db_status,
        "redis": "not_implemented_yet",
        "storage": "not_implemented_yet",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/startup", response_model=StartupGateReport, dependencies=[Depends(public_endpoint("health.startup"))])
async def health_startup():
    """Hasil pemeriksaan komprehensif 18 langkah Fail-Closed Startup Gate."""
    return startup_gate.evaluate_all()

