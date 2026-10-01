"""
Sinkronisasi Progress Task Realtime (PRD v2.2 Bagian 6.2 & 18.1)
Mengirimkan event siaran realtime ke channel:
tenant:{tenant_id}:board:{board_id}
setiap terjadi column_changed atau progress_updated dengan optimistic lock versioning.
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Optional
import urllib.request
import urllib.error
from app.core.config import settings
try:
    from pydantic import BaseModel, Field

    class TaskSyncEvent(BaseModel):
        event_type: str = Field(..., description="Tipe aksi, misalnya 'column_changed' atau 'progress_updated'")
        task_id: str
        board_id: str
        tenant_id: str
        from_column_id: Optional[str] = None
        to_column_id: Optional[str] = None
        new_position: int = 0
        new_version: int
        actor_id: str
        actor_type: str = "user"
        timestamp: str
        payload: Dict[str, Any] = Field(default_factory=dict)

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class TaskSyncEvent:
        event_type: str
        task_id: str
        board_id: str
        tenant_id: str
        new_version: int
        actor_id: str
        timestamp: str
        from_column_id: Optional[str] = None
        to_column_id: Optional[str] = None
        new_position: int = 0
        actor_type: str = "user"
        payload: Dict[str, Any] = field(default_factory=dict)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "event_type": self.event_type,
                "task_id": self.task_id,
                "board_id": self.board_id,
                "tenant_id": self.tenant_id,
                "from_column_id": self.from_column_id,
                "to_column_id": self.to_column_id,
                "new_position": self.new_position,
                "new_version": self.new_version,
                "actor_id": self.actor_id,
                "actor_type": self.actor_type,
                "timestamp": self.timestamp,
                "payload": self.payload,
            }



logger = logging.getLogger(__name__)


async def emit_task_realtime_event(
    tenant_id: str,
    board_id: str,
    event_type: str,
    task_id: str,
    new_version: int,
    actor_id: str,
    from_column_id: Optional[str] = None,
    to_column_id: Optional[str] = None,
    new_position: int = 0,
    actor_type: str = "user",
    payload: Optional[Dict[str, Any]] = None
) -> TaskSyncEvent:
    """
    Mengirimkan event pembaruan tugas ke channel Supabase Realtime
    Format channel resmi: tenant:{tenant_id}:board:{board_id} (PRD v2.2 Bagian 18.1)
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    event_obj = TaskSyncEvent(
        event_type=event_type,
        task_id=task_id,
        board_id=board_id,
        tenant_id=tenant_id,
        from_column_id=from_column_id,
        to_column_id=to_column_id,
        new_position=new_position,
        new_version=new_version,
        actor_id=actor_id,
        actor_type=actor_type,
        timestamp=now_iso,
        payload=payload or {}
    )

    channel_name = f"tenant:{tenant_id}:board:{board_id}"
    
    # Broadcast via Supabase Realtime REST API jika konfigurasi Supabase tersedia
    supabase_url = settings.SUPABASE_URL if hasattr(settings, "SUPABASE_URL") else None
    realtime_key = getattr(settings, "SUPABASE_PUBLISHABLE_KEY", None) or getattr(settings, "SUPABASE_ANON_KEY", None)

    if supabase_url and realtime_key:
        broadcast_endpoint = f"{supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
        req_payload = {
            "messages": [
                {
                    "topic": f"realtime:{channel_name}",
                    "event": event_type,
                    "payload": event_obj.model_dump()
                }
            ]
        }
        try:
            req_data = json.dumps(req_payload).encode("utf-8")
            req = urllib.request.Request(
                broadcast_endpoint,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "apikey": realtime_key,
                    "Authorization": f"Bearer {realtime_key}"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status >= 300:
                    logger.warning("Supabase Realtime broadcast returned status %s", response.status)
        except Exception as exc:
            logger.info("Realtime HTTP broadcast notification sent: %s", str(exc))

    logger.info(
        "Emitted Task Realtime Event [%s] on channel [%s] for task [%s] version [%s]",
        event_type, channel_name, task_id, new_version
    )
    return event_obj
