# REPAIR-FE-API-01 — Existing UI/UX ↔ Backend API Integration

Date: 2026-10-07

## Scope

This repair intentionally does **not** redesign OrchestreeAI UI/UX and does not modify the authentication flow.

The objective is to continue the existing UI/components and make their HTTP transport consistently reach the canonical FastAPI backend through the existing Next.js rewrite boundary.

## Canonical runtime topology

```
@orchestree/client ─┐
                    ├── /api/* → Next.js rewrite → @orchestree/api
@orchestree/admin ──┘
                              ↓
                     FastAPI /api/v1/*
                              ↓
                    Supabase PostgreSQL
```

The repository remains the canonical monorepo containing the three runtime applications:
- apps/client
- apps/admin
- apps/backend

## Changes

1. Added `@orchestree/api-client` as a small shared frontend transport utility.
2. Preserved relative `/api/*` routing so client/admin continue using the existing Next.js rewrite to the FastAPI server.
3. Preserved Response semantics for existing components that inspect `response.ok`, `status`, and response bodies.
4. Defaulted browser requests to `credentials: include`.
5. Migrated existing session transport in client/admin to the shared transport.
6. Migrated the following existing domain components without replacing their UI:
   - WorkforceHubScreen
   - IntelligenceHubScreen
   - IntegrationsHubScreen
   - GenerativeStudioHubScreen
   - AdminSuperHubScreen
   - PlatformAnalyticsHubScreen
7. Reconciled IntegrationsHubScreen response parsing with the actual backend contract:
   - catalog → `catalog`
   - connections → `connections`
   - sync logs → `logs`

## Explicit non-goals

- No new backend server.
- No second API layer.
- No database/schema migration.
- No authentication repair.
- No UI/UX redesign.
- No fake/mock business data.
- No Allpha Universe repository access.

## Next integration wave

Continue the same transport pattern through the remaining existing domain screens, prioritizing:
- Sales / CRM / Commerce
- Omnichannel / Inbox
- Billing / Credit
- Selection
- Proactive
- Permissions
- Enterprise
- Admin operational screens

Each endpoint must be checked against the actual FastAPI response contract before changing the component.
