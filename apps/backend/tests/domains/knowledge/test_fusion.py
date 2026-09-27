"""
Uji Otomatis Context Fabric & Knowledge Fusion Engine (PRD v2.2 Bagian 8.6, 8.13.6, 8.13.8)
Menguji:
1. Fusi node 8 dimensi konteks perusahaan berdasarkan prioritas level 1-6.
2. Penegakan Definition of Done: Rule Knowledge baru dari AI Research Agent TIDAK aktif otomatis
   sampai disetujui manusia eksplisit.
3. Isolasi dimensi ERP eksternal (hanya Enterprise).
"""

import unittest
import uuid
from orchestree.domains.knowledge.fusion import (
    KnowledgeFusionEngine,
    KnowledgeFusionResult,
    FusedKnowledgeItem,
)


class TestKnowledgeFusionEngine(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.engine = KnowledgeFusionEngine()
        self.tenant_id = str(uuid.uuid4())

    async def test_unapproved_ai_research_agent_rule_excluded_from_active_fusion(self):
        """
        PENEGAKAN DEFINITION OF DONE:
        Rule Knowledge baru dari AI Research Agent (Fase 27) TIDAK aktif otomatis sampai disetujui manusia.
        Node dari AI yang belum disetujui WAJIB masuk ke unapproved_ai_rules dan TIDAK masuk ke active_fused_nodes.
        """
        simulated_nodes = [
            # 1. Konstitusi Inti Perusahaan (Disetujui / Terverifikasi Native)
            {
                "id": str(uuid.uuid4()),
                "dimension_code": "STRATEGY_AND_OBJECTIVES",
                "node_key": "core_mission",
                "title": "Misi Utama Perusahaan 2026",
                "content": "Pertumbuhan EBITDA sehat dengan kepatuhan zero-leakage.",
                "priority_level": 1,
                "source_classification": "Native",
                "is_verified": True,
                "approval_status": "APPROVED",
                "is_active": True,
            },
            # 2. Rule Baru Temuan AI Research Agent (BELUM DISETUJUI MANUSIA)
            {
                "id": str(uuid.uuid4()),
                "dimension_code": "CUSTOMER_AND_MARKET",
                "node_key": "ai_competitor_pricing_rule",
                "title": "Rekomendasi Pemotongan Harga 15% dari Riset AI",
                "content": "Kompetitor menurunkan harga 12%, disarankan penyesuaian harga otomatis.",
                "priority_level": 5,
                "source_classification": "AI_RESEARCH_AGENT",
                "is_verified": False,
                "metadata": {
                    "generated_by": "AI_RESEARCH_AGENT",
                    "approval_status": "PENDING_HUMAN_APPROVAL",
                    "is_active": False,
                }
            },
        ]

        result: KnowledgeFusionResult = await self.engine.fuse_knowledge(
            tenant_id=self.tenant_id,
            tier_code="PRO",
            knowledge_nodes_override=simulated_nodes,
        )

        # DoD: Rule AI yang belum disetujui TIDAK BOLEH aktif
        self.assertEqual(result.total_nodes_considered, 2)
        self.assertEqual(result.active_fused_count, 1)
        self.assertEqual(result.unapproved_ai_rules_count, 1)

        # Node aktif HANYA konstitusi internal
        active_keys = [n.node_key for n in result.active_fused_nodes]
        self.assertIn("core_mission", active_keys)
        self.assertNotIn("ai_competitor_pricing_rule", active_keys)

        # Rule AI tertahan di unapproved_ai_rules
        unapproved_keys = [n.node_key for n in result.unapproved_ai_rules]
        self.assertIn("ai_competitor_pricing_rule", unapproved_keys)
        self.assertFalse(result.unapproved_ai_rules[0].is_active)
        self.assertEqual(result.unapproved_ai_rules[0].approval_status, "PENDING_HUMAN_APPROVAL")

    async def test_approved_ai_rule_included_in_active_fusion(self):
        """
        Setelah rule AI disetujui manusia eksplisit, barulah rule tersebut diaktifkan ke active_fused_nodes.
        """
        human_approver_id = str(uuid.uuid4())
        simulated_nodes = [
            {
                "id": str(uuid.uuid4()),
                "dimension_code": "CUSTOMER_AND_MARKET",
                "node_key": "ai_competitor_pricing_rule",
                "title": "Rekomendasi Pemotongan Harga 15% (Sudah Disetujui)",
                "content": "Kompetitor menurunkan harga, disetujui oleh Direktur Komersial.",
                "priority_level": 5,
                "source_classification": "AI_RESEARCH_AGENT",
                "approval_status": "APPROVED",
                "is_active": True,
                "approved_by_user_id": human_approver_id,
                "metadata": {
                    "generated_by": "AI_RESEARCH_AGENT",
                    "approval_status": "APPROVED",
                    "is_active": True,
                    "approved_by_user_id": human_approver_id,
                }
            },
        ]

        result: KnowledgeFusionResult = await self.engine.fuse_knowledge(
            tenant_id=self.tenant_id,
            tier_code="PRO",
            knowledge_nodes_override=simulated_nodes,
        )

        self.assertEqual(result.active_fused_count, 1)
        self.assertEqual(result.unapproved_ai_rules_count, 0)
        self.assertTrue(result.active_fused_nodes[0].is_active)
        self.assertEqual(result.active_fused_nodes[0].approved_by_user_id, human_approver_id)

    async def test_enterprise_erp_dimension_isolation(self):
        """
        Dimensi sinkronisasi ERP hanya dapat dilebur untuk tier ENTERPRISE.
        """
        nodes = [
            {
                "id": str(uuid.uuid4()),
                "dimension_code": "FINANCIALS_AND_BUDGET",
                "node_key": "erp_sap_ledger_node",
                "title": "SAP Financial Dimension Tree",
                "content": "Katalog akun COA korporat SAP.",
                "priority_level": 3,
                "source_classification": "Synced",
                "source_reference": "ERP_SAP_CONNECTOR",
                "approval_status": "APPROVED",
                "is_active": True,
            }
        ]

        # 1. Tier Starter -> Diabaikan (tidak diekspos ke non-enterprise)
        starter_res = await self.engine.fuse_knowledge(
            tenant_id=self.tenant_id,
            tier_code="STARTER",
            knowledge_nodes_override=nodes,
        )
        self.assertEqual(starter_res.active_fused_count, 0)
        self.assertFalse(starter_res.has_external_erp_dimension)

        # 2. Tier Enterprise -> Dilebur dengan sukses
        enterprise_res = await self.engine.fuse_knowledge(
            tenant_id=self.tenant_id,
            tier_code="ENTERPRISE",
            knowledge_nodes_override=nodes,
        )
        self.assertEqual(enterprise_res.active_fused_count, 1)
        self.assertTrue(enterprise_res.has_external_erp_dimension)


if __name__ == "__main__":
    unittest.main()
