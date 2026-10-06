from app.core.database import format_async_postgres_url, format_postgres_url


def test_sync_postgres_url_normalizes_asyncpg_driver():
    raw = "postgresql+asyncpg://orchestree_app:secret@example.test:5432/postgres?sslmode=require"
    normalized = format_postgres_url(raw)

    assert normalized == "postgresql+psycopg2://orchestree_app:secret@example.test:5432/postgres?sslmode=require"


def test_sync_postgres_url_normalizes_explicit_other_driver():
    raw = "postgresql+psycopg://orchestree_app:secret@example.test:5432/postgres"
    normalized = format_postgres_url(raw)

    assert normalized == "postgresql+psycopg2://orchestree_app:secret@example.test:5432/postgres"


def test_async_postgres_url_normalizes_from_sync_and_generic_schemes():
    assert (
        format_async_postgres_url("postgresql://orchestree_app:secret@example.test:5432/postgres")
        == "postgresql+asyncpg://orchestree_app:secret@example.test:5432/postgres"
    )
    assert (
        format_async_postgres_url("postgresql+psycopg2://orchestree_app:secret@example.test:5432/postgres")
        == "postgresql+asyncpg://orchestree_app:secret@example.test:5432/postgres"
    )


def test_postgres_url_preserves_credentials_and_query_options():
    raw = "postgres://orchestree_app:p%40ss@example.test:5432/postgres?sslmode=require&application_name=orchestree"
    normalized = format_postgres_url(raw)

    assert normalized.startswith("postgresql+psycopg2://orchestree_app:p%40ss@example.test:5432/postgres")
    assert "sslmode=require" in normalized
    assert "application_name=orchestree" in normalized


def test_runtime_database_role_is_deployment_configured(monkeypatch):
    from app.core.database import _require_runtime_url

    monkeypatch.setenv("DATABASE_RUNTIME_ROLE", "runtime_role")
    monkeypatch.setenv("DATABASE_URL", "postgresql://runtime_role:secret@example.test:5432/postgres")

    assert _require_runtime_url().startswith("postgresql+psycopg2://runtime_role:")


def test_runtime_database_role_mismatch_fails_closed(monkeypatch):
    from app.core.database import _require_runtime_url, RuntimeDatabaseRoleError

    monkeypatch.setenv("DATABASE_RUNTIME_ROLE", "runtime_role")
    monkeypatch.setenv("DATABASE_URL", "postgresql://other_role:secret@example.test:5432/postgres")

    try:
        _require_runtime_url()
    except RuntimeDatabaseRoleError:
        return
    raise AssertionError("runtime DB role mismatch must fail closed")
