"""Read-side domain service for durable workflow execution history."""

from typing import Any, Dict, List, Optional
import sqlalchemy as sa

from app.core.database import get_database_engine


def list_workflow_executions(tenant_id: Optional[str], limit: int = 50) -> List[Dict[str, Any]]:
    engine = get_database_engine()
    with engine.connect() as conn:
        if tenant_id:
            query = sa.text("""
                SELECT * FROM workflow_executions
                WHERE tenant_id = :tid
                ORDER BY created_at DESC
                LIMIT :lim;
            """)
            params = {"tid": tenant_id, "lim": limit}
        else:
            query = sa.text("""
                SELECT * FROM workflow_executions
                ORDER BY created_at DESC
                LIMIT :lim;
            """)
            params = {"lim": limit}

        rows = conn.execute(query, params).fetchall()
        return [
            {
                "id": str(row.id),
                "tenant_id": str(row.tenant_id),
                "workflow_definition_id": str(row.workflow_definition_id) if getattr(row, "workflow_definition_id", None) else None,
                "status": row.status,
                "started_at": row.started_at.isoformat() if getattr(row, "started_at", None) else None,
                "completed_at": row.completed_at.isoformat() if getattr(row, "completed_at", None) else None,
                "created_at": row.created_at.isoformat() if getattr(row, "created_at", None) else None,
            }
            for row in rows
        ]
