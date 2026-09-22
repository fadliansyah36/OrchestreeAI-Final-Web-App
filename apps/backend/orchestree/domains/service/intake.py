"""
Customer Service Intake Engine (PRD v2.2 Bagian 12.7, 13)

Node CUSTOMER_SERVICE_INTAKE:
- Mencatat komplain, permohonan refund, retur, pembatalan pesanan sebagai baris nyata di service_requests.
- ATURAN MUTLAK PRD v2.2:
  Refund customer sungguhan TERCATAT di service_requests dan WAJIB BERHENTI di HUMAN_APPROVAL.
  AI DILARANG KERAS memutuskan refund secara sepihak tanpa persetujuan manusia!
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from enum import Enum
import uuid
import re
import logging

try:
    import sqlalchemy as sa
    from sqlalchemy.sql import text
except ImportError:
    class _SafeSA:
        def __getattr__(self, name):
            return lambda *args, **kwargs: None
    sa = _SafeSA()
    def text(query):
        return query

logger = logging.getLogger("orchestree.service.intake")


class ServiceRequestCategory(str, Enum):
    REFUND = "REFUND"
    RETURN = "RETURN"
    COMPLAINT = "COMPLAINT"
    CANCELLATION = "CANCELLATION"
    TECHNICAL_SUPPORT = "TECHNICAL_SUPPORT"
    GENERAL_INQUIRY = "GENERAL_INQUIRY"


class ServiceRequestStatus(str, Enum):
    OPEN = "OPEN"
    IN_INVESTIGATION = "IN_INVESTIGATION"
    HUMAN_APPROVAL = "HUMAN_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class ServiceRequestPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


INTAKE_PATTERNS: List[Tuple[str, ServiceRequestCategory, ServiceRequestPriority]] = [
    (r"\b(refund|minta uang kembali|kembalikan uang|dana kembali|tarik dana)\b", ServiceRequestCategory.REFUND, ServiceRequestPriority.HIGH),
    (r"\b(retur|tukar barang|rusak|cacat|pecah|salah kirim|tidak sesuai)\b", ServiceRequestCategory.RETURN, ServiceRequestPriority.HIGH),
    (r"\b(kecewa|komplain|marah|pelayanan buruk|lambat sekali|penipu)\b", ServiceRequestCategory.COMPLAINT, ServiceRequestPriority.HIGH),
    (r"\b(batal|batalkan pesanan|cancel order|cancel)\b", ServiceRequestCategory.CANCELLATION, ServiceRequestPriority.MEDIUM),
    (r"\b(error|tidak bisa login|gangguan|kendala aplikasi)\b", ServiceRequestCategory.TECHNICAL_SUPPORT, ServiceRequestPriority.MEDIUM),
]


class CustomerServiceIntakeNode:
    """Node CUSTOMER_SERVICE_INTAKE untuk memproses keluhan, retur, dan refund."""

    @classmethod
    def detect_category(cls, text_content: str) -> Tuple[ServiceRequestCategory, ServiceRequestPriority, str]:
        lowered = text_content.lower()
        for pattern, cat, prio in INTAKE_PATTERNS:
            match = re.search(pattern, lowered)
            if match:
                return cat, prio, match.group(0)
        return ServiceRequestCategory.GENERAL_INQUIRY, ServiceRequestPriority.LOW, ""

    @classmethod
    def process_intake(
        cls,
        tenant_id: str,
        customer_id: Optional[str],
        conversation_id: Optional[str],
        subject: str,
        description: str,
        order_id: Optional[str] = None,
        category_override: Optional[ServiceRequestCategory] = None,
        amount: float = 0.0,
        channel: str = "WHATSAPP",
        attachments: Optional[List[Dict[str, Any]]] = None,
        db_session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Mengeksekusi intake layanan pelanggan:
        - Membangun tiket terstruktur dengan nomor unik (SR-YYYYMMDD-XXXX).
        - Penegakan: Seluruh permohonan REFUND atau nominal > Rp 0 WAJIB masuk ke status HUMAN_APPROVAL.
        """
        detected_cat, detected_prio, matched_term = cls.detect_category(description)
        category = category_override or detected_cat
        priority = detected_prio

        # Naikkan prioritas jika komplain atau refund bernominal tinggi
        if amount >= 500000.0 or category in (ServiceRequestCategory.REFUND, ServiceRequestCategory.RETURN):
            priority = ServiceRequestPriority.HIGH if amount < 1000000.0 else ServiceRequestPriority.CRITICAL

        # ATURAN MUTLAK PRD v2.2: Refund & Komplain bernominal wajib berhenti di HUMAN_APPROVAL
        initial_status = ServiceRequestStatus.OPEN
        requires_human_approval = False

        if category == ServiceRequestCategory.REFUND or amount > 0:
            initial_status = ServiceRequestStatus.HUMAN_APPROVAL
            requires_human_approval = True
        elif priority in (ServiceRequestPriority.HIGH, ServiceRequestPriority.CRITICAL):
            initial_status = ServiceRequestStatus.IN_INVESTIGATION

        ticket_id = str(uuid.uuid4())
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        ticket_number = f"SR-{date_str}-{ticket_id[:6].upper()}"
        now_iso = datetime.now(timezone.utc).isoformat()

        ticket_record = {
            "id": ticket_id,
            "tenant_id": tenant_id,
            "customer_id": customer_id,
            "conversation_id": conversation_id,
            "order_id": order_id,
            "ticket_number": ticket_number,
            "category": category.value,
            "priority": priority.value,
            "status": initial_status.value,
            "subject": subject or f"Permohonan {category.value.title()} ({ticket_number})",
            "description": description,
            "amount": float(amount),
            "requires_human_approval": requires_human_approval,
            "intake_channel": channel,
            "source_node": "CUSTOMER_SERVICE_INTAKE",
            "matched_keyword": matched_term,
            "created_at": now_iso,
            "attachments_count": len(attachments or []),
        }

        if db_session:
            try:
                db_session.execute(
                    text("""
                    INSERT INTO service_requests (
                        id, tenant_id, customer_id, conversation_id, order_id,
                        ticket_number, category, priority, status, subject,
                        description, amount, intake_channel, source_node, created_at, updated_at
                    ) VALUES (
                        :id, :tid, :cid, :conv_id, :ord_id,
                        :t_num, :cat, :prio, :status, :subj,
                        :desc, :amt, :chan, 'CUSTOMER_SERVICE_INTAKE', now(), now()
                    )
                    """),
                    {
                        "id": ticket_id,
                        "tid": tenant_id,
                        "cid": customer_id,
                        "conv_id": conversation_id,
                        "ord_id": order_id,
                        "t_num": ticket_number,
                        "cat": category.value,
                        "prio": priority.value,
                        "status": initial_status.value,
                        "subj": ticket_record["subject"],
                        "desc": description,
                        "amt": amount,
                        "chan": channel,
                    }
                )

                if attachments:
                    for att in attachments:
                        db_session.execute(
                            text("""
                            INSERT INTO service_request_attachments (
                                id, tenant_id, service_request_id, file_url,
                                file_name, file_type, file_size_bytes, created_at
                            ) VALUES (
                                :id, :tid, :sr_id, :f_url, :f_name, :f_type, :f_size, now()
                            )
                            """),
                            {
                                "id": str(uuid.uuid4()),
                                "tid": tenant_id,
                                "sr_id": ticket_id,
                                "f_url": att.get("file_url", ""),
                                "f_name": att.get("file_name", "bukti_lampiran"),
                                "f_type": att.get("file_type", "image/jpeg"),
                                "f_size": att.get("file_size_bytes", 0),
                            }
                        )

                db_session.commit()
            except Exception as e:
                logger.error(f"Gagal mencatat service_request ke database: {e}")

        return ticket_record


