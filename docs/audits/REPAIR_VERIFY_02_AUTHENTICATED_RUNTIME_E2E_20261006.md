# REPAIR/VERIFY-02 — Authenticated Runtime E2E Gate

Date: 2026-10-06

## Canonical scope

Only `urbanrealty36-ops/OrchestreeAI-Final-Web-App-1` is in scope.

Live Supabase project:
- `OrchestreeDB-Web-PWA`
- ref `szvbcvmvrucqxfikgjlx`

Live Railway API:
- `@orchestree/api`
- production
- current deployment after REPAIR/VERIFY-01: `f180035c-dc30-45e9-a327-9f2ea46d83fe`

## Authenticated gate implementation

Added:

`apps/backend/tests/test_authenticated_runtime_e2e.py`

The gate uses the real application login flow:

1. POST `/auth/login` with a real Supabase Auth tenant user.
2. Preserve the real HttpOnly session cookies.
3. GET `/auth/session` to resolve server-side identity and tenant.
4. GET `/api/v1/tenant/context` to prove authenticated tenant context.
5. GET learning endpoints using the authenticated session.
6. Optional real workflow dispatch, enabled only with `ORCHESTREE_E2E_RUN_AI=true`, because it can consume real AI credits and invoke the real Model Router.

No JWT is fabricated. No service-role token is used as tenant identity. No tenant header is manufactured to bypass authentication.

Required runtime variables are deliberately external to source control:

- `ORCHESTREE_RUNTIME_API_BASE_URL`
- `ORCHESTREE_E2E_EMAIL`
- `ORCHESTREE_E2E_PASSWORD`

Optional:
- `ORCHESTREE_E2E_EXPECTED_TENANT_ID`
- `ORCHESTREE_E2E_RUN_AI=true`

## Live tenant evidence

The production Supabase Auth database currently contains two Auth users with active tenant memberships:

- `orchestree.ai.id@gmail.com` → active tenant `OrchestreeAI`
- `trexioadventure@gmail.com` → active tenant `Trexio Adventure`

Their passwords are not available to the verification environment and are not retrieved or reconstructed.

## Current gate status

**BLOCKED at authenticated credential acquisition, not at application runtime.**

REPAIR/VERIFY-01 already proved:
- application startup;
- Railway deployment;
- live HTTP reachability;
- `/health/live` 200;
- protected orchestration endpoint returns 401 without authentication.

REPAIR/VERIFY-02 cannot honestly declare Tenant → PDP/ABAC → DB/RLS → Orchestration → Model Router → Credit → Memory/Learning GREEN until a real non-privileged Supabase Auth session is supplied to the test runner.

No fake credentials or privileged database identity will be substituted.

## Important architectural observation

The current learning router accepts tenant identity through query/header parameters and performs its own PDP call rather than depending directly on the authenticated tenant context. This is weaker than the canonical `get_current_tenant_context` pattern used by `/auth/session` and `/api/v1/tenant/context`.

This is recorded as a follow-up repair candidate rather than silently changed during the credential gate. The authenticated E2E gate should expose this boundary once a real session is run.

## Next execution

Run:

```
ORCHESTREE_RUNTIME_API_BASE_URL=https://orchestreeapi-production.up.railway.app \
ORCHESTREE_E2E_EMAIL='<real test tenant email>' \
ORCHESTREE_E2E_PASSWORD='<real test tenant password>' \
pytest -q apps/backend/tests/test_authenticated_runtime_e2e.py
```

Only after the non-AI authenticated tests pass should the real AI slice be enabled:

```
ORCHESTREE_E2E_RUN_AI=true
```

That second run is the gate for real orchestration/model-router/credit execution.
