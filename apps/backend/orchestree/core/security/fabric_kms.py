"""
OrchestreeAI Fabric Connector KMS Envelope Encryption Service (PRD v2.2 Bagian 3.4, 3.5, 12)

Menerapkan enkripsi amplop (envelope encryption) terisolasi per koneksi Fabric:
- Setiap koneksi Fabric (ERP, HRIS, CRM, CMMS) memiliki kunci unik (credential_key_id terpisah per baris).
- Kebocoran satu koneksi tidak dapat membuka koneksi lainnya karena turunan kunci (derived key)
  menggabungkan master KMS secret, salt unik per koneksi, tenant_id, dan connector_id.
- Menggunakan skema Authenticated Encryption (Encrypt-then-MAC via PBKDF2-HMAC-SHA256).
"""

import os
import json
import base64
import hashlib
import hmac
import secrets
from typing import Dict, Any, Tuple, Optional


def _get_fabric_kms_master_key() -> bytes:
    """Mengambil master KMS secret dari environment produksi."""
    key = (
        os.getenv("FABRIC_KMS_MASTER_KEY")
        or os.getenv("KMS_MASTER_KEY")
        or os.getenv("MTPROTO_KMS_MASTER_KEY")
        or os.getenv("APP_SECRET_KEY")
        or os.getenv("SUPABASE_JWT_SECRET")
    )
    if not key:
        key = "orchestree-fabric-kms-master-enterprise-v2-seed"
    return key.encode("utf-8")


def derive_connector_keys(tenant_id: str, connector_id: str, key_id: str, salt: bytes) -> Tuple[bytes, bytes]:
    """
    Menurunkan pasangan kunci enkripsi (K_enc) dan kunci integritas (K_mac)
    yang unik secara matematis untuk satu konektor fabric dan satu tenant spesifik.
    """
    master_key = _get_fabric_kms_master_key()
    context = f"orchestree:fabric:tenant:{tenant_id}:conn:{connector_id}:kid:{key_id}".encode("utf-8")

    # 100,000 iterasi PBKDF2-HMAC-SHA256 untuk mematuhi standar enterprise NIST
    derived_material = hashlib.pbkdf2_hmac(
        "sha256",
        master_key + context,
        salt,
        100_000,
        dklen=64
    )
    k_enc = derived_material[:32]
    k_mac = derived_material[32:]
    return k_enc, k_mac


def _keystream_bytes(key: bytes, nonce: bytes, length: int) -> bytes:
    """Menghasilkan aliran kunci deterministik (keystream) menggunakan HMAC-SHA256 counter mode."""
    stream = bytearray()
    counter = 0
    while len(stream) < length:
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        stream.extend(block)
        counter += 1
    return bytes(stream[:length])


def encrypt_fabric_credentials(
    credentials: Dict[str, Any],
    tenant_id: str,
    connector_id: str,
    key_id: Optional[str] = None
) -> Tuple[str, str]:
    """
    Mengenkripsi kamus kredensial (API Key, OAuth tokens, Client Secret, mTLS certs)
    dengan envelope encryption per-koneksi.
    
    Returns:
        Tuple[encrypted_payload_str, key_id]
    """
    kid = key_id or f"kid-fabric-{secrets.token_hex(8)}"
    salt = secrets.token_bytes(16)
    nonce = secrets.token_bytes(16)
    k_enc, k_mac = derive_connector_keys(tenant_id, connector_id, kid, salt)

    plaintext_bytes = json.dumps(credentials, sort_keys=True).encode("utf-8")
    keystream = _keystream_bytes(k_enc, nonce, len(plaintext_bytes))
    ciphertext = bytes(p ^ k for p, k in zip(plaintext_bytes, keystream))

    # MAC dihitung atas (salt + nonce + ciphertext) untuk Authenticated Encryption
    mac_tag = hmac.new(k_mac, salt + nonce + ciphertext, hashlib.sha256).digest()

    envelope_dict = {
        "v": 2,
        "kid": kid,
        "salt": base64.b64encode(salt).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ct": base64.b64encode(ciphertext).decode("ascii"),
        "mac": base64.b64encode(mac_tag).decode("ascii"),
    }

    raw_json = json.dumps(envelope_dict, separators=(",", ":"))
    return base64.b64encode(raw_json.encode("utf-8")).decode("ascii"), kid


def decrypt_fabric_credentials(
    encrypted_payload: str,
    tenant_id: str,
    connector_id: str,
    key_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Mendekripsi kredensial koneksi Fabric dan memvalidasi keaslian (anti-tampering).
    Jika ciphertext diubah atau kunci tidak cocok, ValueError akan dilemparkan.
    """
    try:
        raw_json = base64.b64decode(encrypted_payload.encode("ascii")).decode("utf-8")
        envelope = json.loads(raw_json)
    except Exception as e:
        raise ValueError(f"Payload enkripsi KMS tidak valid atau rusak: {e}")

    kid = key_id or envelope.get("kid")
    if not kid:
        raise ValueError("Key ID (kid) tidak ditemukan pada amplop enkripsi KMS.")

    try:
        salt = base64.b64decode(envelope["salt"].encode("ascii"))
        nonce = base64.b64decode(envelope["nonce"].encode("ascii"))
        ciphertext = base64.b64decode(envelope["ct"].encode("ascii"))
        expected_mac = base64.b64decode(envelope["mac"].encode("ascii"))
    except Exception as e:
        raise ValueError(f"Format field amplop KMS rusak: {e}")

    k_enc, k_mac = derive_connector_keys(tenant_id, connector_id, kid, salt)

    # Verifikasi integritas MAC sebelum dekripsi (Timing-attack resistant)
    actual_mac = hmac.new(k_mac, salt + nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(actual_mac, expected_mac):
        raise ValueError("Integritas data terlanggar (KMS MAC mismatch / deteksi tamper payload)")

    keystream = _keystream_bytes(k_enc, nonce, len(ciphertext))
    plaintext_bytes = bytes(c ^ k for c, k in zip(ciphertext, keystream))

    try:
        return json.loads(plaintext_bytes.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"Dekripsi berhasil namun payload bukan JSON valid: {e}")
