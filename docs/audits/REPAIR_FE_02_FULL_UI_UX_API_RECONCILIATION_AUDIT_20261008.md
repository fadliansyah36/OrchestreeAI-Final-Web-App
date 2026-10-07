# REPAIR-FE-02 — Full UI/UX + API Integration Reconciliation Audit

Audit date: 2026-10-08
Status: AUDIT COMPLETE — IMPLEMENTATION NOT STARTED
Repository: urbanrealty36-ops/OrchestreeAI-Final-Web-App-1
Audited branch: main
Audit branch: repair/FE-02-full-ui-api-reconciliation-audit
Supabase: OrchestreeDB-Web-PWA / szvbcvmvrucqxfikgjlx
Railway: creative-sparkle / production

## 1. Mandate

Rule: EXISTING UI/UX -> INSPECT -> PRESERVE -> REPAIR -> CONNECT -> ACTIVATE.
No wholesale redesign is authorized by this phase.
The canonical product has two distinct experiences: Public Homepage before login, and Authenticated App Shell after login. Root AGENTS.md explicitly protects the public landing page from being replaced by the dashboard.

## 2. Audit scope

Inspected Client routes/layout/PWA/middleware/session/landing/HomeOverview/domain hubs; shared UI and design tokens; Admin session/hubs/analytics; FastAPI router registration and OpenAPI baseline; live Supabase tables/migrations/security advisor; FE-01/FE-01B history; and the diverged API integration branch.

## 3. P0 findings

### FE-02-P0-01 — Root route collision

The repository contains both apps/client/app/page.tsx and apps/client/app/(public)/page.tsx. Both resolve to /. The former renders authenticated Workspace Overview/Feature Hub; the latter renders PublicLandingScreen.

This conflicts with the canonical information architecture. The existing PublicLandingScreen must remain the public / route. The authenticated workspace must have a distinct authenticated entry, using the existing /overview and appropriate authenticated route composition.

### FE-02-P0-02 — Public landing is wrapped by ClientAppShell

apps/client/app/layout.tsx mounts ClientAppShell around children, so the public route inherits dashboard shell behavior. This conflicts with AGENTS.md, which excludes public landing from dashboard shell rules.

Required: separate public layout from authenticated app layout without deleting or redesigning existing landing components.

## 4. P1 UI findings

### Existing Public Landing is substantial and must be preserved

PublicLandingScreen already composes LandingHeader, HeroSection, ProductPillarsSection, ProblemSolutionSection, HowItWorksSteps, UseCasesSection, SecurityTrustSection, PricingSection, FaqSection, FooterCtaSection, ProspectRegistrationModal and AuthModalCard.

Hero already contains the canonical positioning and CTAs. Pricing already consumes real backend public endpoints. Disposition: PRESERVE, then repair route boundary, transport, tokens and runtime behavior.

### Existing HomeOverviewScreen is richer than current root Home

HomeOverviewScreen already contains performance overview, KPI summary, trend data, leaderboard, human/AI filtering, alerts, Ask AI, voice input and audit/detail interactions. It reads a real performance endpoint.

Current apps/client/app/page.tsx instead renders a smaller FeatureHubScreen workspace context plus an empty insight state. Disposition: RESTORE/ACTIVATE the existing HomeOverviewScreen for authenticated Home/Overview. FeatureHubScreen remains a shared Hub pattern, not a replacement for Home Overview.

### Shared navigation

FeatureHubScreen, OrchNavBar and OrchBottomNav are existing reusable components and should remain canonical. ClientAppShell is an FE-01 addition and must be reconciled so it does not govern public landing.

## 5. Design system findings

packages/design-tokens already defines canonical colors, radius, shadow, spacing and typography. Shared Hub components use token variables, but public landing components still contain direct visual constants. Disposition: preserve visual appearance and progressively bind existing values to canonical tokens; do not redesign.

## 6. API transport findings

