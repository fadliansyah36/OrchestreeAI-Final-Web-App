"""
Supabase Auth session endpoints.

PRD v2.2 / AGENTS.md:
- Supabase Auth is the only authentication authority.
- Access/refresh tokens are kept in HttpOnly cookies.
- Backend verifies JWT signature, issuer, audience and lifetime.
- Authorization attributes are resolved server-side from tenant membership.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx
import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.database import tenant_tx
from app.core.security import (
    AuthenticatedTenantContext,
    get_current_tenant_context,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])


class PasswordCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class AuthSessionResponse(BaseModel):
    authenticated: bool
    user_id: str
    tenant_id: Optional[str] = None
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    is_mfa_verified: bool = False
    app_scope: str = "tenant"
    membership_id: Optional[str] = None
    tenant_legal_name: Optional[str] = None
    tenant_display_name: Optional[str] = None
    tenant_status: Optional[str] = None
    tenant_created_at: Optional[str] = None


def _auth_base_url() -> str:
    if not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth belum dikonfigurasi.",
        )
    return settings.SUPABASE_URL.rstrip("/") + "/auth/v1"


def _auth_api_key() -> str:
    key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_ANON_KEY
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth API key belum dikonfigurasi.",
        )
    return key


def _cookie_secure() -> bool:
    return settings.APP_ENV.lower() not in {"local", "development", "test"}


def _set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = _cookie_secure()
    prefix = "__Host-" if secure else ""
    common = {
        "httponly": True,
        "secure": secure,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        f"{prefix}orchestree_access",
        access_token,
        max_age=300,
        **common,
    )
    response.set_cookie(
        f"{prefix}orchestree_refresh",
        refresh_token,
        max_age=60 * 60 * 24 * 30,
        **common,
    )


def _clear_session_cookies(response: Response) -> None:
    secure = _cookie_secure()
    prefix = "__Host-" if secure else ""
    response.delete_cookie(f"{prefix}orchestree_access", path="/")
    response.delete_cookie(f"{prefix}orchestree_refresh", path="/")


async def _supabase_auth_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{_auth_base_url()}{path}"
    headers = {
        "apikey": _auth_api_key(),
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 400:
        try:
            body = response.json()
            detail = body.get("msg") or body.get("error_description") or body.get("message") or "Autentikasi gagal."
        except Exception:
            detail = "Autentikasi gagal."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    return response.json()


@router.post("/login", response_model=AuthSessionResponse)
async def login(credentials: PasswordCredentials, response: Response) -> AuthSessionResponse:
    data = await _supabase_auth_request(
        "/token?grant_type=password",
        {"email": credentials.email, "password": credentials.password},
    )
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    if not access_token or not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase tidak mengembalikan sesi autentikasi yang valid.",
        )

    _set_session_cookies(response, access_token, refresh_token)
    # The access token is deliberately not returned to JavaScript.
    # Tenant/role context is resolved by the authenticated backend on the next request.
    return AuthSessionResponse(
        authenticated=True,
        user_id=str(data.get("user", {}).get("id", "")),
    )


@router.post("/signup", response_model=dict)
async def signup(credentials: PasswordCredentials, response: Response) -> dict[str, Any]:
    data = await _supabase_auth_request(
        "/signup",
        {"email": credentials.email, "password": credentials.password},
    )
    session = data.get("session") or {}
    access_token = session.get("access_token")
    refresh_token = session.get("refresh_token")
    if access_token and refresh_token:
        _set_session_cookies(response, access_token, refresh_token)
        return {"authenticated": True, "email_confirmation_required": False}

    return {
        "authenticated": False,
        "email_confirmation_required": True,
        "message": "Akun berhasil dibuat. Verifikasi email sebelum masuk.",
    }


@router.post("/refresh", response_model=AuthSessionResponse)
async def refresh(request: Request, response: Response) -> AuthSessionResponse:
    secure = _cookie_secure()
    prefix = "__Host-" if secure else ""
    refresh_token = request.cookies.get(f"{prefix}orchestree_refresh")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session tidak ditemukan.")

    data = await _supabase_auth_request(
        "/token?grant_type=refresh_token",
        {"refresh_token": refresh_token},
    )
    access_token = data.get("access_token")
    rotated_refresh = data.get("refresh_token") or refresh_token
    if not access_token:
        _clear_session_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session tidak valid.")

    _set_session_cookies(response, access_token, rotated_refresh)
    return AuthSessionResponse(
        authenticated=True,
        user_id=str(data.get("user", {}).get("id", "")),
    )


@router.get("/session", response_model=AuthSessionResponse)
async def session(context: AuthenticatedTenantContext = Depends(get_current_tenant_context)) -> AuthSessionResponse:
    membership_id = None
    tenant_legal_name = None
    tenant_display_name = None
    tenant_status = None

    # Enrich the authenticated session from authoritative tenant records.
    # The browser never supplies tenant metadata or membership identity.
    with tenant_tx(context.tenant_id, user_id=context.user_id) as conn:
        membership = conn.execute(
            sa.text("""
                SELECT id
                FROM tenant_memberships
                WHERE tenant_id = :tenant_id
                  AND auth_user_id = :user_id
                ORDER BY created_at ASC
                LIMIT 1
            """),
            {"tenant_id": context.tenant_id, "user_id": context.user_id},
        ).mappings().first()
        tenant = conn.execute(
            sa.text("""
                SELECT id, legal_name, display_name, status, created_at
                FROM tenants
                WHERE id = :tenant_id
                LIMIT 1
            """),
            {"tenant_id": context.tenant_id},
        ).mappings().first()

    if membership:
        membership_id = str(membership["id"])
    if tenant:
        tenant_legal_name = tenant.get("legal_name")
        tenant_display_name = tenant.get("display_name")
        tenant_status = tenant.get("status")
        tenant_created_at = tenant["created_at"].isoformat() if tenant.get("created_at") else None

    return AuthSessionResponse(
        authenticated=True,
        user_id=context.user_id,
        tenant_id=context.tenant_id,
        roles=context.roles,
        capabilities=context.capabilities,
        is_mfa_verified=context.is_mfa_verified,
        app_scope=context.app_scope,
        membership_id=membership_id,
        tenant_legal_name=tenant_legal_name,
        tenant_display_name=tenant_display_name,
        tenant_status=tenant_status,
        tenant_created_at=tenant_created_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response) -> Response:
    secure = _cookie_secure()
    prefix = "__Host-" if secure else ""
    access_token = request.cookies.get(f"{prefix}orchestree_access")
    if access_token:
        from app.core.security import revoke_token
        revoke_token(access_token, reason="logout")
    _clear_session_cookies(response)
    return response
