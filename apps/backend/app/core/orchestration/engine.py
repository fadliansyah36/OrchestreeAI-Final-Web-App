"""
OrchestreeAI Cognitive Core Orchestration Engine (PRD v2.2 Bagian 8.1)
Mengelola eksekusi alur kerja node graph otonom dengan:
1. Node Graph types: CLASSIFY, PLAN, TOOL_CALL, LLM_GENERATE, HUMAN_APPROVAL, PERSONA_HANDOFF, DELIVER.
2. Durable checkpointing ke tabel workflow_executions dan workflow_node_runs (dapat di-resume jika backend restart).
3. Evaluasi PDP authorize() pada setiap awal eksekusi node (Titik Evaluasi 2 PRD v2.2 Bagian 3.5).
4. Integrasi langsung ke Model Router dan MCP Tool Registry.
"""

import asyncio
import time
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator, Dict, Any, List, Optional
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine
from app.core.model_router.router import get_model_router, ModelRouterRequest
from app.skills.f01_mcp.decorators import get_tool_registry, ToolExecutionContext
from app.skills.f01_mcp.tools import register_builtin_tools
from app.authz.pdp import authorize, SubjectContext, ResourceContext
from app.domains.continuous_learning.core import get_continuous_learning_engine
from app.domains.cognitive_monitoring.live_state_service import (
    upsert_live_state,
    touch_heartbeat,
    mark_workflow_completed,
    sanitize_step_label,
)

logger = logging.getLogger("orchestree.orchestration_engine")


class WorkflowNodeSpec(BaseModel):
    id: str
    type: str  # CLASSIFY, PLAN, TOOL_CALL, LLM_GENERATE, HUMAN_APPROVAL, PERSONA_HANDOFF, DELIVER
    label: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    next: List[str] = Field(default_factory=list)


class WorkflowGraphSpec(BaseModel):
    nodes: List[WorkflowNodeSpec]
    entry_node: str


class WorkflowDispatchRequest(BaseModel):
    tenant_id: str
    intent_text: str
    workflow_definition_id: Optional[str] = None
    actor_id: Optional[str] = None
    actor_type: str = "ai_agent"
    roles: List[str] = ["STAFF_AI"]
    capabilities: List[str] = ["workflow.dispatch", "workflow.node.execute", "mcp.tool.invoke"]
    is_mfa_verified: bool = False
    execution_context: str = "internal_dashboard"  # 'omnichannel' | 'proactive' | 'internal_dashboard'
    context_data: Dict[str, Any] = Field(default_factory=dict)


class WorkflowDispatchResult(BaseModel):
    execution_id: str
    tenant_id: str
    workflow_definition_id: Optional[str]
    status: str  # running, paused, completed, failed
    current_node_id: Optional[str]
    intent_text: str
    context_data: Dict[str, Any]
    output_payload: Dict[str, Any]
    nodes_executed: List[str]
    error_message: Optional[str] = None


