"""
OrchestreeAI Core ABAC Authorization Engine Re-export (PRD v2.2 Bagian 3.3).
Menyediakan antarmuka check_ai_data_permission() persis spesifikasi arsitektur resmi.
"""

from app.authz.abac import (
    ABACSubject,
    ABACResource,
    ABACDecision,
    check_ai_data_permission,
    log_abac_decision_to_audit,
    DATA_CLASSIFICATION_HIERARCHY,
)

__all__ = [
    "ABACSubject",
    "ABACResource",
    "ABACDecision",
    "check_ai_data_permission",
    "log_abac_decision_to_audit",
    "DATA_CLASSIFICATION_HIERARCHY",
]
