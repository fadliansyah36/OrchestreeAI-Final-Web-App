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

1. Home Hub now reads workspace identity from useAuthSession.
2. Home Hub shows loading, authenticated workspace, and unauthenticated states explicitly.
3. Home Hub category cards cover the currently exposed domain routes.
4. Enterprise card no longer uses a client-side lock; entitlement remains a server/backend concern.
5. Route CI gate now verifies all Home Hub target routes: `/`, `/overview`, `/workforce`, `/sales-marketing`, `/intelligence`, `/enterprise`, `/generative`, `/selection`, `/billing`, `/inbox`, `/omnichannel`, `/proactive`, `/integrations`, `/permissions`, `/settings`.
6. Overview was replaced with a truthful real-data aggregation using existing domain endpoints for departments, staff, agents, and billing wallet. Missing/unavailable data is displayed as unavailable, never synthesized.
7. Workforce role simulation and forged authorization headers were removed.
8. HomeOverview Ask AI no longer reports fabricated success when orchestration fails.

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
