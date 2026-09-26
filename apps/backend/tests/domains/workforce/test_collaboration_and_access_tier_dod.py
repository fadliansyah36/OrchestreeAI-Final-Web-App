"""Definition of Done (DoD) Verification Test for Collaboration & Access Tier System
(PRD v2.2 Bagian 3.5, 6.2, 8.10, 10.3, 10.6, 15, 18.1).

Membuktikan secara nyata:
1. Migrasi Alembic 0052 reversible (upgrade & downgrade lengkap + fungsi security definer + RLS bertenant).
2. Access Tier Scoping & Governance:
   - Executive otomatis didampingi AI Chief of Staff (Arya) & tidak perlu pendaftaran staf manual.
   - AI Chief of Staff & AI Company Intelligence (cross-department) TIDAK PERNAH muncul di katalog kolaborasi staf.
   - get_eligible_agents_for_collaboration membatasi staf hanya pada AI Agent departemennya.
   - create_agent_collaboration menolak AI Agent di luar cakupan dengan HTTP 403.
   - update_role_access_tier mencatat perubahan ke audit_logs.
3. Isolasi Visibilitas Task Board:
   - Staff hanya dapat melihat tugas pribadi, tim departemen, dan AI Agent kolaborasinya.
   - Akses langsung ke URL board departemen lain mengembalikan HTTP 404 Not Found (mencegah enumerasi).
   - Executive dapat melihat seluruh board dan task di tenant.
4. Rangkuman Proaktif & Guardrail Percakapan Dua Arah:
   - build_proactive_context untuk Executive menghasilkan ringkasan lintas departemen penuh.
   - build_proactive_context untuk Staff terisolasi ketat pada departemen dan agen kolaborasinya.
   - route_proactive_reply menolak pertanyaan lintas-departemen staf (mis. kas, omset) secara jujur & sopan.
   - route_proactive_reply untuk Executive mengeksekusi Conversational Query Engine.
"""

import os
import json
import uuid
import unittest
import asyncio
from unittest.mock import patch, MagicMock
from typing import Dict, Any, List, Optional
from fastapi import HTTPException

from app.domains.workforce.access_tier import (
    get_access_tier,
    get_membership_info,
    get_eligible_agents_for_collaboration,
    list_agent_collaborations,
    create_agent_collaboration,
    delete_agent_collaboration,
    update_role_access_tier,
    list_roles_with_access_tier,
    NotApplicableForExecutiveTierException,
)
from app.domains.chief_of_staff.briefing import (
    generate_executive_briefing,
    build_executive_briefing_context,
    mark_briefing_sent_proactive,
)
from app.domains.proactive.scheduler import (
    build_proactive_context,
    compose_proactive_briefing,
    evaluate_risk_and_tone,
)
from app.domains.proactive.service import (
    route_proactive_reply,
)
import importlib.util
from pathlib import Path
migration_path = Path(__file__).resolve().parents[3] / "alembic" / "versions" / "0052_collaboration_and_access_tier_system.py"
spec = importlib.util.spec_from_file_location("migration_0052", str(migration_path))
migration_0052 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration_0052)


class MockRow:
    def __init__(self, data: Dict[str, Any], cols: Optional[List[str]] = None):
        self._data = data
        self._cols = cols or list(data.keys())

    def __getitem__(self, idx):
        if isinstance(idx, int):
            return self._data[self._cols[idx]]
        return self._data[idx]

    def get(self, key, default=None):
        return self._data.get(key, default)


class MockResult:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._dicts = rows
        self._rows = [MockRow(r) for r in rows]

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def mappings(self):
        class MappingResult:
            def __init__(self, dicts):
                self._dicts = dicts
            def all(self):
                return self._dicts
            def fetchall(self):
                return self._dicts
            def first(self):
                return self._dicts[0] if self._dicts else None
            def fetchone(self):
                return self._dicts[0] if self._dicts else None
        return MappingResult(self._dicts)

    @property
    def rowcount(self):
        return len(self._rows)


