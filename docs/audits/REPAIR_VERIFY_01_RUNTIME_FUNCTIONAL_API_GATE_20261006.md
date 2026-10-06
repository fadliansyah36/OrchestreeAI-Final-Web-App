# REPAIR/VERIFY-01 — Runtime Functional API Gate

Date: 2026-10-06

## Scope

This gate verifies the live Railway API for the canonical OrchestreeAI repository only:

- Repository: `urbanrealty36-ops/OrchestreeAI-Final-Web-App-1`
- Branch under repair: `repair/verify-01-runtime-functional-api-gate`
- Railway API: `@orchestree/api`
- Environment: `production`
- Deployment audited: `596faef5-7cbd-4159-b2f4-b377b04f1021`

No Allpha Universe repository or runtime was touched.

## Runtime evidence

The latest deployment log shows:

- application startup complete;
- Uvicorn listening on port 8080;
- Railway `/health/live` returned HTTP 200;
- no current deployment error after the 14:10 deployment.

Historical Railway logs contained earlier runtime-role and `channel_accounts` privilege failures from superseded deployments. Those failures are not present in deployment `596faef5-7cbd-4159-b2f4-b377b04f1021`.

## Functional API verification

The Railway public service was exercised through the deployment's public HTTP path:

| Endpoint | Method | Result | Interpretation |
|---|---:|---:|---|
| `/health/ready` | POST probe | 405 | Correct method boundary; endpoint is GET-only |
| `/health/startup` | POST probe | 405 | Correct method boundary; endpoint is GET-only |
| `/public/register` | POST | 422 | FastAPI validation contract active; malformed sample rejected |
| `/api/v1/orchestration/dispatch` | POST | 401 | Protected orchestration endpoint fails closed without authentication |
| `/api/v1/tenant/context` | POST probe | 405 | Correct method boundary; endpoint is GET-only |

The two health endpoints could not be invoked with GET through the available Railway probe action, so the gate does not fabricate a 200 result for them. Railway's own healthcheck has already proven `/health/live` with HTTP 200.

## REPAIR performed

The audit exposed stale repository tests/documentation still referring to the retired `DATABASE_RUNTIME_ROLE` / `orchestree_app` identity model.

Fixed on this branch:

1. `apps/backend/tests/test_database_driver_normalization.py`
   - removed obsolete `DATABASE_RUNTIME_ROLE` assertions;
   - tests now derive runtime identity from `DATABASE_URL`.

2. `apps/backend/tests/test_runtime_functional_api_gate.py`
   - added a reusable live API contract gate;
   - verifies liveness/readiness/startup/public read contracts when supplied a real deployment URL;
   - verifies protected endpoints reject unauthenticated requests;
   - never manufactures JWTs or privileged headers.

3. `apps/backend/app/core/database.py`
   - removed stale `DATABASE_RUNTIME_ROLE` wording from runtime-role enforcement documentation/errors;
   - canonical runtime identity remains the username from `DATABASE_URL`;
   - NOBYPASSRLS + non-superuser enforcement remains fail-closed.

4. `AGENTS.md`
   - aligned the permanent database rule with the current owner-approved runtime model: `DATABASE_URL` supplies the non-superuser/NOBYPASSRLS login identity;
   - removed stale `orchestree_app` and `DATABASE_RUNTIME_ROLE` references.

## Important verification limitation

The current tool environment cannot make outbound DNS/network connections to the Railway hostname directly, so the reusable GET-based live gate was committed but could not be executed locally from this sandbox. Railway's own HTTP probe successfully reached the service for the POST contract tests above.

Authenticated tenant/workflow E2E is intentionally not declared GREEN here because no real Supabase Auth JWT was supplied. No fake credentials were created.

## Gate status

**REPAIR/VERIFY-01: PARTIAL GREEN**

- Runtime startup: GREEN
- Public HTTP routing: GREEN
- FastAPI validation boundary: GREEN
- Protected orchestration fail-closed boundary: GREEN
- Stale runtime identity test/docs: REPAIRED
- Full authenticated tenant/workflow E2E: PENDING real credentials
- Phase 04 GREEN: NOT YET
- Phase 05 GREEN: NOT YET
