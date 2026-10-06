# OrchestreeAI Workflow Architecture Reconciliation

## Canonical execution boundary

All AI/generative execution must cross the existing application boundary:

`Client/Admin → Next.js API boundary → FastAPI → Auth/Tenant/PDP/ABAC → Canonical OrchestrationEngine → existing domain engine(s) / Memory-RAG / MCP as required → canonical ModelRouter → OpenAI primary / NVIDIA NIM fallback → Supabase Postgres/Storage + audit`.

Frontend code never calls Supabase tables, provider APIs, or model credentials directly.

## Generative Studio completion

Generative Studio image generation and approved batch seeding now enter the same existing `OrchestrationEngine` used by Ask AI and workflow execution.

The engine owns:
- durable `workflow_executions` / `workflow_node_runs` checkpoints;
- per-node PDP evaluation;
- live workflow/learning hooks;
- workflow completion/failure state.

The existing Generative domain engine remains the owner of:
- prompt composition and brand-lock rules;
- credit reservation/consumption/refund;
- ModelRouter image generation;
- output validation;
- metadata stripping;
- artifact persistence.

The domain engine is therefore reused, not duplicated.

### Generative graph

`GENERATIVE_MEDIA → DELIVER`

The `GENERATIVE_MEDIA` node is an extension of the existing OrchestrationEngine node graph, not a second workflow engine. The executable operation is server-selected from the workflow context (`image_generation` or `batch_seeding`).

The actual workflow execution ID is propagated into the Generative domain and ModelRouter call so provider usage remains traceable to the durable workflow.

## Fail-closed checkpointing

A failure to persist a canonical workflow checkpoint is a hard execution failure. The engine does not continue with in-memory workflow state.

## CRUD exception

Read/write CRUD endpoints for Generative Studio templates, brand locks, galleries, and metadata may call the existing domain service directly because they are not AI execution. AI generation/batch execution must enter the OrchestrationEngine.

## Verification gates

Architecture tests enforce:
- no direct Supabase access from Client/Admin;
- no hardcoded frontend backend fallback;
- API feature handlers do not bypass OrchestrationEngine for ModelRouter;
- Generative API handlers do not invoke Generative execution methods directly;
- the canonical OrchestrationEngine contains the Generative Media node;
- workflow checkpoint failure remains fail-closed.