class OrchestrationEngine:
    """
    Cognitive Core Orchestration Engine.
    Menjalankan alur kerja berbasis DAG dengan durable checkpointing di PostgreSQL.
    """

    def __init__(self):
        register_builtin_tools()
        self.model_router = get_model_router()
        self.tool_registry = get_tool_registry()
        self.learning_engine = get_continuous_learning_engine()

    def get_default_graph_spec(self) -> WorkflowGraphSpec:
        """Graf standar: CLASSIFY -> PLAN -> TOOL_CALL -> DELIVER"""
        return WorkflowGraphSpec(
            entry_node="node_classify",
            nodes=[
                WorkflowNodeSpec(
                    id="node_classify",
                    type="CLASSIFY",
                    label="Klasifikasi Intent & Kebutuhan Tugas",
                    next=["node_plan"],
                ),
                WorkflowNodeSpec(
                    id="node_plan",
                    type="PLAN",
                    label="Perencanaan Alur Eksekusi & Pemilihan Alat",
                    next=["node_tool_call"],
                ),
                WorkflowNodeSpec(
                    id="node_tool_call",
                    type="TOOL_CALL",
                    label="Pemanggilan Alat F.01-MCP Terverifikasi",
                    config={"tool": "task.create_from_intent"},
                    next=["node_deliver"],
                ),
                WorkflowNodeSpec(
                    id="node_deliver",
                    type="DELIVER",
                    label="Penyampaian Hasil & Notifikasi Selesai",
                    next=[],
                ),
            ],
        )

    def get_onboarding_persona_graph_spec(self) -> WorkflowGraphSpec:
        """Graf resmi Onboarding Persona Intake: CLASSIFY -> LLM_GENERATE -> TOOL_CALL -> DELIVER"""
        return WorkflowGraphSpec(
            entry_node="node_classify_tenant",
            nodes=[
                WorkflowNodeSpec(
                    id="node_classify_tenant",
                    type="CLASSIFY",
                    label="Deteksi Tenant Baru Pasca-Registrasi",
                    next=["node_adaptive_clarification"],
                ),
                WorkflowNodeSpec(
                    id="node_adaptive_clarification",
                    type="LLM_GENERATE",
                    label="Penyusunan Klarifikasi Adaptif Persona (Opsional)",
                    config={"task": "onboarding_clarification"},
                    next=["node_write_persona_memory"],
                ),
                WorkflowNodeSpec(
                    id="node_write_persona_memory",
                    type="TOOL_CALL",
                    label="Penyimpanan Terstruktur Company Brain (Internal Only)",
                    config={"tool": "memory.write_persona_profile"},
                    next=["node_deliver_onboarding_redirect"],
                ),
                WorkflowNodeSpec(
                    id="node_deliver_onboarding_redirect",
                    type="DELIVER",
                    label="Penyelesaian Persona & Sinyal Redirect Pricing Checkout",
                    next=[],
                ),
            ],
        )


    def get_generative_media_graph_spec(self, operation: str) -> WorkflowGraphSpec:
        """Canonical Generative Studio graph; execution remains inside this OrchestrationEngine."""
        if operation not in {"image_generation", "batch_seeding"}:
            raise ValueError(f"Unsupported generative workflow operation: {operation}")
        return WorkflowGraphSpec(
            entry_node="node_generative_media",
            nodes=[
                WorkflowNodeSpec(
                    id="node_generative_media",
                    type="GENERATIVE_MEDIA",
                    label="Generative Studio — Domain Engine Execution",
                    config={"operation": operation},
                    next=["node_deliver_generative"],
                ),
                WorkflowNodeSpec(
                    id="node_deliver_generative",
                    type="DELIVER",
                    label="Generative Artifact Delivery & Audit Completion",
                    next=[],
                ),
            ],
        )


    async def run(self, req: WorkflowDispatchRequest) -> WorkflowDispatchResult:
        """
        Menjalankan alur kerja kognitif otonom (OrchestrationEngine.run).
        Memanggil dispatch() dengan hook pembelajaran kontinu (ContinuousLearningEngine)
        yang terpasang secara permanen pada setiap penyelesaian node workflow.
        """
        return await self.dispatch(req)

    async def dispatch(self, req: WorkflowDispatchRequest) -> WorkflowDispatchResult:
        """
        Pemicu eksekusi alur kerja kognitif otonom dari intent pengguna.
        Membuat record durable checkpoint awal di workflow_executions,
        lalu mengeksekusi node demi node dengan checkpoint persisten.
        """
        execution_id = str(uuid.uuid4())
        engine = get_engine()

        # Ambil atau fallback ke graph spec default
        wf_def_id = req.workflow_definition_id
        workflow_kind = str((req.context_data or {}).get("workflow_kind") or "")
        if workflow_kind == "generative_media":
            operation = str((req.context_data or {}).get("generative_operation") or "")
            graph_spec = self.get_generative_media_graph_spec(operation)
        elif wf_def_id == "onboarding_persona_intake" or req.intent_text == "onboarding_persona_intake":
            graph_spec = self.get_onboarding_persona_graph_spec()
        else:
            graph_spec = self.get_default_graph_spec()

        try:
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": req.tenant_id},
                )
                if wf_def_id and wf_def_id != "onboarding_persona_intake":
                    res = await conn.execute(
                        sa.text("SELECT graph_spec FROM workflow_definitions WHERE id = :id;"),
                        {"id": wf_def_id},
                    )
                    row = res.fetchone()
                    if row and row[0]:
                        graph_spec = WorkflowGraphSpec.model_validate(row[0])
                elif not wf_def_id:
                    # Ambil workflow definition default jika ada
                    res = await conn.execute(
                        sa.text("SELECT id, graph_spec FROM workflow_definitions WHERE name = 'Standar Pemrosesan Intent Otonom' LIMIT 1;"),
                    )
                    row = res.fetchone()
                    if row:
                        wf_def_id = str(row[0])
                        if row[1]:
                            graph_spec = WorkflowGraphSpec.model_validate(row[1])


                # Simpan record eksekusi awal (Checkpoint 0)
                await conn.execute(
                    sa.text("""
                        INSERT INTO workflow_executions (
                            id,
                            tenant_id,
                            workflow_definition_id,
                            intent_text,
                            status,
                            context_data,
                            current_node_id
                        ) VALUES (
                            :id,
                            :tenant_id,
                            :workflow_definition_id,
                            :intent_text,
                            'running',
                            :context_data,
                            :current_node_id
                        );
                    """),
                    {
                        "id": execution_id,
                        "tenant_id": req.tenant_id,
                        "workflow_definition_id": wf_def_id,
                        "intent_text": req.intent_text,
                        "context_data": json.dumps(req.context_data),
                        "current_node_id": graph_spec.entry_node,
                    },
                )
        except Exception as e:
            # Durable workflow state is a correctness/security boundary. Never
            # continue with an in-memory execution when the canonical database
            # checkpoint cannot be persisted.
            logger.error("Initial workflow checkpoint failed; aborting execution.", exc_info=True)
            raise RuntimeError("Workflow checkpoint could not be persisted to the canonical database.") from e

        # Jalankan loop eksekusi graf
        return await self._run_graph(
            execution_id=execution_id,
            req=req,
            wf_def_id=wf_def_id,
            graph_spec=graph_spec,
            start_node_id=graph_spec.entry_node,
            initial_context=req.context_data,
        )

    async def stream_llm_workflow(
        self,
        req: WorkflowDispatchRequest,
        *,
        prompt: str,
        system_prompt: Optional[str] = None,
        task_type: str = "text_generation",
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Canonical streaming workflow path for Ask AI.

        API handlers remain transport/auth/credit concerns; orchestration owns
        durable execution state, node authorization, Model Router invocation,
        checkpointing, and learning telemetry.
        """
        execution_id = str(uuid.uuid4())
        node_id = "node_llm_generate"
        engine = get_engine()

        subject = SubjectContext(
            user_id=req.actor_id,
            tenant_id=req.tenant_id,
            roles=req.roles,
            capabilities=req.capabilities,
            is_mfa_verified=req.is_mfa_verified,
            actor_type=req.actor_type,
        )
        resource = ResourceContext(
            resource_type="workflow_node",
            resource_id=node_id,
            owner_tenant_id=req.tenant_id,
            attributes={"node_type": "LLM_GENERATE", "node_key": node_id, "task_type": task_type},
        )
        decision = authorize(
            subject=subject,
            action="workflow.node.execute",
            resource=resource,
            context={"execution_id": execution_id},
            log_audit=True,
        )
        if not decision.is_authorized:
            raise PermissionError(f"PDP Denied eksekusi node '{node_id}': {decision.reason}")

        initial_context = dict(req.context_data or {})
        initial_context["task_type"] = task_type
        initial_context["prompt"] = prompt

        async with engine.begin() as conn:
            await conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": req.tenant_id},
            )
            await conn.execute(
                sa.text(
                    """
                    INSERT INTO workflow_executions (
                        id, tenant_id, workflow_definition_id, intent_text,
                        status, context_data, current_node_id
                    ) VALUES (
                        :id, :tenant_id, NULL, :intent_text,
                        'running', :context_data, :current_node_id
                    )
                    """
                ),
                {
                    "id": execution_id,
                    "tenant_id": req.tenant_id,
                    "intent_text": req.intent_text,
                    "context_data": json.dumps(initial_context),
                    "current_node_id": node_id,
                },
            )

        node_run_id = str(uuid.uuid4())
        await self._save_node_run_start(
            node_run_id=node_run_id,
            execution_id=execution_id,
            tenant_id=req.tenant_id,
            node_key=node_id,
            node_type="LLM_GENERATE",
            input_state=initial_context,
        )

        yield {"event": "workflow_start", "execution_id": execution_id, "node_id": node_id}

        collected: List[str] = []
        last_provider = "unknown"
        last_model = "unknown"
        started = time.perf_counter()

        try:
            router_request = ModelRouterRequest(
                tenant_id=req.tenant_id,
                task_type=task_type,
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=1500,
                temperature=0.7,
                workflow_execution_id=execution_id,
                user_id=req.actor_id,
            )
            async for chunk in self.model_router.stream_generate(router_request):
                event_type = chunk.get("event", "token")
                if event_type == "token":
                    token = str(chunk.get("token", ""))
                    collected.append(token)
                    last_provider = str(chunk.get("provider", last_provider))
                    last_model = str(chunk.get("model", last_model))
                elif event_type == "error":
                    raise RuntimeError(str(chunk.get("error") or "Model Router streaming failed."))
                yield chunk

            output = {
                "content": "".join(collected),
                "provider": last_provider,
                "model": last_model,
                "task_type": task_type,
            }
            await self._save_node_run_finish(
                node_run_id=node_run_id,
                tenant_id=req.tenant_id,
                status="completed",
                output_state=output,
                error_detail=None,
            )
            await self.learning_engine.record_and_learn_node(
                tenant_id=req.tenant_id,
                workflow_execution_id=execution_id,
                node_run_id=node_run_id,
                node_key=node_id,
                node_type="LLM_GENERATE",
                context_input=initial_context,
                node_output=output,
                error_detail=None,
                latency_ms=(time.perf_counter() - started) * 1000.0,
                agent_id=req.actor_id if req.actor_type == "ai_agent" else None,
            )
            await self._checkpoint_execution(
                execution_id=execution_id,
                tenant_id=req.tenant_id,
                status="completed",
                current_node_id=None,
                context_data={**initial_context, "llm_output": output},
                output_payload=output,
            )
            yield {
                "event": "workflow_done",
                "execution_id": execution_id,
                "provider": last_provider,
                "model": last_model,
            }
        except Exception as exc:
            error_message = "LLM workflow execution failed."
            logger.error("Streaming LLM workflow failed.", exc_info=True)
            await self._save_node_run_finish(
                node_run_id=node_run_id,
                tenant_id=req.tenant_id,
                status="failed",
                output_state={},
                error_detail=str(exc),
            )
            try:
                await self.learning_engine.record_and_learn_node(
                    tenant_id=req.tenant_id,
                    workflow_execution_id=execution_id,
                    node_run_id=node_run_id,
                    node_key=node_id,
                    node_type="LLM_GENERATE",
                    context_input=initial_context,
                    node_output={},
                    error_detail=str(exc),
                    latency_ms=(time.perf_counter() - started) * 1000.0,
                    agent_id=req.actor_id if req.actor_type == "ai_agent" else None,
                )
            except Exception:
                logger.exception("Continuous learning hook failed for LLM workflow error.")
            await self._checkpoint_execution(
                execution_id=execution_id,
                tenant_id=req.tenant_id,
                status="failed",
                current_node_id=node_id,
                context_data=initial_context,
                output_payload={},
            )
            yield {
                "event": "error",
                "error": error_message,
                "execution_id": execution_id,
            }

    async def _resolve_or_get_agent_id(self, tenant_id: str, actor_id: Optional[str]) -> Optional[str]:
        """Menemukan ID agen AI yang valid untuk live state tracking."""
        try:
            engine = get_engine()
            async with engine.connect() as conn:
                if actor_id:
                    res = await conn.execute(
                        sa.text("SELECT id FROM ai_agents WHERE id::text = :aid LIMIT 1;"),
                        {"aid": str(actor_id)}
                    )
                    r = res.fetchone()
                    if r:
                        return str(r[0])
                # Cari agen aktif pertama milik tenant
                res = await conn.execute(
                    sa.text("SELECT id FROM ai_agents WHERE tenant_id::text = :tid AND status = 'active' LIMIT 1;"),
                    {"tid": str(tenant_id)}
                )
                r = res.fetchone()
                if r:
                    return str(r[0])
                # Fallback agen apapun milik tenant
                res = await conn.execute(
                    sa.text("SELECT id FROM ai_agents WHERE tenant_id::text = :tid LIMIT 1;"),
                    {"tid": str(tenant_id)}
                )
                r = res.fetchone()
                if r:
                    return str(r[0])
        except Exception as e:
            logger.debug(f"Pencarian agent_id live state fallback: {e}")
        return None

    async def emit_heartbeat(self, execution_id: str) -> None:
        """Pembaruan heartbeat periodik untuk proses yang sedang berjalan (Bagian B)."""
        try:
            await touch_heartbeat(execution_id)
        except Exception as e:
            logger.debug(f"Gagal emit heartbeat: {e}")

    async def resume(self, execution_id: str, tenant_id: str, context_updates: Optional[Dict[str, Any]] = None) -> WorkflowDispatchResult:
        """
        Melanjutkan eksekusi yang tertunda (paused) atau terinterupsi dari checkpoint terakhir di DB.
        """
        engine = get_engine()
        state = None

        async with engine.begin() as conn:
            await conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            res = await conn.execute(
                sa.text("SELECT workflow_definition_id, intent_text, status, context_data, current_node_id FROM workflow_executions WHERE id = :id;"),
                {"id": execution_id},
            )
            row = res.fetchone()
            if not row:
                raise ValueError(f"Eksekusi workflow '{execution_id}' tidak ditemukan.")
            state = {
                "workflow_definition_id": str(row[0]) if row[0] else None,
                "intent_text": row[1],
                "status": row[2],
                "context_data": row[3] or {},
                "current_node_id": row[4],
            }

        graph_spec = self.get_default_graph_spec()
        if state["workflow_definition_id"]:
            async with engine.begin() as conn:
                res = await conn.execute(
                    sa.text("SELECT graph_spec FROM workflow_definitions WHERE id = :id;"),
                    {"id": state["workflow_definition_id"]},
                )
                row = res.fetchone()
                if row and row[0]:
                    graph_spec = WorkflowGraphSpec.model_validate(row[0])

        merged_context = dict(state["context_data"])
        if context_updates:
            merged_context.update(context_updates)

        req = WorkflowDispatchRequest(
            tenant_id=tenant_id,
            intent_text=state["intent_text"],
            workflow_definition_id=state["workflow_definition_id"],
            context_data=merged_context,
        )

        return await self._run_graph(
            execution_id=execution_id,
            req=req,
            wf_def_id=state["workflow_definition_id"],
            graph_spec=graph_spec,
            start_node_id=state["current_node_id"] or graph_spec.entry_node,
            initial_context=merged_context,
        )

    async def _run_graph(
        self,
        execution_id: str,
        req: WorkflowDispatchRequest,
        wf_def_id: Optional[str],
        graph_spec: WorkflowGraphSpec,
        start_node_id: str,
        initial_context: Dict[str, Any],
    ) -> WorkflowDispatchResult:
        nodes_by_id = {node.id: node for node in graph_spec.nodes}
        current_node_id: Optional[str] = start_node_id
        context = dict(initial_context)
        context["intent_text"] = req.intent_text
        context["execution_id"] = execution_id
        nodes_executed = []
        final_output: Dict[str, Any] = {}
        status = "running"
        error_msg = None

        while current_node_id:
            node = nodes_by_id.get(current_node_id)
            if not node:
                break

            nodes_executed.append(node.id)

            # --- TITIK EVALUASI PDP KE-2: Awal Setiap Eksekusi Workflow Node ---
            subject = SubjectContext(
                user_id=req.actor_id,
                tenant_id=req.tenant_id,
                roles=req.roles,
                capabilities=req.capabilities,
                is_mfa_verified=req.is_mfa_verified,
                actor_type=req.actor_type,
            )

            resource = ResourceContext(
                resource_type="workflow_node",
                resource_id=node.id,
                owner_tenant_id=req.tenant_id,
                attributes={"node_type": node.type, "node_key": node.id},
            )

            # Generative media is a first-class capability of the existing workflow engine;
            # reuse the canonical workflow.node.execute policy instead of inventing a second PDP action.
            node_action = "workflow.node.execute" if node.type == "GENERATIVE_MEDIA" else f"workflow.node.{node.type.lower()}"
            authz_decision = authorize(
                subject=subject,
                action=node_action,
                resource=resource,
                context={"node_id": node.id, "execution_id": execution_id},
                log_audit=True,
            )

            # Buat record run node (started)
            node_run_id = str(uuid.uuid4())
            await self._save_node_run_start(
                node_run_id=node_run_id,
                execution_id=execution_id,
                tenant_id=req.tenant_id,
                node_key=node.id,
                node_type=node.type,
                input_state=context,
            )

            if not authz_decision.is_authorized:
                status = "failed"
                error_msg = f"PDP Denied eksekusi node '{node.id}' ({node.type}): {authz_decision.reason}"
                await self._save_node_run_finish(
                    node_run_id=node_run_id,
                    tenant_id=req.tenant_id,
                    status="failed",
                    output_state={},
                    error_detail=error_msg,
                )
                break

            # Eksekusi handler node sesuai tipe
            node_start = time.perf_counter()
            node_output = {}
            node_failed = False

            # --- Bagian B: Hook on_node_started untuk Live Cognitive Monitoring ---
            try:
                resolved_agent_id = await self._resolve_or_get_agent_id(req.tenant_id, req.actor_id)
                if resolved_agent_id:
                    tool_name = node.config.get("tool_name") if isinstance(node.config, dict) else getattr(node, "tool_name", None)
                    if tool_name and ("img" in str(tool_name).lower() or "image" in str(tool_name).lower()):
                        live_status = "generating_image"
                    elif tool_name and ("mem" in str(tool_name).lower() or "memory" in str(tool_name).lower()):
                        live_status = "retrieving_memory"
                    elif node.type == "TOOL_CALL":
                        live_status = "calling_tool"
                    elif node.type == "GENERATIVE_MEDIA":
                        live_status = "generating_image"
                    elif node.type == "HUMAN_APPROVAL":
                        live_status = "waiting_approval"
                    else:
                        live_status = "thinking"

                    step_lbl = sanitize_step_label(node.label, node_type=node.type, tool_name=tool_name)
                    await upsert_live_state(
                        tenant_id=req.tenant_id,
                        ai_agent_id=resolved_agent_id,
                        workflow_execution_id=execution_id,
                        current_status=live_status,
                        current_step_label=step_lbl,
                        current_tool_name=tool_name,
                        confidence_score=98.5,
                        source_channel=req.execution_context or "internal",
                    )
            except Exception as live_err:
                logger.debug(f"[LiveState] on_node_started hook warning: {live_err}")

            try:
                if node.type == "CLASSIFY":
                    node_output = await self._execute_classify(req, context, execution_id)
                    context["classification"] = node_output
                elif node.type == "PLAN":
                    node_output = await self._execute_plan(req, context)
                    context["plan"] = node_output
                elif node.type == "TOOL_CALL":
                    node_output = await self._execute_tool_call(req, node, context, execution_id)
                    context["tool_result"] = node_output
                elif node.type == "LLM_GENERATE":
                    node_output = await self._execute_llm_generate(req, node, context, execution_id)
                    context["llm_output"] = node_output
                elif node.type == "GENERATIVE_MEDIA":
                    node_output = await self._execute_generative_media(req, node, context, execution_id)
                    context["generative_output"] = node_output
                elif node.type == "HUMAN_APPROVAL":
                    # Pause eksekusi untuk menunggu otorisasi manusia
                    status = "paused"
                    context["approval_required"] = True
                    await self._checkpoint_execution(
                        execution_id=execution_id,
                        tenant_id=req.tenant_id,
                        status="paused",
                        current_node_id=node.id,
                        context_data=context,
                        output_payload=node_output,
                    )
                    await self._save_node_run_finish(
                        node_run_id=node_run_id,
                        tenant_id=req.tenant_id,
                        status="running",
                        output_state=node_output,
                        error_detail="Menunggu persetujuan manusia",
                    )
                    break
                elif node.type == "PERSONA_HANDOFF":
                    node_output = await self._execute_persona_handoff(req, node, context, execution_id)
                    context["handoff"] = node_output
                    context["active_persona"] = node_output.get("target_persona")
                elif node.type == "DELIVER":
                    node_output = await self._execute_deliver(req, context)
                    final_output = node_output
                    context["delivery"] = node_output
                elif node.type in [
                    "SELECTION_READ",
                    "SELECTION_UNDERSTAND",
                    "SELECTION_VALIDATE",
                    "SELECTION_SELECT",
                    "SELECTION_SCORE",
                    "SELECTION_RANK",
                    "SELECTION_ANALYZE",
                    "SELECTION_VISUALIZE",
                    "SELECTION_RECOMMEND",
                    "SELECTION_RESULT",
                ]:
                    from app.domains.selection.pipeline import execute_selection_pipeline_node
                    node_output = await execute_selection_pipeline_node(node.type, req, node, context, execution_id)
                    context[node.type.lower()] = node_output
                    if node.type == "SELECTION_RESULT":
                        final_output = node_output

                # Catat penyelesaian node run
                await self._save_node_run_finish(
                    node_run_id=node_run_id,
                    tenant_id=req.tenant_id,
                    status="completed",
                    output_state=node_output,
                    error_detail=None,
                )

                # Hook Permanen Pembelajaran Berkelanjutan (PRD v2.2 Bagian 8.11)
                try:
                    await self.learning_engine.record_and_learn_node(
                        tenant_id=req.tenant_id,
                        workflow_execution_id=execution_id,
                        node_run_id=node_run_id,
                        node_key=node.id,
                        node_type=node.type,
                        context_input=context,
                        node_output=node_output,
                        error_detail=None,
                        latency_ms=(time.perf_counter() - node_start) * 1000.0,
                        agent_id=req.actor_id if req.actor_type == "ai_agent" else None,
                    )
                except Exception as learn_err:
                    logger.error(f"[ContinuousLearning] Hook error on node '{node.id}': {learn_err}")

                # Checkpoint durable state ke tabel workflow_executions
                await self._checkpoint_execution(
                    execution_id=execution_id,
                    tenant_id=req.tenant_id,
                    status="running",
                    current_node_id=node.id,
                    context_data=context,
                    output_payload=final_output or node_output,
                )

                # Bagian B: Pembaruan heartbeat live state setelah node selesai
                try:
                    await touch_heartbeat(execution_id)
                except Exception:
                    pass

            except Exception as e:
                node_failed = True
                error_msg = f"Kegagalan eksekusi node '{node.id}': {e}"
                await self._save_node_run_finish(
                    node_run_id=node_run_id,
                    tenant_id=req.tenant_id,
                    status="failed",
                    output_state={},
                    error_detail=error_msg,
                )
                # Hook Permanen Pembelajaran Berkelanjutan saat Kegagalan
                try:
                    await self.learning_engine.record_and_learn_node(
                        tenant_id=req.tenant_id,
                        workflow_execution_id=execution_id,
                        node_run_id=node_run_id,
                        node_key=node.id,
                        node_type=node.type,
                        context_input=context,
                        node_output={},
                        error_detail=error_msg,
                        latency_ms=(time.perf_counter() - node_start) * 1000.0,
                        agent_id=req.actor_id if req.actor_type == "ai_agent" else None,
                    )
                except Exception as learn_err:
                    logger.error(f"[ContinuousLearning] Hook failure error on node '{node.id}': {learn_err}")
                status = "failed"
                break

            # Lanjut ke node berikutnya jika ada
            if node.next and len(node.next) > 0:
                current_node_id = node.next[0]
            else:
                current_node_id = None

        if status == "running":
            status = "completed"

        # Simpan status akhir durable execution
        await self._checkpoint_execution(
            execution_id=execution_id,
            tenant_id=req.tenant_id,
            status=status,
            current_node_id=current_node_id,
            context_data=context,
            output_payload=final_output,
            error_message=error_msg,
        )

        # Bagian B: Perbarui live state menjadi completed/error
        try:
            await mark_workflow_completed(execution_id, status=status, error_detail=error_msg)
        except Exception as live_finish_err:
            logger.debug(f"[LiveState] mark_workflow_completed warning: {live_finish_err}")

        return WorkflowDispatchResult(
            execution_id=execution_id,
            tenant_id=req.tenant_id,
            workflow_definition_id=wf_def_id,
            status=status,
            current_node_id=current_node_id,
            intent_text=req.intent_text,
            context_data=context,
            output_payload=final_output,
            nodes_executed=nodes_executed,
            error_message=error_msg,
        )

    # --- Node Handlers ---

    async def _execute_classify(self, req: WorkflowDispatchRequest, context: Dict[str, Any], execution_id: Optional[str] = None) -> Dict[str, Any]:
        """Klasifikasi intent menggunakan Model Router."""
        prompt = (
            f"Klasifikasikan intent bisnis berikut ke dalam kategori aksi yang tepat:\n"
            f"Intent: \"{req.intent_text}\"\n\n"
            f"Tentukan: category (crm, task, knowledge, support), urgency (low, medium, high), "
            f"dan target_tool (task.create_from_intent, knowledge.lookup, crm.contact_verify). "
            f"Keluarkan format JSON murni: {{\"category\": \"...\", \"urgency\": \"...\", \"target_tool\": \"...\"}}"
        )

        resp = await self.model_router.route(
            ModelRouterRequest(
                tenant_id=req.tenant_id,
                task_type="classification",
                prompt=prompt,
                system_prompt="Anda adalah parser intent kognitif bisnis berkecepatan tinggi. Jawab HANYA dalam JSON valid.",
                temperature=0.2,
                workflow_execution_id=execution_id,
            )
        )

        try:
            # Ekstrak json
            text = resp.content.strip()
            if "{" in text and "}" in text:
                text = text[text.find("{") : text.rfind("}") + 1]
            return json.loads(text)
        except Exception:
            return {
                "category": "task",
                "urgency": "medium",
                "target_tool": "task.create_from_intent",
                "raw_classification": resp.content,
            }

    async def _execute_plan(self, req: WorkflowDispatchRequest, context: Dict[str, Any]) -> Dict[str, Any]:
        """Menyusun rencana eksekusi dan parameter tool."""
        classification = context.get("classification", {})
        target_tool = classification.get("target_tool", "task.create_from_intent")

        return {
            "selected_tool": target_tool,
            "steps": [
                f"Validasi parameter intent: {req.intent_text}",
                f"Eksekusi tool {target_tool}",
                "Verifikasi hasil dan notifikasi delivery",
            ],
            "tool_input_preview": {
                "title": f"Tindak Lanjut: {req.intent_text[:50]}",
                "description": f"Diciptakan secara otonom oleh OrchestreeAI Cognitive Core dari intent: '{req.intent_text}'",
                "priority": classification.get("urgency", "medium"),
            },
        }

    async def _execute_tool_call(
        self, req: WorkflowDispatchRequest, node: WorkflowNodeSpec, context: Dict[str, Any], execution_id: str
    ) -> Dict[str, Any]:
        """Memanggil MCP Tool melalui Registry dengan context & PDP authorization."""
        plan = context.get("plan", {})
        tool_name = node.config.get("tool") or plan.get("selected_tool", "task.create_from_intent")

        tool_input = plan.get("tool_input_preview", {})
        if tool_name == "knowledge.lookup":
            tool_input = {"query": req.intent_text, "category": "general"}
        elif tool_name == "crm.contact_verify":
            tool_input = {"contact_value": req.intent_text, "channel_type": "whatsapp"}
        elif tool_name == "memory.write_persona_profile":
            tool_input = {
                "session_id": context.get("session_id"),
                "tenant_id": req.tenant_id,
            }

        tool_ctx = ToolExecutionContext(
            tenant_id=req.tenant_id,
            actor_id=req.actor_id,
            actor_type=req.actor_type,
            roles=req.roles,
            capabilities=req.capabilities,
            is_mfa_verified=req.is_mfa_verified,
            workflow_execution_id=execution_id,
            execution_context=getattr(req, "execution_context", "internal_dashboard"),
        )

        return await self.tool_registry.invoke_tool(
            name=tool_name,
            context=tool_ctx,
            input_data=tool_input,
        )

    async def _execute_generative_media(
        self,
        req: WorkflowDispatchRequest,
        node: WorkflowNodeSpec,
        context: Dict[str, Any],
        execution_id: str,
    ) -> Dict[str, Any]:
        """Execute Generative Studio through the existing domain engine and Model Router path."""
        operation = str(node.config.get("operation") or context.get("generative_operation") or "")
        payload = context.get("generative_job_payload") or {}
        if not isinstance(payload, dict):
            raise ValueError("Generative workflow payload must be an object.")

        # The domain service owns prompt composition, credit ledger, validation,
        # metadata stripping, artifact persistence and the canonical Model Router call.
        # The orchestration engine owns the durable workflow boundary around it.
        from apps.backend.orchestree.domains.generative.image_router import ImageRouterService

        if operation == "image_generation":
            payload = {**payload, "workflow_execution_id": execution_id}
            result = await asyncio.to_thread(
                ImageRouterService.create_and_execute_job,
                req.tenant_id,
                payload,
            )
        elif operation == "batch_seeding":
            batch_id = str(payload.get("batch_id") or "")
            if not batch_id:
                raise ValueError("batch_id wajib disertakan untuk batch seeding.")
            result = await asyncio.to_thread(
                ImageRouterService.execute_seeding_batch,
                batch_id=batch_id,
                tenant_id=req.tenant_id,
                workflow_execution_id=execution_id,
            )
        else:
            raise ValueError(f"Unsupported generative workflow operation: {operation}")

        return {
            "operation": operation,
            "execution_id": execution_id,
            "result": result,
        }


    async def _execute_llm_generate(
        self, req: WorkflowDispatchRequest, node: WorkflowNodeSpec, context: Dict[str, Any], execution_id: str
    ) -> Dict[str, Any]:
        if node.config.get("task") == "onboarding_clarification":
            # Node 2 (LLM_GENERATE, opsional-adaptif)
            if context.get("skip_clarification", False):
                return {"clarification_needed": False, "reason": "skip_clarification_flag"}
            essay_answer = str(context.get("latest_essay_answer", "") or "")
            if essay_answer and (len(essay_answer.strip()) < 15 or len(essay_answer.split()) < 3):
                prompt = (
                    f"Pengguna sedang mengisi kuesioner onboarding perusahaan baru. Jawaban esai terkini mereka: \"{essay_answer}\". "
                    f"Pertanyaan kuesionernya: \"{context.get('latest_question_text', '')}\". "
                    f"Karena jawaban ini terlalu singkat atau ambigu, susunlah SATU pertanyaan klarifikasi lanjutan "
                    f"yang santun, ringkas (maksimal 1 kalimat), dan relevan agar profil Company Brain dapat diground dengan presisi."
                )
                try:
                    resp = await self.model_router.route(
                        ModelRouterRequest(
                            tenant_id=req.tenant_id,
                            task_type="text_generation",
                            prompt=prompt,
                            temperature=0.3,
                            max_tokens=100,
                            workflow_execution_id=execution_id,
                        )
                    )
                    return {
                        "clarification_needed": True,
                        "clarification_question": resp.content.strip(),
                        "provider": resp.provider_id,
                        "model": resp.model_id,
                    }
                except Exception as e:
                    logger.warning(f"Gagal generate klarifikasi adaptif, dilewati: {e}")
                    return {"clarification_needed": False, "error": str(e)}
            return {"clarification_needed": False, "reason": "answer_sufficient"}

        prompt = node.config.get("prompt_template", "Ringkas hasil alur kerja berikut: ") + json.dumps(context)
        resp = await self.model_router.route(
            ModelRouterRequest(
                tenant_id=req.tenant_id,
                task_type="text_generation",
                prompt=prompt,
                workflow_execution_id=execution_id,
            )
        )
        return {"content": resp.content, "provider": resp.provider_id, "model": resp.model_id}

    async def _execute_deliver(self, req: WorkflowDispatchRequest, context: Dict[str, Any]) -> Dict[str, Any]:
        """Menyusun hasil akhir penyampaian (Delivery)."""
        tool_result = context.get("tool_result", {})
        classification = context.get("classification", {})
        generative_output = context.get("generative_output", {})

        if generative_output:
            return {
                "success": True,
                "message": "Generative Studio workflow completed successfully.",
                "status": "completed",
                "operation": generative_output.get("operation"),
                "result": generative_output.get("result", {}),
                "execution_id": context.get("execution_id"),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }

        if context.get("session_id") or req.workflow_definition_id == "onboarding_persona_intake":
            return {
                "success": True,
                "message": "Profil Company Brain berhasil disintesis dan sesi onboarding persona selesai.",
                "status": "completed",
                "session_id": context.get("session_id"),
                "redirect_to": "/billing?checkout=1",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }

        summary_msg = f"Intent '{req.intent_text}' berhasil diproses secara otonom."
        if "task_id" in tool_result:
            summary_msg = f"Kartu tugas '{tool_result.get('title')}' berhasil dibuat pada Kanban (ID: {tool_result.get('task_id')})."
        elif "results" in tool_result:
            summary_msg = f"Ditemukan {len(tool_result.get('results', []))} dokumen rujukan SOP relevan."

        return {
            "success": True,
            "message": summary_msg,
            "classification": classification,
            "tool_result": tool_result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }


    async def _execute_persona_handoff(
        self, req: WorkflowDispatchRequest, node: WorkflowNodeSpec, context: Dict[str, Any], execution_id: str
    ) -> Dict[str, Any]:
        """
        Mengeksekusi transisi Persona Handoff (PRD v2.2 Bagian 11.12 & 14):
        - Evaluasi target persona berdasarkan config atau persona_handoff_rules
        - Rekam perpindahan ke conversation_handovers
        - Update metadata thread conversation agar percakapan tetap berada dalam thread yang sama
        - Tambahkan pesan sistem ke conversation_messages
        """
        engine = get_engine()
        tenant_id = req.tenant_id
        from_persona = node.config.get("from_persona") or context.get("active_persona") or "Receptionist"
        target_persona = node.config.get("target_persona")
        reason = node.config.get("reason") or "Evaluasi kualifikasi lead memicu pergantian persona otomatis"
        conversation_id = context.get("conversation_id") or node.config.get("conversation_id")
        handover_id = str(uuid.uuid4())

        async with engine.begin() as conn:
            # Jika target_persona belum ditentukan, evaluasi aturan persona_handoff_rules
            if not target_persona:
                rules_res = await conn.execute(
                    sa.text("""
                        SELECT target_persona_type, condition_type, condition_config
                        FROM persona_handoff_rules
                        WHERE tenant_id = :tenant_id AND is_active = true
                        ORDER BY priority ASC;
                    """),
                    {"tenant_id": tenant_id},
                )
                rules = [dict(r) for r in rules_res.mappings().all()]
                for r in rules:
                    cond_type = r["condition_type"]
                    cfg = r["condition_config"] or {}
                    if cond_type == "LEAD_SCORE_THRESHOLD":
                        min_score = float(cfg.get("min_score", 70.0))
                        lead_score = float(context.get("lead_score") or 0.0)
                        if lead_score >= min_score:
                            target_persona = r["target_persona_type"]
                            reason = f"Skor lead ({lead_score:.1f}) memenuhi ambang batas ({min_score:.1f})"
                            break
                    elif cond_type == "STAGE_CHANGE":
                        expected_stage = cfg.get("stage")
                        curr_stage = context.get("lead_stage")
                        if curr_stage == expected_stage:
                            target_persona = r["target_persona_type"]
                            reason = f"Tahap lead berubah menjadi {curr_stage}"
                            break

            if not target_persona:
                target_persona = "SDR"

            summary_context = node.config.get("summary_context") or f"Handover dari {from_persona} ke {target_persona} pada alur kerja {execution_id}."

            # Jika ada conversation_id, rekam ke conversation_handovers & pertahankan satu thread percakapan utuh
            if conversation_id:
                insert_handover = sa.text("""
                    INSERT INTO conversation_handovers (
                        id, tenant_id, conversation_id, from_agent_type, to_agent_type,
                        handover_reason, summary_context, status, created_at, resolved_at
                    ) VALUES (
                        :id, :tenant_id, :conversation_id, :from_agent, :to_agent,
                        :reason, :summary_context, 'ACCEPTED', now(), now()
                    );
                """)
                await conn.execute(
                    insert_handover,
                    {
                        "id": handover_id,
                        "tenant_id": tenant_id,
                        "conversation_id": conversation_id,
                        "from_agent": from_persona,
                        "to_agent": target_persona,
                        "reason": reason,
                        "summary_context": summary_context,
                    },
                )

                # Tambahkan pesan sistem pencatatan handover ke thread
                sys_msg_query = sa.text("""
                    INSERT INTO conversation_messages (
                        id, tenant_id, conversation_id, direction, sender_type,
                        content_text, delivery_status, created_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :conversation_id, 'OUTBOUND', 'SYSTEM',
                        :content, 'SENT', now()
                    );
                """)
                await conn.execute(
                    sys_msg_query,
                    {
                        "tenant_id": tenant_id,
                        "conversation_id": conversation_id,
                        "content": f"[Handover Persona]: Percakapan dialihkan dari {from_persona} ke {target_persona}. Riwayat interaksi tetap terjaga dalam thread ini.",
                    },
                )

                # Update conversation last_message_preview & metadata
                await conn.execute(
                    sa.text("""
                        UPDATE conversations
                        SET last_message_preview = :preview,
                            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{active_persona}', :target_json, true),
                            updated_at = now()
                        WHERE id = :conversation_id AND tenant_id = :tenant_id;
                    """),
                    {
                        "preview": f"[Handover ke {target_persona}]",
                        "target_json": json.dumps(target_persona),
                        "conversation_id": conversation_id,
                        "tenant_id": tenant_id,
                    },
                )

        return {
            "handover_id": handover_id,
            "conversation_id": conversation_id,
            "from_persona": from_persona,
            "target_persona": target_persona,
            "reason": reason,
            "preserved_thread": True,
            "status": "ACCEPTED",
        }

    # --- DB Checkpointing Helpers ---

    async def _checkpoint_execution(
        self,
        execution_id: str,
        tenant_id: str,
        status: str,
        current_node_id: Optional[str],
        context_data: Dict[str, Any],
        output_payload: Dict[str, Any],
        error_message: Optional[str] = None,
    ):
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": tenant_id},
                )
                await conn.execute(
                    sa.text("""
                        UPDATE workflow_executions
                        SET status = :status,
                            current_node_id = :current_node_id,
                            context_data = :context_data,
                            output_payload = :output_payload,
                            error_message = :error_message,
                            updated_at = now()
                        WHERE id = :id;
                    """),
                    {
                        "id": execution_id,
                        "status": status,
                        "current_node_id": current_node_id,
                        "context_data": json.dumps(context_data),
                        "output_payload": json.dumps(output_payload),
                        "error_message": error_message,
                    },
                )
        except Exception as e:
            logger.error("Canonical workflow checkpoint failed; refusing to continue without durable state.", exc_info=True)
            raise RuntimeError("Workflow checkpoint could not be persisted to the canonical database.") from e

    async def _save_node_run_start(
        self,
        node_run_id: str,
        execution_id: str,
        tenant_id: str,
        node_key: str,
        node_type: str,
        input_state: Dict[str, Any],
    ):
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": tenant_id},
                )
                await conn.execute(
                    sa.text("""
                        INSERT INTO workflow_node_runs (
                            id,
                            tenant_id,
                            workflow_execution_id,
                            node_key,
                            node_type,
                            status,
                            input_state,
                            started_at
                        ) VALUES (
                            :id,
                            :tenant_id,
                            :workflow_execution_id,
                            :node_key,
                            :node_type,
                            'running',
                            :input_state,
                            now()
                        );
                    """),
                    {
                        "id": node_run_id,
                        "tenant_id": tenant_id,
                        "workflow_execution_id": execution_id,
                        "node_key": node_key,
                        "node_type": node_type,
                        "input_state": json.dumps(input_state),
                    },
                )
        except Exception as e:
            logger.warning(f"Failed to save workflow_node_runs start: {e}")

    async def _save_node_run_finish(
        self,
        node_run_id: str,
        tenant_id: str,
        status: str,
        output_state: Dict[str, Any],
        error_detail: Optional[str],
    ):
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": tenant_id},
                )
                await conn.execute(
                    sa.text("""
                        UPDATE workflow_node_runs
                        SET status = :status,
                            output_state = :output_state,
                            error_detail = :error_detail,
                            finished_at = now()
                        WHERE id = :id;
                    """),
                    {
                        "id": node_run_id,
                        "status": status,
                        "output_state": json.dumps(output_state),
                        "error_detail": error_detail,
                    },
                )
        except Exception as e:
            logger.warning(f"Failed to save workflow_node_runs finish: {e}")


_orchestration_engine_instance: Optional[OrchestrationEngine] = None


def get_orchestration_engine() -> OrchestrationEngine:
    global _orchestration_engine_instance
    if _orchestration_engine_instance is None:
        _orchestration_engine_instance = OrchestrationEngine()
    return _orchestration_engine_instance
