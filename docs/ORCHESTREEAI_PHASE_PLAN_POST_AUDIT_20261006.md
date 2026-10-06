# OrchestreeAI Phase Plan — Post-Audit Refactoring

## Canonical roadmap

The authoritative product sequence remains **Phase 0 through Phase 38** from `OrchestreeAI_PRD_Final_Web_PWA_v2.2.md`. This document adds **reconciliation sub-phases** under that roadmap; it does not renumber or replace the PRD.

## Current position

**Phase 05 — Continuous Learning Core**  
**Status: IMPLEMENTATION IN PROGRESS / PHASE 04 GATE STILL NOT GREEN**

The owner explicitly advanced implementation to the canonical Phase 05 target. Phase 04 remains an unresolved dependency gate and therefore Phase 05 is not declared GREEN or production-complete.

## Phase 04R — Runtime & Architecture Reconciliation

### 04R.1 — Fail-Closed Runtime Integrity
**Status: IN PROGRESS / code changes applied**

- Remove fabricated operational states from admin/platform data endpoints.
- Explicit `UNAVAILABLE`, `FAILED`, or `WAITING_DEPENDENCY` states on dependency failure.
- Fix endpoint contracts and undefined parameters.
- Add regression coverage.

### 04R.2 — Canonical API → Domain Boundary
**Status: IN PROGRESS — Admin/Orchestration + Billing persistence boundary refactored; remaining API routers still open**

Refactor remaining API routers that contain direct SQL/domain logic into existing domain services/repositories. The first completed slice moves Admin Platform Overview and Orchestration execution-history reads behind domain services; billing persistence is now behind `app.domains.billing.persistence`; however, the repository-wide API/domain boundary is still open because additional API routers (`agentcat`, `collaboration`, `commerce`, `crm`, `integrations`, `intelligence`, `kanban_and_attendance`, `learning`, `marketing`, `memory`, `omnichannel`, `onboarding`, `proactive`, `prospects`, `public`, `sales`, `selection`, `service`, `storage`, `tenant`, `tokenopt`, `webhooks`, `workforce`, plus `auth`) still contain direct persistence access.

Rules:
- do not create a second service layer;
- reuse existing domain engines;
- keep FastAPI as transport/auth/contract boundary;
- keep Supabase Postgres as source of truth;
- preserve PDP/ABAC before data access;
- preserve tenant scoping and audit behavior.

Priority candidates identified by the current PR:
- `apps/backend/app/api/v1/admin_overview.py`
- `apps/backend/app/api/v1/billing.py`
- other API modules identified by architecture scan.

### 04R.3 — Workflow Catalog Reconciliation
**Status: BLOCKED UNTIL 04R.2 IS CLOSED + LIVE EVIDENCE**

- Reconcile the live `workflow_definitions` catalog with the PRD-required workflow surface.
- Ensure code-defined special graphs remain extensions of the canonical OrchestrationEngine, not parallel engines.
- Verify durable execution, resume, retry, cancellation, approval, and idempotency behavior.

### 04R.4 — Model Provider Catalog Reconciliation
**Status: BLOCKED ON CONTROLLED DB MIGRATION**

- Apply/reconcile the OpenAI-primary/NVIDIA-NIM-fallback catalog deliberately.
- Retire stale provider rows only through reviewed migration.
- Verify no direct provider path bypasses ModelRouter.
- Runtime-test primary and controlled fallback with real provider credentials.

### 04R.5 — Memory/RAG Runtime Activation Evidence
**Status: BLOCKED ON LIVE RUNTIME TEST**

- Produce real memory document and embedding evidence.
- Verify OpenAI embeddings through the canonical ModelRouter.
- Verify tenant + ABAC filtering before retrieval.
- Verify persistence and retrieval across restart.

### 04R.6 — Security & Migration Parity Gate
**Status: BLOCKED ON LIVE RECONCILIATION**

- Reconcile Alembic revision drift.
- Review the Security Advisor findings.
- Do not auto-create RLS policies without explicit policy design and review.
- Run cross-tenant authorization tests.
- Verify no privileged frontend path exists.

### REPAIR/VERIFY-01 — Runtime Functional API Gate
**Status: PARTIAL GREEN / live runtime boundary verified; authenticated E2E pending**

- Railway deployment `596faef5-7cbd-4159-b2f4-b377b04f1021` starts successfully and `/health/live` returns HTTP 200.
- Public HTTP routing and FastAPI validation boundaries were exercised against the live Railway service.
- Protected orchestration dispatch rejects unauthenticated requests with HTTP 401.
- Obsolete `DATABASE_RUNTIME_ROLE` test/documentation references were removed; runtime identity is derived from `DATABASE_URL`.
- A reusable live API gate was added at `apps/backend/tests/test_runtime_functional_api_gate.py`.
- Authenticated tenant/workflow E2E is not declared GREEN without a real Supabase Auth JWT; no fake credentials are permitted.

### 04R.7 — Phase 04 GREEN Gate
**Status: PENDING**

Required evidence:
- backend tests pass;
- frontend type/build checks pass;
- CI Content Gate passes;
- real OpenAI generation verified;
- real NVIDIA NIM fallback verified;
- workflow E2E verified;
- Memory/RAG verified;
- tenant isolation verified;
- audit/usage/credit linkage verified;
- no direct provider calls outside ModelRouter;
- no fabricated success state;
- no CI/runtime blocker remains.

## Phase 05 — Continuous Learning Core
**Status: IMPLEMENTATION IN PROGRESS / NOT GREEN**

Implemented/reconciled in this pass:
- Existing ContinuousLearningEngine remains the single learning engine.
- Objective outcome verification remains runtime-derived rather than LLM self-evaluation.
- Confidence scoring, half-life decay, growth ledger, minimum-sample lesson synthesis, and tenant/RLS persistence remain canonical.
- Learning API persistence was moved behind `app.domains.continuous_learning.repository`; the API is now transport/auth/PDP only.
- Added Phase 05 architecture regression coverage for the API/domain boundary and tenant-scoped persistence.
- Live Supabase evidence confirms the four Phase 05 tables exist with RLS enabled and real rows.
- OrchestrationEngine already invokes the learning hook after workflow node execution; this was retained as the canonical integration point.

Open Phase 05 gates:
- Live Railway database credentials are incomplete: the Supabase URL/JWKS/publishable/anon values are configured, but a server-side `DATABASE_URL` / service credential cannot be retrieved through the available Supabase connector and must not be guessed.
- Runtime E2E learning write/read evidence on Railway is therefore pending.
- Phase 04 GREEN dependency remains open.

## Next canonical product phases after Phase 05

Once Phase 05 is genuinely GREEN and its dependency gates are satisfied, continue the PRD sequence:

- **Phase 06 — Authorization hardening / ABAC**
- **Phase 07 — Semantic Memory/RAG + Company Brain**
- **Phase 08 — Billing & Unified AI Credit Ledger**
- **Phase 09 — Proactive Agent + Notification Center + Ask AI**
- **Phase 10 — Analytics & Ranking**
- **Phase 11 — Intelligence**
- **Phase 12 — Third-Party App Registry + Integration Hub**
- **Phase 13 — Super Admin**
- **Phase 14–38** continue exactly according to the canonical PRD roadmap.

### Sequencing rule

Phase 05 implementation is being advanced by explicit owner instruction, but it is not declared GREEN until the Phase 04 dependency gate and Phase 05 live runtime evidence are both satisfied.
