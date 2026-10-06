"""Runtime Functional API Gate (REPAIR/VERIFY-01).

Run against a real deployed API with:
    ORCHESTREE_RUNTIME_API_BASE_URL=https://... pytest -q apps/backend/tests/test_runtime_functional_api_gate.py

The suite intentionally verifies only contracts that require no fabricated
credentials. Authenticated tenant/workflow E2E remains a separate gate because
this test must never manufacture JWTs or privileged headers.
"""

import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest


BASE_URL = os.getenv("ORCHESTREE_RUNTIME_API_BASE_URL", "").rstrip("/")


def _request(path: str, method: str = "GET", body=None):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw.decode("utf-8", errors="replace")
        return exc.code, payload


@pytest.fixture(scope="module", autouse=True)
def require_runtime_base_url():
    if not BASE_URL:
        pytest.skip("Set ORCHESTREE_RUNTIME_API_BASE_URL to run the live runtime gate.")


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/health/live", 200),
        ("/health/ready", 200),
        ("/health/startup", 200),
        ("/public/subscription-plans", 200),
        ("/public/plan-facility-matrix", 200),
    ],
)
def test_public_runtime_read_contracts(path, expected):
    status, payload = _request(path)
    assert status == expected, (path, status, payload)


@pytest.mark.parametrize(
    ("path", "method", "expected"),
    [
        ("/api/v1/orchestration/dispatch", "POST", 401),
        ("/api/v1/tenant/context", "GET", 401),
    ],
)
def test_protected_api_fails_closed_without_auth(path, method, expected):
    status, payload = _request(path, method=method)
    assert status == expected, (path, status, payload)
