from app.core.database import format_async_postgres_url, format_postgres_url


def test_sync_postgres_url_normalizes_asyncpg_driver():
    raw = "postgresql+asyncpg://runtime_role:secret@example.test:5432/postgres?sslmode=require"
    normalized = format_postgres_url(raw)

    assert normalized == "postgresql+psycopg2://runtime_role:secret@example.test:5432/postgres?sslmode=require"


def test_sync_postgres_url_normalizes_explicit_other_driver():
    raw = "postgresql+psycopg://runtime_role:secret@example.test:5432/postgres"
    normalized = format_postgres_url(raw)

    assert normalized == "postgresql+psycopg2://runtime_role:secret@example.test:5432/postgres"


def test_async_postgres_url_normalizes_from_sync_and_generic_schemes():
    assert (
        format_async_postgres_url("postgresql://runtime_role:secret@example.test:5432/postgres")
        == "postgresql+asyncpg://runtime_role:secret@example.test:5432/postgres"
    )
    assert (
        format_async_postgres_url("postgresql+psycopg2://runtime_role:secret@example.test:5432/postgres")
        == "postgresql+asyncpg://runtime_role:secret@example.test:5432/postgres"
    )


def test_postgres_url_preserves_credentials_and_query_options():
    raw = "postgres://runtime_role:p%40ss@example.test:5432/postgres?sslmode=require&application_name=orchestree"
    normalized = format_postgres_url(raw)

    assert normalized.startswith("postgresql+psycopg2://runtime_role:p%40ss@example.test:5432/postgres")
    assert "sslmode=require" in normalized
    assert "application_name=orchestree" in normalized


def test_runtime_database_identity_is_taken_from_database_url(monkeypatch):
    from app.core.database import _require_runtime_url

    monkeypatch.setenv("DATABASE_URL", "postgresql://runtime_role:secret@example.test:5432/postgres")

    assert _require_runtime_url().startswith("postgresql+psycopg2://runtime_role:")



def test_runtime_database_identity_comes_from_database_url(monkeypatch):
    from app.core.database import get_runtime_database_role, _require_runtime_url

    monkeypatch.delenv("DATABASE_RUNTIME_ROLE", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://configured_role:secret@example.test:5432/postgres")

    assert get_runtime_database_role() == "configured_role"
    assert _require_runtime_url().startswith("postgresql+psycopg2://configured_role:")
