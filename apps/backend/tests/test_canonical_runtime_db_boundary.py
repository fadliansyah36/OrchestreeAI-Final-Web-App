import pytest

from app.core.database import (
    RuntimeDatabaseRoleError,
    get_async_pool,
    get_db_connection,
)


def test_legacy_async_pool_is_fail_closed():
    with pytest.raises(RuntimeDatabaseRoleError):
        get_async_pool()


def test_legacy_db_connection_is_fail_closed():
    with pytest.raises(RuntimeDatabaseRoleError):
        get_db_connection()
