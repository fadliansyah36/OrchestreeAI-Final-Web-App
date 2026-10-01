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
