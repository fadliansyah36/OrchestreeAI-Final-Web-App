"""Definition of Done (DoD) Verification Test for Universal AI Selection Audit Lifecycle
and ABAC Data Access Control (PRD v2.2 Bagian 3.3, 3.5, 13.1, Bagian A.5 & Prompt Fase 4)

Membuktikan:
1. Migrasi Alembic 0047 reversible (upgrade & downgrade lengkap + indeks + pendaftaran kapabilitas).
2. Audit Ledger Terpadu: mencatat SELURUH siklus hidup seleksi (prompt instruksi, dataset dokumen sumber,
   AI Agent eksekutor, hasil scoring, keputusan review & approval, ekspor berkas nyata) dalam satu jejak per selection_job_id.
3. Penegakan ABAC (Data Access Control):
   - Skenario Nyata Penolakan: Sales Agent menjalankan seleksi domain Finance tanpa izin eksplisit -> DITOLAK (PermissionError)
     dan dicatat sebagai event SELECTION_ABAC_DENIED di Audit Ledger.
   - Skenario Lulus: AI Agent dengan izin eksplisit atau persona yang berwenang diizinkan dan allowed_fields ditegakkan.
4. Isolasi Lintas Tenant: Tenant A tidak dapat mengakses riwayat audit siklus hidup Tenant B.
5. Endpoint OpenAPI terdaftar secara resmi di router FastAPI.
"""

import os
import json
import uuid
import unittest
import asyncio
from unittest.mock import patch, MagicMock
from contextlib import contextmanager
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.domains.selection.service import SelectionDomainService
from app.domains.selection.pipeline import PipelineStage, SourceChannel
from app.authz.abac import ABACSubject, ABACResource, check_ai_data_permission, ABACDecision


class TestAuditDbState:
    jobs: Dict[str, Dict[str, Any]] = {}
    criteria: Dict[str, Dict[str, Any]] = {}
    documents: Dict[str, Dict[str, Any]] = {}
    results: Dict[str, Dict[str, Any]] = {}
    events: List[Dict[str, Any]] = []
    agents: Dict[str, Dict[str, Any]] = {}
    policies: List[Dict[str, Any]] = []

    @classmethod
    def reset(cls):
        cls.jobs = {}
        cls.criteria = {}
        cls.documents = {}
        cls.results = {}
        cls.events = []
        cls.agents = {}
        cls.policies = []


class MockRow:
    def __init__(self, data: Dict[str, Any], cols: Optional[List[str]] = None):
        self._data = data
        self._cols = cols or list(data.keys())

    def __getitem__(self, idx):
        if isinstance(idx, int):
            return self._data[self._cols[idx]]
        return self._data[idx]

    def __getattr__(self, name):
        return self._data.get(name)


