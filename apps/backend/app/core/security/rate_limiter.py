"""
OrchestreeAI Rate Limiter & Brute-Force Defense (PRD v2.2 Bagian 15 & 16)
Implementasi Token Bucket & Account Lockout Guard untuk endpoint sensitif:
- login & auth: 5 req/min (dengan penguncian akun 15 menit setelah 5x gagal)
- otp: 3 req/min
- ask_ai: 30 req/min (per tenant/user)
- upload: 15 req/min
- public_webhook: 60 req/min
- default: 120 req/min
"""

import time
import threading
from typing import Dict, Tuple, Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse


class RateLimitConfig:
    def __init__(self, capacity: int, refill_rate: float, block_duration: int = 60):
        self.capacity = capacity              # Jumlah token maksimum
        self.refill_rate = refill_rate        # Token per detik
        self.block_duration = block_duration  # Durasi blokir jika terkena limit (detik)


LIMITS: Dict[str, RateLimitConfig] = {
    "auth_login": RateLimitConfig(capacity=5, refill_rate=5 / 60.0, block_duration=300),
    "auth_otp": RateLimitConfig(capacity=3, refill_rate=3 / 60.0, block_duration=600),
    "ask_ai": RateLimitConfig(capacity=30, refill_rate=30 / 60.0, block_duration=60),
    "upload": RateLimitConfig(capacity=15, refill_rate=15 / 60.0, block_duration=60),
    "public_webhook": RateLimitConfig(capacity=60, refill_rate=60 / 60.0, block_duration=60),
    "general": RateLimitConfig(capacity=120, refill_rate=120 / 60.0, block_duration=60),
}


class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.tokens = float(capacity)
        self.refill_rate = refill_rate
        self.last_refill = time.time()

    def consume(self, amount: float = 1.0) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(float(self.capacity), self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False


class SecurityRateLimiter:
    """Thread-safe Token Bucket Rate Limiter dan Account Lockout Tracker."""

    def __init__(self):
        self._lock = threading.Lock()
        self._buckets: Dict[str, TokenBucket] = {}
        self._failed_attempts: Dict[str, Tuple[int, float]] = {}  # key -> (count, lockout_until)

    def _get_client_key(self, request: Request, category: str, custom_id: Optional[str] = None) -> str:
        client_ip = request.client.host if request.client else "127.0.0.1"
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()

        target_id = custom_id or client_ip
        return f"{category}:{target_id}"

    def check_rate_limit(
        self,
        request: Request,
        category: str = "general",
        custom_id: Optional[str] = None
    ) -> Tuple[bool, int]:
        """
        Memeriksa apakah request diizinkan atau terkena rate limit.
        Returns: (allowed, retry_after_seconds)
        """
        config = LIMITS.get(category, LIMITS["general"])
        key = self._get_client_key(request, category, custom_id)

        with self._lock:
            # 1. Cek lockout jika kategori login/otp
            if category in ("auth_login", "auth_otp"):
                lockout_info = self._failed_attempts.get(key)
                if lockout_info:
                    count, lockout_until = lockout_info
                    now = time.time()
                    if lockout_until > now:
                        retry_after = int(lockout_until - now) + 1
                        return False, retry_after

            # 2. Token Bucket check
            if key not in self._buckets:
                self._buckets[key] = TokenBucket(config.capacity, config.refill_rate)

            bucket = self._buckets[key]
            allowed = bucket.consume(1.0)
            if not allowed:
                return False, config.block_duration

            return True, 0

    def record_auth_failure(self, request: Request, identifier: str) -> Tuple[int, bool]:
        """
        Mencatat percobaan otentikasi gagal.
        Setelah 5 kali gagal berturut-turut, akun/IP dikunci selama 15 menit (900 detik).
        Returns: (attempt_count, is_locked)
        """
        key = f"auth_login:{identifier}"
        with self._lock:
            now = time.time()
            count, lockout_until = self._failed_attempts.get(key, (0, 0.0))
            # Jika lockout sebelumnya sudah kedaluwarsa, reset count
            if lockout_until > 0 and now > lockout_until:
                count = 0

            count += 1
            is_locked = False
            lockout_time = 0.0

            if count >= 5:
                lockout_time = now + 900.0  # 15 menit
                is_locked = True

            self._failed_attempts[key] = (count, lockout_time)
            return count, is_locked

    def reset_auth_failures(self, identifier: str) -> None:
        """Mereset catatan percobaan gagal saat login berhasil."""
        key = f"auth_login:{identifier}"
        with self._lock:
            if key in self._failed_attempts:
                del self._failed_attempts[key]


# Singleton instance
limiter = SecurityRateLimiter()


def require_rate_limit(category: str):
    """FastAPI Dependency untuk penegakan rate limit per kategori."""
    async def dependency(request: Request):
        allowed, retry_after = limiter.check_rate_limit(request, category)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Terlalu banyak permintaan untuk kategori '{category}'. Silakan coba lagi dalam {retry_after} detik.",
                headers={"Retry-After": str(retry_after)}
            )
        return True
    return dependency
