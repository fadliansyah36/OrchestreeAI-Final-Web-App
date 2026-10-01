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

These remain R1-B.2 blockers and were deliberately not mixed into R1-B.1.

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

## 5. Current gap matrix

| Control | Status after R1-B.1 | Disposition |
|---|---|---|
| Canonical sync tenant transaction | GREEN | Implemented |
| Canonical async tenant transaction | GREEN | Implemented |
| Runtime role check | GREEN/PARTIAL | Enforced inside canonical transaction + startup verifier |
| Legacy unrestricted async pool | GREEN | Disabled fail-closed |
| Tenant GUC central helper | GREEN | Implemented |
| Missing tenant context | GREEN | Canonical tenant transaction rejects empty tenant |
| Client-controlled Chat identity | RED | R1-B.2 |
| Client-controlled Memory identity | RED | R1-B.2 |
| Direct DB calls across application | YELLOW | Inventory/migration required |
| service_role exclusion | YELLOW | R1-B.3/R1-B.4 proof required |
| Live API cross-tenant test | NOT GREEN | Execute after runtime migration |
| R1-B overall | NOT GREEN | B.2–B.5 remain |

## 6. Files changed

- `apps/backend/app/core/database.py`
- `apps/backend/tests/test_canonical_runtime_db_boundary.py`
- `docs/R1-B_APPLICATION_RUNTIME_TENANT_ISOLATION_AUDIT_2026-10-01.md`

## 7. Commits

R1-B.1 database boundary implementation:

`83e840a304c5a590c2453e9295db8ab67baf5302`

Regression guard:

`e07b4b28ca6c481dbfdbb44978fd0436a5202d30`

## 8. R1-B.1 gate

### GREEN achieved for the defined implementation scope

- [x] canonical sync tenant transaction exists;
- [x] canonical async tenant transaction exists;
- [x] runtime role must be `orchestree_app`;
- [x] runtime role must be NOBYPASSRLS/non-superuser;
- [x] tenant GUCs are transaction-local;
- [x] unrestricted async pool API is fail-closed;
- [x] regression guards added.

### Still blocked for R1-B overall

- [ ] trusted RequestContext;
- [ ] Chat identity migration;
- [ ] Memory identity migration;
- [ ] direct DB access inventory/migration;
- [ ] service_role source/runtime proof;
- [ ] live API cross-tenant negative suite.

No production database mutation was performed in R1-B.1.

## 9. Tahap/Fase Selanjutnya

### **R1-B.2 — Trusted RequestContext & Identity Authority**

**Objective:** menjadikan verified Supabase JWT + active membership sebagai satu-satunya sumber authoritative untuk user, tenant, role, capability, actor type, dan MFA.

**Scope:**
1. canonical FastAPI `AuthenticatedTenantContext`;
2. Chat;
3. Memory;
4. remove client-controlled identity headers;
5. reject payload tenant override;
6. ensure `authorize()` receives trusted context only;
7. preserve `X-Tenant-Id` only as a selector validated against active membership.

**GREEN gate:**
- forged `X-User-Id` cannot impersonate;
- forged role/capability/MFA headers cannot elevate;
- Tenant A token + Tenant B payload/header → 403;
- PDP receives only trusted identity context;
- no fabricated fallback identity.

**STOP blockers:**
- any endpoint still trusting client identity;
- any fallback UUID/user/role/capability;
- any tenant context created from unverified request data.

**Output required before R1-B.3:** trusted request-context migration report + passing negative tests.
