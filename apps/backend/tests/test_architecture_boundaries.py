"""
Pemeriksaan Batas Arsitektur & Modul (PRD v2.2 Bagian 9.2).
Menegakkan aturan: modul domains/* hanya boleh mengimpor core, authz,
dan antarmuka *.contracts domain lain — bukan implementasi internal domain lain.
"""

import ast
import subprocess
import sys
from pathlib import Path
import pytest


def test_import_linter_contracts():
    """
    Menjalankan import-linter untuk memvalidasi kontrak dependensi modul.
    """
    config_path = Path(__file__).resolve().parent.parent / ".importlinter"
    backend_root = Path(__file__).resolve().parent.parent

    cmd = [
        sys.executable,
        "-m",
        "importlinter.cli",
        "--config",
        str(config_path),
        "--no-cache",
    ]

    result = subprocess.run(
        cmd,
        cwd=str(backend_root),
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(backend_root)},
    )

    assert result.returncode == 0, (
        f"import-linter mendeteksi pelanggaran batas arsitektur:\n"
        f"STDOUT:\n{result.stdout}\n"
        f"STDERR:\n{result.stderr}"
    )


def test_domain_boundary_ast_enforcement():
    """
    Analisis AST untuk memeriksa setiap file di app/domains/*.
    Memastikan tidak ada import langsung ke internal domain lain.
    """
    backend_root = Path(__file__).resolve().parent.parent
    domains_dir = backend_root / "app" / "domains"

    if not domains_dir.exists():
        pytest.skip("Direktori app/domains belum diinisiasi")

    violations = []

    # Iterasi setiap domain
    for domain_path in domains_dir.iterdir():
        if not domain_path.is_dir() or domain_path.name.startswith(("_", ".")):
            continue

        domain_name = domain_path.name

        for py_file in domain_path.rglob("*.py"):
            try:
                tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
            except Exception as e:
                violations.append(f"Gagal mem-parsing {py_file}: {e}")
                continue

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        name = alias.name
                        _check_imported_name(name, domain_name, py_file, node.lineno, violations)
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        _check_imported_name(node.module, domain_name, py_file, node.lineno, violations)

    assert not violations, (
        "Pelanggaran batas domain terdeteksi (PRD v2.2 Bagian 9.2):\n"
        + "\n".join(violations)
        + "\nSetiap domain hanya boleh mengimpor core, authz, dan antarmuka *.contracts modul lain."
    )


def _check_imported_name(imported_module: str, current_domain: str, file_path: Path, lineno: int, violations: list):
    """
    Memvalidasi apakah modul yang diimpor mematuhi aturan batas domain.
    """
    if not imported_module.startswith("app.domains."):
        # Mengimpor app.core, app.authz, atau third-party diizinkan
        return

    parts = imported_module.split(".")
    # Format: app.domains.<target_domain>.<submodule>
    if len(parts) >= 3:
        target_domain = parts[2]
        if target_domain == current_domain:
            # Mengimpor modul internal milik domain sendiri diizinkan
            return

        # Mengimpor domain lain HANYA diizinkan jika melalui contracts
        if len(parts) >= 4 and parts[3] == "contracts":
            return

        violations.append(
            f"[{file_path.name}:{lineno}] Domain '{current_domain}' mengimpor internal domain '{target_domain}' "
            f"melalui '{imported_module}'. Wajib menggunakan 'app.domains.{target_domain}.contracts'."
        )
