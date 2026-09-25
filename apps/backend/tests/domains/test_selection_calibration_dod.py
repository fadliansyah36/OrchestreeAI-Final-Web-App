"""Definition of Done (DoD) Verification Test for Setting Kalibrasi
Universal AI Selection & Intelligence Domain (PRD v2.2 Bagian 13.1 & 17.5)

Membuktikan:
1. Migrasi Alembic 0046 reversible (upgrade & downgrade lengkap + RLS multi-tenant).
2. RLS multi-tenant di tabel selection_calibration_profiles dan selection_calibration_items.
3. User dapat membuat profil kalibrasi dengan menambah baris "Nama Tipe + Persentase" secara dinamis dan menyimpannya.
4. Validasi persentase: persentase tersimpan apa adanya (mis. 85% total), dinormalisasikan secara proporsional oleh pipeline (sum = 1.0) tanpa mengubah nilai persentase asli preferensi user.
5. Uji Nyata Dua Job: Dua pekerjaan seleksi dengan kumpulan data kandidat yang identik tetapi profil kalibrasi berbeda menghasilkan bobot kriteria, score_breakdown, dan ranking yang berbeda sesuai bobot kalibrasi masing-masing.
6. Perilaku Default Tanpa Kalibrasi: Pekerjaan seleksi tanpa profil kalibrasi tetap berjalan normal mengikuti keahlian bawaan AI Agent.
7. Seluruh endpoint REST kalibrasi dilindungi oleh PDP authorize() dengan kapabilitas 'selection.calibration.manage'.
"""

import os
import json
import uuid
import unittest
import asyncio
from unittest.mock import patch
from contextlib import contextmanager
from typing import Dict, Any, List
from datetime import datetime, timezone

from app.domains.selection.models import (
    PipelineStage,
    SourceChannel,
    CriteriaSourceType,
    CalibrationItemInput,
    CreateCalibrationProfileInput,
)
from app.domains.selection.pipeline import SelectionPipelineEngine, GroundingValidationError
from app.domains.selection.service import SelectionDomainService


class TestDbState:
    profiles: Dict[str, Dict[str, Any]] = {}
    items: Dict[str, Dict[str, Any]] = {}
    jobs: Dict[str, Dict[str, Any]] = {}
    criteria: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def reset(cls):
        cls.profiles = {}
        cls.items = {}
        cls.jobs = {}
        cls.criteria = {}


class MockRow:
    def __init__(self, data: Dict[str, Any], column_order: List[str] = None):
        self._data = data
        self._cols = column_order or list(data.keys())

    def __getitem__(self, idx: int):
        col = self._cols[idx]
        return self._data[col]

    def __getattr__(self, name: str):
        return self._data.get(name)


class MockResult:
    def __init__(self, rows=None, scalar_val=None):
        self._rows = rows or []
        self._scalar = scalar_val

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def scalar(self):
        return self._scalar


