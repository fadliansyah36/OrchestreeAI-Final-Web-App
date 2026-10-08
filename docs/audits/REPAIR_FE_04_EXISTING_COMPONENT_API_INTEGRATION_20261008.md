# REPAIR-FE-04 — Existing Component API Integration

Date: 2026-10-08

## Status

Implementation branch: `repair/FE-04-existing-component-api-integration`

Scope: continue existing OrchestreeAI UI/UX components and connect their existing HTTP calls through the canonical shared frontend transport:

```
Existing Component
  -> @orchestree/api-client
  -> relative /api/*
  -> Next.js rewrite
  -> FastAPI /api/v1/*
  -> existing domain/service
  -> Supabase PostgreSQL
```

No new UI/UX was created. No existing component was replaced. No authentication flow was changed. No Supabase schema/migration was changed.

## Core transport repair

`packages/api-client/src/index.ts` is the shared transport boundary.

Important semantic correction:
- `apiClient.fetch(...)` preserves native `Response` semantics so existing components can continue using `response.ok`, `response.status`, `response.json()`, streaming `response.body`, multipart `FormData`, and binary/download response handling.
- `apiClient.get/post/patch/put/delete` remain the higher-level error-throwing helpers.
- Browser credentials default to `include`.
- Relative `/api/*` paths remain relative so the existing Next.js rewrite remains the single frontend-to-FastAPI boundary.
- No provider SDK or second backend was introduced.

## Existing surfaces integrated

The following existing surfaces now use `@orchestree/api-client` for their existing HTTP calls:

### Workforce / overview
- `HomeOverviewScreen`
- `apps/client/app/overview/page.tsx`

### Sales / CRM / commerce
- `LeadPipelineScreen`
- `PersonaConfigurationScreen`
- `ProductCatalogScreen`
- `OrderManagementScreen`
- `CampaignBuilderScreen`
- `ServiceRequestScreen`
- `SalesCoachScreen`
- `SalesGuardrailsScreen`
- `RevenueIntelligenceScreen`
- `MessageExperimentScreen`

### Omnichannel
- `OmnichannelInboxScreen`
- `CustomerMergeReviewScreen`
- `ChannelAccountsScreen`

### Billing / credit
- `BillingHubScreen`

### Selection / governance
- `UniversalSelectionHubScreen`
- `AIDataPermissionScreen`

### Enterprise
- `EnterpriseHubScreen`

### Public landing data
- existing `PricingSection` public plan/facility API calls

### Admin
- existing Admin root authorization probe
- Admin Super Hub and Platform Analytics were already on the shared client from the preceding API integration repair and remain unchanged in this wave.

## Transport-sensitive flows preserved

The migration is intentionally transport-only:
- `FormData` uploads remain multipart and do not receive a synthetic JSON content type.
- streaming response bodies remain available through the native `Response` returned by `apiClient.fetch`.
- existing `response.ok/status` branches remain valid.
- WebSocket URLs are not converted to HTTP fetch transport.
- Existing endpoint paths, request payloads, query parameters, and component state/UI were preserved.

## Explicitly out of scope

- Auth credential repair / REPAIR-02B.1.
- GREEN status declaration.
- Supabase migrations or RLS/security-wave changes.
- New backend/API routes.
- UI redesign or replacement of existing components.
- Replacing WebSocket/SSE protocols with REST.
- Allpha Universe repository.

## Verification gate

Added:
- `scripts/ci-api-client-domain-gate.js`
- `.github/workflows/fe-04-api-client-gate.yml`

The gate checks the targeted existing surfaces for:
1. required `@orchestree/api-client` import;
2. absence of direct native `fetch(...)` calls;
3. client/admin TypeScript type-checks.

The gate is deliberately limited to the surfaces migrated by REPAIR-FE-04; unrelated authentication or specialized transport code is not silently rewritten.

## Acceptance target

REPAIR-FE-04 is accepted only after:
- API transport gate passes;
- client type-check passes;
- admin type-check passes;
- client/admin production build gates pass;
- existing component visual/UI composition remains unchanged by the transport migration.

This phase does not declare the product GREEN and does not claim authenticated runtime success.


## Evidence after merge

- PR #19 merged to `main`: squash commit `4e3c327578a53b57440389a578dc31e03207e50d`.
- REPAIR-FE-04 API client domain gate: workflow run `37719779263` — SUCCESS.
  - transport scan: SUCCESS
  - client type-check: SUCCESS
  - admin type-check: SUCCESS
- Client Build & Route Gate: workflow run `37719779212` — SUCCESS.
  - client type-check: SUCCESS
  - Next.js production build: SUCCESS
  - public/authenticated route boundary verification: SUCCESS
  - required app routes verification: SUCCESS
- Railway production deployment was automatically triggered from `main` commit `4e3c327578a53b57440389a578dc31e03207e50d` for:
  - `@orchestree/client`: deployment `ed1f1720-45dd-4e5a-a46d-4ae4a4db7ffd` — BUILDING at verification time.
  - `@orchestree/admin`: deployment `807d90d3-c848-49a7-b2e7-0dc574882dc7` — BUILDING at verification time.
- Supabase: no migration/schema change in REPAIR-FE-04.
- Auth: no repair/change in REPAIR-FE-04; the separate Authenticated Runtime E2E workflow remains outside this phase.
- Product GREEN status: not declared.
