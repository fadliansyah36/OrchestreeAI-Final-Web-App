"""
Layanan Pembuatan dan Validasi Company Code (PRD v2.2 Bagian 13.4 & Fase 1).
- Menghasilkan string acak CSPRNG (kombinasi huruf besar + angka, tanpa karakter ambigu 0/O/1/I).
- Disimpan HANYA dalam bentuk hash SHA-256 (plain-text hanya ditampilkan sekali saat dibuat).
"""

import hashlib
import secrets
from typing import Tuple

# Karakter CSPRNG tanpa karakter ambigu (0, O, 1, I dihindari)
CSPRNG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
COMPANY_CODE_LENGTH = 8


def generate_company_code() -> Tuple[str, str]:
    """
    Menghasilkan Company Code CSPRNG baru dan hash SHA-256 miliknya.
    Returns:
        (plain_code, code_hash)
    """
    plain_code = "".join(secrets.choice(CSPRNG_ALPHABET) for _ in range(COMPANY_CODE_LENGTH))
    code_hash = hash_company_code(plain_code)
    return plain_code, code_hash


def hash_company_code(code: str) -> str:
    """Menghitung hash SHA-256 standar dari Company Code (case-insensitive)."""
    normalized = code.strip().upper()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def verify_company_code(plain_code: str, stored_hash: str) -> bool:
    """Verifikasi konstan (timing-attack safe) kesesuaian company code dengan hash tersimpan."""
    calculated_hash = hash_company_code(plain_code)
    return secrets.compare_digest(calculated_hash, stored_hash)