def process_customer_service_intake(
    tenant_id: str,
    customer_id: Optional[str],
    conversation_id: Optional[str],
    subject: str,
    description: str,
    order_id: Optional[str] = None,
    category_override: Optional[ServiceRequestCategory] = None,
    amount: float = 0.0,
    channel: str = "WHATSAPP",
    attachments: Optional[List[Dict[str, Any]]] = None,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    return CustomerServiceIntakeNode.process_intake(
        tenant_id=tenant_id,
        customer_id=customer_id,
        conversation_id=conversation_id,
        subject=subject,
        description=description,
        order_id=order_id,
        category_override=category_override,
        amount=amount,
        channel=channel,
        attachments=attachments,
        db_session=db_session,
    )


def approve_service_request(
    tenant_id: str,
    ticket_id: str,
    user_id: str,
    resolution_notes: str,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Persetujuan manusia resmi untuk tiket refund atau komplain.
    HANYA pengguna manusia yang dapat mengeksekusi fungsi ini (bukan AI).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    if db_session:
        try:
            db_session.execute(
                text("""
                UPDATE service_requests
                SET status = 'APPROVED',
                    approved_by_user_id = :uid,
                    approved_at = now(),
                    resolution_notes = :notes,
                    updated_at = now()
                WHERE id = :id AND tenant_id = :tid
                """),
                {
                    "uid": user_id,
                    "notes": resolution_notes,
                    "id": ticket_id,
                    "tid": tenant_id,
                }
            )
            db_session.commit()
        except Exception as e:
            logger.error(f"Gagal menyetujui tiket: {e}")

    return {
        "ticket_id": ticket_id,
        "tenant_id": tenant_id,
        "status": ServiceRequestStatus.APPROVED.value,
        "approved_by_user_id": user_id,
        "resolution_notes": resolution_notes,
        "approved_at": now_iso,
    }


def reject_service_request(
    tenant_id: str,
    ticket_id: str,
    user_id: str,
    rejection_reason: str,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """Penolakan tiket oleh staf manusia dengan alasan yang terdokumentasi."""
    now_iso = datetime.now(timezone.utc).isoformat()
    if db_session:
        try:
            db_session.execute(
                text("""
                UPDATE service_requests
                SET status = 'REJECTED',
                    approved_by_user_id = :uid,
                    resolution_notes = :notes,
                    updated_at = now()
                WHERE id = :id AND tenant_id = :tid
                """),
                {
                    "uid": user_id,
                    "notes": rejection_reason,
                    "id": ticket_id,
                    "tid": tenant_id,
                }
            )
            db_session.commit()
        except Exception as e:
            logger.error(f"Gagal menolak tiket: {e}")

    return {
        "ticket_id": ticket_id,
        "tenant_id": tenant_id,
        "status": ServiceRequestStatus.REJECTED.value,
        "rejected_by_user_id": user_id,
        "rejection_reason": rejection_reason,
        "updated_at": now_iso,
    }
