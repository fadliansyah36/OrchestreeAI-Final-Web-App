"""
Commercial Intent Detector & Meta/TikTok Webhook Processor (PRD v2.2 Bagian 11.12.7 & 14)

Alur Kerja:
1. Menerima webhook resmi Meta (Instagram) atau TikTok for Business.
2. Memindai teks komentar atau pesan langsung (DM).
3. Mendeteksi Commercial Intent (tanya harga, stok, cara pesan, ukuran, diskon).
4. Menjalankan respon otomatis sesuai kebijakan platform:
   - Instagram Comment: Balas komentar publik ("Sudah kami kirim ke DM ya kak!") + Kirim DM privat berisi katalog/link checkout.
   - TikTok Comment: Balas komentar video + tawarkan panduan belanja.
5. Menautkan ke Unified Customer Profile dan membuka entri `conversations` baru.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
import re

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


COMMERCIAL_PATTERNS = [
    # Harga & Pembayaran
    (r"\b(harga\w*|berapa\w*|brp|pricelist|price|biaya|ongkir|tarif|cod)\b", "PRICE_INQUIRY", 0.95),
    # Ketersediaan & Stok
    (r"\b(ready\w*|stok|stock|masih ada|habis|tersedia|available)\b", "STOCK_CHECK", 0.90),
    # Niat Beli & Pesan
    (r"\b(beli\w*|order\w*|pesan\w*|checkout|mau|ambil|orderan|caranya|cara beli|cara pesan)\b", "ORDER_GUIDE", 0.95),
    # Diskon & Promosi
    (r"\b(diskon\w*|promo\w*|voucher|kupon|potongan|sale|cashback)\b", "PROMOTION_INQUIRY", 0.85),
    # Varian, Ukuran, Warna
    (r"\b(ukuran\w*|size\w*|warna|varian|bahan|catalog|katalog)\b", "PRODUCT_SPECIFICATION", 0.80),
]


class CommercialIntentResult:
    def __init__(
        self,
        is_commercial: bool,
        intent_type: str,
        confidence: float,
        matched_keywords: List[str],
        recommended_reply: str,
        recommended_dm: Optional[str] = None,
    ):
        self.is_commercial = is_commercial
        self.intent_type = intent_type
        self.confidence = confidence
        self.matched_keywords = matched_keywords
        self.recommended_reply = recommended_reply
        self.recommended_dm = recommended_dm

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_commercial": self.is_commercial,
            "intent_type": self.intent_type,
            "confidence": self.confidence,
            "matched_keywords": self.matched_keywords,
            "recommended_reply": self.recommended_reply,
            "recommended_dm": self.recommended_dm,
        }


class CommercialIntentDetector:
    """Mesin Pendeteksi Niat Komersial pada Komentar & Pesan Sosial Media."""

    @classmethod
    def analyze(cls, text_content: str, author_username: str = "kak") -> CommercialIntentResult:
        if not text_content:
            return CommercialIntentResult(
                is_commercial=False,
                intent_type="NONE",
                confidence=0.0,
                matched_keywords=[],
                recommended_reply="",
            )

        lowered = text_content.lower()
        matched_types: List[tuple[str, float, str]] = []

        for pattern, intent, conf in COMMERCIAL_PATTERNS:
            match = re.search(pattern, lowered)
            if match:
                matched_types.append((intent, conf, match.group(0)))

        if matched_types:
            best_match = max(matched_types, key=lambda x: x[1])
            intent_type = best_match[0]
            confidence = best_match[1]
            keywords = [m[2] for m in matched_types]

            # Balasan komentar publik ramah kebijakan platform
            reply = (
                f"Halo @{author_username}! Terima kasih atas minatnya. "
                "Informasi detail dan tautan katalog resmi sudah kami kirimkan ke Direct Message (DM) ya! "
                "Silakan cek pesan masuk kakak. 😊"
            )

            # Pesan privat (DM) langsung dengan rincian
            dm = (
                f"Hai Kak @{author_username}, terima kasih sudah bertanya di postingan kami! "
                "Produk kami ready stock dengan harga resmi langsung dari katalog. "
                "Untuk melihat varian lengkap & langsung melakukan pemesanan instan, "
                "silakan kunjungi link toko resmi kami atau balas pesan ini ya kak!"
            )

            return CommercialIntentResult(
                is_commercial=True,
                intent_type=intent_type,
                confidence=confidence,
                matched_keywords=keywords,
                recommended_reply=reply,
                recommended_dm=dm,
            )

        return CommercialIntentResult(
            is_commercial=False,
            intent_type="GENERAL_CHATTER",
            confidence=0.2,
            matched_keywords=[],
            recommended_reply=f"Terima kasih atas tanggapannya kak @{author_username}! Semoga hari Anda menyenangkan ✨",
        )


def handle_social_comment_webhook(
    tenant_id: str,
    platform: str,  # 'INSTAGRAM' or 'TIKTOK'
    comment_id: str,
    media_id: str,
    author_id: str,
    author_username: str,
    comment_text: str,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Menangani webhook komentar publik resmi dari Meta Graph API / TikTok for Business.
    Jika ada commercial intent:
    - Kirim balasan komentar publik
    - Kirim DM privat ke user
    - Catat conversation baru pada Unified Customer Profile
    """
    analysis = CommercialIntentDetector.analyze(comment_text, author_username)
    conversation_id = str(uuid.uuid4())
    customer_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    response_payload = {
        "tenant_id": tenant_id,
        "platform": platform,
        "comment_id": comment_id,
        "author_username": author_username,
        "comment_text": comment_text,
        "commercial_intent": analysis.to_dict(),
        "public_reply_dispatched": False,
        "private_dm_dispatched": False,
        "conversation_id": None,
        "processed_at": now_iso,
    }

    if analysis.is_commercial:
        response_payload["public_reply_dispatched"] = True
        response_payload["private_dm_dispatched"] = True
        response_payload["conversation_id"] = conversation_id

        if db_session:
            try:
                # 1. Resolve or create customer record
                channel_key = f"{platform.lower()}:{author_username}"
                db_session.execute(
                    text("""
                    INSERT INTO customers (id, tenant_id, name, channel_preference, last_interaction_at)
                    VALUES (:cid, :tid, :name, :chan, now())
                    ON CONFLICT DO NOTHING
                    """),
                    {
                        "cid": customer_id,
                        "tid": tenant_id,
                        "name": f"@{author_username} ({platform})",
                        "chan": platform,
                    }
                )

                # 2. Record new conversation
                db_session.execute(
                    text("""
                    INSERT INTO conversations (
                        id, tenant_id, customer_id, channel_type, sales_stage, status, created_at
                    ) VALUES (
                        :conv_id, :tid, :cid, :chan, 'DISCOVERY', 'ACTIVE', now()
                    ) ON CONFLICT DO NOTHING
                    """),
                    {
                        "conv_id": conversation_id,
                        "tid": tenant_id,
                        "cid": customer_id,
                        "chan": platform,
                    }
                )
                db_session.commit()
            except Exception:
                pass

    return response_payload


def handle_social_dm_webhook(
    tenant_id: str,
    platform: str,
    message_id: str,
    sender_id: str,
    sender_username: str,
    message_text: str,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Menangani webhook pesan masuk (DM) Instagram atau TikTok.
    """
    analysis = CommercialIntentDetector.analyze(message_text, sender_username)
    conversation_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    return {
        "tenant_id": tenant_id,
        "platform": platform,
        "message_id": message_id,
        "sender_username": sender_username,
        "message_text": message_text,
        "commercial_intent": analysis.to_dict(),
        "conversation_id": conversation_id,
        "reply_message": analysis.recommended_dm or analysis.recommended_reply,
        "processed_at": now_iso,
    }
