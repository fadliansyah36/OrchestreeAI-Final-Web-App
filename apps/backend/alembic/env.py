import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Ensure app package is in sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.core.config import settings

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = None


def get_database_url() -> str:
    """
    Mengambil URL koneksi database untuk migrator (PRD v2.2 Bagian 15.2).
    Prioritas:
    1. DATABASE_URL_MIGRATOR (role migrator dengan hak DDL)
    2. DATABASE_URL (role app / default)
    """
    raw_url = (
        os.getenv("DATABASE_URL_MIGRATOR")
        or settings.DATABASE_URL_MIGRATOR
        or os.getenv("DATABASE_URL")
        or settings.DATABASE_URL
    )

    if not raw_url:
        # Fallback URL offline untuk pemeriksaan kompilasi/offline SQL
        return "postgresql://postgres:postgres@localhost:5432/postgres"

    # Alembic selalu menggunakan SQLAlchemy sinkron; normalisasi setiap
    # explicit Postgres driver agar asyncpg tidak pernah dimuat oleh engine ini.
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_url.startswith("postgresql://"):
        raw_url = raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    elif raw_url.startswith("postgresql+"):
        raw_url = "postgresql+psycopg2://" + raw_url.split("://", 1)[1]

    return raw_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section, {}) or {}
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()



if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
