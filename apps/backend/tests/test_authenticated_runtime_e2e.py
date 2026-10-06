"""Authenticated Runtime E2E Gate.

This suite intentionally requires a real, non-privileged Supabase Auth test
account. It never manufactures JWTs, tenant authority, service-role tokens,
or database fixtures.

Required environment:
    ORCHESTREE_RUNTIME_API_BASE_URL
    ORCHESTREE_E2E_EMAIL
    ORCHESTREE_E2E_PASSWORD

Optional:
    ORCHESTREE_E2E_EXPECTED_TENANT_ID
    ORCHESTREE_E2E_CROSS_TENANT_ID

The real AI/credit slice is opt-in because it can consume real AI credits:
    ORCHESTREE_E2E_RUN_AI=true

Run:
    pytest -q apps/backend/tests/test_authenticated_runtime_e2e.py
"""

from __future__ import annotations

import json
import os
import uuid
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

import pytest


BASE_URL = os.getenv("ORCHESTREE_RUNTIME_API_BASE_URL", "").rstrip("/")
EMAIL = os.getenv("ORCHESTREE_E2E_EMAIL", "")
PASSWORD = os.getenv("ORCHESTREE_E2E_PASSWORD", "")
EXPECTED_TENANT = os.getenv("ORCHESTREE_E2E_EXPECTED_TENANT_ID", "")
CROSS_TENANT_ID = os.getenv("ORCHESTREE_E2E_CROSS_TENANT_ID", "")
RUN_AI = os.getenv("ORCHESTREE_E2E_RUN_AI", "").lower() in {"1", "true", "yes"}


def _json_request(opener, path, method="GET", body=None, headers=None):
    request_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=request_headers,
        method=method,
    )
    try:
        with opener.open(req, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw.decode("utf-8", errors="replace")
        return exc.code, payload


def _require_base_url():
    if not BASE_URL:
        pytest.skip("missing ORCHESTREE_RUNTIME_API_BASE_URL")


def _require_auth_env():
    _require_base_url()
    missing = [
        name
        for name, value in (
            ("ORCHESTREE_E2E_EMAIL", EMAIL),
            ("ORCHESTREE_E2E_PASSWORD", PASSWORD),
        )
        if not value
    ]
    if missing:
        pytest.skip(f"missing required E2E secret(s): {', '.join(missing)}")


def _new_opener():
    # The gate must exercise the real HttpOnly session-cookie contract.
    return build_opener(HTTPCookieProcessor(CookieJar()))


def _login(opener):
    status, login = _json_request(
        opener,
        "/auth/login",
        method="POST",
        body={"email": EMAIL, "password": PASSWORD},
    )
    assert status == 200, login
    assert login.get("authenticated") is True


def test_unauthenticated_runtime_gate():
    _require_base_url()
    opener = _new_opener()

    status, session = _json_request(opener, "/auth/session")
    assert status == 401, session


def test_authenticated_runtime_tenant_pdp_db_boundary():
    _require_auth_env()
    opener = _new_opener()
    _login(opener)

    status, session = _json_request(opener, "/auth/session")
    assert status == 200, session
    assert session.get("authenticated") is True
    assert session.get("user_id")
    tenant_id = session.get("tenant_id")
    assert tenant_id, "Authenticated session must resolve a server-side tenant."

    if EXPECTED_TENANT:
        assert tenant_id == EXPECTED_TENANT

    status, tenant = _json_request(opener, "/api/v1/tenant/context")
    assert status == 200, tenant
    assert tenant.get("tenant_id") == tenant_id
    assert tenant.get("user_id") == session.get("user_id")
    assert isinstance(tenant.get("roles"), list)
    assert isinstance(tenant.get("capabilities"), list)

    # Optional proof against a known different tenant. The test never changes
    # the authenticated tenant; it asks the server to authorize access to a
    # different tenant resource and expects a default-deny decision.
    if CROSS_TENANT_ID and CROSS_TENANT_ID != tenant_id:
        status, denied = _json_request(
            opener,
            f"/api/v1/tenant/s/{CROSS_TENANT_ID}/members",
        )
        assert status == 403, denied


def test_learning_rejects_client_tenant_override():
    _require_auth_env()
    opener = _new_opener()
    _login(opener)

    status, session = _json_request(opener, "/auth/session")
    assert status == 200, session
    tenant_id = session.get("tenant_id")
    assert tenant_id

    learning_path = "/api/v1/learning/outcomes"
    bogus_tenant = str(uuid.uuid4())

    # Query parameters never select the effective tenant. A bogus tenant query
    # must not change the authenticated context or cause cross-tenant access.
    status, outcomes = _json_request(
        opener,
        f"{learning_path}?tenant_id={bogus_tenant}",
    )
    assert status == 200, outcomes
    assert isinstance(outcomes, (dict, list))

    # The authenticated request without any client tenant selector remains
    # valid and uses the same server-resolved tenant.
    status, baseline = _json_request(opener, learning_path)
    assert status == 200, baseline
    assert isinstance(baseline, (dict, list))

    # A conflicting tenant header is an attempted context switch and must be
    # rejected rather than accepted as authorization authority. Forged role,
    # capability and MFA headers must not change that result.
    status, denied = _json_request(
        opener,
        learning_path,
        headers={
            "X-Tenant-Id": bogus_tenant,
            "X-User-Roles": "SUPER_ADMIN",
            "X-User-Capabilities": "learning.outcome.view",
            "X-MFA-Verified": "true",
        },
    )
    assert status == 403, denied

    # The server-resolved session tenant remains unchanged after the attack.
    status, session_after = _json_request(opener, "/auth/session")
    assert status == 200, session_after
    assert session_after.get("tenant_id") == tenant_id


def test_authenticated_runtime_learning_boundary():
    _require_auth_env()
    opener = _new_opener()
    _login(opener)

    for path in (
        "/api/v1/learning/outcomes",
        "/api/v1/learning/confidence",
        "/api/v1/learning/lessons",
        "/api/v1/learning/growth",
    ):
        status, payload = _json_request(opener, path)
        assert status == 200, payload
        assert isinstance(payload, (dict, list))


def test_authenticated_runtime_ai_vertical_slice_opt_in():
    if not RUN_AI:
        pytest.skip(
            "Set ORCHESTREE_E2E_RUN_AI=true to execute the real "
            "AI/credit/model-router slice."
        )

    _require_auth_env()
    opener = _new_opener()
    _login(opener)

    status, session = _json_request(opener, "/auth/session")
    assert status == 200, session
    tenant_id = session.get("tenant_id")
    assert tenant_id

    # This is deliberately a minimal real request. The endpoint must perform
    # tenant/PDP checks, credit reservation, orchestration/model-router work,
    # and durable execution recording. No provider is selected by the test.
    status, result = _json_request(
        opener,
        "/api/v1/orchestration/workflows/dispatch",
        method="POST",
        body={
            "tenant_id": tenant_id,
            "intent_text": "Return exactly: OrchestreeAI E2E runtime verification successful.",
            "actor_id": session.get("user_id"),
            "actor_type": "user",
            "context_data": {"runtime_e2e": True},
        },
    )
    assert status == 200, result
    assert result
