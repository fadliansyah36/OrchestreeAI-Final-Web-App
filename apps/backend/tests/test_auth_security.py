import base64
import json
import time

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from app.core import security


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _jwt(payload: dict) -> tuple[str, ec.EllipticCurvePrivateKey]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public = private_key.public_key().public_numbers()
    jwk = {
        "kid": "test-key",
        "alg": "ES256",
        "kty": "EC",
        "crv": "P-256",
        "x": _b64(public.x.to_bytes(32, "big")),
        "y": _b64(public.y.to_bytes(32, "big")),
    }
    security._JWKS_CACHE.clear()
    security._JWKS_CACHE["https://test.invalid/jwks"] = (time.time(), {"keys": [jwk]})
    security.settings.SUPABASE_JWKS_URL = "https://test.invalid/jwks"
    security.settings.SUPABASE_JWT_ISSUER = "https://test.supabase.co/auth/v1"
    security.settings.SUPABASE_JWT_AUDIENCE = "authenticated"

    header = {"typ": "JWT", "alg": "ES256", "kid": "test-key"}
    encoded_header = _b64(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{encoded_header}.{encoded_payload}".encode()
    der = private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = __import__("cryptography.hazmat.primitives.asymmetric.utils", fromlist=["decode_dss_signature"]).decode_dss_signature(der)
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{encoded_header}.{encoded_payload}.{_b64(signature)}", private_key


def test_supabase_jwt_signature_and_claims_are_verified():
    token, _ = _jwt({
        "sub": "11111111-1111-1111-1111-111111111111",
        "iss": "https://test.supabase.co/auth/v1",
        "aud": "authenticated",
        "exp": time.time() + 300,
    })
    claims = security._verify_supabase_jwt(token)
    assert claims["sub"] == "11111111-1111-1111-1111-111111111111"


def test_tampered_jwt_is_rejected():
    token, _ = _jwt({
        "sub": "11111111-1111-1111-1111-111111111111",
        "iss": "https://test.supabase.co/auth/v1",
        "aud": "authenticated",
        "exp": time.time() + 300,
    })
    parts = token.split(".")
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
    payload["sub"] = "22222222-2222-2222-2222-222222222222"
    parts[1] = _b64(json.dumps(payload, separators=(",", ":")).encode())
    with pytest.raises(Exception):
        security._verify_supabase_jwt(".".join(parts))


def test_expired_jwt_is_rejected():
    token, _ = _jwt({
        "sub": "11111111-1111-1111-1111-111111111111",
        "iss": "https://test.supabase.co/auth/v1",
        "aud": "authenticated",
        "exp": time.time() - 1,
    })
    with pytest.raises(Exception):
        security._verify_supabase_jwt(token)


def test_test_harness_token_is_not_production_authentication():
    security.settings.APP_ENV = "production"
    security.settings.ALLOW_TEST_HARNESS_TOKENS = True
    with pytest.raises(Exception):
        security._verify_supabase_jwt("jwt.user.tenant.PLATFORM_SUPERADMIN.sig")
