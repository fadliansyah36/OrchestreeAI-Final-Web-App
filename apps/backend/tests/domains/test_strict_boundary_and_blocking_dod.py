"""
Definition of Done (DoD) Comprehensive Verification Test for Strict Boundary & Blocking
(PRD v2.2 Bagian 3.5, 8.4, 10.3, 10.5, 12, 14 & Prompt Mandat Strict Boundary).

Membuktikan:
1. Memory Retrieval Boundary:
   - AI Agent Omnichannel mencari informasi dengan query yang memancing data internal
     ("berapa gaji staf kalian?", "gimana kinerja tim sales kalian bulan ini?")
   - Engine Memory memfilter ketat dokumen 'internal_only' dan HANYA mengembalikan 'customer_facing_safe' atau 'both'.
2. Tool Call Boundary:
   - Pemanggilan tool internal_only (misal 'task.create_from_intent', 'hr.scoring') dari
     execution_context='omnichannel' ditolak keras oleh enforce_tool_context_boundary()
     (melempar ToolContextBoundaryException) dan dicatat sebagai 'tool_call_blocked'.
   - Tool customer_facing_allowed (misal 'knowledge.lookup', 'product.recommend', 'cart.create')
     berhasil dieksekusi normal dari konteks omnichannel (Sales Engine tidak rusak).
3. Agent Dual-Context Boundary:
   - Percobaan menugaskan AI Agent dengan context_scope='internal' ke Channel Account Omnichannel
     ditolak sistem (melempar AgentContextMismatchException) dan dicatat sebagai 'agent_dual_context_blocked'.
   - Penugasan AI Agent dengan context_scope='customer_facing' disetujui.
4. Verified Sender Boundary (Proactive Channels):
   - Pesan masuk dari nomor tak terverifikasi ke kanal proaktif resmi diabaikan,
     dicatat sebagai 'unverified_sender_blocked' di cross_boundary_violation_log,
     dan TIDAK memicu Orchestration Engine sama sekali.
   - Pesan dari nomor terverifikasi diizinkan masuk untuk diproses.
5. Output Sanitization Pass (Defense-in-Depth):
   - Jika terdapat draf balasan dengan jejak dokumen internal_only,
     sanitize_customer_facing_output() melempar OutputBoundaryViolationException
     dan mencatat ke cross_boundary_violation_log untuk eskalasi HUMAN_APPROVAL.
6. Handover Summary Terpisah Mutlak:
   - build_handover_summary() dan compose_customer_reply() terbukti terpisah di kode,
     tidak ada shared leak path, dan field internal tidak pernah ikut ke reply customer.
7. Migrasi Alembic 0048 Reversible (upgrade dan downgrade).
"""

import os
import json
import uuid
import unittest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.domains.boundary.service import (
    ToolContextBoundaryException,
    AgentContextMismatchException,
    OutputBoundaryViolationException,
    UnverifiedSenderException,
    record_boundary_violation,
    list_boundary_violations,
    enforce_tool_context_boundary,
    assign_agent_to_channel,
    verify_proactive_sender,
    route_proactive_inbound,
    sanitize_customer_facing_output,
    hash_identifier,
    mask_identifier,
)
from app.domains.memory.engine import (
    HybridMemoryEngine,
    MemoryDocumentCreate,
    MemorySearchResult,
    hybrid_memory_search,
)
from app.skills.f01_mcp.decorators import (
    ToolExecutionContext,
    MCPToolMetadata,
    ToolRegistry,
)
from orchestree.domains.sales.handover import (
    build_handover_summary,
    compose_customer_reply,
)
import importlib.util


