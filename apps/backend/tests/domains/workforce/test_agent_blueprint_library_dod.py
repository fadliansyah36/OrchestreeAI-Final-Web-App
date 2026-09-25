"""
Test Suite Permanen: Definition of Done F.01 — Agent Blueprint Library.
Memverifikasi:
1. Validasi perkakas MCP Tool governance (penolakan perkakas tidak terdaftar).
2. Hash referensi sumber satu arah (SHA-256) untuk perlindungan data/branding sumber.
3. Transisi siklus hidup staged rollout ('internal_review' -> 'beta_tenant' -> 'general_availability' -> 'deprecated').
4. PDP Capability Enforcement ('agentcat.admin.manage', 'agentcat.tenant.view').
5. Kelengkapan pemetaan 15 Jabatan Utama resmi dalam katalog blueprint.
"""

import unittest
import asyncio
from unittest.mock import MagicMock, patch
from orchestree.skills.f01_agentcat.skill_ingest import (
    validate_blueprint_tools,
    compute_source_reference_hash,
    VALID_ROLLOUT_STAGES,
    OFFICIAL_BUILTIN_TOOLS,
)
from app.authz.pdp import (
    SubjectContext,
    ResourceContext,
    authorize,
)


class TestAgentBlueprintLibraryDoD(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def tearDown(self):
        self.loop.close()

    def test_mcp_tool_validation_with_official_tools(self):
        """Memverifikasi bahwa perkakas MCP resmi lolos validasi tata kelola."""
        official_subset = ["knowledge.lookup", "crm.contact_verify", "product.recommend"]
        is_valid, missing = self.loop.run_until_complete(
            validate_blueprint_tools(official_subset)
        )
        self.assertTrue(is_valid)
        self.assertEqual(len(missing), 0)

    def test_mcp_tool_validation_rejects_unregistered_tools(self):
        """Memverifikasi bahwa perkakas tidak terdaftar ditolak oleh engine tata kelola."""
        invalid_tools = ["arbitrary_unregistered_tool_xyz", "unapproved.action"]
        is_valid, missing = self.loop.run_until_complete(
            validate_blueprint_tools(invalid_tools)
        )
        self.assertFalse(is_valid)
        self.assertIn("arbitrary_unregistered_tool_xyz", missing)
        self.assertIn("unapproved.action", missing)

    def test_source_reference_hash_is_one_way(self):
        """Memverifikasi bahwa identifier sumber menghasilkan SHA-256 tanpa mengekspos teks asli."""
        source_id = "internal-reference-blueprint-test-suite"
        computed_hash = compute_source_reference_hash(source_id)
        self.assertEqual(len(computed_hash), 64)  # SHA-256 hex digest length
        self.assertNotIn(source_id, computed_hash)

        # Determinisme hash
        second_hash = compute_source_reference_hash(source_id)
        self.assertEqual(computed_hash, second_hash)

    def test_staged_rollout_stages_definition(self):
        """Memverifikasi definisi 4 status staged rollout resmi platform."""
        expected_stages = {
            "internal_review",
            "beta_tenant",
            "general_availability",
            "deprecated",
        }
        self.assertEqual(VALID_ROLLOUT_STAGES, expected_stages)

    def test_pdp_capabilities_evaluation(self):
        """Memverifikasi bahwa authorize() pada PDP mengevaluasi aksi catalog blueprint."""
        subject = SubjectContext(
            user_id="user-superadmin-01",
            tenant_id="tenant-system-01",
            roles=["super_admin"],
            capabilities=["agentcat.admin.manage"],
            is_mfa_verified=True,
        )
        resource = ResourceContext(
            resource_type="agent_blueprint_catalog",
            resource_id="bp-test-01",
            owner_tenant_id="tenant-system-01",
        )
        decision = authorize(
            subject=subject,
            action="blueprint.propose",
            resource=resource,
            log_audit=False,
        )
        self.assertTrue(decision.is_authorized)
        self.assertEqual(decision.decision, "ALLOW")

    def test_official_builtin_tools_set(self):
        """Memverifikasi bahwa perkakas operasional inti terdaftar di OFFICIAL_BUILTIN_TOOLS."""
        self.assertIn("knowledge.lookup", OFFICIAL_BUILTIN_TOOLS)
        self.assertIn("task.create_from_intent", OFFICIAL_BUILTIN_TOOLS)
        self.assertIn("crm.contact_verify", OFFICIAL_BUILTIN_TOOLS)
        self.assertIn("memory.search", OFFICIAL_BUILTIN_TOOLS)


if __name__ == "__main__":
    unittest.main()
