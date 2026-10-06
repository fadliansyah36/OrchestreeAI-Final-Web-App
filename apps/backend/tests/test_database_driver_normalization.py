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
