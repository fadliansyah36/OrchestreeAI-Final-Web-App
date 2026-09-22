"""Sales domain package."""
from orchestree.domains.sales.identity import (
    normalize_phone_e164,
    normalize_email,
    calculate_name_similarity,
    resolve_identity,
    approve_merge,
    rollback_merge,
    IdentityResolutionResult,
)

__all__ = [
    "normalize_phone_e164",
    "normalize_email",
    "calculate_name_similarity",
    "resolve_identity",
    "approve_merge",
    "rollback_merge",
    "IdentityResolutionResult",
]
