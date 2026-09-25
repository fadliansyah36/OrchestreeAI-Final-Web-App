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

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine


class DatabaseNotConfiguredError(HTTPException, RuntimeError):
    """
    Dilemparkan ketika konfigurasi DATABASE_URL tidak ditemukan di environment.
    Mendukung penanganan HTTPException (status 503 Service Unavailable) dan RuntimeError.
    """
    def __init__(self, detail: str = "DATABASE_URL belum dikonfigurasi di environment."):
        HTTPException.__init__(
            self,
            status_code=503,
            detail=detail,
            headers={"Content-Type": "application/problem+json"}
        )
        RuntimeError.__init__(self, detail)


_engine: Optional[sa.Engine] = None
_async_engine: Optional[AsyncEngine] = None


def get_database_engine() -> sa.Engine:
    """Mengambil atau membuat singleton SQLAlchemy Engine sinkron runtime (orchestree_app)."""
    global _engine
    if _engine is None:
        url = get_runtime_database_url()
        if not url:
            raise DatabaseNotConfiguredError("DATABASE_URL belum dikonfigurasi di environment.")
        _engine = sa.create_engine(
            url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


class HybridContext:
    def __init__(self, sync_ctx_fn, async_ctx_fn):
        self._sync_fn = sync_ctx_fn
        self._async_fn = async_ctx_fn
        self._sync_cm = None
        self._async_cm = None

    def __enter__(self):
        self._sync_cm = self._sync_fn()
        return self._sync_cm.__enter__()

    def __exit__(self, *args):
        return self._sync_cm.__exit__(*args)

    async def __aenter__(self):
        self._async_cm = self._async_fn()
        return await self._async_cm.__aenter__()

    async def __aexit__(self, *args):
        return await self._async_cm.__aexit__(*args)


class HybridEngine:
    """Wrapper yang mendukung eksekusi 'with engine.connect()' sinkron dan 'async with engine.begin()' asinkron."""
    def __init__(self, sync_eng: sa.Engine, async_eng: AsyncEngine):
        self._sync = sync_eng
        self._async = async_eng

    def connect(self):
        return HybridContext(lambda: self._sync.connect(), lambda: self._async.connect())

    def begin(self):
        return HybridContext(lambda: self._sync.begin(), lambda: self._async.begin())

    @property
    def sync_engine(self) -> sa.Engine:
        return self._sync

    @property
    def async_engine(self) -> AsyncEngine:
        return self._async

    def __getattr__(self, name):
        return getattr(self._sync, name)


_hybrid_engine: Optional[HybridEngine] = None


def get_engine() -> HybridEngine:
    """Mengambil atau membuat singleton HybridEngine yang mendukung sync dan async context manager."""
    global _hybrid_engine
    if _hybrid_engine is None:
        sync_eng = get_database_engine()
        raw_url = get_runtime_database_url()
        if not raw_url:
            raise DatabaseNotConfiguredError("DATABASE_URL belum dikonfigurasi di environment.")
        async_url = raw_url
        if async_url.startswith("postgresql://"):
            async_url = async_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif async_url.startswith("postgres://"):
            async_url = async_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif "+psycopg2" in async_url:
            async_url = async_url.replace("+psycopg2", "+asyncpg")
        if "sslmode=" in async_url:
            async_url = async_url.replace("sslmode=", "ssl=")
        async_eng = create_async_engine(
            async_url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
        _hybrid_engine = HybridEngine(sync_eng, async_eng)
    return _hybrid_engine


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
                # Periksa apakah koneksi dapat beralih ke role runtime orchestree_app (NOBYPASSRLS)
                try:
                    conn.execute(text("SET LOCAL ROLE orchestree_app;"))
                    switched = conn.execute(text("""
                        SELECT current_user as user_name, r.rolbypassrls, r.rolsuper
                        FROM pg_roles r
                        WHERE r.rolname = current_user;
                    """)).mappings().first()
                    if switched and switched["user_name"] == "orchestree_app" and not switched["rolbypassrls"]:
                        return True, (
                            f"Koneksi database aktif via role 'orchestree_app' (NOBYPASSRLS terkonfirmasi via pooler '{user_name}')."
                        ), {"user": "orchestree_app", "rolbypassrls": False, "pooler_user": user_name}
                except Exception:
                    pass

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


# AsyncPG connection management for async router operations (Enterprise & Permissions)
_async_pool = None


async def get_async_pool():
    global _async_pool
    if _async_pool is None:
        import asyncpg
        raw_url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
        if not raw_url:
            raise DatabaseNotConfiguredError("DATABASE_URL belum dikonfigurasi di environment.")
        # Ensure pure postgresql:// DSN for asyncpg
        dsn = raw_url
        if "+psycopg2" in dsn:
            dsn = dsn.replace("+psycopg2", "")
        if "+asyncpg" in dsn:
            dsn = dsn.replace("+asyncpg", "")
        if "sslmode=" in dsn:
            dsn = dsn.replace("sslmode=", "ssl=")
        _async_pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)
    return _async_pool


class DBConnectionWrapper:
    """Wrapper supporting both 'async with get_db_connection() as db' and 'Depends(get_db_connection)'."""
    def __init__(self):
        self._conn = None
        self._cm = None

    async def __aenter__(self):
        pool = await get_async_pool()
        self._cm = pool.acquire()
        self._conn = await self._cm.__aenter__()
        return self._conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._cm:
            await self._cm.__aexit__(exc_type, exc_val, exc_tb)

    async def fetch(self, query: str, *args):
        pool = await get_async_pool()
        return await pool.fetch(query, *args)

    async def fetchrow(self, query: str, *args):
        pool = await get_async_pool()
        return await pool.fetchrow(query, *args)

    async def fetchval(self, query: str, *args):
        pool = await get_async_pool()
        return await pool.fetchval(query, *args)

    async def execute(self, query: str, *args):
        pool = await get_async_pool()
        return await pool.execute(query, *args)


def get_db_connection():
    return DBConnectionWrapper()
