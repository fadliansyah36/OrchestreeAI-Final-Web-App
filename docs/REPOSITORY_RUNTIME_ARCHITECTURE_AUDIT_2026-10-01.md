# OrchestreeAI — Repository State, Architecture/Runtime Inventory, Gap Matrix & Refactoring Sequence

Date: 2026-10-01
Branch: main
HEAD: e72916fcbf922f78b803790f39c6de38d7d70b29
Baseline rollback branch: baseline/phase-00-2026-09-29 (immutable; not modified by this audit)

## 1. Audit basis

Binding sources:
- Root AGENTS.md in this repository.
- OrchestreeAI Master PRD & Design System v2.2 (FINAL, TERPADU).
- Existing implementation, migrations, CI gates, and current GitHub Actions state.

Non-negotiable rules applied:
- Python 3.12 + FastAPI backend.
- Supabase PostgreSQL + pgvector as persistent source of truth.
- Supabase Auth/JWKS + MFA.
- One canonical authorize() PDP.
- One canonical Orchestration Core.
- One canonical Model Router.
- MCP/tool execution through governed gateway.
- Real Data only; no dummy/mock/simulation/placeholder/hardcoded production state.
- Frontend is not a security boundary.
- Tenant ID/user ID supplied by browser is not trusted.
- Security failures fail closed.
- Feature completion requires real persistence, API, authorization, business logic, orchestration, tests, security tests, responsive/UI verification, and repository hygiene.

## 2. Repository state

Current monorepo is structurally present and is no longer the former root Vite runtime:
- 683 tracked tree entries reported by the Git tree API: 516 files + 167 directories.
- apps/backend: 481 files.
- apps/client: 129 files.
- apps/admin: 51 files.
- packages: 35 files.
- Shared packages present: api-types, design-tokens, ui.
- Backend uses FastAPI/SQLAlchemy/Alembic.
- Client/admin use Next.js App Router.
- Backend exposes 35 API Python modules under app/api/v1.
- 19 real backend domain packages are present.
- 8 backend skill packages are present.
- Client currently has 11 App Router page entries.
- Admin currently has 6 App Router page entries.

The architecture shape is therefore substantially present, but the inventory below shows that structural presence must not be treated as functional/verified implementation.

## 3. Runtime topology observed

Canonical-looking path:
PWA client/admin
→ FastAPI /api/v1
→ Supabase Auth context
→ authorize()/PDP
→ domain/service
→ Orchestration Core
→ Model Router / MCP registry
→ Supabase/Postgres state
→ UI response

Observed deviations/bypass risks:
1. Several client pages still read auth/tenant state from localStorage.
2. Admin analytics still treats localStorage token + localStorage MFA as an authentication decision.
3. Some backend endpoints construct authorization SubjectContext from client-supplied tenant/user/role headers or request payload instead of using the verified AuthenticatedTenantContext.
4. Orchestration currently contains legacy header-derived role/capability/MFA handling.
5. Chat uses client-supplied tenant_id and x-user-id to build its PDP subject.
6. Some UI error paths fabricate successful business outcomes instead of surfacing a real failure/unavailable state.
7. Admin overview contains hardcoded fallback KPI values.
8. Home Overview contains hardcoded check-in state/time and a fabricated orchestration success message on request failure.
9. Service-worker behavior differs between client and admin; client navigation is network-only while admin navigation can cache/fallback personalized HTML.
10. A tracked storage_data tree exists both at root and under apps/backend, including PNG/TXT artifacts and tenant_default data.
11. apps/admin/tsconfig.tsbuildinfo is tracked repository output.
12. app/authz is the active PDP implementation; apps/backend/orchestree/core/authz is currently a thin re-export. Similar re-export/shadow trees exist for orchestration and model_router. This is not a second runtime today, but it is architectural duplication that can become a shadow implementation.

## 4. Security/runtime findings

