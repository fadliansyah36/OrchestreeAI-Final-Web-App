#!/usr/bin/env python3
"""
OrchestreeAI OpenAPI Contract & Breaking Change Detector (PRD v2.2 Bagian 2.6).
Memanfaatkan `oasdiff` untuk mendeteksi perubahan merusak (breaking changes)
pada skema OpenAPI /api/v1 terhadap baseline resmi.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def generate_current_spec(output_path: Path):
    """
    Mengekstrak skema OpenAPI 3.1 langsung dari instance FastAPI app.main.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.main import app

    spec = app.openapi()
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)


def run_oasdiff(base_spec: Path, current_spec: Path) -> subprocess.CompletedProcess:
    """
    Menjalankan oasdiff breaking check dengan level toleransi kegagalan ERR.
    """
    cmd = [
        "oasdiff",
        "breaking",
        str(base_spec),
        str(current_spec),
        "--fail-on",
        "ERR",
    ]
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description="Validasi breaking change OpenAPI dengan oasdiff.")
    parser.add_argument(
        "--update-base",
        action="store_true",
        help="Perbarui openapi.base.json dengan skema saat ini sebagai baseline baru."
    )
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent.parent
    base_spec_path = backend_dir / "openapi.base.json"
    current_spec_path = backend_dir / "openapi.current.json"

    print("--- OrchestreeAI OpenAPI Contract Check ---")
    generate_current_spec(current_spec_path)
    print(f"✓ Skema OpenAPI terkini diekstraksi ke: {current_spec_path.name}")

    if args.update_base or not base_spec_path.exists():
        current_spec_path.replace(base_spec_path)
        print(f"✓ Baseline OpenAPI resmi diperbarui: {base_spec_path.name}")
        return 0

    # Jalankan oasdiff
    try:
        proc = run_oasdiff(base_spec_path, current_spec_path)
    except FileNotFoundError:
        print("PERINGATAN: `oasdiff` tidak ditemukan di PATH. Silakan instal oasdiff terlebih dahulu.")
        return 1

    if proc.returncode != 0:
        print("❌ BREAKING CHANGES TERDETEKSI PADA OPENAPI SPEC:")
        print(proc.stdout)
        print(proc.stderr)
        return 1

    print("✅ OpenAPI Contract PASSED: Tidak ada breaking change terhadap baseline.")
    if proc.stdout.strip():
        print(f"Info non-breaking:\n{proc.stdout}")

    # Bersihkan file current sementara jika pengujian selesai
    if current_spec_path.exists():
        current_spec_path.unlink()

    return 0


if __name__ == "__main__":
    sys.exit(main())
