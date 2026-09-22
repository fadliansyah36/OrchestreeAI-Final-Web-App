"""
OrchestreeAI Backend Application (PRD v2.2)
Python 3.12 + FastAPI + Pydantic v2
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.tenant import router as tenant_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.public import router as public_router

app = FastAPI(
    title="OrchestreeAI API",
    version="2.2.0",
    description="Autonomous AI Workforce Operating System API",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(health_router)
app.include_router(tenant_router)
app.include_router(onboarding_router)
app.include_router(public_router)


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
