# OrchestreeAI Phase Plan — Post-Audit Refactoring

## Canonical roadmap

The authoritative product sequence remains **Phase 0 through Phase 38** from `OrchestreeAI_PRD_Final_Web_PWA_v2.2.md`. This document adds **reconciliation sub-phases** under that roadmap; it does not renumber or replace the PRD.

## Current position

**Phase 04 — Orchestration Engine + Model Router + MCP Registry**  
**Status: IMPLEMENTED / REFACTORING / NOT GREEN**

The current branch is completing the integrity and boundary work required before Phase 04 can be treated as closed.

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

## Next canonical product phases after Phase 04

Once Phase 04 is genuinely GREEN, continue the PRD sequence:

- **Phase 05 — Continuous Learning Core**
- **Phase 06 — Authorization hardening / ABAC**
- **Phase 07 — Semantic Memory/RAG + Company Brain**
- **Phase 08 — Billing & Unified AI Credit Ledger**
- **Phase 09 — Proactive Agent + Notification Center + Ask AI**
- **Phase 10 — Analytics & Ranking**
- **Phase 11 — Intelligence**
- **Phase 12 — Third-Party App Registry + Integration Hub**
- **Phase 13 — Super Admin**
- **Phase 14–38** continue exactly according to the canonical PRD roadmap.

### Important sequencing rule

Do **not** jump to Phase 05 merely because individual Phase 05 code exists. Phase 04 is a dependency gate for the Continuous Learning Core, Model Router, MCP execution, and workflow execution. The correct next implementation target is therefore **04R.2**, followed by the live verification gates, unless a new blocker changes the dependency order.