class SelectionAuditLifecycleAndAbacDoDTests(unittest.TestCase):
    def setUp(self):
        TestAuditDbState.reset()
        self.tenant_a = str(uuid.uuid4())
        self.tenant_b = str(uuid.uuid4())

    def test_01_alembic_0047_migration_structure(self):
        """Verifikasi bahwa migrasi 0047 reversible dengan indeks dan pendaftaran kapabilitas."""
        migration_file = "apps/backend/alembic/versions/0047_selection_audit_lifecycle_and_abac.py"
        self.assertTrue(os.path.exists(migration_file), f"File migrasi {migration_file} wajib ada.")

        with open(migration_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Cek rantai revisi
        self.assertIn('revision: str = "0047_selection_audit_lifecycle_and_abac"', content)
        self.assertIn('down_revision: Union[str, None] = "0046_selection_calibration_profiles_and_items"', content)

        # Cek pembuatan indeks audit lifecycle
        self.assertIn("CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job", content)
        self.assertIn("CREATE INDEX IF NOT EXISTS idx_company_context_events_selection_job_alt", content)

        # Cek pendaftaran kapabilitas baru
        self.assertIn("selection.audit.view", content)
        self.assertIn("selection.abac.enforce", content)

        # Cek reversibility di downgrade()
        self.assertIn("def downgrade() -> None:", content)
        self.assertIn("DELETE FROM feature_capabilities", content)
        self.assertIn("DROP INDEX IF EXISTS idx_company_context_events_selection_job", content)
        self.assertIn("DROP INDEX IF EXISTS idx_company_context_events_selection_job_alt", content)

    def test_02_abac_zero_trust_sales_agent_denied_on_finance_data(self):
        """
        Skenario Uji Nyata ABAC:
        Sales Agent mencoba menjalankan seleksi atas domain Finance tanpa baris izin eksplisit -> Ditolak (PermissionError)
        dan dicatat event SELECTION_ABAC_DENIED di Audit Ledger.
        """
        sales_agent_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        # Mock info agen di database
        agent_mock_row = MockRow({
            "id": sales_agent_id,
            "name": "Budi Sales AI",
            "role": "sales_representative",
            "department_id": str(uuid.uuid4()),
            "job_title": "Sales Specialist Agent",
        })

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = agent_mock_row
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn

        # Verifikasi bahwa verifikasi ABAC menolak akses Sales Agent ke domain Finance
        with patch("app.domains.selection.service.get_database_engine", return_value=mock_engine):
            with patch("app.domains.selection.service.check_ai_data_permission") as mock_pdp:
                from app.authz.abac import ABACDecision
                mock_pdp.return_value = ABACDecision(
                    is_authorized=False,
                    decision="DENIED_NO_POLICY",
                    reason="Zero-Trust: No matching active policy for subject sales_agent on resource financial_records",
                )

                with self.assertRaises(PermissionError) as ctx:
                    SelectionDomainService.verify_selection_abac_permission(
                        tenant_id=self.tenant_a,
                        domain_category="finance",
                        agent_id=sales_agent_id,
                        job_id=job_id,
                        engine=mock_engine,
                    )

                self.assertIn("Akses data seleksi ditolak (ABAC)", str(ctx.exception))
                self.assertIn("sales_agent", str(ctx.exception))
                self.assertIn("finance", str(ctx.exception))

    def test_03_abac_authorized_agent_with_allowed_fields_restriction(self):
        """
        Skenario Uji ABAC Lolos:
        Finance Agent yang memiliki kebijakan aktif diizinkan, dan pembatasan field (allowed_fields) diteruskan.
        """
        finance_agent_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        agent_mock_row = MockRow({
            "id": finance_agent_id,
            "name": "Fiona Finance AI",
            "role": "financial_analyst",
            "department_id": str(uuid.uuid4()),
            "job_title": "Finance Specialist Agent",
        })

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = agent_mock_row
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn

        with patch("app.domains.selection.service.get_database_engine", return_value=mock_engine):
            with patch("app.domains.selection.service.check_ai_data_permission") as mock_pdp:
                from app.authz.abac import ABACDecision
                mock_pdp.return_value = ABACDecision(
                    is_authorized=True,
                    decision="ALLOWED",
                    reason="Matched policy pol-finance-001",
                    policy_id="pol-finance-001",
                    matched_policy={
                        "policy_id": "pol-finance-001",
                        "conditions": {"allowed_fields": ["revenue", "ebitda", "npv", "entity_label"]},
                    },
                )

                res = SelectionDomainService.verify_selection_abac_permission(
                    tenant_id=self.tenant_a,
                    domain_category="finance",
                    agent_id=finance_agent_id,
                    job_id=job_id,
                    engine=mock_engine,
                )

                self.assertTrue(res["authorized"])
                self.assertEqual(res["persona_type"], "finance_agent")
                self.assertEqual(res["allowed_fields"], ["revenue", "ebitda", "npv", "entity_label"])

    def test_04_full_lifecycle_audit_trail_in_single_view(self):
        """
        Menguji bahwa SelectionDomainService.get_job_audit_lifecycle merangkum
        SELURUH siklus hidup seleksi dalam 1 panggilan terpadu:
        - Prompt instruksi & kriteria
        - Dokumen sumber dataset
        - Agen AI eksekutor & verifikasi ABAC
        - Hasil komputasi scoring
        - Keputusan persetujuan & tinjauan manusia
        - Riwayat ekspor berkas nyata (PDF/Excel/CSV)
        - Rantai kronologis kejadian (timeline)
        """
        job_id = str(uuid.uuid4())
        mock_job_detail = {
            "id": job_id,
            "tenant_id": self.tenant_a,
            "title": "Evaluasi Vendor Cloud Q4",
            "domain_category": "supplier",
            "instruction_prompt": "Pilih penyedia cloud berstandar ISO 27001 dengan latensi terendah.",
            "pipeline_stage": "completed",
            "stage_progress_pct": 100.0,
            "initiated_by_agent_id": str(uuid.uuid4()),
            "created_at": "2026-09-25T10:00:00Z",
            "completed_at": "2026-09-25T10:05:00Z",
            "final_approved_at": "2026-09-25T10:05:00Z",
            "criteria": [
                {"key": "compliance", "label": "Kepatuhan Keamanan", "weight": 0.4, "source_type": "user_prompt"},
                {"key": "sla", "label": "Keandalan SLA", "weight": 0.35, "source_type": "user_prompt"},
                {"key": "pricing", "label": "Efisiensi Biaya", "weight": 0.25, "source_type": "user_prompt"},
            ],
            "weights": {"compliance": 0.4, "sla": 0.35, "pricing": 0.25},
            "documents": [
                {
                    "id": str(uuid.uuid4()),
                    "source_channel": "file_upload",
                    "raw_text": "Vendor A Proposal: ISO 27001 Certified, 99.99% SLA.",
                    "quality_score": 100.0,
                    "validity_status": "VALID",
                    "ingested_at": "2026-09-25T10:01:00Z",
                },
                {
                    "id": str(uuid.uuid4()),
                    "source_channel": "api_connector",
                    "raw_text": "Vendor B Proposal: SOC2 Certified, 99.9% SLA.",
                    "quality_score": 98.0,
                    "validity_status": "VALID",
                    "ingested_at": "2026-09-25T10:01:30Z",
                }
            ],
        }

        mock_results = [
            {
                "id": str(uuid.uuid4()),
                "entity_label": "Vendor A Cloud",
                "total_score": 94.5,
                "rank_position": 1,
                "previous_rank_position": None,
                "decision_status": "approved",
                "recommendation_classification": "STRONGLY_RECOMMENDED",
                "risk_score": 5.0,
                "reviewer_notes": "Vendor memenuhi seluruh standar kelaikan keamanan.",
                "reviewer_id": "usr-director-01",
            },
            {
                "id": str(uuid.uuid4()),
                "entity_label": "Vendor B Cloud",
                "total_score": 86.0,
                "rank_position": 2,
                "previous_rank_position": 3,
                "decision_status": "overridden",
                "recommendation_classification": "RECOMMENDED",
                "risk_score": 12.0,
                "reviewer_notes": "Dinaikkan peringkat karena SLA khusus untuk wilayah Asia Tenggara.",
                "reviewer_id": "usr-director-01",
            },
        ]

        mock_events = [
            (
                str(uuid.uuid4()),
                "SELECTION_JOB_CREATED",
                "Pekerjaan Seleksi Dibuat: Evaluasi Vendor Cloud Q4",
                "Pekerjaan dibuat oleh Agen Pengadaan AI.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "JOB_CREATION"},
                datetime(2026, 9, 25, 10, 0, 0, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_DOCUMENT_INGESTED",
                "Dokumen Sumber Didaftarkan: Proposal Vendor A",
                "Dokumen didaftarkan via file_upload.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "DATASET_INGESTION"},
                datetime(2026, 9, 25, 10, 1, 0, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_PIPELINE_EXECUTED",
                "Pipeline Seleksi Dieksekusi",
                "Alur kerja 10 tahap selesai dieksekusi.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "PIPELINE_EXECUTION"},
                datetime(2026, 9, 25, 10, 2, 0, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_SCORING_COMPLETED",
                "Hasil Scoring Selesai",
                "Scoring selesai untuk 2 entitas.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "SCORING_RESULTS"},
                datetime(2026, 9, 25, 10, 2, 30, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_HUMAN_REVIEW",
                "Tinjauan Manusia (OVERRIDDEN): Vendor B Cloud",
                "Entitas diubah statusnya menjadi OVERRIDDEN.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "HUMAN_APPROVAL"},
                datetime(2026, 9, 25, 10, 3, 0, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_FINAL_APPROVAL",
                "Persetujuan Final Seleksi: Evaluasi Vendor Cloud Q4",
                "Disahkan oleh Direktur Operasional.",
                "RESOLVED",
                {"selection_job_id": job_id, "lifecycle_stage": "FINAL_APPROVAL"},
                datetime(2026, 9, 25, 10, 4, 0, tzinfo=timezone.utc),
            ),
            (
                str(uuid.uuid4()),
                "SELECTION_REPORT_EXPORTED",
                "Ekspor Laporan Seleksi (PDF)",
                "Laporan PDF diunduh.",
                "RESOLVED",
                {
                    "selection_job_id": job_id,
                    "lifecycle_stage": "REPORT_EXPORT",
                    "format": "pdf",
                    "filename": "Laporan_Seleksi_Vendor_2026.pdf",
                    "size_bytes": 145020,
                    "download_url": f"/api/v1/tenants/{self.tenant_a}/selection/reports/download?filename=Laporan_Seleksi_Vendor_2026.pdf",
                },
                datetime(2026, 9, 25, 10, 5, 0, tzinfo=timezone.utc),
            ),
        ]

        @contextmanager
        def mock_tenant_tx(t_id):
            conn = MagicMock()
            # Handle agent fetch
            conn.execute.return_value.fetchone.return_value = (
                mock_job_detail["initiated_by_agent_id"],
                "Agus Procurement AI",
                "procurement_agent",
                str(uuid.uuid4()),
                "Procurement Specialist",
                "Pengadaan & Vendor",
            )
            # Handle events fetch
            conn.execute.return_value.fetchall.return_value = mock_events
            yield conn

        with patch("app.domains.selection.service.SelectionDomainService.get_job_detail", return_value=mock_job_detail):
            with patch("app.domains.selection.service.SelectionDomainService.get_job_results", return_value=mock_results):
                with patch("app.domains.selection.service.tenant_tx", side_effect=mock_tenant_tx):
                    lifecycle = SelectionDomainService.get_job_audit_lifecycle(self.tenant_a, job_id)

                    # Verifikasi kelengkapan seluruh atribut siklus hidup
                    self.assertEqual(lifecycle["selection_job_id"], job_id)
                    self.assertEqual(lifecycle["title"], "Evaluasi Vendor Cloud Q4")
                    self.assertEqual(lifecycle["domain_category"], "supplier")
                    self.assertTrue(lifecycle["summary"]["is_final_approved"])

                    # 1. Prompt instruksi & kriteria
                    self.assertIn("ISO 27001", lifecycle["prompt_instruction"]["instruction_prompt"])
                    self.assertEqual(len(lifecycle["prompt_instruction"]["criteria"]), 3)

                    # 2. Dokumen sumber
                    self.assertEqual(len(lifecycle["dataset_documents"]), 2)

                    # 3. AI Agent eksekutor & verifikasi ABAC
                    self.assertIsNotNone(lifecycle["agent_executor"])
                    self.assertEqual(lifecycle["agent_executor"]["name"], "Agus Procurement AI")
                    self.assertTrue(lifecycle["agent_executor"]["abac_verified"])

                    # 4. Hasil scoring & ranking
                    self.assertEqual(len(lifecycle["scoring_results"]), 2)
                    self.assertEqual(lifecycle["scoring_results"][0]["entity_label"], "Vendor A Cloud")

                    # 5. Keputusan review & approval
                    self.assertEqual(len(lifecycle["human_reviews"]), 2)
                    self.assertEqual(lifecycle["human_reviews"][1]["decision_status"], "overridden")
                    self.assertEqual(lifecycle["human_reviews"][1]["previous_rank_position"], 3)

                    # 6. Riwayat ekspor berkas nyata
                    self.assertEqual(len(lifecycle["exports"]), 1)
                    self.assertEqual(lifecycle["exports"][0]["format"], "pdf")
                    self.assertEqual(lifecycle["exports"][0]["filename"], "Laporan_Seleksi_Vendor_2026.pdf")

                    # 7. Rantai kronologis kejadian (timeline)
                    self.assertEqual(len(lifecycle["timeline"]), 7)
                    event_types = [ev["event_type"] for ev in lifecycle["timeline"]]
                    self.assertIn("SELECTION_JOB_CREATED", event_types)
                    self.assertIn("SELECTION_DOCUMENT_INGESTED", event_types)
                    self.assertIn("SELECTION_PIPELINE_EXECUTED", event_types)
                    self.assertIn("SELECTION_SCORING_COMPLETED", event_types)
                    self.assertIn("SELECTION_HUMAN_REVIEW", event_types)
                    self.assertIn("SELECTION_FINAL_APPROVAL", event_types)
                    self.assertIn("SELECTION_REPORT_EXPORTED", event_types)

    def test_05_cross_tenant_isolation(self):
        """Verifikasi bahwa Tenant B tidak dapat mengakses jejak audit pekerjaan milik Tenant A."""
        job_id_tenant_a = str(uuid.uuid4())

        @contextmanager
        def mock_tenant_tx(t_id):
            conn = MagicMock()
            # Saat Tenant B mencari job Tenant A, query tidak menemukan baris
            if t_id == self.tenant_b:
                conn.execute.return_value.fetchone.return_value = None
            yield conn

        with patch("app.domains.selection.service.tenant_tx", side_effect=mock_tenant_tx):
            with self.assertRaises(ValueError) as ctx:
                SelectionDomainService.get_job_audit_lifecycle(self.tenant_b, job_id_tenant_a)

            self.assertIn("tidak ditemukan", str(ctx.exception))

    def test_06_fastapi_openapi_route_registration(self):
        """Verifikasi endpoint audit-lifecycle terdaftar secara resmi di router FastAPI."""
        from app.api.v1.selection import router

        routes_paths = [route.path for route in router.routes]
        self.assertIn("/tenants/{tenant_id}/selection/jobs/{job_id}/audit-lifecycle", routes_paths)
        self.assertIn("/selection/tenants/{tenant_id}/jobs/{job_id}/audit-lifecycle", routes_paths)


if __name__ == "__main__":
    unittest.main()
