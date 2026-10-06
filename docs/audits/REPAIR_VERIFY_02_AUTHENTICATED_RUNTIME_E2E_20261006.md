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

## REPAIR-02A — Tenant Context Hardening

Implemented on the authenticated runtime repair branch.

### Canonical enforcement

All Continuous Learning endpoints now derive tenant/user/role/capability/MFA context from:

`get_trusted_request_context()`
→ verified Supabase JWT
→ server-managed `app_metadata.tenant_id`
→ authoritative `tenant_memberships`
→ PDP
→ tenant repository.

The Learning API no longer accepts `tenant_id`, `X-User-Roles`, `X-User-Capabilities`, `X-MFA-Verified`, or `X-User-Id` as authorization authority.

Human feedback also derives `actor_id` from the authenticated user context.

### Anti-spoofing behavior

`X-Tenant-Id` is not an authority source. If supplied, it may only repeat the already-resolved tenant. A conflicting value is rejected with HTTP 403.

A `tenant_id` query parameter is not consumed by Learning endpoints and therefore cannot switch the effective tenant.

### Database / migration impact

No Supabase schema or migration change is required for REPAIR-02A. The existing tenant membership and RLS architecture remains the canonical persistence boundary.

### Regression evidence added

The authenticated E2E suite now explicitly verifies:

- authenticated Learning access succeeds without a tenant query parameter;
- a bogus `tenant_id` query cannot change the effective tenant;
- a conflicting `X-Tenant-Id` is rejected;
- forged role/capability/MFA headers do not grant access.

The real credentialed E2E gate remains required before this repair can be declared GREEN.

## Implementation status — REPAIR-02A

**IMPLEMENTED + MERGED + DEPLOYED**

GitHub:
- PR #9 merged to `main`.
- Merge commit: `adfe60e294d44a63950b2cb76913c641ad2b636b`.

Railway:
- Project: `creative-sparkle`
- Environment: `production`
- Service: `@orchestree/api`
- Deployment: `a8e7adaa-dc4a-4994-9c10-1916b49a055a`
- Commit: `adfe60e294d44a63950b2cb76913c641ad2b636b`
- Status: `SUCCESS`
- `/health/live`: HTTP 200 observed in deployment runtime logs.

Supabase:
- Project: `OrchestreeDB-Web-PWA`
- Ref: `szvbcvmvrucqxfikgjlx`
- No schema/migration mutation was required for REPAIR-02A.
- Learning RLS state verified live:
  - `agent_decision_outcomes`: RLS + FORCE RLS
  - `agent_lesson_learned`: RLS + FORCE RLS
  - `agent_skill_confidence`: RLS + FORCE RLS
  - `agent_skill_growth_log`: RLS + FORCE RLS
- Existing live learning evidence remains: 35 outcomes, 5 lessons, 5 confidence records, 35 growth records.

### Acceptance status

The code repair is deployed successfully.

**REPAIR-02A is not yet declared GREEN**, because the real credentialed authenticated E2E suite has not yet been executed with a non-privileged Supabase Auth test account. That runtime gate remains the next required verification step.


## REPAIR-02B — Authenticated Runtime E2E Gate implementation

Date: 2026-10-06

### Implementation completed

The permanent authenticated runtime gate has been hardened and made runnable against the canonical Railway API:

- `apps/backend/tests/test_authenticated_runtime_e2e.py`
  - uses a real CookieJar + HTTPCookieProcessor so the test actually preserves the HttpOnly session cookie returned by `/auth/login`;
  - verifies unauthenticated `/auth/session` returns `401`;
  - verifies real login → `/auth/session` → server-resolved tenant → `/api/v1/tenant/context`;
  - verifies the canonical `/api/v1/learning/*` paths;
  - verifies a bogus `?tenant_id=` query cannot switch tenant context;
  - verifies conflicting `X-Tenant-Id` plus forged role/capability/MFA headers are rejected with `403`;
  - verifies the authenticated session tenant remains unchanged after the spoof attempt;
  - optionally verifies access to a supplied different tenant is denied via `ORCHESTREE_E2E_CROSS_TENANT_ID`;
  - keeps the real AI/credit/model-router slice opt-in via `ORCHESTREE_E2E_RUN_AI=true`.
- `.github/workflows/authenticated-runtime-e2e.yml`
  - manual `workflow_dispatch` only;
  - canonical Railway API base URL;
  - credentials are GitHub Actions secrets only;
  - fails closed when E2E credentials are missing;
  - optional real AI slice is explicit and opt-in.

### Important correction discovered during REPAIR-02B

The previous test file had two false-positive risks:

1. it called `/learning/*` even though the canonical router is `/api/v1/learning/*`;
2. it constructed a CookieJar but did not install an HTTPCookieProcessor, so the login session cookie was not actually carried into subsequent requests.

Both are corrected in this repair.

### Supabase / migration

No schema change is required for REPAIR-02B.

The gate exercises the existing Supabase Auth + tenant membership + RLS boundary. No privileged test identity, fake JWT, service-role token, or database fixture is introduced.

### Credential gate

The production application must not receive or store a human test-user password.

The real credentialed run remains blocked until the dedicated GitHub Actions secrets are provisioned with a non-privileged Supabase Auth test account:

- `ORCHESTREE_E2E_EMAIL`
- `ORCHESTREE_E2E_PASSWORD`

Optional:

- `ORCHESTREE_E2E_EXPECTED_TENANT_ID`
- `ORCHESTREE_E2E_CROSS_TENANT_ID`

Therefore this implementation is **READY FOR CREDENTIALED EXECUTION but NOT GREEN yet**.

### AI slice

The workflow defaults to `run_ai=false`. The AI slice must only be executed after the non-AI authenticated gate passes because it may reserve/consume real AI credits and invoke the real Model Router.

### Canonical binding

GitHub: `urbanrealty36-ops/OrchestreeAI-Final-Web-App-1`, branch `repair/02b-authenticated-runtime-e2e-gate`

Supabase: `OrchestreeDB-Web-PWA`, ref `szvbcvmvrucqxfikgjlx`

Railway: `creative-sparkle` / production / `@orchestree/api`

Allpha Universe is explicitly out of scope and was not touched.
