"""
Domain Tenaga Kerja & Manajemen Tugas (Workforce & Task Management).
"""
from app.domains.workforce.task_sync import (
    TaskSyncEvent,
    emit_task_realtime_event,
)

__all__ = [
    "TaskSyncEvent",
    "emit_task_realtime_event",
]
