"""
OrchestreeAI Core PDP Authorization Engine Re-export (PRD v2.2 Bagian 3.5).
Menyediakan antarmuka authorize() persis spesifikasi arsitektur resmi.
"""

from app.authz.pdp import (
    SubjectContext,
    ResourceContext,
    AuthorizationDecision,
    authorize,
    log_decision_to_audit,
)

__all__ = [
    "SubjectContext",
    "ResourceContext",
    "AuthorizationDecision",
    "authorize",
    "log_decision_to_audit",
]
