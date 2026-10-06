"""Cross-repository architecture boundary gates for OrchestreeAI Web PWA.

These tests enforce the non-negotiable client -> FastAPI boundary and prevent
provider/model routing from leaking into transport/UI layers.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CLIENT_DIRS = [ROOT / "apps" / "client", ROOT / "apps" / "admin"]


def _source_files(root: Path):
    return sorted(
        p for p in root.rglob("*")
        if p.is_file() and p.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"}
        and not any(part in {".next", "node_modules", "dist", "build"} for part in p.parts)
    )


def test_frontends_have_no_direct_supabase_access():
    forbidden = (
        "@supabase/",
        "createClient(",
        "createBrowserClient(",
        "createServerClient(",
        "supabase.from(",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
    )
    findings = []
    for directory in CLIENT_DIRS:
        for path in _source_files(directory):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for token in forbidden:
                if token in text:
                    findings.append(f"{path.relative_to(ROOT)} -> {token}")
    assert not findings, (
        "Frontend/admin must never access Supabase directly. "
        "All business data must cross the FastAPI boundary first:\n"
        + "\n".join(findings)
    )


def test_frontend_api_configuration_has_no_hardcoded_backend_fallback():
    findings = []
    for path in [ROOT / "apps" / "client" / "next.config.mjs", ROOT / "apps" / "admin" / "next.config.mjs"]:
        text = path.read_text(encoding="utf-8")
        if "127.0.0.1" in text or "localhost:" in text:
            findings.append(str(path.relative_to(ROOT)))
    assert not findings, "Frontend routing must not guess a backend endpoint."


def test_api_layer_does_not_bypass_orchestration_for_model_router():
    api_dir = ROOT / "apps" / "backend" / "app" / "api" / "v1"
    findings = []
    for path in sorted(api_dir.glob("*.py")):
        if path.name == "orchestration.py":
            continue
        text = path.read_text(encoding="utf-8")
        if "get_model_router(" in text or "ModelRouterRequest(" in text:
            findings.append(str(path.relative_to(ROOT)))
    assert not findings, (
        "API feature handlers must enter the canonical Orchestration Engine "
        "before Model Router execution: " + repr(findings)
    )


def test_admin_uses_canonical_llm_provider_endpoint():
    admin_files = _source_files(ROOT / "apps" / "admin")
    findings = []
    for path in admin_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "/api/v1/admin/llm-models" in text:
            findings.append(str(path.relative_to(ROOT)))
    assert not findings, "Retired/non-existent /admin/llm-models endpoint is still referenced."
