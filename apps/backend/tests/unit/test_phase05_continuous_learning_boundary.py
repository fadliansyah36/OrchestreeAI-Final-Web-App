from pathlib import Path

BACKEND = Path(__file__).parents[2]
API = BACKEND / "app" / "api" / "v1" / "learning.py"
DOMAIN = BACKEND / "app" / "domains" / "continuous_learning"


def test_learning_api_has_no_direct_persistence_access():
    source = API.read_text(encoding="utf-8")
    assert "sqlalchemy" not in source
    assert "sa.text(" not in source
    assert "get_engine" not in source
    assert "get_continuous_learning_repository" in source


def test_continuous_learning_domain_contains_objective_verification():
    source = (DOMAIN / "core.py").read_text(encoding="utf-8")
    assert "verify_objective_outcome" in source
    assert "record_and_learn_node" in source
    assert "MIN_SAMPLE_THRESHOLD" in source
    assert "DEFAULT_HALF_LIFE_DAYS" in source


def test_learning_repository_owns_tenant_scoped_persistence():
    source = (DOMAIN / "repository.py").read_text(encoding="utf-8")
    assert "SET LOCAL app.tenant_id" in source
    assert "agent_decision_outcomes" in source
    assert "agent_skill_confidence" in source
    assert "agent_skill_growth_log" in source
    assert "agent_lesson_learned" in source
