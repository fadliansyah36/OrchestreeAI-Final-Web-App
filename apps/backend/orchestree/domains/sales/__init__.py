"""Sales and Marketing Domain package."""
from .handover import (
    build_handover_summary,
    evaluate_handover_trigger,
    HandoverTriggerType,
)
from .lead_scoring import (
    determine_funnel_stage,
    calculate_lead_score,
)

__all__ = [
    "build_handover_summary",
    "evaluate_handover_trigger",
    "HandoverTriggerType",
    "determine_funnel_stage",
    "calculate_lead_score",
]
