# R1-B — Application Runtime Tenant-Isolation Audit
## OrchestreeAI Web PWA — 2026-10-01

**Repository:** `fadliansyah36/OrchestreeAI-Final-Web-App`  
**Canonical Supabase:** `OrchestreeDB-Web-PWA` (`szvbcvmvrucqxfikgjlx`)  
**Basis:** AGENTS.md + Master PRD & Design System v2.2 + R1-A database remediation.

## 1. Objective

R1-B verifies that the application layer enforces the database isolation contract proven in R1-A:

1. runtime database access uses `orchestree_app`;
2. `service_role` is never used for tenant queries;
3. every tenant transaction establishes `app.tenant_id`, `app.user_id`, `app.actor_type`;
4. tenant identity comes from verified Supabase JWT + active membership;
5. `X-Tenant-Id` can select only an authenticated membership tenant;
6. REST → service → database paths cannot bypass the canonical transaction boundary;
7. workflow/node/MCP/memory/conversation/credit paths preserve the same tenant context.

PRD v2.2 requires tenant queries through `orchestree_app` with NOBYPASSRLS/FORCE RLS, transaction-local GUCs, restricted `service_role`, and `authorize()` as the unified PDP.

## 2. Initial audit findings

### 2.1 Canonical transaction pattern

The previous `database.py` already had synchronous `tenant_tx()` that set:

- `SET LOCAL ROLE orchestree_app`;
- `app.tenant_id`;
- `app.user_id`;
- `app.membership_id`;
- `app.actor_type`;
- `app.request_id`.

### 2.2 Blocking access-path findings

Before R1-B.1 there were unrestricted sync/async database access paths:

- `get_database_engine()`;
- `get_async_pool()`;
- `DBConnectionWrapper`;
- `get_db_connection()`.

The async pool did not establish `orchestree_app` or tenant GUC context.

### 2.3 Blocking identity findings

Chat accepted client-supplied `tenant_id`, `membership_id`, and `x-user-id`.

Memory accepted client-supplied identity/role/capability/MFA headers.

These were the R1-B.2 blockers. They have now been migrated for the Chat and Memory API surfaces.

## 3. R1-B.1 implementation

### 3.1 Canonical runtime boundary implemented

`apps/backend/app/core/database.py` now defines:

- `RuntimeDatabaseRoleError`;
- `get_database_engine()`;
- `get_async_database_engine()`;
- `tenant_tx()`;
- `tenant_tx_async()`.

Both transaction helpers:

1. acquire the canonical runtime engine;
2. open a transaction;
3. execute `SET LOCAL ROLE orchestree_app`;
4. verify `current_user = orchestree_app`;
5. verify `rolbypassrls = false`;
6. verify `rolsuper = false`;
7. establish transaction-local:
   - `app.tenant_id`
   - `app.user_id`
   - `app.actor_type`
   - `app.request_id`
   - `app.membership_id`.

This follows the PRD pattern for transaction-local GUCs and role isolation.

### 3.2 Legacy async pool path disabled

The former unrestricted:

- `get_async_pool()`;
- `DBConnectionWrapper`;
- `get_db_connection()`

are now fail-closed and raise `RuntimeDatabaseRoleError`.

Tenant-capable async code must migrate to `tenant_tx_async()`.

### 3.3 Runtime role verification strengthened

`verify_db_connection_and_role()` now fails when the runtime URL resolves to a role other than:

`orchestree_app`

or when that role has:

- `rolbypassrls=true`;
- `rolsuper=true`.

This directly aligns the startup check with the PRD requirement.

### 3.4 Regression guard added

Added:

`apps/backend/tests/test_canonical_runtime_db_boundary.py`

The tests verify that the retired unrestricted async-pool/database-wrapper APIs fail closed.

## 4. Important limitation

R1-B.1 establishes the canonical helpers and disables the known unrestricted async pool API, but **R1-B is not GREEN**.

There are still callers that must be migrated away from direct database connections and client-derived identity.

In particular:

- membership/bootstrap lookup still needs a deliberate bootstrap DB path;
- Chat still requires R1-B.2 trusted request context;
- Memory still requires R1-B.2 trusted request context;
- remaining direct database access across domains must be inventoried and migrated;
- `service_role` source usage is not yet fully proven absent.

Therefore R1-B.1 is an implementation milestone, not final tenant-isolation acceptance.