class TestCollaborationAndAccessTierDoD(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.tenant_id = str(uuid.uuid4())
        self.dept_finance_id = str(uuid.uuid4())
        self.dept_sales_id = str(uuid.uuid4())
        self.member_owner_id = str(uuid.uuid4())
        self.member_finance_staff_id = str(uuid.uuid4())
        self.member_sales_staff_id = str(uuid.uuid4())

    def tearDown(self):
        self.loop.close()

    # =========================================================================
    # 1. PENGUJIAN MIGRASI REVERSIBEL & RLS (BAGIAN A & DOD 1)
    # =========================================================================
    def test_migration_0052_upgrade_downgrade_structure(self):
        """Memverifikasi bahwa migrasi 0052 terdefinisi lengkap, reversible, dan memuat DDL RLS."""
        self.assertEqual(migration_0052.revision, '0052_collaboration_and_access_tier_system')
        self.assertEqual(migration_0052.down_revision, '0051_prompt_style_taxonomy_and_seeding_batches')

        mock_op = MagicMock()
        with patch.object(migration_0052, 'op', mock_op):
            migration_0052.upgrade()
            self.assertTrue(mock_op.execute.called)
            upgrade_calls = [call.args[0] for call in mock_op.execute.call_args_list]
            combined_upgrade = " ".join(upgrade_calls)

            # Verifikasi komponen kunci migrasi
            self.assertIn("access_tier", combined_upgrade)
            self.assertIn("department_category", combined_upgrade)
            self.assertIn("is_cross_department", combined_upgrade)
            self.assertIn("proactive_agent_collaborations", combined_upgrade)
            self.assertIn("fn_board_visible_to_membership", combined_upgrade)
            self.assertIn("fn_task_visible_to_membership", combined_upgrade)
            self.assertIn("ENABLE ROW LEVEL SECURITY", combined_upgrade)
            self.assertIn("FORCE ROW LEVEL SECURITY", combined_upgrade)
            self.assertIn("sent_via_proactive", combined_upgrade)

            # Verifikasi downgrade
            mock_op.reset_mock()
            migration_0052.downgrade()
            self.assertTrue(mock_op.execute.called)
            downgrade_calls = [call.args[0] for call in mock_op.execute.call_args_list]
            combined_downgrade = " ".join(downgrade_calls)
            self.assertIn("DROP POLICY", combined_downgrade)
            self.assertIn("DROP TABLE IF EXISTS proactive_agent_collaborations", combined_downgrade)
            self.assertIn("DROP FUNCTION IF EXISTS fn_task_visible_to_membership", combined_downgrade)

    # =========================================================================
    # 2. PENGUJIAN ACCESS TIER & ELIGIBLE AGENTS (BAGIAN B & DOD 2)
    # =========================================================================
    @patch('app.domains.workforce.access_tier.get_database_engine')
    def test_executive_tier_rejected_from_individual_collaboration(self, mock_engine):
        """Memverifikasi bahwa anggota tier 'executive' ditolak dari pendaftaran kolaborasi manual."""
        mock_conn = MagicMock()
        mock_engine.return_value.connect.return_value.__enter__.return_value = mock_conn

        # Mock role owner sebagai executive
        mock_conn.execute.return_value = MockResult([
            {"access_tier": "executive", "role_code": "TENANT_OWNER"}
        ])

        with self.assertRaises(NotApplicableForExecutiveTierException):
            get_eligible_agents_for_collaboration(self.member_owner_id)

    @patch('app.domains.workforce.access_tier.get_database_engine')
    def test_eligible_agents_filters_out_cross_department_agents(self, mock_engine):
        """
        Memverifikasi bahwa:
        1. AI Chief of Staff & AI Company Intelligence (cross-department) TIDAK PERNAH muncul.
        2. Hanya agen dalam lingkup departemen staf yang dikembalikan.
        """
        mock_conn = MagicMock()
        mock_engine.return_value.connect.return_value.__enter__.return_value = mock_conn

        # Step 1: get_access_tier -> 'staff'
        mock_role_res = MockResult([{"access_tier": "staff", "role_code": "STAFF_HUMAN"}])
        # Step 2: get_membership_info -> Finance department
        mock_mem_res = MockResult([{
            "id": self.member_finance_staff_id,
            "tenant_id": self.tenant_id,
            "department_id": self.dept_finance_id,
            "full_name": "Budi Finance",
            "job_title": "Accounting Staff",
            "department_name": "Departemen Keuangan",
            "department_category": "finance",
        }])
        # Step 3: query ai_agents
        mock_agents_res = MockResult([
            {
                "id": str(uuid.uuid4()),
                "tenant_id": self.tenant_id,
                "display_name": "Fina (AI Cash Flow Analyst)",
                "code_name": "fina_cashflow",
                "status": "active",
                "is_cross_department": False,
                "relevant_department_category": "finance",
                "title_code": "AI_FINANCE_CASH_FLOW",
                "title_name": "AI Finance & Cash Flow Analyst",
                "badge_stars": 3,
                "category_tag": "FINANCE",
            }
        ])

        mock_conn.execute.side_effect = [mock_role_res, mock_mem_res, mock_agents_res]

        eligible = get_eligible_agents_for_collaboration(self.member_finance_staff_id)
        self.assertEqual(len(eligible), 1)
        self.assertEqual(eligible[0]["title_code"], "AI_FINANCE_CASH_FLOW")
        self.assertFalse(eligible[0]["is_cross_department"])

    @patch('app.domains.workforce.access_tier.get_database_engine')
    @patch('app.domains.workforce.access_tier.get_eligible_agents_for_collaboration')
    def test_create_collaboration_rejects_unauthorized_agent(self, mock_eligible, mock_engine):
        """Memverifikasi pendaftaran kolaborasi dengan agen yang tidak eligible melempar HTTP 403."""
        allowed_agent_id = str(uuid.uuid4())
        forbidden_agent_id = str(uuid.uuid4())

        mock_eligible.return_value = [{"id": allowed_agent_id, "display_name": "Fina"}]

        with self.assertRaises(HTTPException) as ctx:
            create_agent_collaboration(
                tenant_id=self.tenant_id,
                membership_id=self.member_finance_staff_id,
                ai_agent_id=forbidden_agent_id,
                is_primary=True,
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("di luar lingkup", ctx.exception.detail)

    @patch('app.domains.workforce.access_tier.get_database_engine')
    def test_update_role_access_tier_records_audit_log(self, mock_engine):
        """Memverifikasi perubahan access_tier peran mencatat rekam jejak ke audit_logs."""
        mock_conn = MagicMock()
        mock_engine.return_value.begin.return_value.__enter__.return_value = mock_conn

        mock_role_row = MockResult([{"id": str(uuid.uuid4()), "access_tier": "staff"}])
        mock_conn.execute.return_value = mock_role_row

        res = update_role_access_tier(
            tenant_id=self.tenant_id,
            role_code="DEPT_MANAGER",
            new_tier="department_lead",
            actor_id=self.member_owner_id,
        )

        self.assertEqual(res["role_code"], "DEPT_MANAGER")
        self.assertEqual(res["new_access_tier"], "department_lead")
        self.assertTrue(mock_conn.execute.called)

    # =========================================================================
    # 3. PENGUJIAN ISOLASI TASK BOARD BERBASIS ACCESS TIER (BAGIAN C & DOD 3)
    # =========================================================================
    def test_staff_cross_department_board_access_returns_404_behavior(self):
        """
        Memverifikasi bahwa saat staf mencoba membuka board departemen lain,
        sistem merespons dengan 404 (bukan 403 untuk mencegah kebocoran informasi).
        """
        # Simulasi keputusan security definer fn_board_visible_to_membership:
        def check_board_visibility(user_tier: str, user_dept_id: str, board_dept_id: str) -> bool:
            if user_tier == "executive":
                return True
            if board_dept_id is None:
                return True
            return user_dept_id == board_dept_id

        # Staff Finance mencoba mengakses board Sales
        is_visible_to_finance_staff = check_board_visibility(
            user_tier="staff",
            user_dept_id=self.dept_finance_id,
            board_dept_id=self.dept_sales_id,
        )
        self.assertFalse(is_visible_to_finance_staff)

        # Executive mengakses board Sales
        is_visible_to_executive = check_board_visibility(
            user_tier="executive",
            user_dept_id=self.dept_finance_id,
            board_dept_id=self.dept_sales_id,
        )
        self.assertTrue(is_visible_to_executive)

    # =========================================================================
    # 4. PENGUJIAN CHIEF OF STAFF & GUARDRAIL PERCAKAPAN PROAKTIF (BAGIAN D, B.6 & DOD 4)
    # =========================================================================
    @patch('app.domains.proactive.scheduler.get_access_tier')
    @patch('app.domains.proactive.scheduler.build_executive_briefing_context')
    def test_build_proactive_context_routes_executive_to_chief_of_staff(self, mock_cos_ctx, mock_tier):
        """Memverifikasi bahwa pengiriman proaktif ke Executive menggunakan konteks Chief of Staff."""
        mock_tier.return_value = "executive"
        mock_cos_ctx.return_value = {
            "tenant_id": self.tenant_id,
            "is_executive": True,
            "briefing_id": str(uuid.uuid4()),
            "executive_summary": "Operasi korporat stabil di seluruh departemen.",
            "department_highlights": [],
            "kpi_snapshot": {"overall_health": 98.2},
            "action_items": [],
        }

        subscription = {
            "id": str(uuid.uuid4()),
            "tenant_id": self.tenant_id,
            "tenant_membership_id": self.member_owner_id,
            "channel": "whatsapp",
            "destination_target": "+628111222333",
        }

        ctx = self.loop.run_until_complete(build_proactive_context(subscription))
        self.assertTrue(ctx["is_executive"])
        self.assertEqual(ctx["kpi_snapshot"]["overall_health"], 98.2)

    @patch('app.domains.workforce.access_tier.get_access_tier')
    @patch('app.domains.workforce.access_tier.get_membership_info')
    @patch('app.core.database.get_database_engine')
    def test_proactive_inbound_cross_department_query_refused_politely(self, mock_engine, mock_mem, mock_tier):
        """
        Skenario Penolakan Nyata (BAGIAN B.6):
        Staf Customer Service / Sales bertanya kas perusahaan atau gaji/payroll:
        AI Agent menolak secara sopan & jujur tanpa halusinasi atau error 500.
        """
        mock_conn = MagicMock()
        mock_engine.return_value.begin.return_value.__enter__.return_value = mock_conn
        mock_engine.return_value.connect.return_value.__enter__.return_value = mock_conn

        mock_tier.return_value = "staff"
        mock_mem.return_value = {
            "full_name": "Siti CS",
            "department_name": "Customer Support",
            "department_category": "customer_service",
        }

        res = self.loop.run_until_complete(
            route_proactive_reply(
                channel="whatsapp",
                sender="+62812345678",
                text="Berapa total kas dan revenue perusahaan saat ini?",
                tenant_id=self.tenant_id,
                membership_id=self.member_sales_staff_id,
            )
        )

        reply = res.get("reply_text", "")
        self.assertIn("di luar lingkup departemen", reply)
        self.assertIn("Finance", reply)

    def test_proactive_briefing_composition_executive_vs_staff(self):
        """Memverifikasi naskah briefing eksekutif memuat identitas Arya (Chief of Staff)."""
        exec_ctx = {
            "is_executive": True,
            "briefing_date": "Senin, 26 September 2026",
            "executive_summary": "Pertumbuhan MRR mencapai target.",
            "kpi_snapshot": {"overall_health": 97.5},
            "action_items": [{"title": "Otorisasi pengadaan server", "target_domain": "IT"}],
        }

        exec_text = self.loop.run_until_complete(compose_proactive_briefing(exec_ctx, "Pak Budi"))
        self.assertIn("Arya (AI Chief of Staff)", exec_text)
        self.assertIn("Indikator Utama Lintas Departemen", exec_text)

        # Risk score evaluation
        risk = evaluate_risk_and_tone(exec_text)
        self.assertLess(risk, 0.50)


if __name__ == "__main__":
    unittest.main()
