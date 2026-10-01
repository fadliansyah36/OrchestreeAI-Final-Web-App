"""R1-B.4 API perimeter and cross-tenant negative security suite.

The unit/in-process cases prove that spoofable client identity headers are ignored
and tenant path mismatches fail closed. The live cases require explicit real
Supabase access tokens and an API base URL; they never synthesize production
identity.
"""
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.security import AuthenticatedTenantContext, require_platform_admin, get_trusted_request_context
from app.api.v1.analytics import get_platform_analytics_overview
from app.main import app


def _tenant_context(tenant_id: str) -> AuthenticatedTenantContext:
    return AuthenticatedTenantContext(
        user_id="11111111-1111-1111-1111-111111111111",
        tenant_id=tenant_id,
        roles=["STAFF_HUMAN"],
        capabilities=["memory.search", "memory.documents.read"],
        is_mfa_verified=False,
        app_scope="tenant",
    )


def test_analytics_endpoints_do_not_accept_client_identity_headers():
    from app.api.v1 import analytics

    for route in analytics.router.routes:
        if not getattr(route, "path", "").startswith("/admin/analytics"):
            continue
        dependency_calls = {
            dep.call for dep in getattr(route, "dependant", None).dependencies
        }
        assert require_platform_admin in dependency_calls, (
            f"{route.path} must derive platform identity from require_platform_admin"
        )
        source = Path(analytics.__file__).read_text(encoding="utf-8")
        assert "X-User-Roles" not in source
        assert "X-User-Capabilities" not in source
        assert "X-MFA-Verified" not in source


def test_forged_platform_headers_cannot_authorize_analytics(monkeypatch):
    from app.api.v1 import analytics

    async def denied_platform_admin(*args, **kwargs):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="platform admin required")

    app.dependency_overrides[require_platform_admin] = denied_platform_admin
    try:
        client = TestClient(app)
        response = client.get(
            "/api/v1/admin/analytics/overview",
            headers={
                "X-User-Roles": "PLATFORM_SUPERADMIN",
                "X-User-Capabilities": "admin.analytics.view,platform.admin.manage",
                "X-MFA-Verified": "true",
            },
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(require_platform_admin, None)


@pytest.mark.asyncio
async def test_trusted_context_rejects_cross_tenant_path():
    request = type("Request", (), {"path_params": {"tenant_id": "tenant-b"}})()
    with pytest.raises(Exception) as exc:
        await get_trusted_request_context(request, _tenant_context("tenant-a"))
    assert getattr(exc.value, "status_code", None) == 403


def test_memory_routes_use_trusted_context():
    from app.api.v1 import memory

    source = Path(memory.__file__).read_text(encoding="utf-8")
    assert "Depends(get_trusted_request_context)" in source
    assert "get_database_engine" not in source
    assert "SET LOCAL ROLE orchestree_app" not in source


@pytest.mark.live
def test_live_cross_tenant_api_negative_suite():
    base_url = os.getenv("R1B4_API_BASE_URL")
    token_a = os.getenv("R1B4_TENANT_A_TOKEN")
    token_b = os.getenv("R1B4_TENANT_B_TOKEN")
    tenant_a = os.getenv("R1B4_TENANT_A_ID")
    tenant_b = os.getenv("R1B4_TENANT_B_ID")

    if not all((base_url, token_a, token_b, tenant_a, tenant_b)):
        pytest.skip(
            "Live R1-B.4 requires R1B4_API_BASE_URL, tenant A/B IDs and real "
            "Supabase access tokens; no synthetic production identity is permitted."
        )

    import httpx

    def req(token, method, path, **kwargs):
        return httpx.request(
            method,
            base_url.rstrip("/") + path,
            headers={"Authorization": f"Bearer {token}", **kwargs.pop("headers", {})},
            timeout=20,
            **kwargs,
        )

    # A -> B must fail closed for tenant-scoped memory.
    for path in (
        f"/api/v1/tenants/{tenant_b}/memory/documents",
        f"/api/v1/tenants/{tenant_b}/memory/search?q=security",
    ):
        r = req(token_a, "GET", path)
        assert r.status_code in (403, 404), f"A->B unexpectedly returned {r.status_code}: {path}"

    # B -> A must also fail closed.
    for path in (
        f"/api/v1/tenants/{tenant_a}/memory/documents",
        f"/api/v1/tenants/{tenant_a}/memory/search?q=security",
    ):
        r = req(token_b, "GET", path)
        assert r.status_code in (403, 404), f"B->A unexpectedly returned {r.status_code}: {path}"

    # Forged identity headers must not elevate a normal tenant into platform analytics.
    r = req(
        token_a,
        "GET",
        "/api/v1/admin/analytics/overview",
        headers={
            "X-User-Roles": "PLATFORM_SUPERADMIN",
            "X-User-Capabilities": "admin.analytics.view,platform.admin.manage",
            "X-MFA-Verified": "true",
            "X-Tenant-Id": tenant_b,
        },
    )
    assert r.status_code in (401, 403), (
        f"forged admin identity unexpectedly authorized: {r.status_code}"
    )

    # Explicit cross-tenant selector must not change the authenticated tenant.
    r = req(
        token_a,
        "GET",
        f"/api/v1/tenants/{tenant_b}/memory/documents",
        headers={"X-Tenant-Id": tenant_b},
    )
    assert r.status_code in (403, 404)


@pytest.mark.live
def test_live_unauthenticated_protected_api_denied():
    base_url = os.getenv("R1B4_API_BASE_URL")
    if not base_url:
        pytest.skip("R1B4_API_BASE_URL is required for live API verification.")

    import httpx

    r = httpx.get(
        base_url.rstrip("/") + "/api/v1/admin/analytics/overview",
        timeout=20,
    )
    assert r.status_code in (401, 403)
