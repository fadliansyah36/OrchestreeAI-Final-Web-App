"""Authenticated Runtime E2E Gate.

This suite intentionally requires a real, non-privileged Supabase Auth test
account. It never manufactures JWTs, tenant headers, service-role tokens, or
database fixtures.

Required environment:
    ORCHESTREE_RUNTIME_API_BASE_URL
    ORCHESTREE_E2E_EMAIL
    ORCHESTREE_E2E_PASSWORD

Optional:
    ORCHESTREE_E2E_EXPECTED_TENANT_ID

The workflow dispatch case is opt-in because it can consume real AI credits:
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
from urllib.request import Request, build_opener


BASE_URL = os.getenv("ORCHESTREE_RUNTIME_API_BASE_URL", "").rstrip("/")
EMAIL = os.getenv("ORCHESTREE_E2E_EMAIL", "")
PASSWORD = os.getenv("ORCHESTREE_E2E_PASSWORD", "")
EXPECTED_TENANT = os.getenv("ORCHESTREE_E2E_EXPECTED_TENANT_ID", "")
RUN_AI = os.getenv("ORCHESTREE_E2E_RUN_AI", "").lower() in {"1", "true", "yes"}


def _json_request(opener, path, method="GET", body=None):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
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


def _require_env():
    missing = [
        name
        for name, value in (
            ("ORCHESTREE_RUNTIME_API_BASE_URL", BASE_URL),
            ("ORCHESTREE_E2E_EMAIL", EMAIL),
            ("ORCHESTREE_E2E_PASSWORD", PASSWORD),
        )
        if not value
    ]
    if missing:
        return False, f"missing required environment: {', '.join(missing)}"
    return True, ""


def test_authenticated_runtime_tenant_pdp_db_boundary():
    ok, reason = _require_env()
    if not ok:
        import pytest
        pytest.skip(reason)

    opener = build_opener()
    status, login = _json_request(
        opener,
        "/auth/login",
        method="POST",
        body={"email": EMAIL, "password": PASSWORD},
    )
    assert status == 200, login
    assert login.get("authenticated") is True

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


def test_learning_rejects_client_tenant_override():
    ok, reason = _require_env()
    if not ok:
        import pytest
        pytest.skip(reason)

    opener = build_opener()
    status, login = _json_request(
        opener,
        "/auth/login",
        method="POST",
        body={"email": EMAIL, "password": PASSWORD},
    )
    assert status == 200, login

    status, session = _json_request(opener, "/auth/session")
    assert status == 200, session
    tenant_id = session.get("tenant_id")
    assert tenant_id

    # Query parameters never select the effective tenant. A bogus tenant query
    # must not change the authenticated context or cause cross-tenant access.
    bogus_tenant = str(uuid.uuid4())
    status, outcomes = _json_request(opener, f"/learning/outcomes?tenant_id={bogus_tenant}")
    assert status == 200, outcomes
    assert isinstance(outcomes, (dict, list))

    # A conflicting tenant header is treated as an attempted context switch and
    # is rejected instead of being accepted as authority.
    status, denied = _json_request(
        opener,
        "/learning/outcomes",
    )
    assert status == 200, denied

    req = Request(
        f"{BASE_URL}/learning/outcomes",
        headers={
            "Accept": "application/json",
            "X-Tenant-Id": bogus_tenant,
            "X-User-Roles": "SUPER_ADMIN",
            "X-User-Capabilities": "learning.outcome.view",
            "X-MFA-Verified": "true",
        },
        method="GET",
    )
    try:
        with opener.open(req, timeout=30) as response:
            raw = response.read()
            payload = json.loads(raw) if raw else None
            status = response.status
    except HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw.decode("utf-8", errors="replace")
        status = exc.code
    assert status == 403, payload


def test_authenticated_runtime_learning_boundary():
    ok, reason = _require_env()
    if not ok:
        import pytest
        pytest.skip(reason)

    opener = build_opener()
    status, login = _json_request(
        opener,
        "/auth/login",
        method="POST",
        body={"email": EMAIL, "password": PASSWORD},
    )
    assert status == 200, login

    status, outcomes = _json_request(opener, "/learning/outcomes")
    assert status == 200, outcomes
    assert isinstance(outcomes, (dict, list))

    status, confidence = _json_request(opener, "/learning/confidence")
    assert status == 200, confidence
    assert isinstance(confidence, (dict, list))

    status, lessons = _json_request(opener, "/learning/lessons")
    assert status == 200, lessons
    assert isinstance(lessons, (dict, list))

    status, growth = _json_request(opener, "/learning/growth")
    assert status == 200, growth
    assert isinstance(growth, (dict, list))


def test_authenticated_runtime_ai_vertical_slice_opt_in():
    if not RUN_AI:
        import pytest
        pytest.skip("Set ORCHESTREE_E2E_RUN_AI=true to execute the real AI/credit/model-router slice.")

    ok, reason = _require_env()
    if not ok:
        import pytest
        pytest.skip(reason)

    opener = build_opener()
    status, login = _json_request(
        opener,
        "/auth/login",
        method="POST",
        body={"email": EMAIL, "password": PASSWORD},
    )
    assert status == 200, login

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
