"""
F.01-SOCIAL Skill: Mesin Penjadwalan Content Calendar & Pembersihan Metadata Wajib
(PRD v2.2 Bagian 11.12.7)
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from .tools import (
    tool_social_schedule_post,
    tool_social_scrub_image,
    tool_social_publish_post,
    tool_social_toggle_ai_disclosure,
)
from .metadata_scrubber import scrub_image_metadata

logger = logging.getLogger("orchestree.skills.f01_social")


class F01SocialSkill:
    """
    Skill F.01-SOCIAL:
    Mengelola penjadwalan konten media sosial omnichannel,
    penegakan pembersihan metadata teknis (EXIF/XMP/IPTC/C2PA/model signature),
    dan kontrol pelabelan disclosure AI.
    """

    name: str = "f01_social"
    version: str = "1.0.0"
    description: str = (
        "Mesin Penjadwalan Content Calendar & Pembersihan Metadata Gambar Wajib "
        "(PRD v2.2 Bagian 11.12.7)"
    )

    def schedule_post(
        self,
        tenant_id: str,
        title: str,
        caption: str,
        scheduled_publish_at: str,
        media_urls: Optional[List[str]] = None,
        channels: Optional[List[str]] = None,
        disclose_ai_generated: bool = False,
        db_session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Menjadwalkan postingan ke kalender konten."""
        return tool_social_schedule_post(
            tenant_id=tenant_id,
            title=title,
            caption=caption,
            scheduled_publish_at=scheduled_publish_at,
            media_urls=media_urls,
            channels=channels,
            disclose_ai_generated=disclose_ai_generated,
            db_session=db_session,
        )

    def scrub_media_metadata(
        self,
        tenant_id: str,
        item_id: str,
        raw_image_bytes: bytes,
        filename: str = "asset.jpg",
        db_session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Menjalankan pembersihan metadata gambar wajib.
        Menghapus EXIF, XMP, IPTC, C2PA, dan jejak model sebelum boleh dipublikasikan.
        """
        return tool_social_scrub_image(
            tenant_id=tenant_id,
            item_id=item_id,
            raw_image_bytes=raw_image_bytes,
            filename=filename,
            db_session=db_session,
        )

    def publish_post(
        self,
        tenant_id: str,
        item_id: str,
        current_scrub_status: str,
        channels: Optional[List[str]] = None,
        disclose_ai_generated: bool = False,
        db_session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Mempublikasikan postingan terjadwal.
        MANDATE: Menolak keras jika status metadata_scrub_status != 'clean'.
        """
        return tool_social_publish_post(
            tenant_id=tenant_id,
            item_id=item_id,
            current_scrub_status=current_scrub_status,
            channels=channels,
            disclose_ai_generated=disclose_ai_generated,
            db_session=db_session,
        )

    def toggle_ai_disclosure(
        self,
        tenant_id: str,
        item_id: str,
        disclose: bool,
        db_session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Mengatur toggle disclosure AI independen dari pembersihan metadata teknis."""
        return tool_social_toggle_ai_disclosure(
            tenant_id=tenant_id,
            item_id=item_id,
            disclose_ai_generated=disclose,
            db_session=db_session,
        )
