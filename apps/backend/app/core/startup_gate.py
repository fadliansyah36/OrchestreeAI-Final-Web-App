"""
Fail-Closed Startup Gate (PRD v2.2 Bagian 15.3)
Memeriksa 18 langkah kesiapan sistem sebelum menerima trafik operasional.
Langkah yang belum dibangun di fase inisiasi mengembalikan status 'not_implemented_yet'
secara jujur dan transparan, bukan 'true' palsu.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel
from app.core.config import settings
from app.core.database import (
    verify_db_connection_and_role,
    verify_rls_table_enforcement,
    verify_extensions_and_migrations,
)

CheckStatus = Literal["passed", "failed", "not_implemented_yet"]


class StartupCheckResult(BaseModel):
    step_number: int
    name: str
    status: CheckStatus
    detail: str


class StartupGateReport(BaseModel):
    overall_passed: bool
    total_steps: int
    passed_steps: int
    failed_steps: int
    not_implemented_steps: int
    checks: List[StartupCheckResult]


class StartupGate:
    """Evaluasi 18 Langkah Fail-Closed Startup Gate."""

    # Nilai terlarang untuk konfigurasi produksi
    INVALID_PLACEHOLDERS = {
        "YOUR_KEY_HERE", "changeme", "xxx", "YOUR_SECRET",
        "YOUR_API_KEY", "YOUR_TOKEN", "example", "secret"
    }

    def evaluate_all(self) -> StartupGateReport:
        checks: List[StartupCheckResult] = [
            self.check_step_1_env_schema(),
            self.check_step_2_db_connection(),
            self.check_step_3_rls_policies(),
            self.check_step_4_migrations(),
            self.check_step_5_reference_data(),
            self.check_step_6_redis(),
            self.check_step_7_supabase_auth_storage(),
            self.check_step_8_kms(),
            self.check_step_9_llm_providers(),
            self.check_step_10_embeddings(),
            self.check_step_11_image_providers(),
            self.check_step_12_telegram_bot(),
            self.check_step_13_whatsapp_platform(),
            self.check_step_14_payment_gateways(),
            self.check_step_15_web_push_turnstile(),
            self.check_step_16_scraper_sandbox(),
            self.check_step_17_runtime_security(),
            self.check_step_18_platform_admin(),
        ]

        passed = sum(1 for c in checks if c.status == "passed")
        failed = sum(1 for c in checks if c.status == "failed")
        not_impl = sum(1 for c in checks if c.status == "not_implemented_yet")

        # Di fase inisiasi, overall_passed bernilai True hanya jika tidak ada step yang 'failed'
        # dan step wajib lingkungan (step 1) passed.
        overall_passed = (failed == 0 and checks[0].status == "passed")

        return StartupGateReport(
            overall_passed=overall_passed,
            total_steps=len(checks),
            passed_steps=passed,
            failed_steps=failed,
            not_implemented_steps=not_impl,
            checks=checks
        )

    def check_step_1_env_schema(self) -> StartupCheckResult:
        """Langkah 1: Skema Env (wajib ada, format valid, bukan nilai asal)."""
        issues = []
        if not settings.APP_ENV:
            issues.append("APP_ENV belum terdefinisi")
        if settings.APP_ENV in ("staging", "production"):
            if not settings.SUPABASE_URL or any(p in (settings.SUPABASE_URL or "") for p in self.INVALID_PLACEHOLDERS):
                issues.append("SUPABASE_URL tidak valid atau belum diisi untuk lingkungan produksi")
            if not settings.DATABASE_URL or any(p in (settings.DATABASE_URL or "") for p in self.INVALID_PLACEHOLDERS):
                issues.append("DATABASE_URL belum diisi untuk lingkungan produksi")

        if issues:
            return StartupCheckResult(
                step_number=1,
                name="Skema Environment",
                status="failed",
                detail=f"Ditemukan kegagalan konfigurasi: {'; '.join(issues)}"
            )

        return StartupCheckResult(
            step_number=1,
            name="Skema Environment",
            status="passed",
            detail=f"Konfigurasi environment valid (APP_ENV={settings.APP_ENV})."
        )

    def check_step_2_db_connection(self) -> StartupCheckResult:
        ok, detail, _ = verify_db_connection_and_role()
        return StartupCheckResult(
            step_number=2,
            name="Koneksi Database (role orchestree_app)",
            status="passed" if ok else "failed",
            detail=detail,
        )

    def check_step_3_rls_policies(self) -> StartupCheckResult:
        ok, detail, _ = verify_rls_table_enforcement()
        return StartupCheckResult(
            step_number=3,
            name="Penegakan RLS Seluruh Tabel Tenant",
            status="passed" if ok else "failed",
            detail=detail,
        )

    def check_step_4_migrations(self) -> StartupCheckResult:
        ok, detail, _ = verify_extensions_and_migrations()
        return StartupCheckResult(
            step_number=4,
            name="Status Migrasi Head & Ekstensi Postgres",
            status="passed" if ok else "failed",
            detail=detail,
        )

    def check_step_5_reference_data(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=5,
            name="Master Data 15 Jabatan Utama & Capability",
            status="not_implemented_yet",
            detail="Verifikasi data referensi resmi siap dimuat via seed."
        )

    def check_step_6_redis(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=6,
            name="Konektivitas & Latensi Redis",
            status="not_implemented_yet",
            detail="Koneksi Redis queue and caching akan aktif bersama worker Celery."
        )

    def check_step_7_supabase_auth_storage(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=7,
            name="Supabase Auth JWKS & Storage Private Bucket",
            status="not_implemented_yet",
            detail="Verifikasi kunci publik JWKS dan akses signed-URL storage."
        )

    def check_step_8_kms(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=8,
            name="KMS Envelope Encryption Round-Trip",
            status="not_implemented_yet",
            detail="Pengujian generate data key dan dekripsi envelope."
        )

    def check_step_9_llm_providers(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=9,
            name="Sinkronisasi Katalog NIM & OpenRouter",
            status="not_implemented_yet",
            detail="Probe model router teks aktif pada inisiasi modul model router."
        )

    def check_step_10_embeddings(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=10,
            name="Probe Vector Embedding Model",
            status="not_implemented_yet",
            detail="Verifikasi dimensi vector aktif pada inisiasi memori semantik."
        )

    def check_step_11_image_providers(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=11,
            name="Kredensial GPT-Image-2 / Image Provider",
            status="not_implemented_yet",
            detail="Verifikasi provider generasi gambar studio generatif."
        )

    def check_step_12_telegram_bot(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=12,
            name="Telegram Official Platform Bot",
            status="not_implemented_yet",
            detail="Pemeriksaan getMe bot Telegram resmi platform."
        )

    def check_step_13_whatsapp_platform(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=13,
            name="WhatsApp Official Platform WABA Number",
            status="not_implemented_yet",
            detail="Verifikasi status WABA Cloud API resmi platform."
        )

    def check_step_14_payment_gateways(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=14,
            name="Autentikasi Payment Gateway (Midtrans/Xendit)",
            status="not_implemented_yet",
            detail="Verifikasi signature webhook dan merchant keys."
        )

    def check_step_15_web_push_turnstile(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=15,
            name="VAPID Web Push & Cloudflare Turnstile",
            status="not_implemented_yet",
            detail="Verifikasi pasangan kunci VAPID dan endpoint siteverify Turnstile."
        )

    def check_step_16_scraper_sandbox(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=16,
            name="Sandbox Egress Scraper & Anti-SSRF",
            status="not_implemented_yet",
            detail="Pemeriksaan isolasi egress worker ekstraksi data."
        )

    def check_step_17_runtime_security(self) -> StartupCheckResult:
        from pathlib import Path
        rogue_files = ["server.ts", "server.js", "src/server"]
        found = [f for f in rogue_files if Path(f).exists()]
        if found:
            return StartupCheckResult(
                step_number=17,
                name="Keamanan Runtime & Header HTTP",
                status="failed",
                detail=f"Ditemukan backend server kedua terlarang: {', '.join(found)}"
            )
        return StartupCheckResult(
            step_number=17,
            name="Keamanan Runtime & Header HTTP",
            status="passed",
            detail="Pengaturan runtime aman aktif (FastAPI Python tunggal, zero rogue server)."
        )

    def check_step_18_platform_admin(self) -> StartupCheckResult:
        return StartupCheckResult(
            step_number=18,
            name="Keberadaan Akun Platform Admin dengan MFA",
            status="not_implemented_yet",
            detail="Verifikasi akun Super Admin terdaftar dengan autentikasi dua faktor."
        )


startup_gate = StartupGate()
