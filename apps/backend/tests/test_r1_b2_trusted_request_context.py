from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.security import AuthenticatedTenantContext, get_trusted_request_context
from app.api.v1.chat import ChatMessageRequest


def _context(tenant_id="tenant-a"):
    return AuthenticatedTenantContext(
        user_id="user-a",
        tenant_id=tenant_id,
        roles=["STAFF_HUMAN"],
        capabilities=["chat.message.create"],
        is_mfa_verified=False,
    )


@pytest.mark.asyncio
async def test_trusted_context_rejects_path_tenant_mismatch():
    request = SimpleNamespace(path_params={"tenant_id": "tenant-b"})
    with pytest.raises(HTTPException) as exc:
        await get_trusted_request_context(request, _context("tenant-a"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_trusted_context_accepts_matching_path_tenant():
    request = SimpleNamespace(path_params={"tenant_id": "tenant-a"})
    context = await get_trusted_request_context(request, _context("tenant-a"))
    assert context.user_id == "user-a"
    assert context.tenant_id == "tenant-a"
    assert context.roles == ["STAFF_HUMAN"]


def test_chat_payload_rejects_client_tenant_override():
    with pytest.raises(ValueError):
        ChatMessageRequest(message="hello", tenant_id="tenant-b")


def test_chat_payload_rejects_client_membership_identity():
    with pytest.raises(ValueError):
        ChatMessageRequest(message="hello", membership_id="forged-membership")
