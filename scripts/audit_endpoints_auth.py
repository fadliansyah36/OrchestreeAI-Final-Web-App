#!/usr/bin/env python3
"""
Test every single endpoint in the running FastAPI application without an Authorization header.
Classifies endpoints into:
1. DESIGNED PUBLIC (allowed without token)
2. PROPERLY PROTECTED (returns 401 / 403 without token)
3. UNINTENTIONALLY ACCESSIBLE (returns 200, 400, 404, 422 without token - SECURITY VULNERABILITY!)
"""
import sys
import os
import re

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "apps", "backend")
sys.path.insert(0, root_dir)
sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=False)

ALLOWED_PUBLIC_PREFIXES = (
    "/health",
    "/api/v1/health",
    "/public",
    "/api/v1/public",
    "/api/v1/webhooks",
    "/api/v1/omnichannel/webhooks",
    "/api/v1/commerce/webhooks",
    "/api/v1/marketing/webhooks",
)

ALLOWED_SPECIFIC_PUBLIC = {
    "/",
    "/api/v1/onboarding/tenants",
    "/api/v1/onboarding/staff-join-request",
    "/api/v1/onboarding/verify-company-code",
    "/api/v1/auth/verify-company-code",
    "/api/v1/onboarding/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/prospects/register",
    "/prospects/register",
    "/api/v1/onboarding/join",
    "/api/v1/onboarding/join-company",
    "/api/v1/console-sec-auth/mfa-verify",
    "/api/v1/billing/plans",
    "/api/v1/billing/facilities",
    "/api/v1/billing/topup-packages",
    "/api/v1/billing/activity-types",
    "/api/v1/billing/factors",
    "/api/v1/storage/{bucket}/{file_path}",
    "/api/v1/storage/signed-download/{bucket}/{file_path}",
}

def is_allowed_public(path: str) -> bool:
    for prefix in ALLOWED_PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    if path in ALLOWED_SPECIFIC_PUBLIC:
        return True
    if "/webhook" in path:
        return True
    return False

def substitute_path_params(path: str) -> str:
    # Replace any {param} with a valid uuid or test string
    substitutions = {
        "{tenant_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{ticket_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{lead_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{customer_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{item_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{order_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{invoice_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{account_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{channel_account_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{category_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{style_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{batch_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{template_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{blueprint_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{session_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{agent_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{user_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{question_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{plan_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{package_id}": "10e75d63-15f8-42e8-a6ce-24fece12cd04",
        "{facility_code}": "TEST_FACILITY",
        "{date_str}": "2026-09-27",
        "{year}": "2026",
        "{month}": "9",
    }
    res = path
    for k, v in substitutions.items():
        res = res.replace(k, v)
    # Generic catch-all for any other {param}
    res = re.sub(r'\{[a-zA-Z0-9_]+\}', "10e75d63-15f8-42e8-a6ce-24fece12cd04", res)
    return res

def run_audit():
    schema = app.openapi()
    paths = schema.get("paths", {})

    designed_public = []
    properly_protected = []
    unintentionally_accessible = []

    total_endpoints = 0

    for path, methods_dict in sorted(paths.items()):
        for method_lower in methods_dict.keys():
            method = method_lower.upper()
            if method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                continue

            total_endpoints += 1
            test_path = substitute_path_params(path)

            try:
                if method == "GET":
                    res = client.get(test_path)
                elif method == "POST":
                    res = client.post(test_path, json={})
                elif method == "PUT":
                    res = client.put(test_path, json={})
                elif method == "DELETE":
                    res = client.delete(test_path)
                elif method == "PATCH":
                    res = client.patch(test_path, json={})
                status_code = res.status_code
            except Exception as e:
                status_code = 500

            is_pub = is_allowed_public(path)

            if is_pub:
                designed_public.append((method, path, status_code))
            else:
                # Must return 401 or 403
                if status_code in (401, 403):
                    properly_protected.append((method, path, status_code))
                else:
                    unintentionally_accessible.append((method, path, status_code))

    print(f"\n========================================================")
    print(f"RESULTS OF ENDPOINT ACCESS AUDIT (WITHOUT AUTH TOKEN)")
    print(f"========================================================")
    print(f"Total Endpoints Scanned            : {total_endpoints}")
    print(f"1. Designed Public Endpoints       : {len(designed_public)}")
    print(f"2. Properly Protected (401/403)     : {len(properly_protected)}")
    print(f"3. UNINTENTIONALLY ACCESSIBLE (BUG): {len(unintentionally_accessible)}")
    print(f"========================================================\n")

    if unintentionally_accessible:
        print("CRITICAL FINDINGS - Endpoints accessible without authentication:")
        for m, p, s in unintentionally_accessible:
            print(f"  [CRITICAL status={s}] {m} {p}")
        return 1
    else:
        print("SUCCESS: 100% of non-public endpoints strictly reject requests without Authorization token (401/403).")
        return 0

if __name__ == "__main__":
    sys.exit(run_audit())
