"""
Test Suite Permanen: Live AI Cognitive Monitoring Panel & Realtime State (PRD v2.2 Bagian 25.2, 8.1, 14, 18).
Memverifikasi:
1. Penegakan Privasi Mutlak (Cross-Tenant Health View): Metadata operasional generik tanpa konten prompt/output.
2. Otorisasi PDP Terpadu: Hak akses 'admin.cognitive_monitoring.view' eksklusif Super Admin + MFA.
3. Transisi State Operasional & Heartbeat: on_node_started, emit_heartbeat, mark_workflow_completed.
4. Job Pembersihan Otomatis: Toleransi stale heartbeat 90s ditandai 'error'.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.domains.cognitive_monitoring.live_state_service import (
    sanitize_step_label,
    ALLOWED_STATUSES,
)


class TestCognitiveMonitoringDoD(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tenant_id = str(uuid.uuid4())
        self.agent_id = str(uuid.uuid4())
        self.workflow_id = str(uuid.uuid4())

    def test_privacy_enforcement_step_labels(self):
        """Memverifikasi aturan privasi mutlak: tidak ada potongan prompt atau konten bisnis yang bocor."""
        # 1. Kasus prompt atau teks percakapan pengguna
        sensitive_prompt = "Tolong analisis data keuangan pelanggan PT Maju Bersama nomor rekening 12345678"
        label = sanitize_step_label(f"prompt: {sensitive_prompt}", node_type="LLM_GENERATE")
        self.assertNotIn("12345678", label, "Data rekening/bisnis dilarang bocor ke label step!")
        self.assertNotIn("Maju Bersama", label, "Nama entitas spesifik dilarang bocor ke label step!")
        self.assertEqual(label, "Sintesis kognitif & penalaran konteks")

        # 2. Kasus tool panggilan gambar
        img_label = sanitize_step_label("generate image banner promo", tool_name="gpt_image_2_generate")
        self.assertEqual(img_label, "Menghasilkan gambar via AI Engine")

        # 3. Kasus tool memori
        mem_label = sanitize_step_label("query memory collection", tool_name="memflow_retrieve_context")
        self.assertEqual(mem_label, "Mengambil konteks memori organisasi")

        # 4. Kasus tool reguler
        tool_label = sanitize_step_label(None, tool_name="product.recommend(category='electronics')")
        self.assertTrue(tool_label.startswith("Memanggil tool: product.recommend"))

        # 5. Kasus persetujuan manusia
        approval_label = sanitize_step_label(None, node_type="HUMAN_APPROVAL")
        self.assertEqual(approval_label, "Menunggu persetujuan manusia")

    def test_pdp_authorization_cognitive_monitoring(self):
        """Memverifikasi penegakan otorisasi Unified PDP untuk panel monitoring kognitif."""
        # 1. Super Admin dengan MFA aktif -> DISETUJUI
        admin_subject = SubjectContext(
            user_id=str(uuid.uuid4()),
            tenant_id="global",
            actor_type="user",
            roles=["PLATFORM_SUPERADMIN"],
            capabilities=["admin.cognitive_monitoring.view", "platform.admin.manage"],
            is_mfa_verified=True,
        )
        resource = ResourceContext(
            resource_type="cognitive_monitoring",
            resource_id="global",
            owner_tenant_id="global",
        )
        decision = authorize(admin_subject, "admin.cognitive_monitoring.view", resource)
        self.assertTrue(decision.is_authorized, "Super Admin dengan MFA wajib diizinkan melihat monitoring kognitif.")

        # 2. Pengguna tenant biasa -> DITOLAK
        tenant_user_subject = SubjectContext(
            user_id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            actor_type="user",
            roles=["TENANT_MEMBER"],
            capabilities=["workflow.view"],
            is_mfa_verified=False,
        )
        decision_denied = authorize(tenant_user_subject, "admin.cognitive_monitoring.view", resource)
        self.assertFalse(decision_denied.is_authorized, "Anggota tenant biasa wajib ditolak membuka monitoring kognitif platform.")

    def test_allowed_statuses_completeness(self):
        """Memverifikasi status operasional terdefinisi lengkap sesuai DDL Bagian A."""
        expected = {'idle', 'thinking', 'calling_tool', 'generating_image', 'retrieving_memory', 'waiting_approval', 'error', 'completed'}
        self.assertEqual(ALLOWED_STATUSES, expected)

    @patch("app.domains.cognitive_monitoring.live_state_service.get_database_engine")
    @patch("app.domains.cognitive_monitoring.live_state_service.get_realtime_broadcaster")
    async def test_touch_heartbeat_flow(self, mock_broadcaster, mock_engine):
        """Memverifikasi pembaruan detak heartbeat live state."""
        from app.domains.cognitive_monitoring.live_state_service import touch_heartbeat

        mock_conn = MagicMock()
        mock_conn.execute.return_value.mappings.return_value.first.return_value = {
            "ai_agent_id": self.agent_id,
            "tenant_id": self.tenant_id,
        }
        mock_engine.return_value.begin.return_value.__enter__.return_value = mock_conn
        mock_broadcaster.return_value.publish = AsyncMock()

        success = await touch_heartbeat(self.workflow_id)
        self.assertTrue(success)
        mock_broadcaster.return_value.publish.assert_called_once()
        call_args = mock_broadcaster.return_value.publish.call_args[0]
        self.assertEqual(call_args[0], "platform:ai-agent-live")
        self.assertEqual(call_args[1]["event"], "heartbeat")

    @patch("app.domains.cognitive_monitoring.live_state_service.get_database_engine")
    @patch("app.domains.cognitive_monitoring.live_state_service.get_realtime_broadcaster")
    async def test_stale_cleanup_marks_error(self, mock_broadcaster, mock_engine):
        """Memverifikasi bahwa proses yang macet / hang ditandai error oleh job pembersihan (Bagian A.2)."""
        from app.domains.cognitive_monitoring.live_state_service import cleanup_stale_records

        mock_conn = MagicMock()
        mock_result_error = MagicMock()
        mock_result_error.fetchall.return_value = [("stale_row_1",)]
        mock_result_del = MagicMock()
        mock_result_del.fetchall.return_value = []

        mock_conn.execute.side_effect = [
            None,  # ensure table
            mock_result_error,  # marked error
            mock_result_del,  # deleted old
        ]
        mock_engine.return_value.begin.return_value.__enter__.return_value = mock_conn
        mock_broadcaster.return_value.publish = AsyncMock()

        res = await cleanup_stale_records(stale_threshold_seconds=90)
        self.assertEqual(res["marked_stale_errors"], 1)
        mock_broadcaster.return_value.publish.assert_called_once()
        call_args = mock_broadcaster.return_value.publish.call_args[0]
        self.assertEqual(call_args[1]["event"], "cleanup_sync")


if __name__ == "__main__":
    unittest.main()
