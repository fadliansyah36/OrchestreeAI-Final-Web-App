# R1-A — Database Security & Tenant Isolation Audit + Remediation
## OrchestreeAI Web PWA — 2026-10-01

**Repository:** `fadliansyah36/OrchestreeAI-Final-Web-App`  
**Canonical Supabase:** `OrchestreeDB-Web-PWA` (`szvbcvmvrucqxfikgjlx`)  
**Scope:** R1-A.1 classification → R1-A.2 public exposure removal → R1-A.3 precise RLS/FORCE → R1-A.4 SECURITY DEFINER hardening → R1-A.5 runtime role verification → R1-A.6 live cross-tenant isolation.  
**Baseline:** AGENTS.md + OrchestreeAI PRD v2.2.

## 1. Binding security requirements

PRD v2.2 requires PostgreSQL/Supabase as the OLTP source of truth, RLS FORCE on tenant tables, tenant runtime queries through `orchestree_app` (`NOBYPASSRLS`), transaction-local `app.tenant_id`, restricted `service_role`, narrow audited cross-tenant SECURITY DEFINER paths, and fail-closed tenant isolation.

The PRD also states that `service_role` bypasses RLS and must not be used for tenant data queries, while the frontend does not read application tables directly.

## 2. R1-A.1 — Classification of the 15 previously exposed tables

| Table | Classification | Intended access |
|---|---|---|
| `roles` | Global reference/RBAC catalog | FastAPI via `orchestree_app`; no direct client table access |
| `role_permissions` | Global reference/RBAC catalog | FastAPI via `orchestree_app`; no direct client table access |
| `subscription_plans` | Global commercial reference | FastAPI via `orchestree_app`; no direct client table access |
| `feature_capabilities` | Global capability catalog | FastAPI via `orchestree_app`; no direct client table access |
| `llm_providers` | Global platform catalog | FastAPI via `orchestree_app`; no direct client table access |
| `llm_models` | Global platform catalog | FastAPI via `orchestree_app`; no direct client table access |
| `mcp_tools` | Global tool registry | FastAPI via `orchestree_app`; no direct client table access |
| `tool_health_checks` | Platform operational state | Backend/internal access only |
| `workflow_nodes` | **Tenant-derived workflow child** | RLS inherits tenant scope from `workflow_definitions` |
| `alembic_version` | Migration metadata | Migration runner only; no application/API access |
| `ai_structural_roles` | Global AI workforce reference | FastAPI via `orchestree_app`; no direct client table access |
| `job_levels` | Global AI workforce reference | FastAPI via `orchestree_app`; no direct client table access |
| `ai_job_titles` | Global AI workforce reference | FastAPI via `orchestree_app`; no direct client table access |
| `job_subtitles` | Global AI workforce reference | FastAPI via `orchestree_app`; no direct client table access |
| `job_title_mapping_rules` | Global AI workforce reference | FastAPI via `orchestree_app`; no direct client table access |

The correct remediation is not to force every global catalog table through a tenant policy. The PRD requires RLS/FORCE for tenant-scoped data; global platform/reference tables are instead protected by removal of direct Data API grants and backend-only access.

## 3. R1-A.2 — Public exposure revoked

Applied to the live canonical Supabase database:

- revoked all table privileges from `anon` and `authenticated` on all 15 tables;
- additionally revoked `PUBLIC` privileges as defense-in-depth;
- revoked application/runtime access to `alembic_version` from `orchestree_app` and `service_role`.

Before remediation, the live grants showed broad SELECT/INSERT/UPDATE/DELETE/TRUNCATE/etc. privileges for `anon` and `authenticated`. After remediation, `SET ROLE anon; SELECT ... FROM public.roles` fails with PostgreSQL permission denied.

## 4. R1-A.3 — Precise RLS/FORCE remediation

`public.workflow_nodes` now has:

- RLS enabled;
- FORCE RLS enabled;
- explicit `workflow_nodes_tenant_isolation` policy for `orchestree_app`;
- SELECT/INSERT/UPDATE/DELETE constrained by parent `workflow_definitions.tenant_id`;
- tenant context sourced only from `current_setting('app.tenant_id', true)`;
- absent/empty tenant context therefore matches no tenant UUID.

`workflow_nodes` has no `tenant_id` column, so deriving scope from its parent is the precise tenant-isolation pattern.

## 5. R1-A.4 — SECURITY DEFINER hardening

Hardened:

- `fn_board_visible_to_membership(uuid, uuid)`
- `fn_task_visible_to_membership(uuid, uuid)`
- `rls_auto_enable()`

