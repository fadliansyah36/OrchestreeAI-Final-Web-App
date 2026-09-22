"""
OrchestreeAI Cognitive Core Orchestration Engine (PRD v2.2 Bagian 8.1)
Mengelola eksekusi alur kerja node graph otonom dengan:
1. Node Graph types: CLASSIFY, PLAN, TOOL_CALL, LLM_GENERATE, HUMAN_APPROVAL, PERSONA_HANDOFF, DELIVER.
2. Durable checkpointing ke tabel workflow_executions dan workflow_node_runs (dapat di-resume jika backend restart).
3. Evaluasi PDP authorize() pada setiap awal eksekusi node (Titik Evaluasi 2 PRD v2.2 Bagian 3.5).
4. Integrasi langsung ke Model Router dan MCP Tool Registry.
"""

import time
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_engine
from app.core.model_router.router import get_model_router, ModelRouterRequest
from app.skills.f01_mcp.decorators import get_tool_registry, ToolExecutionContext
from app.skills.f01_mcp.tools import register_builtin_tools
from app.authz.pdp import authorize, SubjectContext, ResourceContext
from app.domains.continuous_learning.core import get_continuous_learning_engine

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
        graph_spec = self.get_default_graph_spec()
        wf_def_id = req.workflow_definition_id

        try:
            async with engine.begin() as conn:
                await conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": req.tenant_id},
                )
                if wf_def_id:
                    res = await conn.execute(
                        sa.text("SELECT graph_spec FROM workflow_definitions WHERE id = :id;"),
                        {"id": wf_def_id},
                    )
                    row = res.fetchone()
                    if row and row[0]:
                        graph_spec = WorkflowGraphSpec.model_validate(row[0])
                else:
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
            logger.warning(f"Simpan checkpoint awal DB gagal, melanjutkan in-memory checkpoint: {e}")

        # Jalankan loop eksekusi graf
        return await self._run_graph(
            execution_id=execution_id,
            req=req,
            wf_def_id=wf_def_id,
            graph_spec=graph_spec,
            start_node_id=graph_spec.entry_node,
            initial_context=req.context_data,
        )

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

            node_action = f"workflow.node.{node.type.lower()}"
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

            try:
                if node.type == "CLASSIFY":
                    node_output = await self._execute_classify(req, context)
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

    async def _execute_classify(self, req: WorkflowDispatchRequest, context: Dict[str, Any]) -> Dict[str, Any]:
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

        tool_ctx = ToolExecutionContext(
            tenant_id=req.tenant_id,
            actor_id=req.actor_id,
            actor_type=req.actor_type,
            roles=req.roles,
            capabilities=req.capabilities,
            is_mfa_verified=req.is_mfa_verified,
            workflow_execution_id=execution_id,
        )

        return await self.tool_registry.invoke_tool(
            name=tool_name,
            context=tool_ctx,
            input_data=tool_input,
        )

    async def _execute_llm_generate(
        self, req: WorkflowDispatchRequest, node: WorkflowNodeSpec, context: Dict[str, Any], execution_id: str
    ) -> Dict[str, Any]:
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
            logger.warning(f"Failed to update workflow_executions checkpoint: {e}")

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
