"""Inisialisasi Ekstensi Dasar Postgres dan Role Database

Revision ID: 0001_initial_core_roles
Revises: None
Create Date: 2026-09-22 08:00:00.000000

PRD v2.2 Bagian 2.6, Bagian 8 & Bagian 15.2:
- Mengaktifkan ekstensi pgcrypto, vector, dan pg_trgm
- Membuat role orchestree_app dengan NOBYPASSRLS (runtime app pool)
- Membuat role orchestree_migrator (migrator schema DDL)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_core_roles"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ekstensi Dasar PostgreSQL
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # 2. Role Runtime: orchestree_app (Wajib NOBYPASSRLS untuk kepatuhan mutlak isolasi RLS)
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchestree_app') THEN
            CREATE ROLE orchestree_app WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
        ELSE
            ALTER ROLE orchestree_app WITH NOBYPASSRLS;
        END IF;
    END
    $$;
    """)

    # 3. Role Migrator: orchestree_migrator (Hak DDL untuk Alembic)
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchestree_migrator') THEN
            CREATE ROLE orchestree_migrator WITH LOGIN CREATEDB CREATEROLE INHERIT;
        END IF;
    END
    $$;
    """)

    # 4. Privilese Schema Public
    op.execute("GRANT USAGE ON SCHEMA public TO orchestree_app;")
    op.execute("GRANT ALL ON SCHEMA public TO orchestree_migrator;")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orchestree_app;")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO orchestree_app;")


def downgrade() -> None:
    # 1. Cabut Privilese Schema
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM orchestree_app;")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM orchestree_app;")
    op.execute("REVOKE ALL ON SCHEMA public FROM orchestree_migrator;")
    op.execute("REVOKE USAGE ON SCHEMA public FROM orchestree_app;")

    # 2. Hapus Role (Reversible)
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchestree_app') THEN
            DROP ROLE IF EXISTS orchestree_app;
        END IF;
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orchestree_migrator') THEN
            DROP ROLE IF EXISTS orchestree_migrator;
        END IF;
    END
    $$;
    """)

    # 3. Hapus Ekstensi
    op.execute("DROP EXTENSION IF EXISTS pg_trgm;")
    op.execute("DROP EXTENSION IF EXISTS vector;")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto;")