### CRITICAL — S1: Browser-derived tenant/user identity still reaches authorization paths
Evidence:
- apps/client/app/overview/page.tsx reads orchestree_active_tenant and an auth token from localStorage.
- apps/client/app/workforce/agents/new/page.tsx reads active tenant from localStorage.
- apps/client/app/sales/page.tsx reads active tenant from localStorage.
- apps/admin/app/admin/analytics/page.tsx accepts localStorage token + localStorage MFA as its UI auth state.
- apps/backend/app/api/v1/orchestration.py accepts X-User-Id, X-User-Roles, X-User-Capabilities and X-MFA-Verified and merges them into the authorization subject.
- apps/backend/app/api/v1/chat.py accepts tenant_id in the request and x-user-id in a header, then builds SubjectContext from those values.

Required correction:
Verified Supabase session context must be the sole source for user, tenant, roles, capabilities and MFA. Request tenant IDs may only be selectors and must be checked against the verified membership context. Browser role/MFA headers must be removed from production authorization logic.

### HIGH — S2: Real-data violations / fabricated state
Evidence:
- apps/backend/app/api/v1/admin_overview.py hardcodes provider/tool KPI totals and returns hardcoded fallback values after DB errors.
- apps/client/components/workforce/HomeOverviewScreen.tsx initializes check-in state as true and check-in time as 08:02.
- Home Overview returns a fabricated success-style orchestration message when the API fails.
- apps/client/components/landing/AuthModalCard.tsx synthesizes login payload fields such as legal_name/display_name/membership_id instead of obtaining the authoritative tenant/membership record.

Required correction:
Every unavailable dependency must produce a real state such as NOT_CONFIGURED, UNAVAILABLE, FAILED, WAITING_DEPENDENCY, WAITING_APPROVAL, or EmptyState. No fabricated success, sample KPI, or placeholder entity.

### HIGH — S3: Tracked runtime/storage artifacts
The repository contains storage_data artifacts and tenant_default document data, including binary PNG files. This conflicts with the repository hygiene and Real Data rules unless these files are explicitly part of the approved persistent storage implementation. Persistent domain storage must be Supabase Storage/Postgres, not repository-local runtime artifacts.

Required correction:
Trace every storage_data reference. If it is runtime-local persistence or test/demo material, remove it from the production repository and move storage to the canonical Supabase layer. Do not delete blindly before reference tracing.

### HIGH — S4: CI security gate currently fails before the substantive Phase 02 tests
Current Phase 02 GitHub Actions run 36862772483 failed at “Verify forbidden client auth patterns are absent”; all subsequent security/build checks were skipped. The failure is caused by the scanner matching test-only harness strings inside apps/backend/tests/test_auth_security.py (including the intentional test token pattern). The gate must distinguish production code from explicitly test-only security fixtures without weakening the production scanner.

Required correction:
Make the CI pattern gate test-aware without allowlisting production bypasses; then rerun the complete Phase 02 workflow and require all remaining steps to execute.

### HIGH — S5: Model Router stream path bypasses the normal route lifecycle
The canonical Model Router exists at app/core/model_router/router.py, with a re-export under orchestree/core/model_router. However stream_generate() directly invokes provider adapters for streaming and does not clearly pass through the same credit reservation/telemetry/validation lifecycle used by route(). This needs one canonical execution path.

Required correction:
Refactor streaming into the canonical Model Router lifecycle so policy, credit, telemetry, fallback, and output validation remain consistent.

### MEDIUM — S6: Image routing does not exactly match the approved provider chain
Current route() uses openai/gpt-image-2 then gemini for image_generation. The Master PRD specifies GPT-Image-2 priority with NVIDIA NIM/OpenRouter Image fallback; Gemini is the multimodal/long-context path.

Required correction:
Align image provider routing and model registry configuration with the approved PRD contract.

### MEDIUM — S7: Canonical/shadow module duplication
The repository contains both:
- app/authz and orchestree/core/authz
- app/core/orchestration and orchestree/core/orchestration
- app/core/model_router and orchestree/core/model_router
- app/core/security and orchestree/core/security

Current orchestree/core implementations are largely re-exports, so this is not evidence of two active engines. It is nevertheless a shadow-architecture risk.

Required correction:
Keep one canonical implementation under app/core (and app/authz as the single PDP boundary), use orchestree as a compatibility namespace only if required by imports, and add an import-boundary gate preventing implementation duplication.

