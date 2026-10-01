# R1-A — Database Security & Tenant Isolation Audit
## OrchestreeAI Web PWA — 2026-10-01

**Repository:** `fadliansyah36/OrchestreeAI-Final-Web-App`  
**Canonical Supabase:** `OrchestreeDB-Web-PWA` (`szvbcvmvrucqxfikgjlx`)  
**Scope:** database security, RLS, tenant isolation, database roles/grants, security-definer functions, and alignment with AGENTS.md + PRD v2.2.  
**Change policy:** audit-only. No production database mutation was applied during R1-A.

## 1. Binding requirements

The PRD requires:
- PostgreSQL/Supabase as the single OLTP source of truth.
- Tenant data isolated by RLS.
- Tenant queries through `orchestree_app`, with `NOBYPASSRLS` and `FORCE ROW LEVEL SECURITY`.
- Backend transaction context sets `app.tenant_id`, `app.user_id`, `app.actor_type`.
- Supabase `service_role` bypassing RLS is restricted to Auth Admin API/Storage admin operations and must not be used for tenant data queries.
- Frontend must not read application tables directly.
- Cross-tenant operations must use narrow audited security-definer functions.
- A single `authorize()` PDP remains mandatory at REST, workflow-node, and MCP-tool layers.

AGENTS.md independently requires Supabase Postgres, no fallback datastore, and truthful completion reporting.

## 2. Canonical database identity

Live integration verification identifies `OrchestreeDB-Web-PWA` as the intended Web PWA database:
- Project ref: `szvbcvmvrucqxfikgjlx`
- Region: `ap-southeast-2`
- Status: ACTIVE_HEALTHY
- PostgreSQL: 17.6.1.166

The database is populated with real application state; this is not an empty/bootstrap-only database.

## 3. Tenant isolation baseline

The database contains broad RLS coverage. Representative tenant-critical tables such as:
- `tenants`
- `tenant_memberships`
- `ai_agents`
- `tasks`
- `conversations`
- `memory_documents`
- `workflow_executions`
- `tenant_credit_wallet`
- `tenant_credit_transactions`

have RLS enabled and, for the inspected tenant tables, FORCE RLS is enabled.

The live database also contains four tenants and six tenant memberships, so isolation must be evaluated against real multi-tenant state rather than an empty database.

## 4. Critical RLS exposure

Supabase Security Advisor currently reports **15 public tables with RLS disabled**:

`roles`, `role_permissions`, `subscription_plans`, `feature_capabilities`, `llm_providers`, `llm_models`, `mcp_tools`, `tool_health_checks`, `workflow_nodes`, `alembic_version`, `ai_structural_roles`, `job_levels`, `ai_job_titles`, `job_subtitles`, `job_title_mapping_rules`.

This is a **critical security finding** because the current grants expose these tables to both `anon` and `authenticated`. The inspected grant metadata shows broad SELECT/INSERT/UPDATE/DELETE/TRUNCATE/etc. privileges, not merely read access.

This does not mean every table should receive the same tenant policy. Several are reference/catalog/system tables and need different access semantics. Therefore the generic Supabase remediation SQL was **not executed**.

## 5. RLS-enabled tables without policies

Security Advisor reports 14 RLS-enabled public tables with no policy, including:
- audit partitions
- `auth_revoked_tokens`
- credit factor/reference tables
- `plan_facility_catalog`
- `plan_facility_matrix`
- `platform_analytics_daily_rollup`
- `selection_domain_categories`
- `audit_logs_2026_09`, `audit_logs_2026_10`, `audit_logs_default`

These require policy-intent classification. Some may be backend-only/system tables and should not receive a broad client policy merely to silence the advisor.

## 6. Security-definer and function findings

The live database has three SECURITY DEFINER functions executable by both anon and authenticated:
- `fn_board_visible_to_membership(uuid, uuid)`
- `fn_task_visible_to_membership(uuid, uuid)`
- `rls_auto_enable()`

The first two are potentially legitimate narrow visibility helpers, but their execution surface must be restricted and their `search_path` hardened.

Security Advisor also reports mutable search_path for:
- `validate_blueprint_recommended_tools`
- `fn_board_visible_to_membership`
- `fn_task_visible_to_membership`

`rls_auto_enable()` already declares `search_path=pg_catalog`.

## 7. Database roles

Live role inspection confirms:
- `orchestree_app`: login-capable, NOT superuser, `rolbypassrls=false`
- `service_role`: `rolbypassrls=true`
- `postgres`: `rolbypassrls=true`
- `anon` and `authenticated`: `rolbypassrls=false`

This is aligned with the intended principle that the application role must not bypass RLS. The remaining audit requirement is to prove all tenant runtime paths actually use this role/context and that service_role is not used for tenant data queries.

## 8. Policy observations

Inspected policies show the intended `app.tenant_id` context pattern is already used on important tenant tables.