Canonical architecture is correct: Client/Admin -> Next rewrite -> FastAPI -> domain/service -> Supabase.
Both Next configs rewrite /api/* to FastAPI. packages/api-types exists and is based on backend OpenAPI. packages/api-client exists and is already adopted by several components.

API client issue: rawRequest() already throws for non-2xx and request() repeats the same check. This is redundant and should be cleaned without changing behavior.

API integration is incomplete across the component estate. Direct fetch calls must be classified before migration. REST calls can use apiClient; SSE, WebSocket, FormData/upload and Blob/download flows must retain their required transport semantics.

## 7. Backend inventory

FastAPI main.py registers canonical routers for health, auth, tenant, onboarding, public, workforce, kanban/attendance, orchestration, learning, billing, proactive, chat, memory, intelligence, integrations, prospects, omnichannel, commerce, CRM, marketing, service, sales, selection, generative, enterprise, permissions, token optimization, agent catalog, storage, admin, collaboration, analytics and cognitive monitoring.

No second backend should be introduced.

Landing public endpoints already used by the existing PricingSection:
- GET /public/subscription-plans
- GET /public/plan-facility-matrix

Existing Client/Admin components already use real workforce, intelligence, generative, integrations, admin overview and analytics endpoints. The next wave is reconciliation, not creation of duplicate APIs.

## 8. Live Supabase reconciliation

Canonical Supabase was inspected read-only. No migration or schema change was performed.

Live schema contains real persistence targets for tenants/memberships, workforce, tasks, workflow executions, credits/billing, notifications, memory, performance, competitor intelligence, integrations, customers/conversations/leads, commerce, selection, generative jobs/artifacts, enterprise context, analytics, onboarding, agent catalog, prompt library and proactive collaboration.

Security advisor currently reports 14 tables with RLS disabled, including roles, role_permissions, subscription_plans, feature_capabilities, llm_providers, llm_models, mcp_tools, tool_health_checks, alembic_version, ai_structural_roles, job_levels, ai_job_titles, job_subtitles and job_title_mapping_rules.

This is a known security-wave issue and is outside FE-02 implementation. Do not auto-enable RLS without policies. Advisor also reports RLS-enabled tables without policies, pg_trgm in public, and leaked-password protection disabled. These remain backlog evidence.

## 9. PWA

manifest.json and sw.js exist. The service worker keeps API, health, public API, WebSocket, OpenAPI and navigation network-only. Because / currently has public/authenticated ambiguity, PWA root behavior must be revalidated after route repair.

## 10. FE-01 / FE-01B reconciliation

FE-01/FE-01B established useful Tailwind, route and App Router foundations, but the homepage composition was changed substantially.

Conclusion: FE-01 is a technical foundation, not the final UI/UX baseline. PublicLandingScreen and HomeOverviewScreen are canonical existing assets that must be reconciled rather than replaced.

The branch repair/frontend-api-component-integration-01 is diverged from main: 15 commits ahead, 1 behind. Do not merge it wholesale. Selectively reconcile its transport changes after this audit.

## 11. Priority matrix

| ID | Finding | Priority | Action |
|---|---|---:|---|
| FE-02-P0-01 | Duplicate root / public vs app | P0 | Repair route ownership |
| FE-02-P0-02 | Public landing wrapped by app shell | P0 | Separate public/app layouts |
| FE-02-P1-03 | Existing HomeOverview richer than root Home | P1 | Restore/activate |
| FE-02-P1-04 | Landing UX already substantial | P1 | Preserve |
| FE-02-P1-05 | Landing visual literals | P1 | Token reconciliation |
| FE-02-API-01 | FastAPI centralized transport | GOOD | Preserve |
| FE-02-API-02 | API client partial adoption | P1 | Complete selective integration |
| FE-02-API-03 | Redundant API-client error check | P2 | Cleanup |
| FE-02-API-04 | OpenAPI contract pipeline | P1 | Enforce |
| FE-02-P1-PWA | Root PWA affected by route ambiguity | P1 | Reverify |

## 12. Next implementation waves

REPAIR-FE-03 — Public Landing Restoration & Route Boundary.
REPAIR-FE-04 — Existing Component API Integration.
REPAIR-FE-05 — Authenticated Home/HomeOverview Activation.
REPAIR-FE-06 — Domain Component Connectivity.
REPAIR-FE-07 — Admin Integration Reconciliation.
REPAIR-FE-08 — Realtime/WebSocket/SSE activation.
REPAIR-FE-09 — UI state completion.
REPAIR-FE-10 — Responsive/PWA runtime verification.

## 13. Acceptance

- Canonical repo locked: YES.
- Main baseline inspected: YES.
- AGENTS.md inspected: YES.
- Canonical PRD reconciled: YES.
- Public landing inspected: YES.
- Authenticated Home inspected: YES.
- Shared UI inspected: YES.
- Backend/OpenAPI inspected: YES.
- Live Supabase inspected read-only: YES.
- Migrations inspected read-only: YES.
- Security advisor inspected: YES.
- FE-01/FE-01B history considered: YES.
- API integration branch compared: YES.
- UI implementation: NO, intentionally deferred.
- Supabase migration: NONE.
- Authenticated E2E: DEFERRED per user instruction.

REPAIR-FE-02 = AUDIT COMPLETE.
Product is NOT declared GREEN.
Immediate next phase: REPAIR-FE-03 — Public Landing Restoration & Route Boundary.
Allpha Universe is completely out of scope and was not inspected, modified, merged or deployed.