### MEDIUM — S8: UI does not yet consistently implement the permanent AGENTS dashboard contract
Observed page-level implementations contain raw Tailwind/hex values and standalone page shells. The design-token package exists, but several screens visibly use literal colors such as #0B1220, #0F172A and direct Tailwind color classes. The inventory also needs an explicit verification of Bottom Navigation + OrchNavBar + FeatureHubScreen coverage across every dashboard domain.

Required correction:
Consolidate dashboard shell/navigation/hub patterns around @orchestree/ui and @orchestree/design-tokens, then verify mobile/tablet/desktop and both themes.

### MEDIUM — S9: PWA cache policy is inconsistent
apps/client/public/sw.js deliberately keeps navigation network-only. apps/admin/public/sw.js caches successful navigation responses and can return cached HTML offline. Because admin HTML is personalized, this requires correction to the same privacy boundary: no personalized/authenticated/business HTML caching.

### LOW — S10: Repository hygiene
Tracked apps/admin/tsconfig.tsbuildinfo and storage artifacts violate the stated repository cleanliness rules. Temporary diagnostic workflows are also still present after the Actions binding issue has been resolved; they should be removed after their diagnostic purpose is no longer needed.

## 5. Gap matrix

| Area | Evidence | Current status | Target | Priority |
|---|---|---|---|---|
| Monorepo shape | apps/client/admin/backend + packages | WIRED | VERIFIED | P1 |
| FastAPI backend | apps/backend/app/main.py | WIRED | VERIFIED | P1 |
| Supabase/Postgres runtime | database.py + migrations | WIRED | VERIFIED | P1 |
| Supabase Auth/JWKS | app/core/security + auth API | PARTIAL/WIRED | VERIFIED | P0 |
| Tenant isolation | RLS migrations + tenant_tx | PARTIAL | VERIFIED with cross-tenant tests | P0 |
| Canonical PDP | app/authz/pdp.py | WIRED | VERIFIED | P0 |
| REST PDP coverage | security_ast_scanner.py | AUTOMATED GATE EXISTS | VERIFIED after gate fix | P0 |
| Node PDP | orchestration engine | WIRED | VERIFIED | P0 |
| MCP PDP | scanner/decorators | WIRED | VERIFIED | P0 |
| Orchestration Core | app/core/orchestration | WIRED | FUNCTIONAL/VERIFIED | P1 |
| Model Router | app/core/model_router | WIRED | FUNCTIONAL/VERIFIED | P1 |
| Streaming model path | stream_generate | PARTIAL | CANONICAL | P1 |
| Credit lifecycle | credit_engine/credits + router/chat | WIRED | VERIFIED | P1 |
| Real-data UI | multiple hardcoded fallbacks | FAIL | VERIFIED | P0 |
| Client auth state | localStorage usage | FAIL | VERIFIED | P0 |
| Admin auth state | localStorage MFA/token usage | FAIL | VERIFIED | P0 |
| Admin KPI truth | hardcoded fallback values | FAIL | VERIFIED | P0 |
| PWA privacy cache | client/admin mismatch | PARTIAL | VERIFIED | P1 |
| Design tokens | package exists, raw literals remain | PARTIAL | VERIFIED | P2 |
| Feature Hub/navigation | route/component inventory incomplete against PRD catalog | PARTIAL | VERIFIED | P2 |
| API typed contract | api-types + openapi.json exist | PARTIAL | GENERATED/DRIFT-GATED | P2 |
| Storage hygiene | tracked storage_data | FAIL | CLEAN | P0 |
| Repository hygiene | tracked tsbuildinfo + diagnostic workflows | PARTIAL | CLEAN | P2 |
| CI | Actions runner works; Phase 02 gate currently fails early | BLOCKED | GREEN | P0 |

## 6. Refactoring sequence

### R0 — Freeze evidence / establish audit baseline
- Keep baseline/phase-00-2026-09-29 immutable.
- Preserve current main HEAD as audit reference.
- Record current workflow failure and tree inventory.
- No architecture replacement.

