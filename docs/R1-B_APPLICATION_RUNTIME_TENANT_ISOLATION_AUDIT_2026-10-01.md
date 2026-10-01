# R1-B — Application Runtime Tenant-Isolation Audit
## OrchestreeAI Web PWA — 2026-10-01

**Repository:** `fadliansyah36/OrchestreeAI-Final-Web-App`  
**Canonical Supabase:** `OrchestreeDB-Web-PWA` (`szvbcvmvrucqxfikgjlx`)  
**Basis:** AGENTS.md + Master PRD & Design System v2.2 + live R1-A database remediation.

## 1. Objective

R1-B verifies that the application layer actually enforces the database isolation contract proven in R1-A:

1. runtime database access uses `orchestree_app`;
2. `service_role` is never used for tenant queries;
3. every tenant transaction establishes `app.tenant_id`, `app.user_id`, `app.actor_type`;
4. tenant identity comes from verified Supabase JWT + active membership, not client-controlled identity;
5. `X-Tenant-Id` can select only an authenticated membership tenant;
6. REST → service → database paths cannot bypass the canonical transaction boundary;
7. workflow/node/MCP/memory/conversation/credit paths preserve the same tenant context.

PRD v2.2 explicitly requires tenant queries through `orchestree_app` with NOBYPASSRLS/FORCE RLS, transaction-local GUCs, restricted `service_role`, and `authorize()` as the unified PDP.

## 2. Audit evidence

### 2.1 Canonical DB helper

`apps/backend/app/core/database.py` contains a synchronous `tenant_tx()` that:

- executes `SET LOCAL ROLE orchestree_app`;
- sets `app.tenant_id`;
- sets `app.user_id` when supplied;
- sets `app.membership_id` when supplied;
- sets `app.actor_type`;
- sets `app.request_id`.

This matches the intended PRD transaction pattern.

### 2.2 Critical runtime gap — synchronous engine

`get_database_engine()` creates the singleton SQLAlchemy engine from `DATABASE_URL`, but the engine itself does not enforce `orchestree_app` at connection establishment.

The role is enforced only when callers explicitly enter `tenant_tx()` or manually execute `SET LOCAL ROLE orchestree_app`.

Therefore a direct:

```python
engine = get_database_engine()
with engine.connect() as conn:
    ...
```

does not, by construction, prove that the connection is `orchestree_app`.

This is a **R1-B blocker** because AGENTS/PRD require the runtime database role to be controlled centrally rather than by individual endpoint discipline.

### 2.3 Critical runtime gap — asynchronous pool

`apps/backend/app/core/database.py` also exposes:

- module-level `_async_pool`;
- `get_async_pool()`;
- `DBConnectionWrapper.fetch()`;
- `DBConnectionWrapper.fetchrow()`;
- `DBConnectionWrapper.fetchval()`;
- `DBConnectionWrapper.execute()`.

The async pool is created directly from `DATABASE_URL` and does not establish `orchestree_app` or tenant GUC context on acquisition.

This creates a second database access path outside the canonical `tenant_tx()` boundary.

**Disposition: HIGH / BLOCKING.**

### 2.4 Authentication / membership resolution

`get_current_tenant_context()` verifies the Supabase JWT and then resolves membership through `_membership_context()`.

The membership lookup checks:

- authenticated JWT subject;
- active tenant membership;
- optional `X-Tenant-Id`;
- multi-tenant users must select an active membership tenant.

This is directionally aligned with the PRD.

However, the membership lookup itself uses `get_database_engine().connect()` rather than the canonical tenant transaction. Because this is the bootstrap step before tenant context exists, it requires a dedicated **identity/bootstrap DB access path** with explicit runtime role enforcement rather than an unrestricted generic engine connection.

### 2.5 Critical endpoint finding — Chat

`apps/backend/app/api/v1/chat.py` currently accepts:

- `tenant_id` in the request body;
- `membership_id` in the request body;
- `x-user-id` as a request header.

It constructs `SubjectContext` directly from these client-controlled values.

This violates the R1-B requirement that authenticated identity and tenant context originate from the verified request security context.

Even though `authorize()` is invoked, PDP input itself is being supplied by the client for this endpoint.

**Disposition: CRITICAL.**

The endpoint must instead derive:

- `user_id`
- `tenant_id`
- `roles`
- `capabilities`
- MFA state

from `get_current_tenant_context()` / canonical FastAPI dependency, while the request payload contains only business data.

### 2.6 Memory endpoint findings

`apps/backend/app/api/v1/memory.py` contains multiple endpoints accepting:

- path `tenant_id`;
- `X-User-Id`;
- `X-User-Roles`;
- `X-User-Capabilities`;
- `X-MFA-Verified`.

Some handlers merge request headers into PDP subject state.

One document-list path manually performs:

```sql
SET LOCAL ROLE orchestree_app;
set_config('app.tenant_id', :tenant_id, true)
```

This is safer than a completely unscoped query, but it duplicates the transaction-security contract at endpoint level.

**Disposition: HIGH.**

R1-B should consolidate these paths behind the canonical security/transaction context rather than relying on every endpoint to implement the same controls correctly.

