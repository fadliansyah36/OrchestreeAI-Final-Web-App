"""
Manajemen Koneksi Database & Pemeriksaan Kesiapan Ekstensi/RLS (PRD v2.2 Bagian 2.6, 8 & 15.3).
Menyediakan engine database, verifikasi role orchestree_app (NOBYPASSRLS),
audit kebijakan RLS, dan pemeriksaan status ekstensi Postgres (pgcrypto, vector, pg_trgm).
"""

import os
from contextlib import contextmanager
from typing import Dict, Generator, List, Optional, Tuple, Union
from urllib.parse import urlparse
import uuid
import sqlalchemy as sa
from sqlalchemy import text
from app.core.config import settings

_engine: Optional[sa.Engine] = None


def get_database_engine() -> sa.Engine:
    """Mengambil atau membuat singleton SQLAlchemy Engine runtime (orchestree_app)."""
    global _engine
    if _engine is None:
        url = get_runtime_database_url()
        if not url:
            raise RuntimeError("DATABASE_URL belum dikonfigurasi di environment.")
        _engine = sa.create_engine(
            url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


@contextmanager
def tenant_tx(
    tenant_id: Union[str, uuid.UUID],
    user_id: Optional[Union[str, uuid.UUID]] = None,
    actor_type: str = "human_user",
    request_id: Optional[str] = None,
) -> Generator[sa.Connection, None, None]:
    """
    Context manager transaksi database dengan penegakan RLS ketat (PRD v2.2 Bagian 9.3).
    Menjalankan:
    - SET LOCAL ROLE orchestree_app;
    - set_config('app.tenant_id', tenant_id, true)
    - set_config('app.user_id', user_id, true)
    - set_config('app.actor_type', actor_type, true)
    - set_config('app.request_id', request_id, true)
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": str(tenant_id)},
            )
            if user_id:
                conn.execute(
                    text("SELECT set_config('app.user_id', :val, true);"),
                    {"val": str(user_id)},
                )
            if actor_type:
                conn.execute(
                    text("SELECT set_config('app.actor_type', :val, true);"),
                    {"val": str(actor_type)},
                )
            if request_id:
                conn.execute(
                    text("SELECT set_config('app.request_id', :val, true);"),
                    {"val": str(request_id)},
                )
            yield conn


def format_postgres_url(raw_url: Optional[str]) -> Optional[str]:
    """Menyesuaikan protokol connection string untuk kompatibilitas driver SQLAlchemy/psycopg2."""
    if not raw_url:
        return None
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
        return raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


def get_runtime_database_url() -> Optional[str]:
    """Mengambil URL database untuk runtime (role orchestree_app)."""
    return format_postgres_url(os.getenv("DATABASE_URL") or settings.DATABASE_URL)


def get_migrator_database_url() -> Optional[str]:
    """Mengambil URL database untuk migrasi DDL Alembic."""
    return format_postgres_url(
        os.getenv("DATABASE_URL_MIGRATOR")
        or settings.DATABASE_URL_MIGRATOR
        or os.getenv("DATABASE_URL")
        or settings.DATABASE_URL
    )


def verify_db_connection_and_role(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, any]]:
    """
    Pemeriksaan Langkah 2: Koneksi Database & Atribut Role (PRD v2.2 Bagian 2.6 & 15.3).
    Memverifikasi:
    1. Database dapat dihubungi dan merespons ping.
    2. Role yang digunakan memiliki atribut NOBYPASSRLS (rolbypassrls = False).
    """
    url = target_url if target_url is not None else get_runtime_database_url()
    if not url:
        return False, "DATABASE_URL belum dikonfigurasi di file .env atau environment runtime.", {}

    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            # Query role dan atribut bypassrls
            result = conn.execute(text("""
                SELECT current_user as user_name, r.rolbypassrls, r.rolsuper
                FROM pg_roles r
                WHERE r.rolname = current_user;
            """)).mappings().first()

            if not result:
                # Bila role tidak ditemukan di pg_roles, periksa minimal current_user
                user_res = conn.execute(text("SELECT current_user;")).scalar()
                return True, f"Koneksi database aktif sebagai user '{user_res}'.", {"user": user_res}

            user_name = result["user_name"]
            is_bypass = bool(result["rolbypassrls"])
            is_super = bool(result["rolsuper"])

            # Penegakan NOBYPASSRLS (PRD Bagian 2.6)
            if is_bypass or is_super:
                return False, (
                    f"Pelanggaran RLS: User '{user_name}' memiliki hak bypass RLS (rolbypassrls={is_bypass}, superuser={is_super}). "
                    "Role runtime wajib NOBYPASSRLS."
                ), {"user": user_name, "rolbypassrls": is_bypass, "rolsuper": is_super}

            return True, f"Koneksi database terverifikasi aktif dengan role '{user_name}' (NOBYPASSRLS terkonfirmasi).", {
                "user": user_name,
                "rolbypassrls": is_bypass,
            }
    except Exception as exc:
        return False, f"Gagal menghubungkan ke database: {str(exc)}", {}


def verify_rls_table_enforcement(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, any]]:
    """
    Pemeriksaan Langkah 3: Penegakan RLS Seluruh Tabel Tenant (PRD v2.2 Bagian 2.6 & 15.3).
    Memverifikasi bahwa seluruh tabel yang memiliki kolom 'tenant_id'
    mengaktifkan rowsecurity = true dan forcerowsecurity = true.
    """
    url = target_url if target_url is not None else (get_runtime_database_url() or get_migrator_database_url())
    if not url:
        return False, "DATABASE_URL belum dikonfigurasi untuk verifikasi kebijakan RLS.", {}

    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            # Cari seluruh tabel bertenant dan status RLS
            query = text("""
                SELECT 
                    c.relname as table_name,
                    c.relrowsecurity as rls_enabled,
                    c.relforcerowsecurity as rls_forced
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                AND EXISTS (
                    SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id'
                );
            """)
            rows = conn.execute(query).mappings().all()

            if not rows:
                return True, "0 tabel bertenant terdeteksi di skema public. Konfigurasi RLS siap untuk tabel baru.", {
                    "tenant_tables_count": 0
                }

            unprotected = []
            for row in rows:
                if not row["rls_enabled"] or not row["rls_forced"]:
                    unprotected.append(row["table_name"])

            if unprotected:
                return False, f"Terdapat {len(unprotected)} tabel bertenant tanpa proteksi RLS ketat: {', '.join(unprotected)}", {
                    "unprotected_tables": unprotected
                }

            return True, f"Seluruh {len(rows)} tabel bertenant terverifikasi mengaktifkan RLS dan FORCE RLS.", {
                "tenant_tables_count": len(rows)
            }
    except Exception as exc:
        return False, f"Gagal memeriksa kebijakan RLS pada database: {str(exc)}", {}


def verify_extensions_and_migrations(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, any]]:
    """
    Pemeriksaan Langkah 4: Ekstensi Postgres & Status Migrasi Head (PRD v2.2 Bagian 8 & 15.3).
    Memverifikasi:
    1. Ekstensi pgcrypto, vector, dan pg_trgm terpasang aktif di Postgres.
    2. Tabel alembic_version ada dan mencatat revisi migrasi.
    """
    url = target_url if target_url is not None else (get_migrator_database_url() or get_runtime_database_url())
    if not url:
        return False, "DATABASE_URL_MIGRATOR / DATABASE_URL belum dikonfigurasi.", {}

    required_extensions = {"pgcrypto", "vector", "pg_trgm"}

    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            # 1. Cek ekstensi aktif
            ext_rows = conn.execute(text("""
                SELECT extname, extversion FROM pg_extension 
                WHERE extname IN ('pgcrypto', 'vector', 'pg_trgm');
            """)).mappings().all()

            installed_exts = {row["extname"]: row["extversion"] for row in ext_rows}
            missing = required_extensions - set(installed_exts.keys())

            if missing:
                return False, f"Ekstensi Postgres wajib belum aktif: {', '.join(sorted(missing))}", {
                    "installed_extensions": installed_exts,
                    "missing_extensions": list(missing),
                }

            # 2. Cek status revisi Alembic
            alembic_table_exists = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'alembic_version'
                );
            """)).scalar()

            if not alembic_table_exists:
                return False, "Tabel alembic_version belum terbentuk. Jalankan 'alembic upgrade head'.", {
                    "installed_extensions": installed_exts,
                    "alembic_version": None,
                }

            current_rev = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1;")).scalar()

            return True, f"Ekstensi Postgres (pgcrypto, vector, pg_trgm) aktif, migrasi Alembic terdaftar: '{current_rev}'.", {
                "installed_extensions": installed_exts,
                "current_revision": current_rev,
            }
    except Exception as exc:
        return False, f"Gagal memverifikasi ekstensi dan migrasi database: {str(exc)}", {}
