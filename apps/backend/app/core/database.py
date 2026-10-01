"""Canonical runtime database boundary for OrchestreeAI.

All tenant data access MUST use the tenant transaction helpers in this module.
Runtime connections are fail-closed: they must execute as orchestree_app and
must not be a service_role/superuser/bypass-RLS connection.
"""

import os
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Dict, Generator, Optional, Tuple, Union
import uuid
from urllib.parse import urlparse, unquote

import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncConnection, create_async_engine
from fastapi import HTTPException

from app.core.config import settings


class DatabaseNotConfiguredError(HTTPException, RuntimeError):
    def __init__(self, detail: str = "DATABASE_URL belum dikonfigurasi di environment."):
        HTTPException.__init__(self, status_code=503, detail=detail, headers={"Content-Type": "application/problem+json"})
        RuntimeError.__init__(self, detail)


class RuntimeDatabaseRoleError(RuntimeError):
    """Raised when a runtime DB connection is not the canonical non-bypass role."""


_engine: Optional[sa.Engine] = None
_async_engine: Optional[AsyncEngine] = None


def format_postgres_url(raw_url: Optional[str]) -> Optional[str]:
    if not raw_url:
        return None
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
        return raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


def get_runtime_database_url() -> Optional[str]:
    """Runtime URL. It must resolve to orchestree_app, never service_role."""
    return format_postgres_url(os.getenv("DATABASE_URL") or settings.DATABASE_URL)


def get_migrator_database_url() -> Optional[str]:
    return format_postgres_url(
        os.getenv("DATABASE_URL_MIGRATOR")
        or settings.DATABASE_URL_MIGRATOR
        or os.getenv("DATABASE_URL")
        or settings.DATABASE_URL
    )


def _require_runtime_url() -> str:
    url = get_runtime_database_url()
    if not url:
        raise DatabaseNotConfiguredError()
    parsed = urlparse(url)
    username = unquote(parsed.username or "")
    if username != "orchestree_app":
        raise RuntimeDatabaseRoleError(
            "DATABASE_URL runtime wajib menunjuk langsung ke role orchestree_app; service_role/postgres/credential lain dilarang."
        )
    return url


def _assert_runtime_role(conn) -> None:
    row = conn.execute(text("""
        SELECT current_user AS user_name, r.rolbypassrls, r.rolsuper
        FROM pg_roles r WHERE r.rolname = current_user
    """)).mappings().first()
    if not row or row["user_name"] != "orchestree_app" or bool(row["rolbypassrls"]) or bool(row["rolsuper"]):
        raise RuntimeDatabaseRoleError(
            "Runtime DB connection wajib menggunakan role orchestree_app "
            "dengan rolbypassrls=false dan rolsuper=false."
        )


async def _assert_async_runtime_role(conn: AsyncConnection) -> None:
    row = (await conn.execute(text("""
        SELECT current_user AS user_name, r.rolbypassrls, r.rolsuper
        FROM pg_roles r WHERE r.rolname = current_user
    """))).mappings().first()
    if not row or row["user_name"] != "orchestree_app" or bool(row["rolbypassrls"]) or bool(row["rolsuper"]):
        raise RuntimeDatabaseRoleError(
            "Runtime DB connection wajib menggunakan role orchestree_app "
            "dengan rolbypassrls=false dan rolsuper=false."
        )


def _set_runtime_gucs(conn, tenant_id, user_id=None, actor_type="human_user", request_id=None, membership_id=None):
    if not tenant_id:
        raise RuntimeDatabaseRoleError("Tenant context wajib tersedia untuk runtime tenant transaction.")
    conn.execute(text("SET LOCAL ROLE orchestree_app;"))
    _assert_runtime_role(conn)
    for key, value in {
        "app.tenant_id": str(tenant_id),
        "app.user_id": str(user_id or ""),
        "app.actor_type": str(actor_type or "human_user"),
        "app.request_id": str(request_id or ""),
        "app.membership_id": str(membership_id or ""),
    }.items():
        conn.execute(text("SELECT set_config(:key, :value, true)"), {"key": key, "value": value})


