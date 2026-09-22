import subprocess
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parents[3]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from infra.supabase.link import extract_supabase_credentials


def test_supabase_credentials_extractor():
    root_dir = Path(__file__).resolve().parents[2]
    creds = extract_supabase_credentials(root_dir)
    assert isinstance(creds, dict)
    assert "project_ref" in creds
    assert "db_password" in creds


def test_alembic_migration_offline_generation():
    backend_dir = Path(__file__).resolve().parents[1]
    res = subprocess.run(
        ["alembic", "upgrade", "head", "--sql"],
        cwd=str(backend_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0
    sql_output = res.stdout

    # Verifikasi ekstensi dasar di migrasi
    assert "CREATE EXTENSION IF NOT EXISTS pgcrypto" in sql_output
    assert "CREATE EXTENSION IF NOT EXISTS vector" in sql_output
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in sql_output

    # Verifikasi role orchestree_app dengan NOBYPASSRLS
    assert "CREATE ROLE orchestree_app WITH LOGIN NOBYPASSRLS" in sql_output
    assert "ALTER ROLE orchestree_app WITH NOBYPASSRLS" in sql_output

    # Verifikasi role orchestree_migrator
    assert "CREATE ROLE orchestree_migrator" in sql_output


def test_alembic_downgrade_offline_generation():
    backend_dir = Path(__file__).resolve().parents[1]
    res = subprocess.run(
        ["alembic", "downgrade", "0001_initial_core_roles:base", "--sql"],
        cwd=str(backend_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0
    sql_output = res.stdout

    # Verifikasi reversibilitas: drop ekstensi dan drop role
    assert "DROP EXTENSION IF EXISTS pg_trgm" in sql_output
    assert "DROP EXTENSION IF EXISTS vector" in sql_output
    assert "DROP EXTENSION IF EXISTS pgcrypto" in sql_output
    assert "DROP ROLE IF EXISTS orchestree_app" in sql_output
    assert "DROP ROLE IF EXISTS orchestree_migrator" in sql_output
