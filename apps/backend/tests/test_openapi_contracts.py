"""
Pengujian Stabilitas Kontrak OpenAPI 3.1 & Deteksi Breaking Change (PRD v2.2 Bagian 2.6).
Memastikan setiap perubahan endpoint di /api/v1 kompatibel mundur terhadap baseline openapi.base.json.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
import pytest
from app.main import app


def test_openapi_schema_generation():
    """
    Memastikan skema OpenAPI dapat diekstraksi tanpa error dari FastAPI instance.
    """
    spec = app.openapi()
    assert spec is not None
    assert spec.get("openapi", "").startswith("3.1")
    assert "paths" in spec
    assert "/health/live" in spec["paths"]
    assert "/health/startup" in spec["paths"]


def test_oasdiff_no_breaking_changes(tmp_path: Path):
    """
    Menjalankan oasdiff untuk memvalidasi bahwa skema saat ini tidak memiliki breaking change
    terhadap openapi.base.json.
    """
    oasdiff_bin = shutil.which("oasdiff")
    if not oasdiff_bin:
        pytest.skip("oasdiff binary tidak ditemukan di sistem environment")

    backend_dir = Path(__file__).resolve().parent.parent
    base_spec = backend_dir / "openapi.base.json"

    if not base_spec.exists():
        pytest.skip("openapi.base.json belum ada sebagai baseline")

    current_spec = tmp_path / "current_openapi.json"
    with open(current_spec, "w", encoding="utf-8") as f:
        json.dump(app.openapi(), f, indent=2)

    proc = subprocess.run(
        [oasdiff_bin, "breaking", str(base_spec), str(current_spec), "--fail-on", "ERR"],
        capture_output=True,
        text=True,
    )

    assert proc.returncode == 0, (
        f"Breaking changes terdeteksi oleh oasdiff:\nSTDOUT: {proc.stdout}\nSTDERR: {proc.stderr}"
    )