async def _set_async_runtime_gucs(conn, tenant_id, user_id=None, actor_type="human_user", request_id=None, membership_id=None):
    if not tenant_id:
        raise RuntimeDatabaseRoleError("Tenant context wajib tersedia untuk runtime tenant transaction.")
    await conn.execute(text("SET LOCAL ROLE orchestree_app;"))
    await _assert_async_runtime_role(conn)
    for key, value in {
        "app.tenant_id": str(tenant_id),
        "app.user_id": str(user_id or ""),
        "app.actor_type": str(actor_type or "human_user"),
        "app.request_id": str(request_id or ""),
        "app.membership_id": str(membership_id or ""),
    }.items():
        await conn.execute(text("SELECT set_config(:key, :value, true)"), {"key": key, "value": value})


def get_database_engine() -> sa.Engine:
    """Canonical sync runtime engine; tenant queries must use tenant_tx()."""
    global _engine
    if _engine is None:
        _engine = sa.create_engine(_require_runtime_url(), pool_pre_ping=True, pool_size=10, max_overflow=20, connect_args={"connect_timeout": 5})
        @event.listens_for(_engine, "checkout")
        def _verify_sync_runtime_checkout(dbapi_conn, connection_record, connection_proxy):
            cursor = dbapi_conn.cursor()
            try:
                cursor.execute("SELECT current_user, r.rolbypassrls, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user")
                row = cursor.fetchone()
                if not row or row[0] != "orchestree_app" or bool(row[1]) or bool(row[2]):
                    raise RuntimeDatabaseRoleError("Runtime DB pool checkout wajib menggunakan orchestree_app NOBYPASSRLS non-superuser.")
            finally:
                cursor.close()
    return _engine


def get_async_database_engine() -> AsyncEngine:
    """Canonical async runtime engine; tenant queries must use tenant_tx_async()."""
    global _async_engine
    if _async_engine is None:
        raw_url = _require_runtime_url()
        async_url = raw_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        if async_url.startswith("postgresql://"):
            async_url = async_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        async_url = async_url.replace("sslmode=", "ssl=")
        _async_engine = create_async_engine(async_url, pool_pre_ping=True, pool_size=10, max_overflow=20, connect_args={"timeout": 5})
    return _async_engine


@contextmanager
def platform_tx() -> Generator[sa.Connection, None, None]:
    """Canonical non-tenant runtime transaction for global platform reference reads.

    The connection is still forced through orchestree_app and is never service_role.
    Callers must not use this helper for tenant-owned data.
    """
    with get_database_engine().connect() as conn:
        with conn.begin():
            conn.execute(text("SET LOCAL ROLE orchestree_app;"))
            _assert_runtime_role(conn)
            yield conn


@contextmanager
def tenant_tx(tenant_id: Union[str, uuid.UUID], user_id: Optional[Union[str, uuid.UUID]] = None,
              actor_type: str = "human_user", request_id: Optional[str] = None,
              membership_id: Optional[Union[str, uuid.UUID]] = None) -> Generator[sa.Connection, None, None]:
    """Canonical sync tenant transaction with role + transaction-local security context."""
    with get_database_engine().connect() as conn:
        with conn.begin():
            _set_runtime_gucs(conn, tenant_id, user_id, actor_type, request_id, membership_id)
            yield conn


@asynccontextmanager
async def platform_tx_async() -> AsyncGenerator[AsyncConnection, None]:
    """Canonical async non-tenant runtime transaction for platform reference reads."""
    async with get_async_database_engine().connect() as conn:
        async with conn.begin():
            await conn.execute(text("SET LOCAL ROLE orchestree_app;"))
            await _assert_async_runtime_role(conn)
            yield conn


@asynccontextmanager
async def tenant_tx_async(tenant_id: Union[str, uuid.UUID], user_id: Optional[Union[str, uuid.UUID]] = None,
                          actor_type: str = "human_user", request_id: Optional[str] = None,
                          membership_id: Optional[Union[str, uuid.UUID]] = None) -> AsyncGenerator[AsyncConnection, None]:
    """Canonical async tenant transaction with transaction-local GUC security context."""
    async with get_async_database_engine().connect() as conn:
        async with conn.begin():
            await _set_async_runtime_gucs(conn, tenant_id, user_id, actor_type, request_id, membership_id)
            yield conn


