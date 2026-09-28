# OrchestreeAI — PHASE 00 Baseline & Backup

Date: 2026-09-29
Repository: farhanfadliansyah36/OrchestreeAI-Final-Web-App
Baseline commit: ccecfae566918cc422e9ce14f88bd2f7636f0eb5
Default branch: main
Backup branch: baseline/phase-00-2026-09-29
Working branch: refactor/phase-00-baseline

## 1. Scope

This document records the immutable baseline before any refactoring. No production source-code behavior is changed in PHASE 00.

Authoritative project rules reviewed:
- AGENTS.md
- docs/OrchestreeAI_PRD_Final_Web_PWA_v2_2.md

## 2. Mandatory architecture baseline

Required by AGENTS.md and PRD:
- Backend: Python 3.12 + FastAPI
- Database: Supabase PostgreSQL
- Auth: Supabase Auth / JWT / JWKS / MFA
- Frontend: Next.js App Router + React
- Realtime: Supabase Realtime + FastAPI WebSocket
- Redis: cache/queue only
- LLM calls: single Model Router
- Real Data only; no production mock/fake/simulation/scenario/hardcoded business data
- No in-memory business-data fallback
- No SQLite/Room
- No second backend outside apps/backend
- Client/admin must call FastAPI; backend is the application data authority

## 3. Repository structure observed

Present:
- apps/client
- apps/admin
- apps/backend
- packages/ui
- packages/design-tokens
- packages/api-types
- infra
- tests
- docs

Legacy/shadow runtime also present:
- root src/
- root index.html
- root vite.config.ts
- root Vite build/dev scripts

This is an architecture-debt finding. It is not modified in PHASE 00.

## 4. Backup

An immutable baseline branch was created at the exact baseline commit:

baseline/phase-00-2026-09-29
=> ccecfae566918cc422e9ce14f88bd2f7636f0eb5

main was not modified by PHASE 00.

## 5. Baseline security findings

Critical findings already verified by source inspection:

1. JWT extraction code accepts a test harness token format and decodes JWT payload without establishing cryptographic signature verification.
2. Client-supplied X-User-Roles / X-User-Capabilities / X-MFA-Verified are still consumed by authentication/context code.
3. Admin middleware and admin page rely on client-controlled token/MFA storage/presence checks.
4. Client middleware checks token presence/length rather than cryptographic session validity.
5. Tenant onboarding accepts owner_auth_user_id from request data rather than deriving the owner from verified auth identity.
6. Hardcoded/fallback secrets exist in backend security/storage-related code and must be replaced with fail-closed required configuration.
7. Production-facing simulation/test-style code exists and must be isolated from production.
8. Static/canned business responses and state exist in frontend code and violate Real Data enforcement.

These are baseline blockers for production security. They are intentionally not patched in PHASE 00.

## 6. Build/runtime baseline findings

Root package.json currently declares:
- dev:frontend = vite
- build = vite build
- start:frontend = vite preview

Meanwhile apps/client and apps/admin declare Next.js build/start scripts.

Therefore the root build command is not a proof that the PRD Next.js PWAs build successfully. The final refactor must make the official monorepo runner target apps/client, apps/admin and apps/backend without restoring a Vite production application.

## 7. CI / execution evidence

GitHub Actions workflow-runs endpoint for the current baseline commit returned zero workflow runs.

Therefore there is no GitHub Actions execution evidence at this baseline proving:
- client Next.js build
- admin Next.js build
- backend tests
- security gates
- 19-domain E2E
- PWA compliance

No claim of successful application execution is made from repository inspection alone.

## 8. Database architecture baseline

Source tree contains FastAPI/SQLAlchemy/Alembic/asyncpg and Supabase-oriented configuration.

Repository code search for "sqlite" and "room database" returned no matches.

This is evidence against a Room/SQLite implementation in the indexed code, but not a substitute for a full post-refactor filesystem/history scan.

## 9. Secrets baseline

.env.example contains configuration names only; no secret values were observed there.

.gitignore excludes .env* while allowing .env.example.

A current-tree secret scan is not equivalent to a complete Git history secret scan. Full history scanning is a later security phase.

## 10. PHASE 00 gate

Status: BASELINE CAPTURED / PRODUCTION READINESS NOT PROVEN

The application has NOT yet been declared "running normally" because PHASE 00 does not modify the application and the connected GitHub repository has no CI execution evidence for this baseline.

The required proof will be produced after the refactoring phases through:
1. client Next.js production build
2. admin Next.js production build
3. FastAPI startup/health check
4. Supabase-backed integration tests
5. security gate
6. PWA compliance test
7. real-auth E2E
8. 19-domain E2E
9. cross-tenant isolation tests
10. production-like smoke test

## 11. Next phase gate

Do not call the project production-ready until PHASE 04–08 critical authentication, authorization, tenant isolation and Super Admin controls are repaired and the above execution evidence is green.

