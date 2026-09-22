"""
Script Link Proyek Supabase CLI (PRD v2.2 Bagian 15.2 & Inisialisasi Database).
Membaca kredensial nyata dari file .env dan melakukan link ke proyek Supabase.
"""

import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse
from dotenv import dotenv_values


def resolve_project_root() -> Path:
    """Mencari direktori root repositori."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / "package.json").exists() or (current / ".env.schema").exists():
            return current
        current = current.parent
    return Path.cwd()


def extract_supabase_credentials(root_dir: Path) -> dict:
    """Mengekstrak konfigurasi Supabase dari .env di root atau apps/backend."""
    env_paths = [
        root_dir / ".env",
        root_dir / "apps" / "backend" / ".env",
    ]

    merged_env = {}
    for p in env_paths:
        if p.exists():
            values = dotenv_values(p)
            merged_env.update({k: v for k, v in values.items() if v})

    # Fallback ke environment variables sistem operasi
    for key in [
        "SUPABASE_URL",
        "SUPABASE_PROJECT_REF",
        "SUPABASE_DB_PASSWORD",
        "DATABASE_URL_MIGRATOR",
        "DATABASE_URL",
        "SUPABASE_ACCESS_TOKEN",
    ]:
        val = os.getenv(key)
        if val and key not in merged_env:
            merged_env[key] = val

    project_ref = merged_env.get("SUPABASE_PROJECT_REF")
    db_password = merged_env.get("SUPABASE_DB_PASSWORD")

    # Ekstraksi project ref dari SUPABASE_URL jika belum ditentukan eksplisit
    supabase_url = merged_env.get("SUPABASE_URL", "")
    if not project_ref and supabase_url:
        match = re.search(r"https?://([a-zA-Z0-9_-]+)\.supabase\.co", supabase_url)
        if match:
            project_ref = match.group(1)

    # Ekstraksi dari DATABASE_URL_MIGRATOR atau DATABASE_URL
    db_url = merged_env.get("DATABASE_URL_MIGRATOR") or merged_env.get("DATABASE_URL")
    if db_url:
        try:
            parsed = urlparse(db_url)
            if not project_ref and parsed.hostname:
                # Pola db.<project-ref>.supabase.co
                host_match = re.search(r"(?:db\.)?([a-zA-Z0-9_-]+)\.supabase\.co", parsed.hostname)
                if host_match:
                    project_ref = host_match.group(1)
            if not db_password and parsed.password:
                db_password = parsed.password
        except Exception:
            pass

    return {
        "project_ref": project_ref,
        "db_password": db_password,
        "access_token": merged_env.get("SUPABASE_ACCESS_TOKEN"),
        "has_env": any(p.exists() for p in env_paths),
    }


def link_supabase_project(workdir: Path = None) -> bool:
    """Menjalankan perintah supabase link dengan kredensial terdeteksi."""
    root_dir = resolve_project_root()
    infra_supabase_dir = root_dir / "infra" / "supabase"
    target_workdir = workdir or infra_supabase_dir

    creds = extract_supabase_credentials(root_dir)
    project_ref = creds.get("project_ref")
    db_password = creds.get("db_password")
    access_token = creds.get("access_token")

    if not project_ref:
        print("[-] SUPABASE_URL atau SUPABASE_PROJECT_REF belum terkonfigurasi di file .env.")
        print("    Silakan pastikan variabel SUPABASE_URL diisi dengan format https://<project-ref>.supabase.co")
        return False

    print(f"[*] Menghubungkan Supabase CLI ke proyek: {project_ref}")

    cmd = ["supabase", "link", "--project-ref", project_ref, "--workdir", str(target_workdir)]
    if db_password:
        cmd.extend(["--password", db_password])

    env = os.environ.copy()
    if access_token:
        env["SUPABASE_ACCESS_TOKEN"] = access_token

    try:
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"[+] Berhasil menghubungkan Supabase CLI ke proyek: {project_ref}")
            if res.stdout:
                print(res.stdout.strip())
            return True
        else:
            print(f"[-] Gagal menghubungkan ke Supabase: {res.stderr.strip() or res.stdout.strip()}")
            return False
    except FileNotFoundError:
        print("[-] Biner supabase tidak ditemukan di PATH.")
        return False


if __name__ == "__main__":
    success = link_supabase_project()
    sys.exit(0 if success else 1)
