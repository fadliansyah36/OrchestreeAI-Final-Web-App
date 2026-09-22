import os
from typing import Optional
from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    OrchestreeAI Backend Settings (PRD v2.2 Bagian 15.2)
    Semua konfigurasi dibaca dari environment variables.
    """
    model_config = SettingsConfigDict(
        env_file=(".env", "apps/backend/.env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Runtime
    APP_ENV: str = "local"
    APP_BASE_URL: str = "http://localhost:8000"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    # Database & Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None
    SUPABASE_SECRET_KEY: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_JWKS_URL: Optional[str] = None
    SUPABASE_JWKS_KEY: Optional[str] = None
    SUPABASE_JWT_ISSUER: Optional[str] = None
    SUPABASE_JWT_AUDIENCE: Optional[str] = "authenticated"
    JWT_SECRET_KEY: Optional[str] = None

    DATABASE_URL: Optional[str] = None
    DATABASE_DIRECT_URL: Optional[str] = None
    DATABASE_URL_MIGRATOR: Optional[str] = None
    REDIS_URL: Optional[str] = None

    # KMS & Security
    KMS_PROVIDER: Optional[str] = "local"
    KMS_KEY_ID: Optional[str] = None

    # Models & LLMs
    NVIDIA_API_KEY: Optional[str] = None
    NVIDIA_NIM_API_KEY: Optional[str] = None
    NVIDIA_NIM_BASE_URL: Optional[str] = "https://integrate.api.nvidia.com/v1"
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: Optional[str] = "https://openrouter.ai/api/v1"
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GPT_IMAGE_2_API_KEY: Optional[str] = None
    GPT_IMAGE_2_API_URL: Optional[str] = None

    # Channels
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_OFFICIAL_BOT_TOKEN: Optional[str] = None
    TELEGRAM_BOT_USERNAME: Optional[str] = None
    TELEGRAM_WEBHOOK_URL: Optional[str] = None
    TELEGRAM_WEBHOOK_SECRET: Optional[str] = None
    WA_PROACTIVE_PHONE_NUMBER_ID: Optional[str] = None
    WA_PROACTIVE_WABA_ID: Optional[str] = None
    WA_PROACTIVE_ACCESS_TOKEN: Optional[str] = None

    # Integrations & Prospecting
    VIBE_PROSPECTING_API_KEY: Optional[str] = None
    VIBE_PROSPECTING_API_URL: Optional[str] = None
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_WEBHOOK_VERIFY_TOKEN: Optional[str] = None
    META_GRAPH_API_VERSION: str = "v19.0"

    # Payment Gateways
    MIDTRANS_SERVER_KEY: Optional[str] = None
    MIDTRANS_CLIENT_KEY: Optional[str] = None
    MIDTRANS_IS_PRODUCTION: bool = False
    PAYMENT_GATEWAY_CLIENT_KEY: Optional[str] = None
    PAYMENT_GATEWAY_SERVER_KEY: Optional[str] = None
    XENDIT_SECRET_KEY: Optional[str] = None
    XENDIT_CALLBACK_TOKEN: Optional[str] = None

    # Web Push & Integrity
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_PRIVATE_KEY: Optional[str] = None
    VAPID_SUBJECT: Optional[str] = None
    TURNSTILE_SECRET_KEY: Optional[str] = None

    # Flags
    FEATURES_DISABLED: Optional[str] = None

    @model_validator(mode="after")
    def populate_aliases(self) -> "Settings":
        # Database direct / migrator fallback
        if not self.DATABASE_URL_MIGRATOR and self.DATABASE_DIRECT_URL:
            self.DATABASE_URL_MIGRATOR = self.DATABASE_DIRECT_URL
        if not self.DATABASE_URL and self.DATABASE_DIRECT_URL:
            self.DATABASE_URL = self.DATABASE_DIRECT_URL

        # NVIDIA API key alias
        if not self.NVIDIA_NIM_API_KEY and self.NVIDIA_API_KEY:
            self.NVIDIA_NIM_API_KEY = self.NVIDIA_API_KEY
        if not self.NVIDIA_API_KEY and self.NVIDIA_NIM_API_KEY:
            self.NVIDIA_API_KEY = self.NVIDIA_NIM_API_KEY

        # Telegram token alias
        if not self.TELEGRAM_BOT_TOKEN and self.TELEGRAM_OFFICIAL_BOT_TOKEN:
            self.TELEGRAM_BOT_TOKEN = self.TELEGRAM_OFFICIAL_BOT_TOKEN

        # Payment gateway key alias
        if not self.MIDTRANS_SERVER_KEY and self.PAYMENT_GATEWAY_SERVER_KEY:
            self.MIDTRANS_SERVER_KEY = self.PAYMENT_GATEWAY_SERVER_KEY
        if not self.MIDTRANS_CLIENT_KEY and self.PAYMENT_GATEWAY_CLIENT_KEY:
            self.MIDTRANS_CLIENT_KEY = self.PAYMENT_GATEWAY_CLIENT_KEY

        # JWT Secret Key
        if not self.JWT_SECRET_KEY and self.SUPABASE_JWKS_KEY:
            self.JWT_SECRET_KEY = self.SUPABASE_JWKS_KEY

        return self


settings = Settings()