## 5. R1-B.2 implementation — Trusted RequestContext & Identity Authority

### 5.1 Canonical trusted context

`apps/backend/app/core/security/__init__.py` now exposes `get_trusted_request_context()` as the canonical FastAPI identity dependency. It is derived from the verified Supabase JWT and active tenant membership resolved by `get_current_tenant_context()`. `X-Tenant-Id` remains only a validated tenant selector. When a tenant path parameter exists, it must match the trusted active tenant or the request is rejected with HTTP 403.

`require_capability()` now consumes this trusted dependency, so the unified PDP no longer receives a subject assembled from endpoint-supplied identity headers.

### 5.2 Chat migration

`POST /api/v1/chat/messages` now receives `AuthenticatedTenantContext` through `get_trusted_request_context()` and constructs `SubjectContext` exclusively from it. The request body no longer accepts `tenant_id` or `membership_id`; Pydantic `extra="forbid"` rejects those client overrides. The endpoint no longer accepts `X-User-Id`, and tenant/user/role/capability/MFA values used by PDP and Credit/Model Router are sourced from trusted context.

### 5.3 Memory migration

Memory search, document list/create, and consolidation endpoints now consume `AuthenticatedTenantContext`. Client-controlled `X-User-Id`, `X-User-Roles`, `X-User-Capabilities`, and `X-MFA-Verified` are removed from these endpoint contracts. Tenant, user, role, capability, actor type, and MFA state are taken only from trusted context. Tenant path values are independently checked by the trusted dependency.

### 5.4 Regression tests

Added `apps/backend/tests/test_r1_b2_trusted_request_context.py` covering:
- path tenant mismatch rejection;
- matching trusted tenant acceptance;
- Chat payload rejection of `tenant_id` override;
- Chat payload rejection of `membership_id` identity injection.

### 5.5 R1-B.2 status

**Implementation scope: GREEN.** The targeted Chat and Memory identity surfaces are now server-authoritative.

**R1-B overall: NOT GREEN.** This does not yet prove that every backend endpoint is free of client-derived identity, nor does it prove live API cross-tenant isolation or absence of `service_role` tenant queries.

## 6. Current gap matrix

| Control | Status after R1-B.1 | Disposition |
|---|---|---|
| Canonical sync tenant transaction | GREEN | Implemented |
| Canonical async tenant transaction | GREEN | Implemented |
| Runtime role check | GREEN/PARTIAL | Enforced inside canonical transaction + startup verifier |
| Legacy unrestricted async pool | GREEN | Disabled fail-closed |
| Tenant GUC central helper | GREEN | Implemented |
| Missing tenant context | GREEN | Canonical tenant transaction rejects empty tenant |
| Client-controlled Chat identity | GREEN | Migrated to trusted context |
| Client-controlled Memory identity | GREEN | Migrated to trusted context |
| Direct DB calls across application | YELLOW | Inventory/migration required |
| service_role exclusion | YELLOW | R1-B.3/R1-B.4 proof required |
| Live API cross-tenant test | NOT GREEN | Execute after runtime migration |
| R1-B overall | NOT GREEN | B.3–B.5 remain |

## 7. Files changed

- `apps/backend/app/core/database.py`
- `apps/backend/tests/test_canonical_runtime_db_boundary.py`
- `apps/backend/app/core/security/__init__.py`
- `apps/backend/app/authz/pdp.py`
- `apps/backend/app/api/v1/chat.py`
- `apps/backend/app/api/v1/memory.py`
- `apps/backend/tests/test_r1_b2_trusted_request_context.py`
- `docs/R1-B_APPLICATION_RUNTIME_TENANT_ISOLATION_AUDIT_2026-10-01.md`

## 8. Commits

R1-B.1 database boundary implementation:

`83e840a304c5a590c2453e9295db8ab67baf5302`

R1-B.3 DB boundary/service-role changes:

`1adee09440ed846a8d75f925c31ec7081544f8ef` · `47a9ff668294f88779740d1d87b1949b71e33638` · `39044d146098b8d0f036923aed0ad7e816bb7fc8` · `e08797aaefb04e2942995b843c8c822d7d67b2ef` · `674d3d91e33986870f74af0153dce89f13fc2a77`

R1-B.2 trusted context + PDP:

`fb7d1271850c2f4938e9958696aefca7c22a8417` · `37ebe77facd9485fbf059179acbd15ae6737da8c`

