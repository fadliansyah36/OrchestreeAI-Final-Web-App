"""Strict Boundary & Blocking Domain Module (PRD v2.2 Bagian 3.5, 8.4, 10.3, 10.5, 12, 14).

Isolasi mutlak konteks Omnichannel (customer-facing) dan Proactive (internal-facing).
"""
from .service import (
    ToolContextBoundaryException,
    AgentContextMismatchException,
    OutputBoundaryViolationException,
    UnverifiedSenderException,
    record_boundary_violation,
    list_boundary_violations,
    enforce_tool_context_boundary,
    assign_agent_to_channel,
    verify_proactive_sender,
    route_proactive_inbound,
    sanitize_customer_facing_output,
    hash_identifier,
    mask_identifier,
)

__all__ = [
    "ToolContextBoundaryException",
    "AgentContextMismatchException",
    "OutputBoundaryViolationException",
    "UnverifiedSenderException",
    "record_boundary_violation",
    "list_boundary_violations",
    "enforce_tool_context_boundary",
    "assign_agent_to_channel",
    "verify_proactive_sender",
    "route_proactive_inbound",
    "sanitize_customer_facing_output",
    "hash_identifier",
    "mask_identifier",
]