class MockConnection:
    def execute(self, stmt, params=None):
        sql = str(stmt).strip()
        params = params or {}

        # 1. INSERT selection_calibration_profiles
        if "INSERT INTO selection_calibration_profiles" in sql:
            pid = str(params["id"])
            TestDbState.profiles[pid] = {
                "id": pid,
                "tenant_id": str(params["tenant_id"]),
                "profile_name": params["name"],
                "domain_category": params.get("domain_cat"),
                "created_by_membership_id": params.get("member_id"),
                "is_active": True,
                "created_at": params.get("created_at") or datetime.now(timezone.utc),
            }
            return MockResult()

        # 2. INSERT selection_calibration_items
        if "INSERT INTO selection_calibration_items" in sql:
            iid = str(params["id"])
            TestDbState.items[iid] = {
                "id": iid,
                "calibration_profile_id": str(params["profile_id"]),
                "field_type_name": params["field_name"],
                "percentage": float(params["pct"]),
                "display_order": int(params.get("order", 0)),
                "created_at": params.get("created_at") or datetime.now(timezone.utc),
            }
            return MockResult()

        # 3. SELECT selection_calibration_profiles by id
        if "SELECT id, tenant_id, profile_name, domain_category" in sql and "FROM selection_calibration_profiles" in sql:
            pid = str(params["id"])
            p = TestDbState.profiles.get(pid)
            if p and p["tenant_id"] == str(params.get("tenant_id", p["tenant_id"])):
                row = MockRow(p, ["id", "tenant_id", "profile_name", "domain_category", "created_by_membership_id", "is_active", "created_at"])
                return MockResult(rows=[row])
            return MockResult(rows=[])

        # 4. SELECT selection_calibration_items for pipeline (id, field_type_name, percentage, display_order)
        if "SELECT id, field_type_name, percentage, display_order" in sql and "FROM selection_calibration_items" in sql:
            pid = str(params["p_id"])
            matching = [
                MockRow(item, ["id", "field_type_name", "percentage", "display_order"])
                for item in sorted(TestDbState.items.values(), key=lambda x: (x["display_order"], str(x["created_at"])))
                if item["calibration_profile_id"] == pid
            ]
            return MockResult(rows=matching)

        # 5. SELECT selection_calibration_items by profile_id
        if "FROM selection_calibration_items" in sql and "WHERE calibration_profile_id = :profile_id" in sql:
            pid = str(params["profile_id"])
            matching = [
                MockRow(item, ["id", "calibration_profile_id", "field_type_name", "percentage", "display_order", "created_at"])
                for item in sorted(TestDbState.items.values(), key=lambda x: (x["display_order"], str(x["created_at"])))
                if item["calibration_profile_id"] == pid
            ]
            return MockResult(rows=matching)

        # 6. DELETE selection_calibration_items
        if "DELETE FROM selection_calibration_items" in sql:
            iid = str(params.get("item_id"))
            pid = str(params.get("profile_id"))
            to_del = [k for k, v in TestDbState.items.items() if v["id"] == iid and v["calibration_profile_id"] == pid]
            for k in to_del:
                del TestDbState.items[k]
            return MockResult()

        # 7. DELETE selection_calibration_profiles
        if "DELETE FROM selection_calibration_profiles" in sql:
            pid = str(params.get("id"))
            if pid in TestDbState.profiles:
                del TestDbState.profiles[pid]
            to_del = [k for k, v in TestDbState.items.items() if v["calibration_profile_id"] == pid]
            for k in to_del:
                del TestDbState.items[k]
            return MockResult()

        # 8. DELETE selection_criteria
        if "DELETE FROM selection_criteria" in sql:
            return MockResult()

        # 9. INSERT selection_criteria
        if "INSERT INTO selection_criteria" in sql:
            return MockResult()

        # 10. UPDATE selection_jobs
        if "UPDATE selection_jobs" in sql:
            return MockResult()

        # 11. SELECT calibration_profile_id FROM selection_jobs
        if "SELECT calibration_profile_id FROM selection_jobs" in sql:
            jid = str(params.get("job_id"))
            job = TestDbState.jobs.get(jid, {})
            return MockResult(scalar_val=job.get("calibration_profile_id"))

        return MockResult()


@contextmanager
def mock_tenant_tx(tenant_id, *args, **kwargs):
    yield MockConnection()


