"""
OrchestreeAI Centralized Redacting Logging Service (PRD v2.2 Bagian 10.4 & 14.3)
Filters and scrubs sensitive data, secrets, tokens, connection strings, and PII from all log handlers.
"""

import logging
import re
from typing import Any

SENSITIVE_PATTERNS = [
    # Database connection strings with credentials: postgresql://user:password@host/db
    (re.compile(r'(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)', re.IGNORECASE), r'\1***REDACTED***\3'),
    # Bearer tokens
    (re.compile(r'Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*', re.IGNORECASE), 'Bearer ***REDACTED_JWT***'),
    # Generic JWT
    (re.compile(r'eyJhbGciOi[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9\-_.+/=]*'), '***REDACTED_JWT***'),
    # API keys (OpenAI sk-, NVIDIA nvapi-, etc.)
    (re.compile(r'\b(sk-[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,})\b', re.IGNORECASE), '***REDACTED_KEY***'),
    # Passwords or secrets in key-value format (JSON, query string, or key=value)
    (re.compile(r'([\'"]?(?:password|secret|server_key|client_key|service_role_key|api_key|access_token|refresh_token|cvv|cvc|pin)[\'"]?\s*[:=]\s*[\'"]?)([^\s\'",}]+)([\'",}]?)', re.IGNORECASE), r'\1***REDACTED***\3'),
    # Credit card numbers (13 to 19 digits)
    (re.compile(r'\b(?:\d[ -]*?){13,16}\b'), '***REDACTED_CARD***'),
]


class RedactingFilter(logging.Filter):
    """
    Log filter that intercepts and sanitizes any sensitive credentials or tokens.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self.redact(v) if isinstance(v, str) else v for k, v in record.args.items()}
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(self.redact(v) if isinstance(v, str) else v for v in record.args)
        return True

    @classmethod
    def redact(cls, text: Any) -> str:
        if not isinstance(text, str):
            return str(text)
        sanitized = text
        for pattern, replacement in SENSITIVE_PATTERNS:
            sanitized = pattern.sub(replacement, sanitized)
        return sanitized


def setup_redacting_logger():
    """
    Attaches the RedactingFilter to root logger and standard FastAPI / Uvicorn loggers.
    """
    filter_instance = RedactingFilter()
    root_logger = logging.getLogger()
    root_logger.addFilter(filter_instance)
    for handler in root_logger.handlers:
        handler.addFilter(filter_instance)

    for logger_name in [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "fastapi",
        "sqlalchemy.engine",
        "orchestree",
        "orchestree.api.webhooks",
    ]:
        l = logging.getLogger(logger_name)
        l.addFilter(filter_instance)
        for h in l.handlers:
            h.addFilter(filter_instance)
