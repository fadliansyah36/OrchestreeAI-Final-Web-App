"""Marketing Domain Package (PRD v2.2 Bagian 12.6 & 14)"""
from .campaign_engine import (
    SegmentCriteriaFilter,
    resolve_segment,
    execute_campaign,
    get_campaign_status,
)
from .commercial_intent import (
    CommercialIntentDetector,
    CommercialIntentResult,
    handle_social_comment_webhook,
    handle_social_dm_webhook,
)

__all__ = [
    "SegmentCriteriaFilter",
    "resolve_segment",
    "execute_campaign",
    "get_campaign_status",
    "CommercialIntentDetector",
    "CommercialIntentResult",
    "handle_social_comment_webhook",
    "handle_social_dm_webhook",
]