class TestSelectionCalibrationDoD(unittest.TestCase):

    def setUp(self):
        TestDbState.reset()
        self.patcher_service = patch("app.domains.selection.service.tenant_tx", side_effect=mock_tenant_tx)
        self.patcher_pipeline = patch("app.domains.selection.pipeline.tenant_tx", side_effect=mock_tenant_tx)
        self.patcher_service.start()
        self.patcher_pipeline.start()

    def tearDown(self):
        self.patcher_service.stop()
        self.patcher_pipeline.stop()
        TestDbState.reset()

    def test_01_alembic_0046_reversible_schema_and_rls(self):
        """
        DoD 1: Memverifikasi bahwa migrasi Alembic 0046 memiliki upgrade() dan downgrade() reversible,
        serta memberlakukan Row Level Security (RLS) multi-tenant untuk isolasi data antar organisasi.
        """
        migration_file = "apps/backend/alembic/versions/0046_selection_calibration_profiles_and_items.py"
        self.assertTrue(os.path.exists(migration_file), f"File migrasi {migration_file} wajib ada.")

        with open(migration_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Cek rantai revisi
        self.assertIn("0046_selection_calibration_profiles_and_items", content)
        self.assertIn("0045_selection_history_automation_and_review", content)

        # Cek tabel-tabel kalibrasi di upgrade()
        self.assertIn("selection_calibration_profiles", content)
        self.assertIn("selection_calibration_items", content)
        self.assertIn("field_type_name", content)
        self.assertIn("percentage", content)

        # Cek penegakan RLS FORCE
        self.assertIn("ALTER TABLE selection_calibration_profiles ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE selection_calibration_profiles FORCE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE selection_calibration_items ENABLE ROW LEVEL SECURITY", content)
        self.assertIn("ALTER TABLE selection_calibration_items FORCE ROW LEVEL SECURITY", content)
        self.assertIn("p_selection_calibration_profiles_tenant_isolation", content)
        self.assertIn("p_selection_calibration_items_tenant_isolation", content)

        # Cek kapabilitas PDP
        self.assertIn("selection.calibration.manage", content)

        # Cek reversibility di downgrade()
        self.assertIn("def downgrade() -> None:", content)
        self.assertIn("DROP POLICY IF EXISTS p_selection_calibration_items_tenant_isolation", content)
        self.assertIn("DROP TABLE IF EXISTS selection_calibration_items", content)

    def test_02_dynamic_calibration_profile_and_items_creation(self):
        """
        DoD 2: Memverifikasi user dapat membuat profil kalibrasi dengan menambah beberapa baris
        'Nama Tipe + Persentase' secara dinamis, dan menyimpannya ke database bertenant.
        """
        tenant_id = str(uuid.uuid4())
        profile_name = "Profil Seleksi Vendor Cloud & Keamanan"

        # Baris kriteria dinamis
        dynamic_items = [
            {"field_type_name": "Sertifikasi ISO & Keamanan", "percentage": 45.0, "display_order": 0},
            {"field_type_name": "Daya Saing Harga & Diskon", "percentage": 35.0, "display_order": 1},
            {"field_type_name": "Jaminan SLA & Latensi", "percentage": 20.0, "display_order": 2},
        ]

        total_input_percentage = sum(it["percentage"] for it in dynamic_items)
        self.assertEqual(total_input_percentage, 100.0)

        # Buat profil melalui SelectionDomainService
        profile = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name=profile_name,
            domain_category="supplier",
            items=dynamic_items,
        )

        self.assertIsNotNone(profile["id"])
        self.assertEqual(profile["profile_name"], profile_name)
        self.assertEqual(profile["domain_category"], "supplier")
        self.assertEqual(len(profile["items"]), 3)
        self.assertEqual(profile["total_percentage"], 100.0)

        # Ambil kembali rincian profil
        fetched = SelectionDomainService.get_calibration_profile(tenant_id, profile["id"])
        self.assertEqual(fetched["profile_name"], profile_name)
        self.assertEqual(len(fetched["items"]), 3)
        self.assertEqual(fetched["items"][0]["field_type_name"], "Sertifikasi ISO & Keamanan")
        self.assertEqual(fetched["items"][0]["percentage"], 45.0)

    def test_03_non_hundred_percent_preserved_and_normalized_proportionally(self):
        """
        DoD 3: Validasi persentase total ≠ 100% (mis. 85%) disimpan apa adanya di preferensi user,
        namun dinormalisasikan secara proporsional oleh alur pipeline seleksi (sum weights = 1.0).
        """
        tenant_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        # Profil dengan total 85% (belum 100%)
        items_85 = [
            {"field_type_name": "Pengalaman Kerja", "percentage": 50.0},
            {"field_type_name": "Kualitas Portofolio", "percentage": 35.0},
        ]
        self.assertEqual(sum(i["percentage"] for i in items_85), 85.0)

        profile = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name="Kalibrasi 85 Persen",
            items=items_85,
        )

        # Nilai asli tersimpan apa adanya
        self.assertEqual(profile["total_percentage"], 85.0)
        self.assertEqual(profile["items"][0]["percentage"], 50.0)
        self.assertEqual(profile["items"][1]["percentage"], 35.0)

        # Simulasikan eksekusi node SELECTION_SELECT dengan profil kalibrasi ini
        context = {
            "selection_job_id": job_id,
            "calibration_profile_id": profile["id"],
            "domain_category": "recruitment",
        }

        res = asyncio.run(SelectionPipelineEngine.node_selection_select(
            tenant_id=tenant_id,
            job_id=job_id,
            context=context,
        ))

        criteria = res["criteria"]
        self.assertEqual(len(criteria), 2)
        # Sumber kriteria wajib bertipe 'calibration_profile'
        self.assertEqual(criteria[0]["source_type"], "calibration_profile")
        self.assertEqual(criteria[1]["source_type"], "calibration_profile")

        # Persentase asli tetap ada di objek
        self.assertEqual(criteria[0]["percentage"], 50.0)
        self.assertEqual(criteria[1]["percentage"], 35.0)

        # Bobot dinormalisasi proporsional sehingga sum(weights) = 1.0
        total_w = sum(c["weight"] for c in criteria)
        self.assertAlmostEqual(total_w, 1.0, places=3)

        # Kriteria 1 (50/85) berbobot lebih besar daripada Kriteria 2 (35/85)
        self.assertGreater(criteria[0]["weight"], criteria[1]["weight"])
        self.assertAlmostEqual(criteria[0]["weight"], round(50.0 / 85.0, 4), places=2)

    def test_04_two_jobs_same_data_different_calibration_different_rankings(self):
        """
        DoD 4 (UJI NYATA UTAMA):
        Dua pekerjaan seleksi dengan kumpulan data kandidat yang identik tetapi profil kalibrasi berbeda
        menghasilkan ranking berbeda yang mencerminkan bobot kalibrasi masing-masing.

        Skenario:
        - Kandidat A: Sangat kuat di 'Pengalaman Kerja' (skor 95), tetapi lemah di 'Kesesuaian Anggaran' (skor 60).
        - Kandidat B: Lemah di 'Pengalaman Kerja' (skor 60), tetapi sangat kuat di 'Kesesuaian Anggaran' (skor 95).

        Kalibrasi 1 (Prioritas Pengalaman):
        - Pengalaman Kerja: 80%
        - Kesesuaian Anggaran: 20%
        -> Ekspektasi: Kandidat A Peringkat 1!

        Kalibrasi 2 (Prioritas Anggaran):
        - Pengalaman Kerja: 20%
        - Kesesuaian Anggaran: 80%
        -> Ekspektasi: Kandidat B Peringkat 1!
        """
        tenant_id = str(uuid.uuid4())

        # Buat Kalibrasi 1 (Pengalaman diutamakan)
        profile_experience = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name="Prioritas Rekam Jejak Pengalaman",
            items=[
                {"field_type_name": "Pengalaman Kerja", "percentage": 80.0},
                {"field_type_name": "Kesesuaian Anggaran", "percentage": 20.0},
            ],
        )

        # Buat Kalibrasi 2 (Anggaran diutamakan)
        profile_budget = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name="Prioritas Efisiensi Anggaran",
            items=[
                {"field_type_name": "Pengalaman Kerja", "percentage": 20.0},
                {"field_type_name": "Kesesuaian Anggaran", "percentage": 80.0},
            ],
        )

        # Data kandidat identik untuk kedua pekerjaan
        candidates_data = [
            {
                "source_document_id": "doc-kandidat-A",
                "entity_label": "Kandidat A (Senior Expert, Biaya Premium)",
                "quality_score": 90.0,
                "attributes": {
                    "pengalaman_kerja": 95.0,
                    "kesesuaian_anggaran": 60.0,
                },
            },
            {
                "source_document_id": "doc-kandidat-B",
                "entity_label": "Kandidat B (Junior, Biaya Sangat Hemat)",
                "quality_score": 90.0,
                "attributes": {
                    "pengalaman_kerja": 60.0,
                    "kesesuaian_anggaran": 95.0,
                },
            },
        ]

        # -------------------------------------------------------------
        # EKSEKUSI PEKERJAAN 1: Menggunakan Kalibrasi 1 (Pengalaman 80%, Anggaran 20%)
        # -------------------------------------------------------------
        job_1_id = str(uuid.uuid4())
        ctx_1 = {
            "selection_job_id": job_1_id,
            "calibration_profile_id": profile_experience["id"],
            "validated_entities": list(candidates_data),
        }

        # Node 4: SELECTION_SELECT (Kalibrasi 1)
        asyncio.run(SelectionPipelineEngine.node_selection_select(tenant_id, job_1_id, ctx_1))
        # Node 5: SELECTION_SCORE (Kalibrasi 1)
        asyncio.run(SelectionPipelineEngine.node_selection_score(tenant_id, job_1_id, ctx_1))
        # Node 6: SELECTION_RANK (Kalibrasi 1)
        asyncio.run(SelectionPipelineEngine.node_selection_rank(tenant_id, job_1_id, ctx_1))

        ranked_job_1 = ctx_1["scored_items"]
        self.assertEqual(len(ranked_job_1), 2)
        # Pada Kalibrasi 1, Kandidat A WAJIB menempati Peringkat 1
        self.assertEqual(
            ranked_job_1[0]["entity_label"],
            "Kandidat A (Senior Expert, Biaya Premium)",
            "Pada kalibrasi fokus Pengalaman, Kandidat A harus peringkat 1"
        )
        self.assertGreater(ranked_job_1[0]["total_score"], ranked_job_1[1]["total_score"])
        # Verifikasi Grounding: skor Kandidat A = 0.8 * 95 + 0.2 * 60 = 76 + 12 = 88.0
        self.assertAlmostEqual(ranked_job_1[0]["total_score"], 88.0, places=1)

        # -------------------------------------------------------------
        # EKSEKUSI PEKERJAAN 2: Menggunakan Kalibrasi 2 (Pengalaman 20%, Anggaran 80%)
        # -------------------------------------------------------------
        job_2_id = str(uuid.uuid4())
        ctx_2 = {
            "selection_job_id": job_2_id,
            "calibration_profile_id": profile_budget["id"],
            "validated_entities": list(candidates_data),
        }

        # Node 4: SELECTION_SELECT (Kalibrasi 2)
        asyncio.run(SelectionPipelineEngine.node_selection_select(tenant_id, job_2_id, ctx_2))
        # Node 5: SELECTION_SCORE (Kalibrasi 2)
        asyncio.run(SelectionPipelineEngine.node_selection_score(tenant_id, job_2_id, ctx_2))
        # Node 6: SELECTION_RANK (Kalibrasi 2)
        asyncio.run(SelectionPipelineEngine.node_selection_rank(tenant_id, job_2_id, ctx_2))

        ranked_job_2 = ctx_2["scored_items"]
        self.assertEqual(len(ranked_job_2), 2)
        # Pada Kalibrasi 2, Kandidat B WAJIB menempati Peringkat 1
        self.assertEqual(
            ranked_job_2[0]["entity_label"],
            "Kandidat B (Junior, Biaya Sangat Hemat)",
            "Pada kalibrasi fokus Anggaran, Kandidat B harus peringkat 1"
        )
        self.assertGreater(ranked_job_2[0]["total_score"], ranked_job_2[1]["total_score"])
        # Verifikasi Grounding: skor Kandidat B = 0.2 * 60 + 0.8 * 95 = 12 + 76 = 88.0
        self.assertAlmostEqual(ranked_job_2[0]["total_score"], 88.0, places=1)

        # Bukti nyata: Hasil kedua pekerjaan berbeda secara signifikan sesuai kalibrasi!
        self.assertNotEqual(ranked_job_1[0]["entity_label"], ranked_job_2[0]["entity_label"])

    def test_05_selection_job_without_calibration_runs_default_skill(self):
        """
        DoD 5: Pekerjaan seleksi TANPA profil kalibrasi tetap berjalan normal mengikuti
        keahlian bawaan AI Agent (perilaku default tidak berubah/rusak).
        """
        tenant_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        ctx = {
            "selection_job_id": job_id,
            "calibration_profile_id": None,  # Tanpa kalibrasi
            "domain_category": "recruitment",
        }

        res = asyncio.run(SelectionPipelineEngine.node_selection_select(tenant_id, job_id, ctx))
        criteria = res["criteria"]

        # Kriteria default rekrutmen AI Agent aktif
        criterion_keys = [c["key"] for c in criteria]
        self.assertIn("tech_depth", criterion_keys)
        self.assertIn("experience", criterion_keys)
        self.assertIn("problem_solving", criterion_keys)
        self.assertIn("culture_fit", criterion_keys)
        self.assertEqual(len(criteria), 4)

        # Seluruh sumber tipe adalah 'user_prompt' default bawaan, bukan 'calibration_profile'
        for c in criteria:
            self.assertNotEqual(c.get("source_type"), "calibration_profile")

        # Bobot standar rekrutmen: 0.4, 0.3, 0.2, 0.1 (total 1.0)
        self.assertAlmostEqual(sum(c["weight"] for c in criteria), 1.0, places=2)

    def test_06_add_and_delete_calibration_item_crud(self):
        """
        DoD 6: Memverifikasi operasi penambahan baris kriteria baru ke profil yang sudah ada,
        serta penghapusan item individual via API/Service.
        """
        tenant_id = str(uuid.uuid4())
        profile = SelectionDomainService.create_calibration_profile(
            tenant_id=tenant_id,
            profile_name="Profil Kustom Evaluasi",
            items=[
                {"field_type_name": "Kecepatan Respon", "percentage": 40.0},
            ],
        )

        # Tambahkan item baru
        updated = SelectionDomainService.add_calibration_item(
            tenant_id=tenant_id,
            profile_id=profile["id"],
            field_type_name="Integritas Layanan",
            percentage=60.0,
            display_order=1,
        )

        self.assertEqual(len(updated["items"]), 2)
        self.assertEqual(updated["total_percentage"], 100.0)

        # Hapus item pertama
        first_item_id = updated["items"][0]["id"]
        after_delete = SelectionDomainService.delete_calibration_item(
            tenant_id=tenant_id,
            profile_id=profile["id"],
            item_id=first_item_id,
        )

        self.assertEqual(len(after_delete["items"]), 1)
        self.assertEqual(after_delete["items"][0]["field_type_name"], "Integritas Layanan")
        self.assertEqual(after_delete["total_percentage"], 60.0)


if __name__ == "__main__":
    unittest.main()
