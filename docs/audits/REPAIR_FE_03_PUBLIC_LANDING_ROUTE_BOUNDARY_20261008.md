# REPAIR-FE-03 — Public Landing Restoration & Route Boundary

Date: 2026-10-08
Status: IMPLEMENTATION BRANCH READY FOR CI / PR REVIEW
Repository: urbanrealty36-ops/OrchestreeAI-Final-Web-App-1
Branch: repair/FE-03-public-landing-route-boundary
Base: main @ a7a7811534a2f36d9723c49c78d22d57cfead039

## Mandate

Restore the existing public landing experience at `/` without redesigning it, and prevent the authenticated `ClientAppShell` from wrapping the public route.

Canonical rule:

`Existing PublicLandingScreen -> public /`
`Authenticated routes -> existing ClientAppShell`

## Implemented

1. Removed the duplicate `apps/client/app/page.tsx` root route.
   - The authenticated FeatureHub page no longer competes for `/`.
   - Authenticated workspace remains on its existing routes, including `/overview`.

2. Added `apps/client/app/(public)/layout.tsx`.
   - Explicit public route-group boundary.
   - Contains no dashboard navigation or `ClientAppShell`.
   - Does not replace or redesign any landing component.

3. Added `apps/client/components/ClientRouteBoundary.tsx`.
   - `/` renders children directly.
   - All non-public application routes continue through the existing `ClientAppShell`.
   - Existing shell/navigation components remain unchanged.

4. Updated `apps/client/app/layout.tsx`.
   - Global layout now delegates shell ownership to `ClientRouteBoundary`.
   - Existing `OrchIntlProvider` and `BackendConnectivityGate` remain intact.

5. Extended `.github/workflows/client-build-route-gate.yml`.
   - Verifies root `app/page.tsx` is absent.
   - Verifies public `app/(public)/page.tsx` and its layout exist.
   - Verifies `ClientRouteBoundary.tsx` exists.
   - Fails if the public route group imports/renders `ClientAppShell`.

## Explicitly preserved

- `PublicLandingScreen`
- `LandingHeader`
- `HeroSection`
- `ProductPillarsSection`
- `ProblemSolutionSection`
- `HowItWorksSteps`
- `UseCasesSection`
- `SecurityTrustSection`
- `PricingSection`
- `FaqSection`
- `FooterCtaSection`
- `ProspectRegistrationModal`
- `AuthModalCard`
- Existing authenticated `ClientAppShell`
- Existing `OrchNavBar` / `OrchBottomNav`

No visual redesign was introduced by FE-03.

## Not part of FE-03

- HomeOverview restoration/activation remains REPAIR-FE-05.
- Existing domain API integration remains REPAIR-FE-04/06.
- Authenticated E2E / GREEN remains parked per current instruction.
- Supabase schema/migrations: NONE.
- Railway production deployment: deferred until CI/PR acceptance.

## Acceptance gates

- [x] Duplicate root route removed.
- [x] Existing public landing remains the canonical `/` owner.
- [x] Public route group has no authenticated shell.
- [x] Authenticated routes retain existing shell boundary.
- [x] No Supabase migration.
- [x] No Auth implementation change.
- [x] Client TypeScript/build CI pass (run #55).
- [x] Route manifest verification pass (run #55).
- [ ] Production runtime verification after merge/deploy.

FE-03 should only be merged after the CI gates above pass.


## CI correction

The first FE-03 CI attempt (run #54) correctly passed type-check, build and the new boundary assertions, but the existing route-manifest assertion only accepted `/page`. Next.js emitted the root route under the `/(public)/page` route-group key. The assertion was corrected to accept the canonical public route-group key; run #55 then passed all client build and route checks.
