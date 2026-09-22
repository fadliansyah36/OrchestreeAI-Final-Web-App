"""
OrchestreeAI Channel Gateway Routing & Identification (PRD v2.2 Bagian 10.5 & 12.9)

Menangani identifikasi akun kanal resmi (Category A & Category B),
validasi signature webhook X-Hub-Signature-256, dan penolakan payload tidak dikenal.
"""

import hmac
import hashlib
import json
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime, timezone

try:
    import sqlalchemy as sa
except ImportError:
    class _MockSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _MockSA()

try:
    from app.core.database import get_engine
except ImportError:
    get_engine = None

logger = logging.getLogger("orchestree.gateway.routing")


class UnrecognizedChannelAccountException(Exception):
    """Dilempar saat payload masuk tidak dapat dipetakan ke channel_account yang aktif."""
    pass


class InvalidWebhookSignatureException(Exception):
    """Dilempar saat verifikasi signature X-Hub-Signature-256 gagal."""
    pass


@dataclass
class InboundMessage:
    """Representasi kanonik terpadu dari setiap pesan masuk dari seluruh kanal."""
    tenant_id: str
    channel_account_id: str
    channel_type: str  # 'telegram_mtproto', 'whatsapp_cloud', 'instagram', 'facebook', 'tiktok'
    external_user_id: str
    content_text: str
    external_message_id: str
    display_name: Optional[str] = None
    external_username: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_email: Optional[str] = None
    media_urls: List[str] = field(default_factory=list)
    raw_payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def hash_identifier(identifier: str) -> str:
    """Menghasilkan hash deterministik sha256 dari external identifier untuk pencarian aman."""
    return hashlib.sha256(identifier.strip().encode("utf-8")).hexdigest()


def verify_hub_signature(signature_header: Optional[str], payload_bytes: bytes, secret: str) -> bool:
    """
    Verifikasi tanda tangan X-Hub-Signature-256 resmi (Meta WhatsApp Cloud API / Instagram).
    Format header: sha256=<signature_hex>
    """
    if not signature_header or not secret:
        return False

    prefix = "sha256="
    if not signature_header.startswith(prefix):
        return False

    received_sig = signature_header[len(prefix):]
    expected_sig = hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(received_sig, expected_sig)


def resolve_channel_account(
    channel_type: str,
    external_identifier: str,
    tenant_id: Optional[str] = None,
    engine=None
) -> Dict[str, Any]:
    """
    Menemukan dan memverifikasi akun kanal yang terdaftar aktif dalam sistem.
    Jika tidak ditemukan atau berstatus tidak aktif, melempar UnrecognizedChannelAccountException.
    """
    if engine is None:
        engine = get_engine()

    id_hash = hash_identifier(external_identifier)

    with engine.begin() as conn:
        if tenant_id:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": str(tenant_id)}
            )
            query = sa.text("""
                SELECT id, tenant_id, channel_type, connection_mode, account_label,
                       external_identifier, credential_ref, status, requires_owner_approval, is_approved
                FROM channel_accounts
                WHERE tenant_id = :tid 
                  AND channel_type = :ctype 
                  AND (external_identifier_hash = :hash OR external_identifier = :raw_id)
                LIMIT 1
            """)
            params = {"tid": tenant_id, "ctype": channel_type, "hash": id_hash, "raw_id": external_identifier}
        else:
            query = sa.text("""
                SELECT id, tenant_id, channel_type, connection_mode, account_label,
                       external_identifier, credential_ref, status, requires_owner_approval, is_approved
                FROM channel_accounts
                WHERE channel_type = :ctype 
                  AND (external_identifier_hash = :hash OR external_identifier = :raw_id)
                LIMIT 1
            """)
            params = {"ctype": channel_type, "hash": id_hash, "raw_id": external_identifier}

        acc = conn.execute(query, params).mappings().first()

        if not acc:
            raise UnrecognizedChannelAccountException(
                f"Akun kanal tidak dikenali untuk tipe '{channel_type}' dan identifier '{external_identifier}'"
            )

        if acc["status"] != "ACTIVE":
            raise UnrecognizedChannelAccountException(
                f"Akun kanal '{acc['account_label']}' berstatus '{acc['status']}', bukan ACTIVE"
            )

        return dict(acc)
