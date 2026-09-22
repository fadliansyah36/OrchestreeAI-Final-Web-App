"""OrchestreeAI Integrations Domain Service (PRD v2.2 Bagian 12 & 12.9)
Mengorkestrasi koneksi pihak ketiga, enkripsi KMS, health-check, dan revoke cascading.
"""

import datetime
import logging
from typing import Dict, Any, Optional, List

from app.domains.integrations.crypto import encrypt_credential, decrypt_credential
from app.domains.integrations.health import (
    IntegrationHealthChecker,
    perform_auto_refresh_tokens,
    perform_revoke_cascading,
    validate_transparency_notice_consent,
)

logger = logging.getLogger("orchestree.domains.integrations.service")


class IntegrationsDomainService:
    """
    Layanan terpadu integrasi pihak ketiga untuk media sosial, marketplace, dan tools kolaborasi kerja.
    """

    def __init__(self, db_session=None):
        self.db_session = db_session

    def evaluate_connection_state(
        self,
        connection: Dict[str, Any],
        app_registry: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Menilai kondisi kesehatan dan kepatuhan transparansi koneksi.
        """
        status = connection.get("status", "not_connected")
        expires_at = connection.get("token_expires_at")
        has_token = bool(connection.get("access_token_encrypted"))

        health_status, reason = IntegrationHealthChecker.evaluate_token_health(
            status=status,
            token_expires_at=expires_at,
            has_access_token=has_token
        )

        requires_notice = app_registry.get("requires_transparency_notice", False)
        notice_accepted = bool(connection.get("transparency_notice_accepted_at"))

        return {
            "health_status": health_status,
            "health_reason": reason,
            "requires_transparency_notice": requires_notice,
            "transparency_notice_accepted": notice_accepted,
            "observation_mode": connection.get("observation_mode", "metadata_only"),
        }
