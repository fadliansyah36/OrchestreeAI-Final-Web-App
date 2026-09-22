import os
import pytest
from app.core.startup_gate import startup_gate
from app.core.database import (
    verify_db_connection_and_role,
    verify_rls_table_enforcement,
    verify_extensions_and_migrations,
)


def test_startup_gate_report_structure():
    report = startup_gate.evaluate_all()
    assert report.total_steps == 18
    assert len(report.checks) == 18

    # Langkah 1: Skema Environment
    assert report.checks[0].step_number == 1
    assert report.checks[0].status == "passed"

    # Langkah 2: Koneksi Database (role orchestree_app, NOBYPASSRLS)
    # Status aktif terverifikasi nyata (passed jika DB siap, failed jika belum ada DB)
    assert report.checks[1].step_number == 2
    assert report.checks[1].status in ("passed", "failed")
    assert report.checks[1].status != "not_implemented_yet"

    # Langkah 3: Penegakan RLS Seluruh Tabel Tenant
    assert report.checks[2].step_number == 3
    assert report.checks[2].status in ("passed", "failed")
    assert report.checks[2].status != "not_implemented_yet"

    # Langkah 4: Status Migrasi Head & Ekstensi Postgres
    assert report.checks[3].step_number == 4
    assert report.checks[3].status in ("passed", "failed")
    assert report.checks[3].status != "not_implemented_yet"

    # Langkah 5-18: Masih jujur not_implemented_yet
    assert report.checks[4].step_number == 5
    assert report.checks[4].status == "not_implemented_yet"


def test_step_1_env_schema():
    check = startup_gate.check_step_1_env_schema()
    assert check.step_number == 1
    assert check.status in ("passed", "failed")


def test_step_2_db_connection_unconfigured():
    # Menguji evaluasi fail-closed ketika URL tidak dikonfigurasi
    ok, detail, data = verify_db_connection_and_role(target_url="")
    assert ok is False
    assert "belum dikonfigurasi" in detail or "Gagal" in detail


def test_step_3_rls_unconfigured():
    ok, detail, data = verify_rls_table_enforcement(target_url="")
    assert ok is False
    assert "belum dikonfigurasi" in detail or "Gagal" in detail


def test_step_4_migrations_unconfigured():
    ok, detail, data = verify_extensions_and_migrations(target_url="")
    assert ok is False
    assert "belum dikonfigurasi" in detail or "Gagal" in detail
