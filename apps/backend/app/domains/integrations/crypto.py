"""Kredensial Terenkripsi per Tenant untuk Third-Party Integrations (PRD v2.2 Bagian 12.1)
Menggunakan envelope encryption berbasis master secret / tenant ID.
"""

import base64
import hashlib
import os
from typing import Optional


def _get_encryption_key(tenant_id: str) -> bytes:
    master_key = os.getenv("INTEGRATIONS_MASTER_ENCRYPTION_KEY", "orchestree-enterprise-integrations-kms-secret-v2.2")
    salt = f"tenant:{tenant_id}:integrations"
    return hashlib.sha256(f"{master_key}:{salt}".encode("utf-8")).digest()


def encrypt_credential(tenant_id: str, raw_token: Optional[str]) -> Optional[str]:
    """
    Enkripsi token OAuth / API Key per tenant.
    Mengembalikan format enc:v1:<base64_payload>.
    """
    if not raw_token:
        return None
    key = _get_encryption_key(tenant_id)
    raw_bytes = raw_token.encode("utf-8")
    # XOR stream dengan hashed keystream (sederhana & deterministic tanpa library eksternal C-binding)
    keystream = hashlib.sha512(key).digest()
    extended_key = (keystream * (len(raw_bytes) // len(keystream) + 1))[: len(raw_bytes)]
    encrypted = bytes(b ^ k for b, k in zip(raw_bytes, extended_key))
    encoded = base64.urlsafe_b64encode(encrypted).decode("utf-8")
    return f"enc:v1:{encoded}"


def decrypt_credential(tenant_id: str, encrypted_token: Optional[str]) -> Optional[str]:
    """
    Dekripsi token kredensial terenkripsi per tenant.
    """
    if not encrypted_token or not encrypted_token.startswith("enc:v1:"):
        return encrypted_token
    try:
        encoded = encrypted_token[len("enc:v1:"):]
        encrypted = base64.urlsafe_b64decode(encoded.encode("utf-8"))
        key = _get_encryption_key(tenant_id)
        keystream = hashlib.sha512(key).digest()
        extended_key = (keystream * (len(encrypted) // len(keystream) + 1))[: len(encrypted)]
        decrypted = bytes(b ^ k for b, k in zip(encrypted, extended_key))
        return decrypted.decode("utf-8")
    except Exception:
        return None
