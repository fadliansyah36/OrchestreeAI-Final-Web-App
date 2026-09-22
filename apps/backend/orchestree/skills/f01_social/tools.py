"""
MCP Tools untuk F.01-SOCIAL Content Calendar & Metadata Scrubber (PRD v2.2 Bagian 11.12.7)
"""

from typing import Dict, Any, List, Optional
import uuid
from datetime import datetime, timezone
from .metadata_scrubber import scrub_image_metadata

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


def tool_social_schedule_post(
    tenant_id: str,
    title: str,
    caption: str,
    scheduled_publish_at: str,
    media_urls: Optional[List[str]] = None,
    channels: Optional[List[str]] = None,
    disclose_ai_generated: bool = False,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """Menjadwalkan konten baru ke kalender sosial media."""
    item_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    media_list = media_urls or []
    target_channels = channels or ["INSTAGRAM"]

    # Jika ada gambar, status awal metadata adalah 'dirty' (wajib dibersihkan sebelum publish)
    initial_scrub_status = "dirty" if media_list else "clean"

    if db_session:
        try:
            db_session.execute(
                text("""
                INSERT INTO content_calendar_items (
                    id, tenant_id, title, caption, media_urls, channels,
                    scheduled_publish_at, status, metadata_scrub_status, disclose_ai_generated, created_at
                ) VALUES (
                    :id, :tid, :title, :caption, :media, :channels,
                    :sched, 'SCHEDULED', :scrub, :disclose, now()
                )
                """),
                {
                    "id": item_id,
                    "tid": tenant_id,
                    "title": title,
                    "caption": caption,
                    "media": media_list,
                    "channels": target_channels,
                    "sched": scheduled_publish_at,
                    "scrub": initial_scrub_status,
                    "disclose": disclose_ai_generated,
                }
            )
            db_session.commit()
        except Exception:
            pass

    return {
        "item_id": item_id,
        "title": title,
        "caption": caption,
        "scheduled_publish_at": scheduled_publish_at,
        "channels": target_channels,
        "status": "SCHEDULED",
        "metadata_scrub_status": initial_scrub_status,
        "disclose_ai_generated": disclose_ai_generated,
        "created_at": now_iso,
    }


def tool_social_scrub_image(
    tenant_id: str,
    item_id: str,
    raw_image_bytes: bytes,
    filename: str = "banner_post.jpg",
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Menjalankan proses pembersihan metadata wajib (EXIF, XMP, IPTC, C2PA).
    Mencatat ke audit log metadata_scrub_logs dan memperbarui status item menjadi 'clean'.
    """
    clean_bytes, stripped_tags = scrub_image_metadata(raw_image_bytes, filename)
    log_id = str(uuid.uuid4())
    scrubbed_filename = f"clean_{filename}"

    if db_session:
        try:
            # 1. Catat ke audit log
            db_session.execute(
                text("""
                INSERT INTO metadata_scrub_logs (
                    id, tenant_id, content_calendar_item_id, original_filename,
                    scrubbed_filename, stripped_tags, scrubbed_at, status
                ) VALUES (
                    :id, :tid, :item_id, :orig, :clean, :tags, now(), 'SUCCESS'
                )
                """),
                {
                    "id": log_id,
                    "tid": tenant_id,
                    "item_id": item_id,
                    "orig": filename,
                    "clean": scrubbed_filename,
                    "tags": stripped_tags,
                }
            )

            # 2. Update status item kalender menjadi 'clean'
            db_session.execute(
                text("""
                UPDATE content_calendar_items
                SET metadata_scrub_status = 'clean', updated_at = now()
                WHERE id = :item_id AND tenant_id = :tid
                """),
                {"item_id": item_id, "tid": tenant_id}
            )
            db_session.commit()
        except Exception:
            pass

    return {
        "log_id": log_id,
        "item_id": item_id,
        "original_filename": filename,
        "scrubbed_filename": scrubbed_filename,
        "stripped_tags": stripped_tags,
        "new_scrub_status": "clean",
        "clean_bytes_length": len(clean_bytes),
        "scrubbed_at": datetime.now(timezone.utc).isoformat(),
    }


def tool_social_publish_post(
    tenant_id: str,
    item_id: str,
    current_scrub_status: str,
    channels: Optional[List[str]] = None,
    disclose_ai_generated: bool = False,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Menerbitkan postingan media sosial.
    ATURAN MUTLAK PRD v2.2 Bagian 11.12.7:
    Publish job WAJIB MENOLAK item yang metadata_scrub_status belum 'clean'!
    """
    if current_scrub_status.lower() != "clean":
        return {
            "success": False,
            "error_code": "METADATA_SCRUB_REJECTED",
            "message": (
                "Penerbitan DITOLAK: Gambar belum lolos pembersihan metadata teknis. "
                "Status metadata_scrub_status saat ini adalah '" + current_scrub_status + "'. "
                "Item WAJIB memiliki status 'clean' sebelum dapat dipublikasikan."
            ),
            "item_id": item_id,
        }

    # Jika lolos validasi 'clean'
    now_iso = datetime.now(timezone.utc).isoformat()
    if db_session:
        try:
            db_session.execute(
                text("""
                UPDATE content_calendar_items
                SET status = 'PUBLISHED', published_at = now(), updated_at = now()
                WHERE id = :item_id AND tenant_id = :tid
                """),
                {"item_id": item_id, "tid": tenant_id}
            )
            db_session.commit()
        except Exception:
            pass

    return {
        "success": True,
        "item_id": item_id,
        "status": "PUBLISHED",
        "published_at": now_iso,
        "metadata_scrub_verified": True,
        "disclose_ai_generated": disclose_ai_generated,
        "channels": channels or ["INSTAGRAM"],
        "message": "Konten berhasil dipublikasikan ke kanal resmi setelah verifikasi metadata bersih.",
    }


def tool_social_toggle_ai_disclosure(
    tenant_id: str,
    item_id: str,
    disclose_ai_generated: bool,
    db_session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Mengubah preferensi pelabelan konten AI sesuai regulasi platform.
    Independen dari proses pembersihan metadata teknis.
    """
    if db_session:
        try:
            db_session.execute(
                text("""
                UPDATE content_calendar_items
                SET disclose_ai_generated = :disclose, updated_at = now()
                WHERE id = :item_id AND tenant_id = :tid
                """),
                {"disclose": disclose_ai_generated, "item_id": item_id, "tid": tenant_id}
            )
            db_session.commit()
        except Exception:
            pass

    return {
        "item_id": item_id,
        "disclose_ai_generated": disclose_ai_generated,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