R1-B.2 Chat/Memory migration:

`585a8005ece8c981c2f539d9af5d94996540ad64` · `1b0a18d6aae05d8aad1eb412ebdd2330569170ac` · `4665685ef6a522ba6e3665d0e3da0d5419997a37`

R1-B.2 regression tests:

`6cb7107fe7d5b580713b94ce4a93d1ea1f86d5f6`

## 9. R1-B.1 + R1-B.2 gate

### GREEN achieved for the defined implementation scope

- [x] canonical sync tenant transaction exists;
- [x] canonical async tenant transaction exists;
- [x] runtime role must be `orchestree_app`;
- [x] runtime role must be NOBYPASSRLS/non-superuser;
- [x] tenant GUCs are transaction-local;
- [x] unrestricted async pool API is fail-closed;
- [x] regression guards added.

### Still blocked for R1-B overall

- [x] trusted RequestContext;
- [x] Chat identity migration;
- [x] Memory identity migration;
- [ ] direct DB access inventory/migration;
- [ ] service_role source/runtime proof;
- [ ] live API cross-tenant negative suite.

No production database mutation was performed in R1-B.1.

## 10. Tahap/Fase Selanjutnya

### **R1-B.3 — Direct DB Access Inventory & Service-Role Exclusion**

**Objective:** membuktikan seluruh jalur database aplikasi memakai boundary runtime kanonik dan tidak menggunakan `service_role` untuk query tenant.

**Scope:**
1. inventory seluruh direct DB engine/connection usage;
2. migrate tenant-capable callers to `tenant_tx()` / `tenant_tx_async()`;
3. define the explicit identity/bootstrap path for membership resolution;
4. audit all `service_role` references and classify Auth/Storage admin-only usage;
5. add source-level guards for forbidden tenant queries via `service_role`.

**Execution order:** inventory → classify bootstrap vs tenant transaction → migrate callers → service_role audit → regression tests.

**GREEN gates:**
- no unrestricted tenant-capable DB path remains;
- no `service_role` tenant query path remains;
- bootstrap path is explicit and fail-closed;
- direct DB caller regression suite passes.

**STOP blockers:**
- any tenant query can execute through `service_role`;
- any direct connection bypasses canonical runtime role/GUC boundary;
- bootstrap identity resolution falls back to client-supplied identity.

**Output required before R1-B.4:** complete DB access inventory, migration report, service-role exclusion evidence, and passing regression suite.


## R1-B.3 Finalization — Cross-Tenant Analytics Security Boundary

Implemented and live-verified on canonical Supabase project.

### Security boundary

- Cross-tenant rollup computation is now encapsulated in `SECURITY DEFINER` function `public.superadmin_compute_daily_rollup(date)`.
- Platform analytics overview uses `public.superadmin_platform_analytics_overview(date,date)`.
- Tenant ranking uses `public.superadmin_tenant_rankings(text,boolean,integer)` with an allowlisted sort key and bounded limit.
- LLM usage aggregation uses `public.superadmin_llm_usage_breakdown(text,date,date)` and returns aggregate JSON only.
- All four functions use fixed `search_path = pg_catalog, public`.
- EXECUTE is denied to `PUBLIC`, `anon`, `authenticated`, and `service_role`; only `orchestree_app` has EXECUTE.
- Tenant detail drill-down remains tenant-scoped and now uses `tenant_tx(tenant_id)` rather than an unrestricted engine.
- Rollup execution records an append-only Audit Ledger event in `audit_logs_2026_10` with a server-generated request id for scheduled/system execution.

### Live verification

- `orchestree_app`: `rolsuper=false`, `rolbypassrls=false`.
- Cross-tenant compute function executed successfully under `SET ROLE orchestree_app` in a rolled-back verification transaction and returned live aggregate values for 4 tenants.
- Anonymous execution of `superadmin_tenant_rankings` was denied with PostgreSQL permission error.
- Function metadata confirms `prosecdef=true`, owner `postgres`, fixed search path, and EXECUTE only for `orchestree_app` among runtime roles checked.
- Direct engine/connect/begin usage was removed from `domains/analytics/rollup_service.py`.

### R1-B.3 Finalization gate

