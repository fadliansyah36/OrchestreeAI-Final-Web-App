"""
Uji Otomatis Enterprise Event Engine & Knowledge Rule Governance (PRD v2.2 Bagian 8.13.8)
DEFINITION OF DONE:
"Rule Knowledge baru dari AI Research Agent (Fase 27) TIDAK aktif otomatis sampai disetujui manusia eksplisit."
"""

import unittest
import uuid
from orchestree.domains.enterprise.event_engine import (
    EnterpriseEventEngine,
    EventDefinition,
    KnowledgeEventRule,
    EventEvaluationResult,
)


class TestEnterpriseEventEngine(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.engine = EnterpriseEventEngine()
        self.tenant_id = str(uuid.uuid4())

    async def test_dod_ai_research_agent_rule_inactive_until_human_approved(self):
        """
        PENEGAKAN DEFINITION OF DONE:
        1. AI Research Agent mengusulkan rule baru (mis. Cash Flow Alert atau Dynamic Discount).
        2. Rule tersebut WAJIB default PENDING_HUMAN_APPROVAL dan is_active = False.
        3. Saat event dievaluasi, rule AI tertahan dan DIBLOKIR dari eksekusi.
        4. Setelah disetujui manusia eksplisit, barulah rule aktif dan dieksekusi saat event terpicu.
        """
        event_def = EventDefinition(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            event_code="CASH_FLOW_DEFICIT_RISK",
            event_name="Peringatan Arus Kas Negatif",
            dimension_code="FINANCIALS_AND_BUDGET",
            trigger_type="THRESHOLD_BREACH",
            trigger_conditions={
                "metric": "net_cash_flow",
                "operator": "<",
                "threshold": 0
            },
            target_department="FINANCE",
            severity="HIGH",
        )

        # 1. AI Research Agent mengusulkan Knowledge Rule baru
        proposed_rule: KnowledgeEventRule = self.engine.propose_rule_from_ai_research(
            tenant_id=self.tenant_id,
            rule_code="AI_AUTO_FREEZE_DISCRETIONARY_SPEND",
            rule_name="AI Freeze Discretionary Expenses saat Defisit Arus Kas",
            condition_logic={"min_deficit_idr": 10000000},
            directive_action={"action": "FREEZE_EXPENSE_CARDS", "target": "MARKETING"},
            event_definition_id=event_def.id,
        )

        # DoD Bagian 1: Verifikasi state awal rule dari AI Research Agent
        self.assertEqual(proposed_rule.rule_source, "AI_RESEARCH_AGENT")
        self.assertEqual(proposed_rule.approval_status, "PENDING_HUMAN_APPROVAL")
        self.assertFalse(proposed_rule.is_active)
        self.assertIsNone(proposed_rule.approved_by_user_id)

        # 2. Defisit arus kas terjadi (net_cash_flow = -15,000,000 IDR)
        context_data = {"net_cash_flow": -15000000.0}

        # Evaluasi event saat rule BELUM disetujui manusia
        eval_before: EventEvaluationResult = await self.engine.evaluate_event(
            tenant_id=self.tenant_id,
            event_def=event_def,
            context_data=context_data,
            associated_rules=[proposed_rule],
        )

        # DoD Bagian 2: Event terpicu, TETAPI rule dari AI DIBLOKIR dan TIDAK dieksekusi!
        self.assertTrue(eval_before.is_triggered)
        self.assertEqual(len(eval_before.active_rules_executed), 0)
        self.assertEqual(len(eval_before.pending_rules_blocked), 1)
        self.assertIn("DITAHAN", eval_before.pending_rules_blocked[0])
        self.assertIn("Menunggu persetujuan manusia eksplisit", eval_before.pending_rules_blocked[0])
        self.assertEqual(len(eval_before.generated_actions), 0)

        # 3. Manusia (Direktur Keuangan / Manager) meninjau dan menyetujui secara eksplisit
        human_finance_director_id = str(uuid.uuid4())
        approved_rule: KnowledgeEventRule = await self.engine.approve_knowledge_rule(
            tenant_id=self.tenant_id,
            rule=proposed_rule,
            approved_by_user_id=human_finance_director_id,
            approved_by_role="DIRECTOR",
        )

        # DoD Bagian 3: Rule telah sah dan aktif setelah persetujuan manusia
        self.assertEqual(approved_rule.approval_status, "APPROVED")
        self.assertTrue(approved_rule.is_active)
        self.assertEqual(approved_rule.approved_by_user_id, human_finance_director_id)
        self.assertIsNotNone(approved_rule.approved_at)

        # 4. Evaluasi ulang setelah disetujui manusia
        eval_after: EventEvaluationResult = await self.engine.evaluate_event(
            tenant_id=self.tenant_id,
            event_def=event_def,
            context_data=context_data,
            associated_rules=[approved_rule],
        )

        # DoD Bagian 4: Rule sekarang BERHASIL dieksekusi secara aman!
        self.assertTrue(eval_after.is_triggered)
        self.assertIn("AI_AUTO_FREEZE_DISCRETIONARY_SPEND", eval_after.active_rules_executed)
        self.assertEqual(len(eval_after.pending_rules_blocked), 0)
        self.assertEqual(len(eval_after.generated_actions), 1)
        self.assertEqual(eval_after.generated_actions[0]["action_directive"]["action"], "FREEZE_EXPENSE_CARDS")
        self.assertEqual(eval_after.generated_actions[0]["approved_by_user_id"], human_finance_director_id)

    async def test_unauthorized_role_cannot_approve_ai_knowledge_rule(self):
        """
        Pengguna non-manajerial atau entitas tanpa wewenang dilarang menyetujui rule AI.
        """
        proposed_rule: KnowledgeEventRule = self.engine.propose_rule_from_ai_research(
            tenant_id=self.tenant_id,
            rule_code="DUMMY_AI_RULE",
            rule_name="Aturan Coba",
            condition_logic={},
            directive_action={},
        )

        with self.assertRaises(ValueError) as ctx:
            await self.engine.approve_knowledge_rule(
                tenant_id=self.tenant_id,
                rule=proposed_rule,
                approved_by_user_id=str(uuid.uuid4()),
                approved_by_role="STAFF_GUEST",  # Role tidak berhak
            )

        self.assertIn("tidak memiliki wewenang", str(ctx.exception))
        self.assertEqual(proposed_rule.approval_status, "PENDING_HUMAN_APPROVAL")
        self.assertFalse(proposed_rule.is_active)


if __name__ == "__main__":
    unittest.main()
