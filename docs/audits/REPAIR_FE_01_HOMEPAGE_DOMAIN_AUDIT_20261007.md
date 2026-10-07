# REPAIR-FE-01 — Homepage / Feature Domain Audit — 2026-10-07

## Scope

Audit and repair of the authenticated application Home/Feature Hub and the domain routes reachable from it.

Canonical sources:
- Final Web PWA PRD v2.2
- Master Continue Context 2026-10-06
- Existing repository architecture and domain screens

## Findings

### Homepage / Feature Hub
- Existing Home Hub rendered hard-coded workspace identity ("Workspace Utama").
- Analytics and recommendations were static empty/fallback presentation rather than a real workspace context.
- Enterprise was represented as UI-locked without the client having authoritative entitlement data.
- Several implemented domain screens were not reachable because their routes were missing.

### Overview
- Existing HomeOverviewScreen referenced `/performance/*` endpoints that are not mounted by the canonical backend `app.main`.
- Its Ask AI failure path fabricated a confirmation/success-like response.
- The route therefore could not be treated as a reliable operational overview.

### Workforce
- WorkforceHubScreen exposed a client-side role simulator and sent X-User-Role, X-User-Id, and X-Tenant-Id headers.
- These headers must not be an authority source for browser authorization.
- The repair removes the simulation controls and client-supplied authorization headers. The backend/session remains the authority.

## Implemented

### FE-01 Home / Route Foundation
- Added a shared `ClientAppShell` mounted from the canonical Next.js root layout.
- App shell now owns the full navigation drawer, mobile bottom navigation, theme toggle, workspace identity, and active-route state.
- Bottom navigation is limited to active routes: Home, Work, Overview, Activity, Account.
- Full navigation normalizes route paths and marks domain entries whose route does not exist in the current App Router as `Belum tersedia` instead of navigating to a 404.
- Feature Hub now groups modules by domain section and uses the canonical design-token CSS variables for surface, text, border, radius, and elevation.
- Shared `ClientDomainRoute` standardizes loading/authentication/error framing for domain pages.
- Selection, Billing, Inbox, Omnichannel, Permissions, Generative, Workforce, Sales/Marketing, Intelligence, Enterprise, Integrations, Settings, and Proactive no longer use `orchestree_active_tenant` localStorage as tenant authority.
- Domain pages now consume the existing server-backed `useAuthSession` context.
- The browser never selects a tenant by localStorage for these routes.

1. Home Hub now reads workspace identity from useAuthSession.
2. Home Hub shows loading, authenticated workspace, and unauthenticated states explicitly.
3. Home Hub category cards cover the currently exposed domain routes.
4. Enterprise card no longer uses a client-side lock; entitlement remains a server/backend concern.
5. Route CI gate now verifies all Home Hub target routes: `/`, `/overview`, `/workforce`, `/sales-marketing`, `/intelligence`, `/enterprise`, `/generative`, `/selection`, `/billing`, `/inbox`, `/omnichannel`, `/proactive`, `/integrations`, `/permissions`, `/settings`.
6. Overview was replaced with a truthful real-data aggregation using existing domain endpoints for departments, staff, and agents. Billing wallet is intentionally not queried from the browser because the current billing endpoint still requires a separate authenticated server-context repair. Missing/unavailable data is displayed as unavailable, never synthesized.
7. Workforce role simulation and forged authorization headers were removed.
8. HomeOverview Ask AI no longer reports fabricated success when orchestration fails.
9. Fixed the pre-existing Generative Studio JSX structure error in the canonical server-side model-router gateway block so the client build can proceed.

## Supabase

No schema or migration change was required for this frontend/domain repair.
Live canonical project verified: `OrchestreeDB-Web-PWA` / `szvbcvmvrucqxfikgjlx`.

## Railway

No manual production deployment was performed from this branch.
Canonical production remains `creative-sparkle` / `@orchestree/client`.
Deployment must follow merge to `main`.

## Acceptance

Not GREEN until:
1. Client Build & Route Gate succeeds.
2. PR #14 is merged.
3. Railway client deployment from the merged main commit succeeds.
4. Production UI and target routes are visually/runtime verified.
5. Authenticated domain data is verified separately once the parked Auth blocker is resumed.

Auth is intentionally parked and is not being used as a reason to fabricate domain success.

Allpha Universe is out of scope and was not touched.

## FE-01A — TypeScript / Frontend Build Repair

The first Client Build & Route Gate run against the FE-01 merge ref exposed three TypeScript errors after the UI foundation changes:
- `apps/client/app/overview/page.tsx`: stale `walletAvailable` property not present in `CountState`.
- `apps/client/components/workforce/WorkforceHubScreen.tsx`: two stale `testRole` references remained after removal of the client-side role simulator.

Repairs applied:
- Removed the stale `walletAvailable` field from the `CountState` initialization.
- Derived `userRole` from the authenticated `TenantRegistrationResponse.role` and replaced the stale `testRole` references. No role simulation was restored.

Acceptance remains pending the next GitHub Client Build & Route Gate run. The build gate also now supplies the same canonical public Railway API endpoint required by `apps/client/next.config.mjs`, matching the configured `BACKEND_API_URL` / `NEXT_PUBLIC_BACKEND_API_URL` variables on the production client service. No Supabase schema change is required and no Railway deployment is performed before merge.


## REPAIR-FE-01B — Production UI/UX Runtime Verification & Landing/Homepage Activation

PR #14 has been merged to `main` after FE-01A Client Build & Route Gate passed. Railway production auto-deployment was observed for `@orchestree/client`; deployment `fdb00177-2d4d-4d65-a9b1-04c2bce4f799` was BUILDING at verification time. Production visual verification could not yet be accepted while the deployment was still building, and no browser screenshot evidence is being fabricated. The canonical production service remains bound to the canonical repository/main branch and the expected public backend variables are present. Final FE-01B acceptance remains pending deployment SUCCESS plus runtime/visual verification at 375px, 768px, and 1280px.
