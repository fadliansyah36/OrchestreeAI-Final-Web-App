"""
OrchestreeAI Sales Stage State Machine (PRD v2.2 Bagian 11.3 & 12.2)
Mengelola transisi siklus penjualan percakapan:
GREETING → DISCOVERY → RECOMMENDATION → OBJECTION_HANDLING → CLOSING →
CART_CHECKOUT → PAYMENT_PENDING → ORDER_CONFIRMED → POST_SALE → RETENTION
Disimpan di kolom conversations.sales_stage.
"""

from app.domains.commerce.sales_stage_machine import (
    SalesStage,
    ALLOWED_STAGE_TRANSITIONS,
    SalesStageMachine,
)

__all__ = [
    "SalesStage",
    "ALLOWED_STAGE_TRANSITIONS",
    "SalesStageMachine",
]
