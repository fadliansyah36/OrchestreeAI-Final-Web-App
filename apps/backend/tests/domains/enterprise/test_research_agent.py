"""
Uji Otomatis AI Research Agent (PRD v2.2 Bagian 8.6, 8.13.1, 3.5)
Definition of Done (DoD):
1. Jawaban AI Research Agent menyebutkan tingkat sumber yang dipakai (traceable).
2. Akses web publik (Tingkat 6) HANYA saat diizinkan oleh kebijakan tenant.
3. Menegakkan 6 Tingkat Knowledge Priority Hierarchy secara ketat.
"""

import unittest
import uuid
from orchestree.domains.enterprise.research_agent import (
    EnterpriseResearchAgent,
    KnowledgeSourceItem,
    ResearchPolicy,
    ResearchQueryResult,
    KNOWLEDGE_LEVEL_METADATA,
)


def create_sample_knowledge_sources():
    """Membuat sampel sumber pengetahuan pada 6 tingkat hierarki prioritas."""
    # Tingkat 1: Ground Truth
    s1 = KnowledgeSourceItem(
        level=1,
        title="SOP Kepatuhan Perlindungan Data Korporat & Keamanan Informasi (ISO 27001)",
        content="Kebijakan keamanan data menetapkan seluruh transmisi payload enkripsi wajib AES-256-GCM dengan retensi log audit kekal.",
        source_ref="SOP-SEC-2026-001",
        source_classification="Native",
        dimension_code="COMPLIANCE_AND_LEGAL",
        confidence_weight=1.0,
        is_verified=True,
    )

    # Tingkat 2: Operational Data
    s2 = KnowledgeSourceItem(
        level=2,
        title="Sinyal Real-time Transaksi Pembelian ERP SAP",
        content="Order PO-9921 senilai Rp 1.5 Miliar untuk server database telah diverifikasi finance dan dalam status pengiriman vendor.",
        source_ref="SAP-PO-9921",
        source_classification="Synced",
        dimension_code="OPERATIONAL_TRANSACTIONAL",
        confidence_weight=0.95,
        is_verified=True,
    )

    # Tingkat 3: Domain Knowledge Base
    s3 = KnowledgeSourceItem(
        level=3,
        title="Peta Arsitektur Strategis Q3: Multi-tenant Federated Fabric",
        content="Arsitektur enterprise mengadopsi federated company context fabric lintas 8 dimensi untuk menyatukan isolasi tenant.",
        source_ref="ARCH-FABRIC-08",
        source_classification="Uploaded",
        dimension_code="STRATEGY_AND_OBJECTIVES",
        confidence_weight=0.90,
        is_verified=True,
    )

    # Tingkat 4: Historical Learning
    s4 = KnowledgeSourceItem(
        level=4,
        title="Catatan Resolusi Insiden Keterlambatan Pasokan Server Q1",
        content="Pada Q1 2026, mitigasi keterlambatan dilakukan melalui pengalihan alokasi batch gudang regional Surabaya.",
        source_ref="AUDIT-POSTMORTEM-12",
        source_classification="Native",
        dimension_code="PROCESSES_AND_SOPS",
        confidence_weight=0.85,
        is_verified=True,
    )

    # Tingkat 5: Curated Industry Benchmark
    s5 = KnowledgeSourceItem(
        level=5,
        title="Benchmark Standar Waktu Respons SLA Enterprise APAC 2026",
        content="Standar industri enterprise Cloud di Asia Pasifik mencatat rata-rata Mean Time to Resolution (MTTR) di bawah 30 menit.",
        source_ref="BENCHMARK-GARTNER-2026",
        source_classification="External",
        dimension_code="CUSTOMER_AND_MARKET",
        confidence_weight=0.80,
        is_verified=True,
    )

    # Tingkat 6: Public Web Search (Memerlukan Izin Eksplisit)
    s6 = KnowledgeSourceItem(
        level=6,
        title="Berita Publik: Dinamika Rantai Pasok Semikonduktor Global Q3",
        content="Laporan berita Reuters mengindikasikan kelangkaan chip server enterprise berangsur normal pada paruh kedua tahun 2026.",
        source_ref="https://reuters.com/business/tech/semiconductor-supply-2026",
        source_classification="External",
        dimension_code="CUSTOMER_AND_MARKET",
        confidence_weight=0.70,
        is_verified=False,
    )

    return [s1, s2, s3, s4, s5, s6]


