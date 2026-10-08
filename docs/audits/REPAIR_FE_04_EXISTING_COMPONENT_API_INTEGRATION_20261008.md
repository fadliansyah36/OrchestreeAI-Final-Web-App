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
