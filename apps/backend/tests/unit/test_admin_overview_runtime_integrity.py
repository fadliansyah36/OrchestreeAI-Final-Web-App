"""Architecture regression checks for Phase 04 admin runtime integrity."""

from pathlib import Path


TARGET = Path(__file__).parents[1] / "app" / "api" / "v1" / "admin_overview.py"


def test_admin_overview_dependency_failures_are_not_reported_as_operational():
    text = TARGET.read_text(encoding="utf-8")

    assert '"state": "UNAVAILABLE"' in text
    assert "ADMIN_HUB_DATA_UNAVAILABLE" in text
    assert "FINANCIAL_COMMAND_CENTER_UNAVAILABLE" in text
    assert "ADMIN_TENANTS_UNAVAILABLE" in text

    # These endpoints must not convert database exceptions into fake healthy values.
    assert "status=\"operational\"" not in text.split('async def get_admin_hub_overview', 1)[1].split('@router.get(\n    "/process-integrity"', 1)[0]


def test_process_integrity_test_scenario_is_explicitly_declared():
    text = TARGET.read_text(encoding="utf-8")

    assert "simulate_scenario: str = Query(" in text
    assert 'pattern="^(rogue_process|missing_service)$"' in text