class HybridContext:
    def __init__(self, sync_ctx_fn, async_ctx_fn):
        self._sync_fn, self._async_fn = sync_ctx_fn, async_ctx_fn
        self._sync_cm = self._async_cm = None

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
    def __init__(self, sync_eng: sa.Engine, async_eng: AsyncEngine):
        self._sync, self._async = sync_eng, async_eng

    def connect(self):
        return HybridContext(lambda: self._sync.connect(), lambda: self._async.connect())

    def begin(self):
        return HybridContext(lambda: self._sync.begin(), lambda: self._async.begin())

    @property
    def sync_engine(self):
        return self._sync

    @property
    def async_engine(self):
        return self._async

    def __getattr__(self, name):
        return getattr(self._sync, name)


_hybrid_engine: Optional[HybridEngine] = None


def get_engine() -> HybridEngine:
    global _hybrid_engine
    if _hybrid_engine is None:
        _hybrid_engine = HybridEngine(get_database_engine(), get_async_database_engine())
    return _hybrid_engine


def verify_db_connection_and_role(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, object]]:
    url = target_url if target_url is not None else get_runtime_database_url()
    if not url:
        return False, "DATABASE_URL belum dikonfigurasi di environment runtime.", {}
    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT current_user AS user_name, r.rolbypassrls, r.rolsuper
                FROM pg_roles r WHERE r.rolname = current_user
            """)).mappings().first()
            if not row or row["user_name"] != "orchestree_app" or row["rolbypassrls"] or row["rolsuper"]:
                return False, "Runtime DB wajib menggunakan orchestree_app dengan rolbypassrls=false dan rolsuper=false.", dict(row or {})
            return True, "Runtime DB role orchestree_app terverifikasi (NOBYPASSRLS, non-superuser).", dict(row)
    except Exception as exc:
        return False, f"Gagal menghubungkan ke database: {str(exc)}", {}


def verify_rls_table_enforcement(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, object]]:
    url = target_url if target_url is not None else get_runtime_database_url()
    if not url:
        return False, "DATABASE_URL belum dikonfigurasi.", {}
    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
                       c.relforcerowsecurity AS rls_forced
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                AND EXISTS (
                    SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public' AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id'
                )
            """)).mappings().all()
            unprotected = [r["table_name"] for r in rows if not r["rls_enabled"] or not r["rls_forced"]]
            if unprotected:
                return False, f"Terdapat {len(unprotected)} tabel bertenant tanpa RLS+FORCE: {', '.join(unprotected)}", {"unprotected_tables": unprotected}
            return True, f"Seluruh {len(rows)} tabel bertenant terverifikasi RLS+FORCE.", {"tenant_tables_count": len(rows)}
    except Exception as exc:
        return False, f"Gagal memeriksa kebijakan RLS: {str(exc)}", {}


def verify_extensions_and_migrations(target_url: Optional[str] = None) -> Tuple[bool, str, Dict[str, object]]:
    url = target_url if target_url is not None else (get_migrator_database_url() or get_runtime_database_url())
    if not url:
        return False, "DATABASE_URL_MIGRATOR / DATABASE_URL belum dikonfigurasi.", {}
    try:
        engine = sa.create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            ext_rows = conn.execute(text("SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto','vector','pg_trgm')")).mappings().all()
            installed = {r["extname"]: r["extversion"] for r in ext_rows}
            missing = {"pgcrypto", "vector", "pg_trgm"} - set(installed)
            if missing:
                return False, f"Ekstensi wajib belum aktif: {', '.join(sorted(missing))}", {"installed_extensions": installed}
            exists = conn.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='alembic_version')")).scalar()
            if not exists:
                return False, "Tabel alembic_version belum terbentuk.", {"installed_extensions": installed}
            current_rev = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()
            return True, f"Ekstensi aktif, migrasi Alembic terdaftar: '{current_rev}'.", {"installed_extensions": installed, "current_revision": current_rev}
    except Exception as exc:
        return False, f"Gagal memverifikasi ekstensi dan migrasi: {str(exc)}", {}


# Legacy direct-pool APIs are deliberately fail-closed.
def get_async_pool():
    raise RuntimeDatabaseRoleError("get_async_pool() dinonaktifkan. Gunakan tenant_tx_async().")


class DBConnectionWrapper:
    def __init__(self):
        raise RuntimeDatabaseRoleError("DBConnectionWrapper dinonaktifkan. Gunakan tenant_tx_async().")


def get_db_connection():
    raise RuntimeDatabaseRoleError("get_db_connection() dinonaktifkan. Gunakan tenant_tx_async().")