Changes:

1. revoked EXECUTE from `PUBLIC`, `anon`, and `authenticated`;
2. granted the two visibility helpers only to `orchestree_app`;
3. set `search_path = pg_catalog, public` on the two visibility helpers;
4. retained `rls_auto_enable()` with `search_path = pg_catalog` and no API-role EXECUTE grant.

Also hardened `validate_blueprint_recommended_tools()` with `search_path = pg_catalog, public`.

Post-remediation Security Advisor no longer reports the previous SECURITY DEFINER execution findings and no longer reports mutable search_path for these functions.

## 6. R1-A.5 — Runtime role discipline verification

Live database verification proves:

- `orchestree_app` can be explicitly selected as the application role;
- `orchestree_app` is not superuser and has `rolbypassrls=false`;
- `service_role` remains an RLS-bypass role and therefore must not be used for tenant queries;
- a transaction with no `app.tenant_id` returns **0** rows from `tenant_memberships`;
- tenant context limits `tenant_memberships` to the active tenant.

The PRD contract requires backend transactions to set `app.tenant_id`, `app.user_id`, and `app.actor_type` locally at transaction start. Database-level verification confirms the intended role/GUC isolation behavior.

A complete source-level proof of every SQLAlchemy call site avoiding `service_role` remains an application-runtime audit item; it cannot be proven solely from the database connector.

## 7. R1-A.6 — Live cross-tenant isolation test

Real tenants were used:

- Tenant A: `10e75d63-15f8-42e8-a6ce-24fece12cd04`
- Tenant B: `88f0e51b-6e90-4797-b7ef-b127dceb40c3`

| Test | Result |
|---|---:|
| `orchestree_app` without tenant GUC → tenant rows | **0** |
| Tenant A context → A membership row visible | **1** |
| Tenant B context → A membership row visible | **0** |
| Tenant B context → UPDATE against A membership row | **0 rows affected** |
| Tenant A/B context → workflow child rows | **0** for both currently populated contexts; no cross-tenant visibility observed |
| `anon` direct SELECT on `roles` after revocation | **permission denied** |

The write test was a no-op update (`created_at = created_at`) and was rolled back, so no production row was changed.

**Result:** the tested database-level isolation suite is **GREEN**. This does not claim exhaustive REST/Realtime/Storage/MCP E2E coverage.

## 8. Current Security Advisor state

After remediation:

- the original **15 RLS-disabled public tables are no longer reported**;
- previous SECURITY DEFINER exposure findings are no longer reported;
- mutable `search_path` for the remediated functions is no longer reported;
- the separate **14 RLS-enabled/no-policy** informational findings remain and were intentionally not mass-patched;
- `pg_trgm` in `public` remains a warning;
- leaked password protection remains a warning.

## 9. Versioned implementation record

Live database changes were applied through Supabase migrations:

- `r1_a_public_reference_access_hardening_20261001`
- `r1_a_rls_security_definer_hardening_20261001`
- `r1_a_function_search_path_hardening_20261001`

Repository migration added:

- `apps/backend/alembic/versions/0062_r1_a_database_security_hardening.py`

The repository migration is intentionally security-preserving on downgrade: it never restores public Data API grants and never disables RLS on the tenant-derived workflow table.

## 10. R1-A final disposition

**R1-A.1 → R1-A.6: COMPLETED for the defined database-security scope.**

### Completed
- [x] 15-table classification
- [x] revoke anon/authenticated/public table exposure
- [x] precise RLS + FORCE for tenant-derived `workflow_nodes`
- [x] SECURITY DEFINER execution/search_path hardening
- [x] live `orchestree_app` fail-closed verification
- [x] live cross-tenant read/write isolation tests
- [x] post-remediation Security Advisor verification

### Remaining outside the completed R1-A database mutation scope
- [ ] classify/remediate the separate 14 RLS-enabled/no-policy informational tables
- [ ] complete source-level proof that no application tenant query uses `service_role`
- [ ] REST/Realtime/Storage/MCP end-to-end isolation suite
- [ ] review nullable/global-read semantics on `workflow_definitions`
- [ ] separately evaluate `pg_trgm` schema placement
- [ ] separately enable Supabase leaked-password protection

**Conclusion:** R1-A has moved from audit-only to an evidence-backed remediation state. The critical 15-table public exposure has been removed, tenant-derived workflow children are protected with FORCE RLS, SECURITY DEFINER surfaces are narrowed, and live database-level cross-tenant isolation tests pass for the tested real tenants. No fallback datastore or alternative database was introduced.
