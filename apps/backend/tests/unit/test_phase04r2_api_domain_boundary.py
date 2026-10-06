"""Phase 04R.2 architecture boundary regression tests."""

from pathlib import Path

BACKEND = Path(__file__).parents[2]
API = BACKEND / "app" / "api" / "v1"


def _text(name: str) -> str:
    return (API / name).read_text(encoding="utf-8")


def test_admin_overview_api_has_no_database_sql():
    text = _text("admin_overview.py")
    assert "sqlalchemy" not in text
    assert "sa.text(" not in text
    assert "get_database_engine" not in text


def test_orchestration_api_has_no_database_sql():
    text = _text("orchestration.py")
    assert "sqlalchemy" not in text
    assert "sa.text(" not in text
    assert "get_database_engine" not in text


def test_ai_execution_routes_remain_on_canonical_orchestration_boundary():
    text = _text("generative.py")
    assert "get_orchestration_engine" in text
    assert "create_and_execute_job" in text
    assert "execute_seeding_batch" in text
