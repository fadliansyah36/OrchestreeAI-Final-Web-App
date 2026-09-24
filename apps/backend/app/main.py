"""
OrchestreeAI Backend Application (PRD v2.2)
Python 3.12 + FastAPI + Pydantic v2
"""

from datetime import datetime, timezone
import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.tenant import router as tenant_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.public import router as public_router, console_router
from app.api.v1.workforce import router as workforce_router
from app.api.v1.kanban_and_attendance import router as kanban_and_attendance_router
from app.api.v1.orchestration import router as orchestration_router
from app.api.v1.learning import router as learning_router
from app.api.v1.billing import router as billing_router, tenant_summary_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.proactive import router as proactive_router
from app.api.v1.chat import router as chat_router
from app.api.v1.memory import router as memory_router
from app.api.v1.intelligence import router as intelligence_router
from app.api.v1.integrations import router as integrations_router
from app.api.v1.prospects import router as prospects_router
from app.api.v1.omnichannel import router as omnichannel_router, webhook_router as omnichannel_webhook_router
from app.api.v1.commerce import router as commerce_router, webhook_router as commerce_webhook_router
from app.api.v1.marketing import router as marketing_router, webhook_router as social_webhook_router
from app.api.v1.service import router as service_router
from app.api.v1.sales import router as sales_router
from app.api.v1.selection import router as selection_router
from app.api.v1.generative import router as generative_router
from app.api.v1.enterprise import router as enterprise_router
from app.api.v1.permissions import router as permissions_router
from app.api.v1.tokenopt import router as tokenopt_router
from app.api.v1.agentcat import admin_router as agentcat_admin_router, tenant_router as agentcat_tenant_router
from app.skills.f01_memflow.tools import register_memflow_tools
from app.skills.f01_scrape.tools import register_scrape_tools

app = FastAPI(
    title="OrchestreeAI API",
    version="2.2.0",
    description="Autonomous AI Workforce Operating System API",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Startup event: register builtin skills & tools
@app.on_event("startup")
async def startup_event():
    try:
        register_memflow_tools()
        register_scrape_tools()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(f"Could not register tools on startup: {e}")

# CORS configuration (Strict allow-list, never fallback to wildcard '*' with credentials)
explicit_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip() and origin.strip() != "*"]
if not explicit_origins:
    explicit_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://orchestree.biz.id",
        "https://admin.orchestree.biz.id",
        "https://client.orchestree.biz.id",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=explicit_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Centralized Security Headers Middleware (OWASP Secure Headers)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; object-src 'none';"
    return response

# Centralized RFC 7807 Problem Details Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        headers={"Content-Type": "application/problem+json"},
        content={
            "type": f"https://orchestree.ai/errors/{exc.status_code}",
            "title": exc.detail if isinstance(exc.detail, str) else "HTTP Error",
            "status": exc.status_code,
            "detail": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "instance": str(request.url.path),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger("uvicorn.error").error(f"Internal error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        headers={"Content-Type": "application/problem+json"},
        content={
            "type": "https://orchestree.ai/errors/500",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "Terjadi kesalahan internal pada server. Detail kesalahan telah dicatat pada log sistem audit.",
            "instance": str(request.url.path),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )

# Mount API routers
app.include_router(health_router)
app.include_router(tenant_router)
app.include_router(onboarding_router)
app.include_router(public_router)
app.include_router(console_router)
app.include_router(workforce_router)
app.include_router(kanban_and_attendance_router)
app.include_router(orchestration_router)
app.include_router(learning_router)
app.include_router(billing_router)
app.include_router(tenant_summary_router)
app.include_router(webhooks_router)
app.include_router(proactive_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(intelligence_router)
app.include_router(integrations_router)
app.include_router(prospects_router)
app.include_router(omnichannel_router, prefix="/api/v1")
app.include_router(omnichannel_webhook_router, prefix="/api/v1")
app.include_router(commerce_router, prefix="/api/v1")
app.include_router(commerce_webhook_router, prefix="/api/v1")
app.include_router(marketing_router, prefix="/api/v1")
app.include_router(social_webhook_router, prefix="/api/v1")
app.include_router(service_router, prefix="/api/v1")
app.include_router(sales_router, prefix="/api/v1")
app.include_router(selection_router, prefix="/api/v1")
app.include_router(generative_router, prefix="/api/v1")
app.include_router(enterprise_router)
app.include_router(permissions_router)
app.include_router(tokenopt_router)
app.include_router(agentcat_admin_router)
app.include_router(agentcat_tenant_router)


@app.get("/")
async def root():
    return {
        "name": "OrchestreeAI Backend",
        "version": "2.2.0",
        "status": "operational",
        "docs": "/docs",
        "openapi": "/openapi.json"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
