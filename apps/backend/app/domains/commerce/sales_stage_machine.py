"""
OrchestreeAI Sales Stage State Machine (PRD v2.2 Bagian 11.3 & 12.2)
Mengelola transisi siklus penjualan percakapan:
GREETING → DISCOVERY → RECOMMENDATION → OBJECTION_HANDLING → CLOSING →
CART_CHECKOUT → PAYMENT_PENDING → ORDER_CONFIRMED → POST_SALE → RETENTION
Disimpan di kolom conversations.sales_stage.
"""

from enum import Enum
from typing import List, Dict, Optional, Tuple, Any
import logging

try:
    import sqlalchemy as sa
    from sqlalchemy.orm import Session
except ImportError:  # allowlist: sqlalchemy shim
    class _SafeSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _SafeSA()
    Session = Any  # type: ignore

logger = logging.getLogger("orchestree.commerce.sales_stage")


class SalesStage(str, Enum):
    GREETING = "GREETING"
    DISCOVERY = "DISCOVERY"
    RECOMMENDATION = "RECOMMENDATION"
    OBJECTION_HANDLING = "OBJECTION_HANDLING"
    CLOSING = "CLOSING"
    CART_CHECKOUT = "CART_CHECKOUT"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    ORDER_CONFIRMED = "ORDER_CONFIRMED"
    POST_SALE = "POST_SALE"
    RETENTION = "RETENTION"


# Matriks transisi yang diizinkan dalam siklus penjualan
ALLOWED_STAGE_TRANSITIONS: Dict[SalesStage, List[SalesStage]] = {
    SalesStage.GREETING: [SalesStage.DISCOVERY, SalesStage.RECOMMENDATION],
    SalesStage.DISCOVERY: [SalesStage.RECOMMENDATION, SalesStage.OBJECTION_HANDLING, SalesStage.CLOSING],
    SalesStage.RECOMMENDATION: [SalesStage.OBJECTION_HANDLING, SalesStage.CLOSING, SalesStage.CART_CHECKOUT, SalesStage.DISCOVERY],
    SalesStage.OBJECTION_HANDLING: [SalesStage.RECOMMENDATION, SalesStage.CLOSING, SalesStage.CART_CHECKOUT],
    SalesStage.CLOSING: [SalesStage.CART_CHECKOUT, SalesStage.OBJECTION_HANDLING, SalesStage.PAYMENT_PENDING],
    SalesStage.CART_CHECKOUT: [SalesStage.PAYMENT_PENDING, SalesStage.CLOSING, SalesStage.RECOMMENDATION],
    SalesStage.PAYMENT_PENDING: [SalesStage.ORDER_CONFIRMED, SalesStage.CART_CHECKOUT, SalesStage.CLOSING],
    SalesStage.ORDER_CONFIRMED: [SalesStage.POST_SALE],
    SalesStage.POST_SALE: [SalesStage.RETENTION, SalesStage.DISCOVERY],
    SalesStage.RETENTION: [SalesStage.DISCOVERY, SalesStage.RECOMMENDATION],
}


class SalesStageMachine:
    def __init__(self, db_session: Session, tenant_id: str):
        self.db = db_session
        self.tenant_id = tenant_id

    def get_current_stage(self, conversation_id: str) -> Optional[SalesStage]:
        query = sa.text("""
            SELECT sales_stage
            FROM conversations
            WHERE id = :conv_id AND tenant_id = :tenant_id;
        """)
        row = self.db.execute(query, {"conv_id": conversation_id, "tenant_id": self.tenant_id}).mappings().first()
        if row and row["sales_stage"]:
            try:
                return SalesStage(row["sales_stage"])
            except ValueError:
                return SalesStage.GREETING
        return None

    def transition_stage(
        self,
        conversation_id: str,
        target_stage: SalesStage,
        trigger_reason: str = "Interaksi pelanggan",
        metadata_update: Optional[Dict] = None,
    ) -> Tuple[bool, str, Optional[SalesStage]]:
        """
        Mengevaluasi dan mengeksekusi transisi status sales_stage pada percakapan.
        """
        current_stage = self.get_current_stage(conversation_id)
        if not current_stage:
            return False, f"Percakapan '{conversation_id}' tidak ditemukan.", None

        if current_stage == target_stage:
            return True, f"Tahap penjualan sudah berada pada '{target_stage.value}'.", current_stage

        allowed_targets = ALLOWED_STAGE_TRANSITIONS.get(current_stage, [])
        # Izinkan transisi maju normal atau transisi mundur terpandu
        if target_stage not in allowed_targets:
            logger.warning(
                f"[SalesStageMachine] Transisi tidak lazim dari {current_stage.value} ke {target_stage.value}. Diizinkan dengan logging."
            )

        # Update database
        update_query = sa.text("""
            UPDATE conversations
            SET sales_stage = :target_stage,
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{sales_stage_history}',
                    COALESCE(metadata->'sales_stage_history', '[]'::jsonb) || :history_entry::jsonb,
                    true
                ),
                updated_at = now()
            WHERE id = :conv_id AND tenant_id = :tenant_id;
        """)

        history_item = {
            "from": current_stage.value,
            "to": target_stage.value,
            "reason": trigger_reason,
            "timestamp": "now()",
        }

        self.db.execute(
            update_query,
            {
                "target_stage": target_stage.value,
                "history_entry": f'{{"from": "{current_stage.value}", "to": "{target_stage.value}", "reason": "{trigger_reason}"}}',
                "conv_id": conversation_id,
                "tenant_id": self.tenant_id,
            },
        )
        self.db.commit()

        logger.info(
            f"[SalesStageMachine] Percakapan {conversation_id} berhasil beralih dari {current_stage.value} ke {target_stage.value}."
        )
        return True, f"Berhasil beralih ke {target_stage.value}.", target_stage