class TestEnterpriseResearchAgent(unittest.TestCase):

    def test_research_agent_denies_public_web_when_policy_disallows(self):
        """
        DoD 1: Bila kebijakan tenant melarang riset web publik (allow_public_web_search = False),
        AI Research Agent wajib MENOLAK akses Tingkat 6, mengecualikan rujukan web dari sintesis,
        dan melaporkan status penolakan secara transparan.
        """
        agent = EnterpriseResearchAgent()
        tenant_id = str(uuid.uuid4())
        sources = create_sample_knowledge_sources()

        # Kebijakan: Web search dinonaktifkan
        strict_policy = ResearchPolicy(allow_public_web_search=False)

        result = agent.execute_research(
            tenant_id=tenant_id,
            query="Bagaimana strategi mitigasi risiko pengadaan server dan kepatuhan regulasi kita?",
            research_objective="Perencanaan audit kesiapan Q3 2026",
            sources=sources,
            policy=strict_policy,
        )

        self.assertIsInstance(result, ResearchQueryResult)
        self.assertEqual(result.tenant_id, tenant_id)
        self.assertFalse(result.public_web_search_allowed)
        self.assertTrue(result.public_web_search_attempted)
        self.assertEqual(result.public_web_status, "DENIED_BY_TENANT_POLICY")

        # Verifikasi bahwa Tingkat 6 TIDAK masuk dalam sumber yang dikonsultasikan
        self.assertNotIn(6, result.knowledge_levels_consulted)
        self.assertIn(1, result.knowledge_levels_consulted)
        self.assertIn(2, result.knowledge_levels_consulted)
        self.assertIn(3, result.knowledge_levels_consulted)

        # Verifikasi laporan traceability
        trace = result.traceability_report
        self.assertFalse(trace["public_web_search_allowed"])
        self.assertEqual(trace["rejected_web_sources_count"], 1)
        self.assertNotIn(6, trace["levels_consulted"])

        # Verifikasi teks jawaban (DoD: Traceable & penolakan web eksplisit)
        answer = result.answer_text
        self.assertIn("[HIERARKI SUMBER PENGETAHUAN TERPAKAI]", answer)
        self.assertIn("Tingkat 1: Verified Internal Ground Truth", answer)
        self.assertIn("[STATUS AKSES WEB PUBLIK]", answer)
        self.assertIn("DITOLAK / TIDAK DIIZINKAN (DENIED_BY_TENANT_POLICY)", answer)
        self.assertNotIn("Reuters", answer)  # Sumber web dikesampingkan

    def test_research_agent_allows_public_web_when_policy_permits(self):
        """
        DoD 2: Bila kebijakan tenant mengizinkan riset web publik (allow_public_web_search = True),
        AI Research Agent mengintegrasikan rujukan Tingkat 6 dengan penanda sitasi eksplisit.
        """
        agent = EnterpriseResearchAgent()
        tenant_id = str(uuid.uuid4())
        sources = create_sample_knowledge_sources()

        # Kebijakan: Web search diizinkan
        permissive_policy = ResearchPolicy(allow_public_web_search=True)

        result = agent.execute_research(
            tenant_id=tenant_id,
            query="Bagaimana proyeksi pasar pasokan server global dibandingkan kesiapan internal kita?",
            sources=sources,
            policy=permissive_policy,
        )

        self.assertTrue(result.public_web_search_allowed)
        self.assertTrue(result.public_web_search_attempted)
        self.assertEqual(result.public_web_status, "PERMITTED")

        # Tingkat 6 wajib ada dalam level yang dikonsultasikan
        self.assertIn(6, result.knowledge_levels_consulted)

        trace = result.traceability_report
        self.assertTrue(trace["public_web_search_allowed"])
        self.assertEqual(trace["rejected_web_sources_count"], 0)

        # Verifikasi teks jawaban mencantumkan sitasi dan status diizinkan
        answer = result.answer_text
        self.assertIn("[STATUS AKSES WEB PUBLIK]", answer)
        self.assertIn("DIIZINKAN (Tingkat 6 Aktif)", answer)
        self.assertIn("[Tingkat 6", answer)
        self.assertIn("Reuters", answer)

    def test_research_agent_traceability_hierarchy_ordering(self):
        """
        DoD 3: Pastikan urutan hierarki prioritas tingkat 1 selalu diutamakan di atas tingkat lainnya,
        dan skor keyakinan merefleksikan otoritas data primer.
        """
        agent = EnterpriseResearchAgent()
        tenant_id = str(uuid.uuid4())
        sources = create_sample_knowledge_sources()

        policy = ResearchPolicy(allow_public_web_search=False)
        result = agent.execute_research(
            tenant_id=tenant_id,
            query="SOP apa yang mengatur enkripsi data?",
            sources=sources,
            policy=policy,
        )

        # Tingkat tertinggi harus Tingkat 1
        self.assertEqual(result.traceability_report["highest_priority_level"], 1)
        # Urutan sitasi pertama wajib tingkat 1
        self.assertEqual(result.traceability_report["citations"][0]["knowledge_level"], 1)
        self.assertEqual(result.traceability_report["citations"][0]["source_ref"], "SOP-SEC-2026-001")
        # Skor keyakinan harus tinggi karena didukung Ground Truth terverifikasi
        self.assertGreaterEqual(result.confidence_score, 0.85)


if __name__ == "__main__":
    unittest.main()
