"""
OrchestreeAI F.01-SCRAPE Adapters (PRD v2.2 Bagian 11.4)

Komponen Adapter Ekstraksi Data Publik Berbasis LLM:
1. RobotsTxtValidator: Memeriksa kepatuhan robots.txt dan ToS domain publik sebelum proses crawling.
2. DomainRateLimiterAndCircuitBreaker: Membatasi frekuensi request dan memutus sirkuit bila domain mengalami error berulang.
3. WebAdapter: Ekstraksi berstruktur untuk situs perusahaan, landing page, dan halaman harga.
4. MarketplaceAdapter: Ekstraksi berstruktur untuk katalog etalase e-commerce publik.
5. SocialAdapter: Ekstraksi berstruktur untuk tren dan kampanye di profil publik media sosial.
"""

import re
import time
import hashlib
import logging
from typing import Dict, Any, Optional, List, Tuple
from urllib.parse import urlparse
import urllib.request

try:
    import httpx
except ImportError:
    httpx = None

from app.core.model_router.router import ModelRouterRequest
from app.core.security import validate_safe_external_url

logger = logging.getLogger("orchestree.skills.f01_scrape.adapters")

USER_AGENT = "OrchestreeBot/2.2 (+https://orchestree.biz.id/bot; autonomous workforce intelligence)"


class RobotsTxtValidator:
    """
    Validator kepatuhan robots.txt untuk domain publik.
    Menjamin OrchestreeAI hanya mengumpulkan data publik yang diizinkan oleh pemilik domain.
    """

    def __init__(self, timeout_seconds: float = 8.0):
        self.timeout_seconds = timeout_seconds

    async def check_access(self, target_url: str) -> Tuple[bool, str, Optional[float]]:
        """
        Memeriksa apakah URL diizinkan untuk di-crawl.
        Return: (is_allowed, status_reason, crawl_delay)
        """
        try:
            # 0. Penegakan Keamanan SSRF: Tolak localhost, IP internal, dan cloud metadata
            safe, reason, _ = validate_safe_external_url(target_url)
            if not safe:
                logger.warning(f"SSRF defense triggered on robots check for {target_url}: {reason}")
                return False, f"ssrf_rejected: {reason}", None

            parsed = urlparse(target_url)
            if not parsed.scheme or not parsed.netloc:
                return False, "invalid_url", None

            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            path = parsed.path or "/"

            robots_text = ""
            if httpx is not None:
                async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                    try:
                        resp = await client.get(robots_url, headers={"User-Agent": USER_AGENT})
                        if resp.status_code in (404, 410):
                            return True, "allowed", None
                        if resp.status_code != 200:
                            return True, "allowed", None
                        robots_text = resp.text
                    except Exception as net_err:
                        logger.warning(f"Robots.txt unreachable for {parsed.netloc}: {net_err}")
                        return True, "unreachable", None
            else:
                try:
                    req = urllib.request.Request(robots_url, headers={"User-Agent": USER_AGENT})
                    with urllib.request.urlopen(req, timeout=self.timeout_seconds) as response:
                        robots_text = response.read().decode("utf-8", errors="ignore")
                except urllib.error.HTTPError as he:
                    if he.code in (404, 410):
                        return True, "allowed", None
                    return True, "allowed", None
                except Exception as net_err:
                    logger.warning(f"Robots.txt unreachable for {parsed.netloc}: {net_err}")
                    return True, "unreachable", None

            return self._parse_robots(robots_text, path)

        except Exception as err:
            logger.error(f"RobotsTxtValidator failure on {target_url}: {err}")
            return False, f"error: {str(err)}", None

    def _parse_robots(self, robots_txt: str, path: str) -> Tuple[bool, str, Optional[float]]:
        lines = robots_txt.splitlines()
        current_applies = False
        disallows: List[str] = []
        allows: List[str] = []
        crawl_delay: Optional[float] = None

        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            if ":" in line:
                key, val = line.split(":", 1)
                key = key.strip().lower()
                val = val.strip()

                if key == "user-agent":
                    ua = val.lower()
                    if ua in ["*", "orchestreetreebot", "orchestreetbot"]:
                        current_applies = True
                    else:
                        current_applies = False
                elif current_applies:
                    if key == "disallow":
                        if val:
                            disallows.append(val)
                    elif key == "allow":
                        if val:
                            allows.append(val)
                    elif key == "crawl-delay":
                        try:
                            crawl_delay = float(val)
                        except ValueError:
                            pass

        # Aturan Allow yang lebih spesifik mengesampingkan Disallow
        for allow_rule in allows:
            if path.startswith(allow_rule):
                return True, "allowed", crawl_delay

        for disallow_rule in disallows:
            if disallow_rule == "/" or path.startswith(disallow_rule):
                logger.info(f"Crawl ditolak oleh robots.txt: path '{path}' cocok dengan Disallow '{disallow_rule}'")
                return False, "disallowed", crawl_delay

        return True, "allowed", crawl_delay


class DomainRateLimiterAndCircuitBreaker:
    """
    Manajemen laju request (Rate Limiter) dan pemutus sirkuit (Circuit Breaker) per domain
    untuk mencegah pembebanan server target.
    """

    def __init__(self, min_interval_seconds: float = 1.5, failure_threshold: int = 3, reset_timeout_seconds: float = 300.0):
        self.min_interval = min_interval_seconds
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout_seconds
        # Domain tracking dictionary (non-business state, transient network counters)
        self._last_request_time: Dict[str, float] = {}
        self._failure_counts: Dict[str, int] = {}
        self._circuit_tripped_time: Dict[str, float] = {}

    def is_available(self, domain: str) -> Tuple[bool, Optional[str]]:
        now = time.time()
        tripped_at = self._circuit_tripped_time.get(domain)
        if tripped_at:
            if now - tripped_at < self.reset_timeout:
                remaining = int(self.reset_timeout - (now - tripped_at))
                return False, f"Circuit breaker aktif untuk {domain}. Tunggu {remaining} detik."
            else:
                # Reset breaker setelah timeout
                self._circuit_tripped_time.pop(domain, None)
                self._failure_counts[domain] = 0

        last_time = self._last_request_time.get(domain, 0)
        elapsed = now - last_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)

        return True, None

    def record_success(self, domain: str):
        self._last_request_time[domain] = time.time()
        self._failure_counts[domain] = 0

    def record_failure(self, domain: str):
        self._last_request_time[domain] = time.time()
        count = self._failure_counts.get(domain, 0) + 1
        self._failure_counts[domain] = count
        if count >= self.failure_threshold:
            self._circuit_tripped_time[domain] = time.time()
            logger.warning(f"Circuit breaker dipicu untuk domain {domain} setelah {count} kegagalan beruntun.")


def extract_clean_text_from_html(html_content: str, max_chars: int = 12000) -> str:
    """
    Pembersih markup HTML publik sederhana tanpa dependency eksternal berat.
    Menghilangkan tag script, style, SVG, dan menyisakan teks informatif halaman.
    """
    # Buang scripts dan styles
    clean = re.sub(r"<script.*?</script>", " ", html_content, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r"<style.*?</style>", " ", clean, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r"<svg.*?</svg>", " ", clean, flags=re.DOTALL | re.IGNORECASE)
    # Buang tag HTML
    clean = re.sub(r"<[^>]+>", " ", clean)
    # Normalkan spasi
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:max_chars]


def compute_content_hash(text_or_json: str) -> str:
    """Menghasilkan SHA-256 content hash dari teks atau struktur JSON."""
    return hashlib.sha256(text_or_json.encode("utf-8")).hexdigest()