### R1 — Security identity/perimeter consolidation (P0)
1. Make AuthenticatedTenantContext authoritative everywhere.
2. Remove production trust in x-user-id, x-user-roles, x-user-capabilities, x-mfa-verified.
3. Remove request-body tenant identity as an authorization authority.
4. Add cross-tenant negative tests for every tenant-scoped high-risk endpoint family.
5. Make client/admin route guards call the backend session endpoint; never localStorage token/MFA.
6. Re-run AST security gate.

Acceptance: forged tenant/user/role/MFA headers cannot alter authorization; unauthenticated/incorrect-tenant access fails closed.

### R2 — Real Data hardening (P0)
1. Remove hardcoded KPI fallback values.
2. Remove fabricated AI/task success messages.
3. Remove hardcoded check-in state/time.
4. Replace all synthetic tenant registration payloads with authoritative session/tenant/membership data.
5. Standardize EmptyState/NotConnected/Unavailable/Failed states.

Acceptance: stopping a dependency produces an explicit real failure state, never fake business data.

### R3 — Storage and persistence cleanup (P0)
1. Trace all storage_data references.
2. Move approved persistence to Supabase Storage/Postgres.
3. Remove repository-local artifacts and tenant_default data if not canonical source data.
4. Add CI gate against runtime-local business storage.

Acceptance: no production business entity or artifact is persisted in repository-local storage.

### R4 — Canonical runtime consolidation (P1)
1. Keep app/core as implementation source.
2. Keep orchestree/* only as explicit compatibility re-exports where needed.
3. Add import-linter rules preventing implementation duplication.
4. Consolidate orchestration and Model Router lifecycle.
5. Remove any second/shadow execution path.

Acceptance: exactly one executable Orchestration Core, one PDP, one Model Router.

### R5 — Model/Orchestration execution integrity (P1)
1. Canonicalize streaming through Model Router policy/credit/telemetry.
2. Align image provider chain with PRD.
3. Ensure every workflow node performs capability gate → authorize → input validation → credit reserve → execution → output/risk validation → checkpoint → audit/event → consume/refund.
4. Verify real provider probes and real workflow intent → task → delivery.

Acceptance: first end-to-end workflow succeeds against real dependencies, and failure states remain truthful.

### R6 — Frontend runtime realization (P1/P2)
1. Build a single authenticated API client using cookie session.
2. Remove localStorage auth/tenant authority.
3. Make Home Overview entirely backend-driven.
4. Implement canonical App Shell, Bottom Navigation, OrchNavBar and FeatureHubScreen.
5. Register every implemented domain in navigation with real feature_capabilities.
6. Enforce design tokens and both themes.
7. Test 375/768/1280 widths.

Acceptance: every visible business action has UI → API → auth → authorize → service/domain → DB/engine → response → UI state.

### R7 — API contract and domain verification (P2)
1. Generate typed frontend contracts from canonical OpenAPI.
2. Detect OpenAPI drift in CI.
3. Verify each feature against PRD catalog and domain acceptance criteria.
4. Add E2E coverage for critical flows.

### R8 — PWA/security/repository hygiene (P2)
1. Align client/admin service-worker privacy boundaries.
2. Remove tracked build outputs.
3. Remove obsolete diagnostic workflows once their purpose is complete.
4. Add suspicious-file CI enforcement.

### R9 — Full runtime acceptance / production readiness (P0 release gate)
- Real Supabase data.
- Real provider probes.
- Real credit ledger.
- Real workflow execution.
- Tenant isolation tests.
- Security tests.
- UI responsive/theme tests.
- Content/perimeter/import gates.
- Backend/client/admin production builds.
- No dummy/mock/simulation/placeholder production state.
- Evidence captured before marking any domain VERIFIED.

## 7. Execution rule for the next pass

Do not start by rewriting the UI or adding new features.

The next implementation pass must start at R1 (identity/perimeter), because the current runtime still contains browser-authority paths. R2 and R3 follow immediately because fake state and repository-local artifacts violate the Real Data contract. Only after those gates are green should R4–R6 activate/refactor the orchestration and UI at scale.

Status of this audit:
AUDIT BASELINE COMPLETE.
ARCHITECTURE REFACTORING: NOT YET APPLIED IN THIS AUDIT COMMIT.
NEXT EXECUTION: R1 Security Identity/Perimeter Consolidation.