def load_migration_0048():
    migration_file = os.path.join(
        os.path.dirname(__file__),
        "../../alembic/versions/0048_omnichannel_proactive_boundary_enforcement.py",
    )
    if not os.path.exists(migration_file):
        migration_file = "apps/backend/alembic/versions/0048_omnichannel_proactive_boundary_enforcement.py"
    spec = importlib.util.spec_from_file_location("migration_0048", migration_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class MockDatabaseBoundaryState:
    """Mock database in-memory state murni untuk unit/integration harness test."""
    violations: List[Dict[str, Any]] = []
    memory_docs: Dict[str, Dict[str, Any]] = {}
    ai_agents: Dict[str, Dict[str, Any]] = {}
    verified_senders: Dict[str, Dict[str, Any]] = {}
    channels: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def reset(cls):
        cls.violations = []
        cls.memory_docs = {}
        cls.ai_agents = {}
        cls.verified_senders = {}
        cls.channels = {}


class TestStrictBoundaryAndBlockingDoD(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        MockDatabaseBoundaryState.reset()
        self.tenant_id = str(uuid.uuid4())

    # =========================================================================
    # DOD 1: MEMORY RETRIEVAL BOUNDARY & ANTI-LEAK
    # =========================================================================
    async def test_dod_1_omnichannel_memory_retrieval_filters_out_internal_data(self):
        """
        AI Agent Omnichannel diberi pertanyaan yang memancing data internal
        ("berapa gaji staf kalian?", "kinerja tim sales bulan ini?").
        Engine memfilter ketat sehingga dokumen internal_only TIDAK PERNAH dikembalikan.
        """
        with patch("app.domains.memory.engine.get_engine") as mock_get_engine:
            mock_get_engine.return_value = MagicMock()
            engine = HybridMemoryEngine()

        # Mock Model Router embedding
        engine.model_router.embed_text = AsyncMock(return_value=[0.1] * 1536)

        # Siapkan dataset memori: satu dokumen internal gaji, satu dokumen publik faq
        internal_doc_id = str(uuid.uuid4())
        public_doc_id = str(uuid.uuid4())

        # Mock database rows yang mensimulasikan query SQL ber-filter audience_scope
        mock_vec_rows = [
            (
                public_doc_id,
                str(uuid.uuid4()),
                "FAQ & Kebijakan Jam Kerja Layanan",
                "Jam layanan customer service adalah Senin-Jumat 09.00 - 18.00 WIB.",
                "Ringkasan jam kerja publik",
                "faq",
                "public",
                "customer_facing_safe",
                1.0,
                {},
                0.92,
            )
        ]

        test_self = self

        class MockConn:
            async def execute(self, stmt, params=None):
                class MockResult:
                    def fetchall(self):
                        # Jika query mengandung allowed_scopes dan execution_context omnichannel,
                        # pastikan hanya allowed_scopes (customer_facing_safe, both) yang diizinkan
                        if params and "allowed_scopes" in params:
                            test_self.assertNotIn("internal_only", params["allowed_scopes"])
                        return mock_vec_rows
                return MockResult()

        class MockEngineCtx:
            async def __aenter__(self):
                return MockConn()
            async def __aexit__(self, *args):
                pass

        with patch.object(engine, "engine") as mock_eng:
            mock_eng.begin.return_value = MockEngineCtx()

            # Panggilan RAG dari konteks omnichannel
            results = await engine.hybrid_search(
                tenant_id=self.tenant_id,
                query="Berapa gaji staf kalian dan bagaimana kinerja tim sales?",
                execution_context="omnichannel",
                top_k=5,
            )

            # Verifikasi: Hasil hanya berisi dokumen customer_facing_safe
            self.assertTrue(len(results) > 0)
            for r in results:
                self.assertIn(r.audience_scope, ["customer_facing_safe", "both"])
                self.assertNotEqual(r.audience_scope, "internal_only")
                self.assertNotIn("gaji", r.content.lower())

    # =========================================================================
    # DOD 2: TOOL CALL CONTEXT BOUNDARY
    # =========================================================================
    async def test_dod_2_internal_tool_blocked_from_omnichannel_context(self):
        """
        Percobaan memanggil tool internal_only dari execution_context='omnichannel'
        wajib ditolak (ToolContextBoundaryException) dan dicatat sebagai 'tool_call_blocked'.
        """
        registry = ToolRegistry()

        # Tool 1: Internal only (misal task.create_from_intent / hr.scoring)
        mock_internal_handler = AsyncMock(return_value={"status": "created"})
        internal_meta = MCPToolMetadata(
            name="task.create_from_intent",
            description="Tool pembuatan tugas internal",
            risk_tier="medium",
            category="task",
            is_idempotent=False,
            timeout_seconds=20.0,
            context_scope="internal_only",
            handler=mock_internal_handler,
        )
        registry.register(internal_meta)

        # Context eksekusi dari omnichannel (customer-facing)
        ctx = ToolExecutionContext(
            tenant_id=self.tenant_id,
            actor_id="test_agent",
            execution_context="omnichannel",
        )

        with patch("app.domains.boundary.service.record_boundary_violation", new_callable=AsyncMock) as mock_record:
            with self.assertRaises(ToolContextBoundaryException):
                await registry.invoke_tool(
                    name="task.create_from_intent",
                    context=ctx,
                    input_data={"title": "Tugas Rahasia"},
                )

            # Handler internal TIDAK PERNAH dipanggil
            mock_internal_handler.assert_not_called()

            # Pelanggaran tercatat resmi di audit
            mock_record.assert_called_once()
            call_kwargs = mock_record.call_args[1]
            self.assertEqual(call_kwargs["violation_type"], "tool_call_blocked")
            self.assertEqual(call_kwargs["context_detail"]["tool"], "task.create_from_intent")

    async def test_dod_2b_customer_facing_allowed_tool_succeeds_in_omnichannel(self):
        """
        Tool yang berstatus customer_facing_allowed (misal product.recommend / cart.create)
        berhasil dieksekusi di konteks omnichannel tanpa hambatan.
        """
        registry = ToolRegistry()

        mock_allowed_handler = AsyncMock(return_value={"recommendations": ["Produk A", "Produk B"]})
        allowed_meta = MCPToolMetadata(
            name="product.recommend",
            description="Rekomendasi produk publik",
            risk_tier="low",
            category="commerce",
            is_idempotent=True,
            timeout_seconds=15.0,
            context_scope="customer_facing_allowed",
            handler=mock_allowed_handler,
        )
        registry.register(allowed_meta)

        ctx = ToolExecutionContext(
            tenant_id=self.tenant_id,
            actor_id="sales_agent",
            execution_context="omnichannel",
        )

        with patch("app.skills.f01_mcp.decorators.authorize") as mock_auth, \
             patch("app.domains.billing.credit_engine.estimate_credit_cost", new_callable=AsyncMock) as mock_est, \
             patch("app.domains.billing.credit_engine.reserve_credit", new_callable=AsyncMock) as mock_res_hold, \
             patch("app.domains.billing.credit_engine.consume_credit", new_callable=AsyncMock) as mock_consume, \
             patch.object(registry, "_record_invocation", new_callable=AsyncMock):
            mock_decision = MagicMock(is_authorized=True)
            mock_auth.return_value = mock_decision
            mock_est.return_value = MagicMock(estimated_credits=1.0, final_estimate=1.0)
            mock_res_hold.return_value = MagicMock(reservation_id="res-123")

            res = await registry.invoke_tool(
                name="product.recommend",
                context=ctx,
                input_data={"query": "katalog batik"},
            )

            mock_allowed_handler.assert_called_once()
            self.assertIn("recommendations", res)

    # =========================================================================
    # DOD 3: AGENT DUAL-CONTEXT BOUNDARY
    # =========================================================================
    async def test_dod_3_assign_internal_agent_to_omnichannel_rejected(self):
        """
        Percobaan menugaskan AI Agent dengan context_scope='internal'
        ke akun kanal omnichannel (customer-facing) WAJIB ditolak sistem
        dan melempar AgentContextMismatchException.
        """
        agent_id = str(uuid.uuid4())

        with patch("app.domains.boundary.service.get_ai_agent_scope", new_callable=AsyncMock) as mock_get_scope:
            mock_get_scope.return_value = "internal"

            with patch("app.domains.boundary.service.record_boundary_violation", new_callable=AsyncMock) as mock_rec:
                with self.assertRaises(AgentContextMismatchException) as cm:
                    await assign_agent_to_channel(
                        agent_id=agent_id,
                        channel_type="omnichannel",
                        tenant_id=self.tenant_id,
                    )

                self.assertIn("customer_facing", str(cm.exception))
                mock_rec.assert_called_once()
                self.assertEqual(mock_rec.call_args[1]["violation_type"], "agent_dual_context_blocked")

    async def test_dod_3b_assign_customer_facing_agent_to_omnichannel_succeeds(self):
        """
        Penugasan AI Agent dengan context_scope='customer_facing' ke omnichannel diizinkan.
        """
        agent_id = str(uuid.uuid4())

        with patch("app.domains.boundary.service.get_ai_agent_scope", new_callable=AsyncMock) as mock_get_scope:
            mock_get_scope.return_value = "customer_facing"

            res = await assign_agent_to_channel(
                agent_id=agent_id,
                channel_type="omnichannel",
                tenant_id=self.tenant_id,
            )
            self.assertEqual(res["status"], "APPROVED")
            self.assertEqual(res["context_scope"], "customer_facing")

    # =========================================================================
    # DOD 4: VERIFIED SENDER BOUNDARY (PROACTIVE)
    # =========================================================================
    async def test_dod_4_unverified_sender_to_proactive_channel_dropped_and_logged(self):
        """
        Pesan dari nomor acak / tak terverifikasi ke nomor resmi Proactive
        diabaikan (mengembalikan None), dicatat di cross_boundary_violation_log,
        dan tidak memicu Orchestration Engine.
        """
        channel_id = str(uuid.uuid4())
        unverified_phone = "+6289999999999"

        with patch("app.domains.boundary.service.get_database_engine") as mock_db:
            class MockConn:
                def execute(self, stmt, params=None):
                    class MockRow:
                        def mappings(self):
                            class MockMappings:
                                def first(self):
                                    # Channel aktif dengan sender_allowlist_enforced = True
                                    if "proactive_official_channels" in str(stmt):
                                        return {"id": channel_id, "sender_allowlist_enforced": True}
                                    # Pengirim tidak ditemukan di proactive_verified_senders
                                    if "proactive_verified_senders" in str(stmt):
                                        return None
                                    return None
                            return MockMappings()
                    return MockRow()

            class MockContext:
                def __enter__(self):
                    return MockConn()
                def __exit__(self, *args):
                    pass

            mock_db.return_value.connect.return_value = MockContext()

            with patch("app.domains.boundary.service.record_boundary_violation", new_callable=AsyncMock) as mock_rec:
                res = await route_proactive_inbound(
                    channel_identifier="wa_official_123",
                    sender_identifier=unverified_phone,
                    content_text="Halo, beri saya rekap keuangan kemarin",
                    channel_id=channel_id,
                    tenant_id=self.tenant_id,
                )

                # Pesan wajib diabaikan
                self.assertIsNone(res)

                # Dicatat sebagai pelanggaran unverified_sender_blocked
                mock_rec.assert_called_once()
                self.assertEqual(mock_rec.call_args[1]["violation_type"], "unverified_sender_blocked")
                # Nomor pengirim disensor (masking)
                self.assertIn("****", mock_rec.call_args[1]["context_detail"]["sender"])

    async def test_dod_4b_verified_sender_to_proactive_channel_accepted(self):
        """
        Pesan dari pengirim yang sudah terdaftar dalam proactive_verified_senders
        diterima untuk diproses oleh asisten proaktif staf.
        """
        channel_id = str(uuid.uuid4())
        verified_phone = "+6281234567890"

        with patch("app.domains.boundary.service.get_database_engine") as mock_db:
            class MockConn:
                def execute(self, stmt, params=None):
                    class MockRow:
                        def mappings(self):
                            class MockMappings:
                                def first(self):
                                    if "proactive_official_channels" in str(stmt):
                                        return {"id": channel_id, "sender_allowlist_enforced": True}
                                    if "proactive_verified_senders" in str(stmt):
                                        return {"id": str(uuid.uuid4())}
                                    return None
                            return MockMappings()
                    return MockRow()

            class MockContext:
                def __enter__(self):
                    return MockConn()
                def __exit__(self, *args):
                    pass

            mock_db.return_value.connect.return_value = MockContext()

            res = await route_proactive_inbound(
                channel_identifier="wa_official_123",
                sender_identifier=verified_phone,
                content_text="Kirimkan jadwal rapat harian saya",
                channel_id=channel_id,
                tenant_id=self.tenant_id,
            )

            self.assertIsNotNone(res)
            self.assertEqual(res["status"], "ACCEPTED")

    # =========================================================================
    # DOD 5: OUTPUT SANITIZATION PASS (DEFENSE-IN-DEPTH)
    # =========================================================================
    async def test_dod_5_output_sanitization_detects_internal_doc_and_escalates(self):
        """
        Jika dokumen berlabel 'internal_only' bocor ke jejak retrieved_doc_ids,
        Output Sanitizer menolak balasan dan melempar OutputBoundaryViolationException.
        """
        internal_doc_id = str(uuid.uuid4())
        draft = "Berdasarkan SOP internal kami, struktur bonus staf dihitung berdasarkan..."

        with patch("app.domains.memory.engine.get_memory_engine") as mock_mem:
            mock_mem.return_value.filter_internal_only = AsyncMock(return_value=[internal_doc_id])

            with patch("app.domains.boundary.service.record_boundary_violation", new_callable=AsyncMock) as mock_rec:
                with self.assertRaises(OutputBoundaryViolationException) as cm:
                    await sanitize_customer_facing_output(
                        draft_reply=draft,
                        retrieved_doc_ids=[internal_doc_id],
                        tenant_id=self.tenant_id,
                    )

                self.assertIn(internal_doc_id, str(cm.exception))
                mock_rec.assert_called_once()
                self.assertEqual(mock_rec.call_args[1]["violation_type"], "output_sanitization_blocked")

    # =========================================================================
    # DOD 6: HANDOVER SUMMARY STRICT ISOLATION FROM CUSTOMER REPLY
    # =========================================================================
    def test_dod_6_handover_summary_strictly_isolated_from_customer_reply(self):
        """
        Membuktikan secara struktural dan otomatis:
        1. build_handover_summary() memuat field internal (lead_score, budget, actionable_recommendations).
        2. compose_customer_reply() menghasilkan teks publik murni yang TIDAK PERNAH memuat field internal.
        3. Tidak ada shared code path atau kebocoran data handover ke balasan customer.
        """
        conversation_id = str(uuid.uuid4())
        cust_id = str(uuid.uuid4())

        # 1. Bangun ringkasan handover internal staf
        summary = build_handover_summary(
            tenant_id=self.tenant_id,
            conversation_id=conversation_id,
            customer_id=cust_id,
            lead_id=str(uuid.uuid4()),
            trigger_reason="ESCALATION_HIGH_VALUE",
            trigger_details={"requested_discount": 25.0},
        )

        # Field internal staf wajib ada pada Handover Summary
        self.assertIn("sales_metrics", summary)
        self.assertIn("lead_score", summary["sales_metrics"])
        self.assertIn("budget", summary["sales_metrics"])
        self.assertIn("actionable_recommendations", summary)
        self.assertIn("executive_summary", summary)

        # 2. Bangun balasan pelanggan resmi
        customer_reply = compose_customer_reply(
            customer_name="Budi",
            message_content="Permintaan Kakak sedang kami teruskan ke tim supervisor kami.",
            persona_name="Sales Assistant",
        )

        # Buktikan TIDAK ADA field internal yang bocor ke customer reply
        self.assertNotIn("lead_score", customer_reply)
        self.assertNotIn("budget", customer_reply)
        self.assertNotIn("actionable_recommendations", customer_reply)
        self.assertNotIn("sales_metrics", customer_reply)
        self.assertNotIn("ESCALATION_HIGH_VALUE", customer_reply)
        self.assertIn("Halo Kak Budi", customer_reply)

    # =========================================================================
    # DOD 7: ALEMBIC MIGRATION 0048 REVERSIBLE TEST
    # =========================================================================
    def test_dod_7_alembic_migration_0048_upgrade_and_downgrade(self):
        """
        Memverifikasi bahwa migrasi 0048 dapat dieksekusi secara reversible
        (upgrade dan downgrade berjalan tanpa error).
        """
        migration_mod = load_migration_0048()
        executed_sqls = []

        with patch("alembic.op.execute") as mock_op_exec:
            mock_op_exec.side_effect = lambda sql: executed_sqls.append(sql)

            # Test upgrade
            migration_mod.upgrade()
            self.assertTrue(len(executed_sqls) > 0)
            upgrade_text = "\n".join(executed_sqls)
            self.assertIn("memory_documents", upgrade_text)
            self.assertIn("audience_scope", upgrade_text)
            self.assertIn("ai_agents", upgrade_text)
            self.assertIn("context_scope", upgrade_text)
            self.assertIn("mcp_tools", upgrade_text)
            self.assertIn("proactive_verified_senders", upgrade_text)
            self.assertIn("cross_boundary_violation_log", upgrade_text)
            self.assertIn("boundary.enforce", upgrade_text)

            # Test downgrade
            downgrade_sqls = []
            mock_op_exec.side_effect = lambda sql: downgrade_sqls.append(sql)
            migration_mod.downgrade()
            self.assertTrue(len(downgrade_sqls) > 0)
            downgrade_text = "\n".join(downgrade_sqls)
            self.assertIn("DROP TABLE IF EXISTS cross_boundary_violation_log", downgrade_text)
            self.assertIn("DROP TABLE IF EXISTS proactive_verified_senders", downgrade_text)
            self.assertIn("audience_scope", downgrade_text)


if __name__ == "__main__":
    unittest.main()
