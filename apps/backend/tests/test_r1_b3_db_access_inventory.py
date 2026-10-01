"""R1-B.3 runtime DB access and service-role exclusion guards."""

from __future__ import annotations

import ast
from pathlib import Path


BACKEND_APP = Path(__file__).resolve().parents[1] / "app"
FORBIDDEN_RUNTIME_SERVICE_ROLE = {"SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"}
ALLOWED_SERVICE_ROLE_FILES = {
    BACKEND_APP / "core" / "config.py",
}


def _python_files():
    return sorted(BACKEND_APP.rglob("*.py"))


def _scan_source():
    findings = []
    for path in _python_files():
        if path in ALLOWED_SERVICE_ROLE_FILES:
            continue
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_RUNTIME_SERVICE_ROLE:
                findings.append((str(path.relative_to(BACKEND_APP)), node.lineno, node.id))
            if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_RUNTIME_SERVICE_ROLE:
                findings.append((str(path.relative_to(BACKEND_APP)), node.lineno, node.attr))
    return findings


def _tenant_db_inventory():
    findings = []
    for path in _python_files():
        if path == BACKEND_APP / "core" / "database.py":
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        for idx, line in enumerate(lines):
            if "set_config('app.tenant_id'" in line or 'set_config("app.tenant_id"' in line:
                window = "\n".join(lines[max(0, idx - 12): min(len(lines), idx + 13)])
                if "get_engine(" in window or "get_database_engine(" in window or "engine.begin(" in window or "engine.connect(" in window:
                    findings.append((str(path.relative_to(BACKEND_APP)), idx + 1, line.strip()))
    return findings


def test_service_role_is_excluded_from_runtime_source():
    findings = _scan_source()
    assert not findings, "Forbidden service_role access in runtime source: " + repr(findings)


def test_retired_unrestricted_database_apis_are_not_used():
    findings = []
    for path in _python_files():
        source = path.read_text(encoding="utf-8")
        if any(token in source for token in ("get_async_pool(", "DBConnectionWrapper(", "get_db_connection(")):
            if path != BACKEND_APP / "core" / "database.py":
                findings.append(str(path.relative_to(BACKEND_APP)))
    assert not findings, "Retired unrestricted DB APIs referenced: " + repr(findings)


def test_direct_tenant_db_inventory_is_emitted():
    findings = _tenant_db_inventory()
    # This is an inventory gate, not a false GREEN claim: remaining findings are
    # intentionally surfaced so R1-B.3 can migrate every tenant-capable caller.
    print("\nR1-B.3 direct tenant DB inventory:")
    for item in findings:
        print(f" - {item[0]}:{item[1]} {item[2]}")