- [x] cross-tenant rollup isolated behind narrow SECURITY DEFINER boundary;
- [x] platform overview isolated behind SECURITY DEFINER boundary;
- [x] tenant ranking isolated behind SECURITY DEFINER boundary;
- [x] LLM usage aggregate isolated behind SECURITY DEFINER boundary;
- [x] tenant detail remains canonical tenant transaction;
- [x] fixed search_path;
- [x] anon/authenticated/service_role function execution denied;
- [x] orchestree_app execution verified;
- [x] live cross-tenant aggregate execution verified;
- [ ] repository CI final verification still pending.

**R1-B.3 status: IMPLEMENTATION GREEN; release gate remains pending CI verification.**


## R1-B.4 — Live API Cross-Tenant Isolation & Negative Security Suite

Implementation completed on main.

### API perimeter hardening

- Admin analytics endpoints no longer accept `X-User-Roles`, `X-User-Capabilities`, or `X-MFA-Verified` as authorization inputs.
- All admin analytics REST endpoints now derive identity from `require_platform_admin`, which verifies Supabase JWT, token revocation, AAL2, and platform-admin membership server-side.
- Analytics endpoints no longer fabricate zero-valued success responses when the backend fails.
- Memory document listing no longer uses direct unrestricted engine access; it uses canonical `tenant_tx(context.tenant_id)`.

### Automated negative suite

Added `apps/backend/tests/test_r1_b4_live_api_cross_tenant_isolation.py` covering:

- trusted tenant path mismatch → 403;
- forged analytics role/capability/MFA headers → denied;
- analytics routes must depend on `require_platform_admin`;
- memory API must use `get_trusted_request_context` and contain no direct database engine;
- live Tenant A → Tenant B and Tenant B → Tenant A memory reads → 403/404;
- forged platform headers from tenant user → 401/403;
- explicit cross-tenant `X-Tenant-Id` selector → 403/404;
- unauthenticated protected analytics API → 401/403.

A manual GitHub workflow `.github/workflows/r1-b4-live-api-security.yml` runs the live suite only when explicit real Supabase access tokens and tenant IDs are provided through GitHub Secrets. No synthetic production identity is accepted.

The mandatory Phase 01 CI workflow now executes the non-live R1-B.4 negative suite on every main push.

### R1-B.4 status

**IMPLEMENTATION GREEN; live external API gate remains pending execution with real Tenant A/Tenant B access tokens.**

The live Supabase database cross-tenant controls remain verified from R1-A/R1-B.3. This phase does not claim end-to-end live API GREEN until the manual live workflow executes successfully against the deployed API.


## R1-B.5 — Frontend Identity Authority & Runtime Hygiene

Implemented on `main` after the R1-B.4 live-gate pause:

- Added `apps/client/lib/useAuthSession.ts` as the client session boundary. It reads only `GET /api/v1/auth/session` with credentials and no browser token storage.
- `apps/client/app/generative/page.tsx` and `apps/client/app/proactive/page.tsx` no longer derive tenant context from `localStorage`.
- Generative Studio no longer reads browser-stored access tokens and no longer falls back to a fabricated checksum display value.
- Normalized client type imports from `@/apps/client/types` to the canonical `@/types` alias.
- Corrected Omnichannel component imports to their canonical `sales/` and `omnichannel/` locations.
- Phase 02 forbidden-auth scanner now excludes `apps/**/tests` so security tests can legitimately contain forged-header strings without being mistaken for production authentication code. Production application code remains scanned.

This is a frontend authority/hygiene implementation milestone. It does not by itself close R1-B.4 live execution.

Next R1-B.5 work remains: complete browser-derived identity/tenant-state inventory across client/admin, remove remaining production localStorage auth/tenant authority, remove fabricated UI success/fallback states, and re-run Phase 01/02 gates.


### R1-B.5 Completion — Frontend Identity & Real-Data Hardening

Additional remediation completed on `main`:

- Home Overview no longer falls back to `localStorage` for tenant identity.
- Home Overview no longer exposes a fabricated check-in state/time or hardcoded agenda entries; it now reports loading/error/unavailable state when the backend does not provide agenda data.
- Home Overview no longer converts orchestration HTTP/network failure into a fabricated successful response; the real backend error is surfaced.
- Platform Analytics no longer reads browser-stored admin/Supabase tokens and no longer sends client-supplied role/capability/MFA headers. Requests use the HttpOnly session cookie with `credentials: include`.
- Platform Analytics rollup refresh now treats a non-2xx response as an actual failure.
- `GET /api/v1/auth/session` now enriches the authenticated session from authoritative `tenant_memberships` and `tenants` records, returning membership ID and tenant legal/display/status/creation metadata. The browser still supplies none of these identity attributes.
- Login tenant payload now uses those server-returned values and fails closed if required tenant metadata is missing; the former fabricated `Organisasi Terdaftar`, client user-id-as-membership, and client-generated tenant creation timestamp were removed.
- Pending staff join no longer synthesizes a tenant membership payload, queue ID, or client-created timestamp; the UI remains pending until authoritative HR approval/session establishment.
- Tracked `apps/admin/tsconfig.tsbuildinfo` was removed as generated repository artifact.

### R1-B.5 gate status

- [x] browser-stored auth token removed from Platform Analytics production path;
- [x] forged platform identity headers removed from Platform Analytics production path;
- [x] Home Overview tenant authority is backend-derived;
- [x] Home Overview fabricated operational states removed;
- [x] orchestration failure is surfaced as failure, not success;
- [x] login tenant metadata is backend-authoritative;
- [x] tracked TypeScript build artifact removed;
- [ ] Phase 01 CI GREEN after the final commits;
- [ ] Phase 02 CI GREEN after the final commits;
- [ ] complete repository-wide static inventory independently re-run against final `main`;
- [ ] R1-B.4 live external API workflow executed with real Tenant A/B tokens.

**R1-B.5 implementation status: GREEN for the completed remediation scope; release/CI gate remains pending.**

R1-B overall remains **NOT GREEN** until the remaining CI and live API gates are executed and pass.


### R1-B.5-GATE — Final Frontend Identity Inventory & CI Closure

Gate execution was started on main with a production-only static inventory:
- `scripts/r1_b5_frontend_identity_inventory.py`
- integrated into Phase 01 CI after the R1-B.4 non-live negative suite;
- excludes tests and generated build output;
- blocks browser auth-token storage, browser tenant authority, client-authored role/capability/MFA headers, frontend service-role secrets, and known synthetic identity patterns.

### CI evidence

Latest relevant Phase 02 run:
- run **37357429237**
- **SUCCESS**
- forbidden client-auth pattern scan: SUCCESS
- production cookie/session policy: SUCCESS
- backend JWT security tests: SUCCESS
- backend compile: SUCCESS
- client type-check: SUCCESS
- admin type-check: SUCCESS
- client build reached SUCCESS
- admin build gate is part of the successful run.

Latest relevant Phase 01 run:
- run **37357429249**
- **FAILURE**
- frontend type-check: SUCCESS
- client PWA build: SUCCESS
- admin PWA build: SUCCESS
- backend compile: SUCCESS
- service-worker syntax: SUCCESS
- failure occurred at existing **R1-B.3 DB access inventory**, before R1-B.4/R1-B.5 gate execution.

### R1-B.3 blocker discovered by final CI

The existing direct-DB inventory gate reports:
1. retired unrestricted DB APIs are still referenced by `api/v1/enterprise.py` and `api/v1/permissions.py`;
2. direct tenant DB/GUC patterns remain across multiple API/domain/skill modules, including billing, commerce, CRM, integrations, intelligence, kanban/attendance, omnichannel, proactive, sales, selection, service, workforce, authorization, model router, orchestration, process-integrity, billing credits, boundary, chief-of-staff, proactive scheduler, MCP/memory/scrape skills.

This is treated as a **real prerequisite blocker**, not a scanner failure. The gate must not be weakened merely to close R1-B.5.

### Gate status

- [x] R1-B.5 production frontend identity inventory is implemented and wired into CI.
- [x] Phase 02 Authentication Security Verification is GREEN (run 37357429237).
- [x] frontend/admin type-check and both production builds passed in the latest Phase 01 execution.
- [ ] Phase 01 GREEN — blocked by R1-B.3 direct DB access inventory.
- [ ] R1-B.5 final GREEN — blocked until the prerequisite Phase 01 gate is GREEN and the new R1-B.5 inventory actually executes in the same successful pipeline.
- [ ] R1-B.4 live external API workflow remains pending real Tenant A/B credentials.

**R1-B.5-GATE status: BLOCKED BY R1-B.3 PREREQUISITE.**

The correct next execution is **R1-B.3 Continuation — Complete Direct DB Extraction**, not weakening the gate.