Examples:
- `tenant_memberships`: reads are constrained by authenticated user or `app.tenant_id`; writes require `app.tenant_id`.
- `tenants`: reads are constrained by membership or `app.tenant_id`; writes require `app.tenant_id`.
- `user_roles`: tenant isolation is derived through `tenant_memberships`.
- `workflow_definitions`: tenant policies use `app.tenant_id`.

However, `workflow_definitions` currently has two overlapping policies, one of which permits `tenant_id IS NULL` for reads. This needs explicit review because the PRD requires fail-closed tenant behavior and global/reference workflows must have a clearly defined access path.

## 9. Architecture gap

The database security posture is **mixed**:

**Aligned**
- Real Supabase database is active and populated.
- `orchestree_app` exists and does not bypass RLS.
- Major tenant data has RLS + FORCE RLS.
- `app.tenant_id` is used by existing policies.
- Tenant membership and tenant tables have context-aware policies.

**Not yet compliant**
- 15 public tables remain without RLS.
- Those tables are broadly granted to anon/authenticated.
- 14 RLS-enabled tables have no policies.
- SECURITY DEFINER functions have excessive execution grants.
- Two SECURITY DEFINER visibility helpers have mutable search_path.
- Complete proof of service_role exclusion from all tenant query paths is still required.
- Complete proof that every tenant table has FORCE RLS is still required.
- Cross-tenant negative tests must be executed against the live schema and real tenant IDs.

## 10. R1-A disposition

**R1-A status: AUDIT COMPLETE / REMEDIATION BLOCKED BY POLICY DESIGN**

The critical exposure is confirmed. It is not appropriate to blindly enable RLS on all 15 tables because that can immediately deny legitimate backend/reference access and the tables have different security semantics.

### Required remediation sequence

**R1-A.1 — classify the 15 RLS-disabled tables**
1. Global reference/catalog
2. Backend-only/system metadata
3. Tenant-scoped
4. Workflow-child table inheriting parent tenant scope
5. Migration metadata

For each class, define the exact intended access path before changing RLS.

**R1-A.2 — remove public Data API exposure**
For tables not intended for direct client access, revoke anon/authenticated table privileges and route access through the FastAPI backend.

**R1-A.3 — add precise RLS + policies**
Enable RLS and FORCE RLS where required, then add least-privilege policies. Do not use a generic one-policy-for-all approach.

**R1-A.4 — harden SECURITY DEFINER**
- Revoke direct EXECUTE from anon/authenticated unless explicitly required.
- Restrict visibility helpers to the required caller role/path.
- Set immutable/safe search_path explicitly.
- Ensure functions cannot be used to bypass tenant membership checks.

**R1-A.5 — prove runtime role discipline**
Audit backend SQLAlchemy engine/session creation and all DB access helpers for:
- `orchestree_app`
- no service_role tenant query
- transaction-local `app.tenant_id`
- fail-closed behavior when tenant context is absent.

**R1-A.6 — live cross-tenant isolation suite**
Use two real tenants and verify:
- tenant A cannot SELECT tenant B rows
- tenant A cannot INSERT/UPDATE/DELETE rows under tenant B
- changing `X-Tenant-Id` cannot escape membership
- missing tenant context fails closed
- workflow/node/tool access cannot cross tenant
- memory/conversation/credit data cannot cross tenant
- Super Admin cross-tenant paths are explicit, audited, and capability-gated.

## 11. Important non-action

The Supabase advisor's generic RLS remediation SQL was deliberately **not applied** during R1-A. The advisor itself warns that enabling RLS without policies can block access. Policy design must precede the migration.

## 12. Evidence links

Supabase RLS guidance:
https://supabase.com/docs/guides/database/postgres/row-level-security

Supabase database linter — RLS disabled:
https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

Supabase database linter — RLS enabled without policy:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Supabase database linter — mutable function search_path:
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

Supabase database linter — SECURITY DEFINER executable by anon:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

Supabase database linter — SECURITY DEFINER executable by authenticated:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## 13. Final self-check

- [x] Canonical database is Supabase PostgreSQL.
- [x] No alternative database was introduced or proposed.
- [x] No in-memory datastore was introduced.
- [x] `orchestree_app` exists and does not bypass RLS.
- [x] Live RLS state was inspected.
- [x] Live grants were inspected.
- [x] SECURITY DEFINER execution surface was inspected.
- [ ] All public tables satisfy final RLS/policy requirements.
- [ ] All tenant tables are proven FORCE RLS.
- [ ] Service-role exclusion from tenant runtime is fully proven.
- [ ] Live cross-tenant negative suite is GREEN.
- [ ] R1-A remediation migration applied.

**Conclusion:** R1-A is complete as an evidence-based database security and tenant-isolation audit. The next implementation step is **R1-A.1 policy classification**, followed by a reviewed RLS/grant/function-hardening migration. No database mutation was made during this audit.
