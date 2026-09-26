"""
Realtime Broadcaster untuk Saluran platform:ai-agent-live (PRD v2.2 Bagian 25.2 & 9.4).
Mendukung langganan WebSocket live untuk Super Admin dan publikasi event status operasional agen AI.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("orchestree.cognitive_monitoring.broadcaster")


class RealtimeBroadcaster:
    """Broadcaster in-memory multi-koneksi WebSocket untuk event live state."""

    def __init__(self):
        self._active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Mendaftarkan koneksi WebSocket baru."""
        async with self._lock:
            self._active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self._active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        """Menghapus koneksi WebSocket yang terputus."""
        async with self._lock:
            self._active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self._active_connections)}")

    async def publish(self, channel: str, payload: Dict[str, Any]) -> None:
        """
        Mempublikasikan payload pesan ke seluruh client yang terhubung ke channel.
        Secara default menyasar channel 'platform:ai-agent-live'.
        """
        if not self._active_connections:
            return

        message = {
            "channel": channel,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        raw_text = json.dumps(message)

        dead_connections: Set[WebSocket] = set()
        async with self._lock:
            current_connections = list(self._active_connections)

        for ws in current_connections:
            try:
                await ws.send_text(raw_text)
            except Exception as exc:
                logger.debug(f"Gagal mengirim pesan ke websocket: {exc}")
                dead_connections.add(ws)

        if dead_connections:
            async with self._lock:
                for dead_ws in dead_connections:
                    self._active_connections.discard(dead_ws)


_broadcaster = RealtimeBroadcaster()


def get_realtime_broadcaster() -> RealtimeBroadcaster:
    """Mengembalikan singleton RealtimeBroadcaster."""
    return _broadcaster