### 2.7 Unified PDP

`apps/backend/app/authz/pdp.py` is present as the canonical `authorize()` implementation.

It performs:

1. RBAC;
2. subscription tier;
3. ABAC;
4. department budget.

It also contains explicit cross-tenant denial logic except for MFA-authenticated Super Admin paths.

This satisfies the architectural direction, but R1-B still needs to ensure every relevant endpoint constructs its `SubjectContext` from trusted authentication context.

## 3. R1-B gap matrix

| Control | Result | Evidence |
|---|---|---|
| Supabase JWT verification | GREEN | canonical security module verifies signature/issuer/audience/exp/nbf |
| Active membership resolution | GREEN/PARTIAL | membership query exists and filters active membership |
| X-Tenant-Id membership binding | GREEN/PARTIAL | membership lookup constrains requested tenant |
| Canonical `authorize()` | GREEN/PARTIAL | unified PDP exists and is used by dependencies |
| `tenant_tx()` exists | GREEN | sets role + tenant/user/actor/request GUC |
| Central runtime role enforcement | **FAIL** | generic sync engine does not enforce role |
| Async runtime role enforcement | **FAIL** | async pool does not enforce role |
| Central transaction boundary | **FAIL** | direct engine/pool paths remain |
| Client-controlled tenant in Chat | **FAIL** | payload tenant_id directly enters SubjectContext |
| Client-controlled user identity in Chat | **FAIL** | x-user-id directly enters SubjectContext |
| Client-controlled roles/capabilities in Memory | **FAIL** | request headers merged into subject |
| service_role exclusion | **NOT PROVEN** | source/runtime evidence incomplete |
| DB-level RLS backstop | GREEN | R1-A live isolation suite |
| Cross-tenant API E2E | **NOT GREEN** | requires runtime remediation first |

## 4. R1-B disposition

**R1-B status: AUDIT COMPLETE / REMEDIATION BLOCKED BY APPLICATION RUNTIME GAPS.**

The database backstop is strong after R1-A, but the application layer is not yet compliant with the PRD/AGENTS contract.

The two most important blockers are:

### B1 — Multiple database access paths

The application currently has:

`get_database_engine()`  
`tenant_tx()`  
`get_async_pool()`  
`DBConnectionWrapper`

The PRD requires one controlled tenant database access pattern. Runtime role and tenant GUC enforcement cannot depend on every endpoint remembering the correct helper.

### B2 — Client-derived identity in tenant-sensitive endpoints

Chat and Memory still contain paths where request headers/body influence identity/tenant/role/capability state.

The authenticated security context must become authoritative.

## 5. Required remediation sequence

### R1-B.1 — Canonical Runtime DB Boundary

Create one authoritative runtime database boundary:

- enforce `orchestree_app`;
- reject runtime connections that remain `service_role`/superuser;
- provide explicit bootstrap/global access only where justified;
- provide sync + async tenant transaction helpers;
- set `app.tenant_id`, `app.user_id`, `app.actor_type`, `app.request_id` centrally;
- fail closed when tenant context is absent;
- remove/restrict unrestricted tenant-capable pool helpers.

### R1-B.2 — Trusted RequestContext

Make verified `AuthenticatedTenantContext` the only source for:

- user ID;
- tenant ID;
- roles;
- capabilities;
- actor type;
- MFA state.

Remove client-controlled identity headers from tenant-sensitive handlers.

### R1-B.3 — Endpoint migration

Migrate high-risk endpoints first:

1. Chat
2. Memory
3. Billing/Credit
4. Conversations
5. Workflow/Orchestration
6. MCP/tool invocation
7. Storage
8. Collaboration/Tasks

### R1-B.4 — Runtime negative tests

Add real integration tests proving:

- Tenant A token + Tenant B header → 403;
- Tenant A token + Tenant B payload → 403;
- forged user header cannot impersonate another user;
- forged roles/capabilities cannot elevate;
- missing tenant context → fail closed;
- tenant transaction → only tenant rows;
- service_role runtime connection → startup/runtime rejection;
- workflow node cannot escape tenant;
- MCP tool cannot escape tenant.

### R1-B.5 — Live API isolation

Only after B1–B4:

- execute against the real canonical Supabase tenants;
- test REST endpoints;
- workflow execution;
- MCP tool access;
- memory;
- credits;
- conversations;
- storage;
- audit ledger.

## 6. Gate

R1-B cannot be marked GREEN until:

- [ ] one canonical runtime DB boundary exists;
- [ ] runtime role is centrally enforced as `orchestree_app`;
- [ ] no tenant path uses `service_role`;
- [ ] tenant GUC is established centrally;
- [ ] client identity cannot override verified identity;
- [ ] Chat/Memory/etc. no longer construct trusted SubjectContext from headers/body;
- [ ] real API cross-tenant negative tests pass;
- [ ] missing tenant context fails closed.

**No production database mutation was performed during this R1-B audit.**

## 7. Next execution phase

**NEXT: R1-B.1 — Canonical Runtime DB Boundary**

This is the immediate next implementation step. It must be completed and verified before R1-B.2 endpoint migration begins.
