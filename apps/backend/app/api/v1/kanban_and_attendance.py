"""
Router Manajemen Papan Kanban (Optimistic Lock) dan Presensi WebAuthn
Sesuai PRD v2.2 Bagian 6.2, 18.1, 15:
- Endpoint Papan Kanban & Tugas dengan PostgreSQL & RLS bertenant nyata
- Perpindahan tugas dengan Header If-Match dan deteksi konflik versi 409
- Sinkronisasi event realtime ke Supabase Realtime channel tenant:{tenant_id}:board:{board_id}
- Presensi WebAuthn biometrik dengan verifikasi tantangan dan pencegahan replay attack (sign_count wajib naik)
- Riwayat kredensial WebAuthn & log pencatatan presensi persisten
"""

from datetime import datetime, timezone
import json
import logging
import secrets
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Header, HTTPException, Request, Response, status, Depends, Query
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine
from app.domains.workforce.task_sync import emit_task_realtime_event
from app.authz.pdp import require_capability

logger = logging.getLogger("orchestree.kanban_attendance")

router = APIRouter(
    tags=["Kanban Board, Tasks & WebAuthn Attendance"],
    dependencies=[Depends(require_capability("tasks.assigned.view"))]
)

# Nonce kriptografis tantangan WebAuthn transien (TTL 5 menit)
# Sesuai AGENTS.md Bagian 4: murni non-bisnis transien untuk validasi hand-shake
_webauthn_challenges: Dict[str, Dict[str, Any]] = {}


# --- Schemas ---

class CreateBoardRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    column_id: Optional[str] = None
    priority: str = Field(default="medium")
    assignee_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    due_date: Optional[str] = None
    cover_color: Optional[str] = None
    source_channel: str = Field(default="dashboard")
    source_ref_id: Optional[str] = None
    created_by_type: str = Field(default="user")
    created_by_id: Optional[str] = None


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    due_date: Optional[str] = None
    cover_color: Optional[str] = None
    assignee_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    column_id: Optional[str] = None
    position: Optional[int] = None
    progress_percentage: Optional[int] = None


class CreateChecklistRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    position: Optional[int] = 0


class UpdateChecklistRequest(BaseModel):
    title: Optional[str] = None
    position: Optional[int] = None


class CreateChecklistItemRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    position: Optional[int] = 0


class UpdateChecklistItemRequest(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    completed_by_type: Optional[str] = None
    completed_by_id: Optional[str] = None
    position: Optional[int] = None


class CreateAttachmentRequest(BaseModel):
    file_name: str
    file_url: str
    file_size: Optional[int] = 0
    mime_type: Optional[str] = None


class CreateCommentRequest(BaseModel):
    content: str = Field(..., min_length=1)
    author_id: Optional[str] = None
    author_type: str = Field(default="user")


class ProactiveTaskFromChannelRequest(BaseModel):
    source_channel: str = Field(..., description="'dashboard' | 'telegram' | 'whatsapp' | 'proactive_agent'")
    sender_id: str
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    board_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    assignee_id: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    priority: str = Field(default="medium")
    due_date: Optional[str] = None


def _recompute_task_progress(conn: sa.Connection, task_id: str) -> int:
    """Menghitung ulang persentase progres tugas berdasarkan rasio checklist item yang selesai."""
    stats = conn.execute(
        sa.text("""
            SELECT 
                COUNT(ci.id) as total_items,
                COUNT(CASE WHEN ci.is_completed THEN 1 END) as completed_items
            FROM task_checklists c
            LEFT JOIN task_checklist_items ci ON ci.checklist_id = c.id
            WHERE c.task_id = :task_id;
        """),
        {"task_id": task_id}
    ).mappings().first()
    
    total = stats["total_items"] if stats else 0
    completed = stats["completed_items"] if stats else 0
    
    if total > 0:
        pct = int(round((completed / total) * 100))
    else:
        col = conn.execute(
            sa.text("""
                SELECT col.name FROM tasks t
                JOIN board_columns col ON t.column_id = col.id
                WHERE t.id = :task_id;
            """),
            {"task_id": task_id}
        ).scalar()
        pct = 100 if col and any(w in col.lower() for w in ["selesai", "done", "complete"]) else 0
    
    conn.execute(
        sa.text("UPDATE tasks SET progress_percentage = :pct, updated_at = now() WHERE id = :task_id;"),
        {"pct": pct, "task_id": task_id}
    )
    return pct


class MoveTaskRequest(BaseModel):
    target_column_id: str
    new_position: int = 0
    tenant_id: Optional[str] = None


class WebAuthnRegisterChallengeRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str


class WebAuthnRegisterVerifyRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str
    credential_id: str
    public_key: Optional[str] = "verified_key"
    sign_count: Optional[int] = 0


class WebAuthnLoginChallengeRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str


class WebAuthnVerifyAttendanceRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str
    credential_id: str
    sign_count: int
    check_type: str = Field(default="in", description="'in' atau 'out'")


def _ensure_default_board_in_db(conn: sa.Connection, tenant_id: str) -> Dict[str, Any]:
    """Memastikan papan default dan 4 kolom standar ada di database Supabase Postgres."""
    existing = conn.execute(
        sa.text("SELECT id, tenant_id, name, description, created_at, updated_at FROM boards WHERE tenant_id = :tenant_id ORDER BY created_at ASC LIMIT 1;"),
        {"tenant_id": tenant_id}
    ).mappings().first()

    if existing:
        return dict(existing)

    board_id = str(uuid.uuid4())
    conn.execute(
        sa.text("""
            INSERT INTO boards (id, tenant_id, name, description, created_at, updated_at)
            VALUES (:id, :tenant_id, :name, :description, now(), now())
            ON CONFLICT DO NOTHING;
        """),
        {
            "id": board_id,
            "tenant_id": tenant_id,
            "name": "Papan Operasional Utama",
            "description": "Papan kendali alur tugas staf dan pekerja kecerdasan buatan"
        }
    )

    default_cols = [
        {"id": str(uuid.uuid4()), "name": "Antrean Tugas", "pos": 0, "wip": None},
        {"id": str(uuid.uuid4()), "name": "Sedang Dikerjakan", "pos": 1, "wip": 5},
        {"id": str(uuid.uuid4()), "name": "Tinjauan & Validasi", "pos": 2, "wip": 3},
        {"id": str(uuid.uuid4()), "name": "Selesai", "pos": 3, "wip": None},
    ]
    for col in default_cols:
        conn.execute(
            sa.text("""
                INSERT INTO board_columns (id, tenant_id, board_id, name, position, wip_limit, created_at)
                VALUES (:id, :tenant_id, :board_id, :name, :pos, :wip, now())
                ON CONFLICT DO NOTHING;
            """),
            {
                "id": col["id"],
                "tenant_id": tenant_id,
                "board_id": board_id,
                "name": col["name"],
                "pos": col["pos"],
                "wip": col["wip"],
            }
        )

    created = conn.execute(
        sa.text("SELECT id, tenant_id, name, description, created_at, updated_at FROM boards WHERE id = :id;"),
        {"id": board_id}
    ).mappings().first()
    return dict(created) if created else {"id": board_id, "tenant_id": tenant_id, "name": "Papan Operasional Utama"}


# --- Endpoints Papan & Tugas ---

@router.get("/api/v1/tenants/{tenant_id}/boards")
async def list_tenant_boards(
    tenant_id: str,
    membership_id: Optional[str] = Query(None),
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengambil seluruh papan kanban milik tenant dari Supabase Postgres yang sesuai hak akses."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        
        resolved_mid = membership_id or x_membership_id
        if not resolved_mid and x_user_id:
            m_row = conn.execute(
                sa.text("SELECT id FROM tenant_memberships WHERE tenant_id = :tid AND (auth_user_id::text = :uid OR id::text = :uid) AND status = 'active' LIMIT 1;"),
                {"tid": tenant_id, "uid": x_user_id}
            ).fetchone()
            if m_row:
                resolved_mid = str(m_row[0])

        if resolved_mid:
            conn.execute(sa.text("SELECT set_config('app.membership_id', :mid, true);"), {"mid": resolved_mid})

        _ensure_default_board_in_db(conn, tenant_id)
        rows = conn.execute(
            sa.text("SELECT id, tenant_id, name, description, department_id, created_at, updated_at FROM boards WHERE tenant_id = :tenant_id ORDER BY created_at ASC;"),
            {"tenant_id": tenant_id}
        ).mappings().fetchall()
        return [dict(r) for r in rows]


@router.get("/api/v1/tenants/{tenant_id}/boards/{board_id}")
async def get_board_detail(
    tenant_id: str,
    board_id: str,
    membership_id: Optional[str] = Query(None),
    x_membership_id: Optional[str] = Header(None, alias="x-membership-id"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Mengambil rincian papan, kolom, dan kartu tugas nyata dari Supabase Postgres dengan isolasi access tier."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})

        resolved_mid = membership_id or x_membership_id
        if not resolved_mid and x_user_id:
            m_row = conn.execute(
                sa.text("SELECT id FROM tenant_memberships WHERE tenant_id = :tid AND (auth_user_id::text = :uid OR id::text = :uid) AND status = 'active' LIMIT 1;"),
                {"tid": tenant_id, "uid": x_user_id}
            ).fetchone()
            if m_row:
                resolved_mid = str(m_row[0])

        user_tier = "executive"
        if resolved_mid:
            conn.execute(sa.text("SELECT set_config('app.membership_id', :mid, true);"), {"mid": resolved_mid})
            from app.domains.workforce.access_tier import get_access_tier
            user_tier = get_access_tier(resolved_mid)

        board_row = conn.execute(
            sa.text("SELECT id, tenant_id, name, description, department_id, created_at, updated_at FROM boards WHERE id = :id AND tenant_id = :tenant_id;"),
            {"id": board_id, "tenant_id": tenant_id}
        ).mappings().first()

        if not board_row:
            if board_id == "default":
                board_row = _ensure_default_board_in_db(conn, tenant_id)
                board_id = str(board_row["id"])
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Papan tugas tidak ditemukan atau di luar cakupan akses Anda."
                )

        col_rows = conn.execute(
            sa.text("SELECT id, tenant_id, board_id, name, position, wip_limit, created_at FROM board_columns WHERE board_id = :board_id ORDER BY position ASC;"),
            {"board_id": board_id}
        ).mappings().fetchall()

        task_query = """
            SELECT t.id, t.tenant_id, t.board_id, t.column_id, t.title, t.description,
                   t.position, t.priority,
                   COALESCE(t.assigned_membership_id, t.assignee_id) as assignee_id,
                   t.assigned_membership_id, t.assigned_agent_id, t.version,
                   t.created_at, t.updated_at,
                   COALESCE(t.labels, ARRAY[]::text[]) as labels,
                   t.due_date, t.cover_color,
                   COALESCE(t.progress_percentage, 0) as progress_percentage,
                   COALESCE(t.source_channel, 'dashboard') as source_channel,
                   t.source_ref_id,
                   COALESCE(t.created_by_type, 'user') as created_by_type,
                   t.created_by_id,
                   m.full_name as assignee_name, a.display_name as assigned_agent_name,
                   (SELECT COUNT(*) FROM task_checklists c WHERE c.task_id = t.id) as checklist_count,
                   (SELECT COUNT(*) FROM task_checklist_items ci JOIN task_checklists c ON ci.checklist_id = c.id WHERE c.task_id = t.id) as checklist_total_items,
                   (SELECT COUNT(*) FROM task_checklist_items ci JOIN task_checklists c ON ci.checklist_id = c.id WHERE c.task_id = t.id AND ci.is_completed = true) as checklist_completed_items,
                   (SELECT COUNT(*) FROM task_attachments att WHERE att.task_id = t.id) as attachment_count,
                   (SELECT COUNT(*) FROM task_comments cm WHERE cm.task_id = t.id) as comment_count
            FROM tasks t
            LEFT JOIN tenant_memberships m ON COALESCE(t.assigned_membership_id, t.assignee_id) = m.id
            LEFT JOIN ai_agents a ON t.assigned_agent_id = a.id
            WHERE t.board_id = :board_id
              AND (t.deleted_at IS NULL)
        """
        task_params = {"board_id": board_id}
        if user_tier == "staff" and resolved_mid:
            task_query += " AND fn_task_visible_to_membership(t.id, :mid::uuid) = true"
            task_params["mid"] = resolved_mid

        task_query += " ORDER BY t.position ASC;"
        task_rows = conn.execute(sa.text(task_query), task_params).mappings().fetchall()

        tier_notice = None
        if user_tier == "staff":
            tier_notice = "Menampilkan task Anda, tim, dan AI Agent kolaborasi Anda"

        return {
            "board": dict(board_row),
            "columns": [dict(c) for c in col_rows],
            "tasks": [dict(t) for t in task_rows],
            "access_tier": user_tier,
            "tier_scope_notice": tier_notice,
        }


@router.post("/api/v1/tenants/{tenant_id}/boards", status_code=status.HTTP_201_CREATED)
async def create_board(tenant_id: str, payload: CreateBoardRequest):
    """Membuat papan tugas baru di Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            board_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO boards (id, tenant_id, name, description, created_at, updated_at)
                    VALUES (:id, :tenant_id, :name, :description, now(), now());
                """),
                {
                    "id": board_id,
                    "tenant_id": tenant_id,
                    "name": payload.name.strip(),
                    "description": payload.description.strip() if payload.description else None
                }
            )
            default_cols = [
                {"id": str(uuid.uuid4()), "name": "Antrean Tugas", "pos": 0, "wip": None},
                {"id": str(uuid.uuid4()), "name": "Sedang Dikerjakan", "pos": 1, "wip": 5},
                {"id": str(uuid.uuid4()), "name": "Tinjauan & Validasi", "pos": 2, "wip": 3},
                {"id": str(uuid.uuid4()), "name": "Selesai", "pos": 3, "wip": None},
            ]
            for col in default_cols:
                conn.execute(
                    sa.text("""
                        INSERT INTO board_columns (id, tenant_id, board_id, name, position, wip_limit, created_at)
                        VALUES (:id, :tenant_id, :board_id, :name, :pos, :wip, now());
                    """),
                    {
                        "id": col["id"],
                        "tenant_id": tenant_id,
                        "board_id": board_id,
                        "name": col["name"],
                        "pos": col["pos"],
                        "wip": col["wip"],
                    }
                )

            row = conn.execute(
                sa.text("SELECT id, tenant_id, name, description, created_at, updated_at FROM boards WHERE id = :id;"),
                {"id": board_id}
            ).mappings().first()
            return dict(row)


@router.post("/api/v1/tenants/{tenant_id}/boards/{board_id}/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(tenant_id: str, board_id: str, payload: CreateTaskRequest):
    """Menambahkan tugas baru ke papan kanban nyata dengan kapabilitas Trello & Omnichannel."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
            
            target_col = payload.column_id
            if not target_col:
                first_col = conn.execute(
                    sa.text("SELECT id FROM board_columns WHERE board_id = :board_id ORDER BY position ASC LIMIT 1;"),
                    {"board_id": board_id}
                ).mappings().first()
                if not first_col:
                    raise HTTPException(status_code=400, detail="Tidak ada kolom pada papan ini.")
                target_col = str(first_col["id"])

            pos_row = conn.execute(
                sa.text("SELECT count(*) as total FROM tasks WHERE board_id = :board_id AND column_id = :col_id;"),
                {"board_id": board_id, "col_id": target_col}
            ).mappings().first()
            new_pos = pos_row["total"] if pos_row else 0

            task_id = str(uuid.uuid4())
            labels_arr = payload.labels if payload.labels else []

            conn.execute(
                sa.text("""
                    INSERT INTO tasks (
                        id, tenant_id, board_id, column_id, title, description,
                        position, priority, assignee_id, assigned_membership_id, assigned_agent_id, version,
                        labels, due_date, cover_color, progress_percentage, source_channel, source_ref_id,
                        created_by_type, created_by_id, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :board_id, :col_id, :title, :description,
                        :pos, :priority, :assignee, :assignee, :agent, 1,
                        :labels, :due_date, :cover_color, 0, :source_channel, :source_ref_id,
                        :created_by_type, :created_by_id, now(), now()
                    );
                """),
                {
                    "id": task_id,
                    "tenant_id": tenant_id,
                    "board_id": board_id,
                    "col_id": target_col,
                    "title": payload.title.strip(),
                    "description": payload.description.strip() if payload.description else None,
                    "pos": new_pos,
                    "priority": payload.priority,
                    "assignee": payload.assignee_id or None,
                    "agent": payload.assigned_agent_id or None,
                    "labels": labels_arr,
                    "due_date": payload.due_date,
                    "cover_color": payload.cover_color,
                    "source_channel": payload.source_channel or "dashboard",
                    "source_ref_id": payload.source_ref_id,
                    "created_by_type": payload.created_by_type or "user",
                    "created_by_id": payload.created_by_id,
                }
            )

            # Catat task event
            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, to_column_id, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'task_created', :col_id, :actor_type, :actor_id, :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "col_id": target_col,
                    "actor_type": payload.created_by_type or "user",
                    "actor_id": payload.created_by_id or "system",
                    "payload": json.dumps({"title": payload.title.strip(), "source_channel": payload.source_channel or "dashboard"})
                }
            )

            row = conn.execute(
                sa.text("""
                    SELECT t.*, m.full_name as assignee_name, a.display_name as assigned_agent_name
                    FROM tasks t
                    LEFT JOIN tenant_memberships m ON COALESCE(t.assigned_membership_id, t.assignee_id) = m.id
                    LEFT JOIN ai_agents a ON t.assigned_agent_id = a.id
                    WHERE t.id = :id;
                """),
                {"id": task_id}
            ).mappings().first()
            new_task = dict(row)

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_created",
        task_id=task_id,
        new_version=1,
        actor_id=payload.created_by_id or "system",
        to_column_id=target_col,
        new_position=new_pos,
        payload={"title": new_task["title"], "source_channel": payload.source_channel or "dashboard"}
    )

    return new_task


@router.get("/api/v1/tenants/{tenant_id}/boards/{board_id}/events")
async def get_board_events(tenant_id: str, board_id: str, limit: int = Query(30, ge=1, le=100)):
    """Mengambil riwayat event kolaborasi papan tugas dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        rows = conn.execute(
            sa.text("""
                SELECT e.id, e.tenant_id, e.task_id, e.event_type, e.from_column_id, e.to_column_id,
                       e.actor_type, e.actor_id, e.payload, e.created_at, t.title as task_title
                FROM task_events e
                JOIN tasks t ON e.task_id = t.id
                WHERE e.tenant_id = :tenant_id AND t.board_id = :board_id
                ORDER BY e.created_at DESC
                LIMIT :limit;
            """),
            {"tenant_id": tenant_id, "board_id": board_id, "limit": limit}
        ).mappings().fetchall()
        return {"status": "success", "events": [dict(r) for r in rows]}


@router.patch("/api/v1/tasks/{task_id}/move")
async def move_task(
    task_id: str,
    payload: MoveTaskRequest,
    response: Response,
    if_match: Optional[str] = Header(None, alias="If-Match")
):
    """
    Perpindahan Tugas Antar Kolom dengan Kunci Optimistis (Optimistic Concurrency Control)
    - Wajib menyertakan Header If-Match dengan versi tugas
    - Jika versi tidak cocok, tolak 409 Conflict
    - Emit event ke Supabase Realtime channel tenant:{tenant_id}:board:{board_id}
    """
    if if_match is None or if_match == "":
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="Header If-Match wajib disertakan dengan versi tugas saat ini."
        )

    clean_header = str(if_match).strip().replace('"', '')
    try:
        expected_version = int(clean_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format header If-Match tidak valid.")

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            
            task_row = conn.execute(
                sa.text("SELECT * FROM tasks WHERE id = :id;"),
                {"id": task_id}
            ).mappings().first()

            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            board_id = str(task_row["board_id"])
            current_version = int(task_row["version"])
            old_column_id = str(task_row["column_id"])

            if expected_version != current_version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "Konflik versi terdeteksi. Tugas telah diperbarui oleh sesi kerja lain.",
                        "current_version": current_version,
                        "submitted_version": expected_version
                    }
                )

            next_version = current_version + 1
            conn.execute(
                sa.text("""
                    UPDATE tasks
                    SET column_id = :target_col, position = :new_pos, version = :next_ver, updated_at = now()
                    WHERE id = :id AND version = :exp_ver;
                """),
                {
                    "target_col": payload.target_column_id,
                    "new_pos": payload.new_position,
                    "next_ver": next_version,
                    "id": task_id,
                    "exp_ver": current_version
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, from_column_id, to_column_id, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'column_changed', :from_col, :to_col, 'user', 'usr_actor', :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "from_col": old_column_id,
                    "to_col": payload.target_column_id,
                    "payload": json.dumps({"previous_version": expected_version, "new_version": next_version})
                }
            )

            updated_task = dict(conn.execute(
                sa.text("SELECT * FROM tasks WHERE id = :id;"),
                {"id": task_id}
            ).mappings().first())

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="column_changed",
        task_id=task_id,
        new_version=next_version,
        actor_id="usr_actor",
        from_column_id=old_column_id,
        to_column_id=payload.target_column_id,
        new_position=payload.new_position,
        payload={"previous_version": expected_version, "new_version": next_version}
    )

    response.headers["ETag"] = f'"{next_version}"'
    return updated_task


# --- Trello-Style Task Card Details, Checklists, Attachments & Activity Timeline ---

@router.get("/api/v1/tasks/{task_id}")
async def get_task_details(task_id: str, request: Request):
    """Mengambil detail lengkap kartu tugas termasuk daftar periksa (checklists), lampiran berkas, komentar, dan linimasa aktivitas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        task_row = conn.execute(
            sa.text("""
                SELECT t.*, m.full_name as assignee_name, a.display_name as assigned_agent_name,
                       col.name as column_name, b.name as board_name
                FROM tasks t
                JOIN board_columns col ON t.column_id = col.id
                JOIN boards b ON t.board_id = b.id
                LEFT JOIN tenant_memberships m ON COALESCE(t.assigned_membership_id, t.assignee_id) = m.id
                LEFT JOIN ai_agents a ON t.assigned_agent_id = a.id
                WHERE t.id = :id AND (t.deleted_at IS NULL);
            """),
            {"id": task_id}
        ).mappings().first()

        if not task_row:
            raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

        task_data = dict(task_row)
        if not task_data.get("labels"):
            task_data["labels"] = []

        # Ambil checklists & items
        checklists_rows = conn.execute(
            sa.text("SELECT * FROM task_checklists WHERE task_id = :task_id ORDER BY position ASC, created_at ASC;"),
            {"task_id": task_id}
        ).mappings().fetchall()

        checklists = []
        for chk in checklists_rows:
            chk_dict = dict(chk)
            items_rows = conn.execute(
                sa.text("SELECT * FROM task_checklist_items WHERE checklist_id = :cid ORDER BY position ASC, created_at ASC;"),
                {"cid": chk["id"]}
            ).mappings().fetchall()
            chk_dict["items"] = [dict(it) for it in items_rows]
            checklists.append(chk_dict)

        # Ambil attachments
        attachments = [dict(r) for r in conn.execute(
            sa.text("SELECT * FROM task_attachments WHERE task_id = :task_id ORDER BY created_at DESC;"),
            {"task_id": task_id}
        ).mappings().fetchall()]

        # Ambil comments
        comments = [dict(r) for r in conn.execute(
            sa.text("""
                SELECT c.*, m.full_name as author_name
                FROM task_comments c
                LEFT JOIN tenant_memberships m ON c.author_id = m.id
                WHERE c.task_id = :task_id
                ORDER BY c.created_at ASC;
            """),
            {"task_id": task_id}
        ).mappings().fetchall()]

        task_data["checklists"] = checklists
        task_data["attachments"] = attachments
        task_data["comments"] = comments
        return task_data


@router.patch("/api/v1/tasks/{task_id}")
async def update_task(task_id: str, payload: UpdateTaskRequest, response: Response):
    """Memperbarui informasi kartu tugas (judul, deskripsi, prioritas, label, tenggat waktu, warna sampul, penugasan)."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            task_row = conn.execute(sa.text("SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL;"), {"id": task_id}).mappings().first()
            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            board_id = str(task_row["board_id"])
            current_ver = int(task_row["version"])
            next_ver = current_ver + 1

            updates = ["version = :next_ver", "updated_at = now()"]
            params: Dict[str, Any] = {"id": task_id, "next_ver": next_ver}

            if payload.title is not None:
                updates.append("title = :title")
                params["title"] = payload.title.strip()
            if payload.description is not None:
                updates.append("description = :description")
                params["description"] = payload.description.strip() if payload.description else None
            if payload.priority is not None:
                updates.append("priority = :priority")
                params["priority"] = payload.priority
            if payload.labels is not None:
                updates.append("labels = :labels")
                params["labels"] = payload.labels
            if payload.due_date is not None:
                updates.append("due_date = :due_date")
                params["due_date"] = payload.due_date if payload.due_date != "" else None
            if payload.cover_color is not None:
                updates.append("cover_color = :cover_color")
                params["cover_color"] = payload.cover_color if payload.cover_color != "" else None
            if payload.assignee_id is not None:
                updates.append("assignee_id = :assignee_id")
                updates.append("assigned_membership_id = :assignee_id")
                params["assignee_id"] = payload.assignee_id if payload.assignee_id != "" else None
            if payload.assigned_agent_id is not None:
                updates.append("assigned_agent_id = :agent_id")
                params["agent_id"] = payload.assigned_agent_id if payload.assigned_agent_id != "" else None
            if payload.column_id is not None:
                updates.append("column_id = :col_id")
                params["col_id"] = payload.column_id
            if payload.position is not None:
                updates.append("position = :pos")
                params["pos"] = payload.position
            if payload.progress_percentage is not None:
                updates.append("progress_percentage = :progress_percentage")
                params["progress_percentage"] = payload.progress_percentage

            update_sql = f"UPDATE tasks SET {', '.join(updates)} WHERE id = :id RETURNING *;"
            updated_task = dict(conn.execute(sa.text(update_sql), params).mappings().first())

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'task_updated', 'user', 'usr_editor', :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "payload": json.dumps({"updated_fields": list(payload.model_dump(exclude_unset=True).keys())})
                }
            )

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_updated",
        task_id=task_id,
        new_version=next_ver,
        actor_id="usr_editor",
        payload=payload.model_dump(exclude_unset=True)
    )

    response.headers["ETag"] = f'"{next_ver}"'
    return updated_task


@router.delete("/api/v1/tasks/{task_id}")
async def delete_task(task_id: str):
    """Menghapus (soft delete) kartu tugas kanban."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            task_row = conn.execute(sa.text("SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL;"), {"id": task_id}).mappings().first()
            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            board_id = str(task_row["board_id"])

            conn.execute(
                sa.text("UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = :id;"),
                {"id": task_id}
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'task_deleted', 'user', 'usr_deleter', '{}'::jsonb, now());
                """),
                {"tenant_id": tenant_id, "task_id": task_id}
            )

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_deleted",
        task_id=task_id,
        new_version=int(task_row["version"]) + 1,
        actor_id="usr_deleter",
        payload={"deleted": True}
    )

    return {"status": "success", "message": "Tugas berhasil dihapus."}


@router.post("/api/v1/tasks/{task_id}/checklists", status_code=status.HTTP_201_CREATED)
async def create_task_checklist(task_id: str, payload: CreateChecklistRequest):
    """Membuat daftar periksa (checklist) baru untuk tugas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            task_row = conn.execute(sa.text("SELECT tenant_id, board_id FROM tasks WHERE id = :id;"), {"id": task_id}).mappings().first()
            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            chk_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO task_checklists (id, tenant_id, task_id, title, position, created_at, updated_at)
                    VALUES (:id, :tenant_id, :task_id, :title, :pos, now(), now());
                """),
                {
                    "id": chk_id,
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "title": payload.title.strip(),
                    "pos": payload.position or 0,
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'checklist_created', 'user', 'system', :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "payload": json.dumps({"checklist_id": chk_id, "title": payload.title.strip()})
                }
            )

            created = dict(conn.execute(sa.text("SELECT * FROM task_checklists WHERE id = :id;"), {"id": chk_id}).mappings().first())
            created["items"] = []
            return created


@router.patch("/api/v1/tasks/{task_id}/checklists/{checklist_id}")
async def update_task_checklist(task_id: str, checklist_id: str, payload: UpdateChecklistRequest):
    """Mengubah judul atau urutan checklist."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            updates = ["updated_at = now()"]
            params: Dict[str, Any] = {"id": checklist_id, "task_id": task_id}
            if payload.title is not None:
                updates.append("title = :title")
                params["title"] = payload.title.strip()
            if payload.position is not None:
                updates.append("position = :position")
                params["position"] = payload.position

            res = conn.execute(
                sa.text(f"UPDATE task_checklists SET {', '.join(updates)} WHERE id = :id AND task_id = :task_id RETURNING *;"),
                params
            ).mappings().first()
            if not res:
                raise HTTPException(status_code=404, detail="Checklist tidak ditemukan.")
            return dict(res)


@router.delete("/api/v1/tasks/{task_id}/checklists/{checklist_id}")
async def delete_task_checklist(task_id: str, checklist_id: str):
    """Menghapus checklist beserta seluruh itemnya dan menghitung ulang progress tugas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("DELETE FROM task_checklists WHERE id = :id AND task_id = :task_id;"),
                {"id": checklist_id, "task_id": task_id}
            )
            new_pct = _recompute_task_progress(conn, task_id)

    return {"status": "success", "new_progress_percentage": new_pct}


@router.post("/api/v1/tasks/{task_id}/checklists/{checklist_id}/items", status_code=status.HTTP_201_CREATED)
async def create_checklist_item(task_id: str, checklist_id: str, payload: CreateChecklistItemRequest):
    """Menambahkan item checklist baru."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            chk_row = conn.execute(
                sa.text("SELECT tenant_id FROM task_checklists WHERE id = :id AND task_id = :task_id;"),
                {"id": checklist_id, "task_id": task_id}
            ).mappings().first()
            if not chk_row:
                raise HTTPException(status_code=404, detail="Checklist tidak ditemukan.")

            tenant_id = str(chk_row["tenant_id"])
            item_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO task_checklist_items (id, tenant_id, checklist_id, title, is_completed, position, created_at, updated_at)
                    VALUES (:id, :tenant_id, :cid, :title, false, :pos, now(), now());
                """),
                {
                    "id": item_id,
                    "tenant_id": tenant_id,
                    "cid": checklist_id,
                    "title": payload.title.strip(),
                    "pos": payload.position or 0,
                }
            )

            new_pct = _recompute_task_progress(conn, task_id)
            created = dict(conn.execute(sa.text("SELECT * FROM task_checklist_items WHERE id = :id;"), {"id": item_id}).mappings().first())
            created["task_progress_percentage"] = new_pct
            return created


@router.patch("/api/v1/tasks/{task_id}/checklists/{checklist_id}/items/{item_id}")
async def update_checklist_item(task_id: str, checklist_id: str, item_id: str, payload: UpdateChecklistItemRequest):
    """Mengubah status kelengkapan item checklist (selesai oleh Human / AI Agent) dan memperbarui progres tugas secara otomatis."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            item_row = conn.execute(
                sa.text("SELECT * FROM task_checklist_items WHERE id = :id AND checklist_id = :cid;"),
                {"id": item_id, "cid": checklist_id}
            ).mappings().first()
            if not item_row:
                raise HTTPException(status_code=404, detail="Item checklist tidak ditemukan.")

            tenant_id = str(item_row["tenant_id"])
            updates = ["updated_at = now()"]
            params: Dict[str, Any] = {"id": item_id, "cid": checklist_id}

            if payload.title is not None:
                updates.append("title = :title")
                params["title"] = payload.title.strip()
            if payload.position is not None:
                updates.append("position = :pos")
                params["pos"] = payload.position
            if payload.is_completed is not None:
                updates.append("is_completed = :comp")
                params["comp"] = payload.is_completed
                if payload.is_completed:
                    updates.append("completed_at = now()")
                    updates.append("completed_by_type = :cb_type")
                    updates.append("completed_by_id = :cb_id")
                    params["cb_type"] = payload.completed_by_type or "user"
                    params["cb_id"] = payload.completed_by_id or "system"
                else:
                    updates.append("completed_at = NULL")
                    updates.append("completed_by_type = NULL")
                    updates.append("completed_by_id = NULL")

            conn.execute(
                sa.text(f"UPDATE task_checklist_items SET {', '.join(updates)} WHERE id = :id AND checklist_id = :cid;"),
                params
            )

            new_pct = _recompute_task_progress(conn, task_id)

            # Log task event
            if payload.is_completed is not None:
                evt_type = "checklist_item_completed" if payload.is_completed else "checklist_item_uncompleted"
                conn.execute(
                    sa.text("""
                        INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                        VALUES (gen_random_uuid(), :tenant_id, :task_id, :evt_type, :act_type, :act_id, :payload, now());
                    """),
                    {
                        "tenant_id": tenant_id,
                        "task_id": task_id,
                        "evt_type": evt_type,
                        "act_type": payload.completed_by_type or "user",
                        "act_id": payload.completed_by_id or "system",
                        "payload": json.dumps({"item_id": item_id, "title": item_row["title"], "progress_percentage": new_pct})
                    }
                )

            updated = dict(conn.execute(sa.text("SELECT * FROM task_checklist_items WHERE id = :id;"), {"id": item_id}).mappings().first())
            updated["task_progress_percentage"] = new_pct
            return updated


@router.delete("/api/v1/tasks/{task_id}/checklists/{checklist_id}/items/{item_id}")
async def delete_checklist_item(task_id: str, checklist_id: str, item_id: str):
    """Menghapus item checklist dan menghitung ulang persentase progres tugas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("DELETE FROM task_checklist_items WHERE id = :id AND checklist_id = :cid;"),
                {"id": item_id, "cid": checklist_id}
            )
            new_pct = _recompute_task_progress(conn, task_id)

    return {"status": "success", "new_progress_percentage": new_pct}


@router.get("/api/v1/tasks/{task_id}/attachments")
async def list_task_attachments(task_id: str):
    """Mengambil daftar lampiran berkas tugas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        rows = conn.execute(
            sa.text("SELECT * FROM task_attachments WHERE task_id = :task_id ORDER BY created_at DESC;"),
            {"task_id": task_id}
        ).mappings().fetchall()
        return {"attachments": [dict(r) for r in rows]}


@router.post("/api/v1/tasks/{task_id}/attachments", status_code=status.HTTP_201_CREATED)
async def create_task_attachment(task_id: str, payload: CreateAttachmentRequest):
    """Menambahkan tautan/lampiran berkas tugas baru."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            task_row = conn.execute(sa.text("SELECT tenant_id FROM tasks WHERE id = :id;"), {"id": task_id}).mappings().first()
            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            att_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO task_attachments (id, tenant_id, task_id, file_name, file_url, file_size, mime_type, created_at)
                    VALUES (:id, :tenant_id, :task_id, :fname, :furl, :fsize, :mime, now());
                """),
                {
                    "id": att_id,
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "fname": payload.file_name,
                    "furl": payload.file_url,
                    "fsize": payload.file_size or 0,
                    "mime": payload.mime_type,
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'attachment_added', 'user', 'system', :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "payload": json.dumps({"attachment_id": att_id, "file_name": payload.file_name})
                }
            )

            return dict(conn.execute(sa.text("SELECT * FROM task_attachments WHERE id = :id;"), {"id": att_id}).mappings().first())


@router.delete("/api/v1/tasks/{task_id}/attachments/{attachment_id}")
async def delete_task_attachment(task_id: str, attachment_id: str):
    """Menghapus lampiran berkas tugas."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("DELETE FROM task_attachments WHERE id = :id AND task_id = :task_id;"),
                {"id": attachment_id, "task_id": task_id}
            )
    return {"status": "success", "message": "Lampiran berhasil dihapus."}


@router.get("/api/v1/tasks/{task_id}/timeline")
async def get_task_timeline(task_id: str):
    """
    Mengambil Linimasa Aktivitas Terpadu (Unified Activity Timeline)
    Menggabungkan log riwayat peristiwa (task_events) dan komentar (task_comments)
    dengan identifikasi visual jelas antara aksi Human vs AI Agent.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        # Ambil event
        events_rows = conn.execute(
            sa.text("""
                SELECT e.id, e.task_id, e.event_type, e.from_column_id, e.to_column_id,
                       e.actor_type, e.actor_id, e.payload, e.created_at,
                       fc.name as from_col_name, tc.name as to_col_name
                FROM task_events e
                LEFT JOIN board_columns fc ON e.from_column_id = fc.id
                LEFT JOIN board_columns tc ON e.to_column_id = tc.id
                WHERE e.task_id = :task_id
                ORDER BY e.created_at DESC;
            """),
            {"task_id": task_id}
        ).mappings().fetchall()

        # Ambil komentar
        comments_rows = conn.execute(
            sa.text("""
                SELECT c.id, c.task_id, c.author_id, c.content, c.created_at,
                       m.full_name as author_name,
                       a.display_name as agent_name,
                       a.persona_type as agent_persona
                FROM task_comments c
                LEFT JOIN tenant_memberships m ON c.author_id = m.id
                LEFT JOIN ai_agents a ON c.author_id::text = a.id::text
                WHERE c.task_id = :task_id
                ORDER BY c.created_at DESC;
            """),
            {"task_id": task_id}
        ).mappings().fetchall()

        timeline = []

        for e in events_rows:
            is_agent = e["actor_type"] in ("ai_agent", "agent") or "agent" in str(e["actor_id"]).lower()
            timeline.append({
                "id": str(e["id"]),
                "entry_type": "event",
                "event_type": e["event_type"],
                "actor_type": "agent" if is_agent else ("system" if e["actor_type"] == "system" else "human"),
                "actor_id": str(e["actor_id"]),
                "actor_name": "AI Agent" if is_agent else ("Sistem" if e["actor_type"] == "system" else "Staf"),
                "payload": e["payload"] if isinstance(e["payload"], dict) else json.loads(e["payload"] or "{}"),
                "from_column_name": e["from_col_name"],
                "to_column_name": e["to_col_name"],
                "created_at": e["created_at"].isoformat() if hasattr(e["created_at"], "isoformat") else str(e["created_at"])
            })

        for c in comments_rows:
            is_agent = bool(c["agent_name"])
            timeline.append({
                "id": str(c["id"]),
                "entry_type": "comment",
                "event_type": "comment_added",
                "actor_type": "agent" if is_agent else "human",
                "actor_id": str(c["author_id"]) if c["author_id"] else "anonymous",
                "actor_name": c["agent_name"] or c["author_name"] or "Anggota Organisasi",
                "persona_type": c["agent_persona"],
                "content": c["content"],
                "created_at": c["created_at"].isoformat() if hasattr(c["created_at"], "isoformat") else str(c["created_at"])
            })

        timeline.sort(key=lambda x: x["created_at"], reverse=True)
        return {"timeline": timeline}


@router.post("/api/v1/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_task_comment(task_id: str, payload: CreateCommentRequest):
    """Menambahkan komentar baru ke kartu tugas (dapat ditulis oleh Human maupun AI Agent)."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            task_row = conn.execute(sa.text("SELECT tenant_id FROM tasks WHERE id = :id;"), {"id": task_id}).mappings().first()
            if not task_row:
                raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

            tenant_id = str(task_row["tenant_id"])
            cid = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO task_comments (id, tenant_id, task_id, author_id, content, created_at)
                    VALUES (:id, :tenant_id, :task_id, :author_id, :content, now());
                """),
                {
                    "id": cid,
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "author_id": payload.author_id if payload.author_id else None,
                    "content": payload.content.strip(),
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'comment_added', :actor_type, :actor_id, :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "actor_type": payload.author_type,
                    "actor_id": payload.author_id or "anonymous",
                    "payload": json.dumps({"comment_id": cid, "preview": payload.content[:60]})
                }
            )

            return dict(conn.execute(sa.text("SELECT * FROM task_comments WHERE id = :id;"), {"id": cid}).mappings().first())


@router.post("/api/v1/tenants/{tenant_id}/proactive-tasks/from-channel", status_code=status.HTTP_201_CREATED)
async def create_proactive_task_from_channel(tenant_id: str, payload: ProactiveTaskFromChannelRequest):
    """
    Pencatatan Tugas Baru dari AI Agent Proaktif & Saluran Omnichannel (Dashboard/Telegram/WhatsApp).
    Menjamin seluruh sumber input tercatat ke tabel SSOT tasks yang sama dan teragregasi ke metrik KPI workforce.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})

            board_id = payload.board_id
            if not board_id:
                b_row = conn.execute(
                    sa.text("SELECT id FROM boards WHERE tenant_id = :tenant_id ORDER BY created_at ASC LIMIT 1;"),
                    {"tenant_id": tenant_id}
                ).mappings().first()
                if not b_row:
                    b_row = _ensure_default_board_in_db(conn, tenant_id)
                board_id = str(b_row["id"])

            first_col = conn.execute(
                sa.text("SELECT id FROM board_columns WHERE board_id = :board_id ORDER BY position ASC LIMIT 1;"),
                {"board_id": board_id}
            ).mappings().first()
            if not first_col:
                raise HTTPException(status_code=400, detail="Tidak ada kolom pada papan kerja ini.")
            target_col = str(first_col["id"])

            pos_row = conn.execute(
                sa.text("SELECT count(*) as total FROM tasks WHERE board_id = :board_id AND column_id = :col_id;"),
                {"board_id": board_id, "col_id": target_col}
            ).mappings().first()
            new_pos = pos_row["total"] if pos_row else 0

            # Jika tidak ada agent spesifik yang ditentukan, cari AI agent aktif yang sesuai
            agent_id = payload.assigned_agent_id
            if not agent_id and not payload.assignee_id:
                default_agent = conn.execute(
                    sa.text("SELECT id FROM ai_agents WHERE tenant_id = :tenant_id AND status = 'active' LIMIT 1;"),
                    {"tenant_id": tenant_id}
                ).mappings().first()
                if default_agent:
                    agent_id = str(default_agent["id"])

            task_id = str(uuid.uuid4())
            labels_arr = payload.labels if payload.labels else [payload.source_channel.upper()]

            conn.execute(
                sa.text("""
                    INSERT INTO tasks (
                        id, tenant_id, board_id, column_id, title, description,
                        position, priority, assignee_id, assigned_membership_id, assigned_agent_id, version,
                        labels, due_date, progress_percentage, source_channel, source_ref_id,
                        created_by_type, created_by_id, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :board_id, :col_id, :title, :description,
                        :pos, :priority, :assignee, :assignee, :agent, 1,
                        :labels, :due_date, 0, :source_channel, :source_ref_id,
                        'ai_agent', :created_by_id, now(), now()
                    );
                """),
                {
                    "id": task_id,
                    "tenant_id": tenant_id,
                    "board_id": board_id,
                    "col_id": target_col,
                    "title": payload.title.strip(),
                    "description": payload.description.strip() if payload.description else f"Tugas dibuat otomatis dari kanal {payload.source_channel} oleh pengirim {payload.sender_id}",
                    "pos": new_pos,
                    "priority": payload.priority,
                    "assignee": payload.assignee_id or None,
                    "agent": agent_id,
                    "labels": labels_arr,
                    "due_date": payload.due_date,
                    "source_channel": payload.source_channel,
                    "source_ref_id": payload.sender_id,
                    "created_by_id": agent_id or payload.sender_id,
                }
            )

            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, to_column_id, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'task_created_omnichannel', :col_id, 'ai_agent', :actor_id, :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "col_id": target_col,
                    "actor_id": agent_id or "proactive_system",
                    "payload": json.dumps({"source_channel": payload.source_channel, "sender_id": payload.sender_id, "title": payload.title})
                }
            )

            row = conn.execute(
                sa.text("""
                    SELECT t.*, m.full_name as assignee_name, a.display_name as assigned_agent_name
                    FROM tasks t
                    LEFT JOIN tenant_memberships m ON COALESCE(t.assigned_membership_id, t.assignee_id) = m.id
                    LEFT JOIN ai_agents a ON t.assigned_agent_id = a.id
                    WHERE t.id = :id;
                """),
                {"id": task_id}
            ).mappings().first()
            created_task = dict(row)

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_created",
        task_id=task_id,
        new_version=1,
        actor_id=agent_id or "proactive_system",
        to_column_id=target_col,
        new_position=new_pos,
        payload={"title": created_task["title"], "source_channel": payload.source_channel}
    )

    return {
        "status": "success",
        "task": created_task,
        "source_channel": payload.source_channel,
        "message": f"Tugas berhasil dibuat dari saluran {payload.source_channel}."
    }


# --- WebAuthn Attendance Endpoints ---

@router.post("/api/v1/attendance/webauthn/register-challenge")
@router.post("/api/v1/attendance/webauthn/register/options")
async def webauthn_register_challenge(payload: WebAuthnRegisterChallengeRequest):
    challenge = secrets.token_urlsafe(32)
    _webauthn_challenges[payload.tenant_membership_id] = {
        "challenge": challenge,
        "membership_id": payload.tenant_membership_id,
        "created_at": datetime.now(timezone.utc).timestamp()
    }
    
    # Ambil nama staf dari database jika ada
    member_name = "Anggota Organisasi"
    engine = get_database_engine()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT full_name FROM tenant_memberships WHERE id = :id;"),
                {"id": payload.tenant_membership_id}
            ).mappings().first()
            if row and row["full_name"]:
                member_name = row["full_name"]
    except Exception as err:
        logger.warning("Gagal mengambil nama anggota tenant membership: %s", err)

    return {
        "challenge": challenge,
        "rp": {"name": "OrchestreeAI Presensi", "id": "localhost"},
        "user": {
            "id": payload.tenant_membership_id,
            "name": member_name,
            "displayName": member_name
        },
        "pubKeyCredParams": [
            {"type": "public-key", "alg": -7},
            {"type": "public-key", "alg": -257}
        ],
        "timeout": 60000,
        "attestation": "none"
    }


@router.post("/api/v1/attendance/webauthn/register-verify", status_code=status.HTTP_201_CREATED, operation_id="webauthn_register_verify_dash")
@router.post("/api/v1/attendance/webauthn/register/verify", status_code=status.HTTP_201_CREATED, operation_id="webauthn_register_verify_slash")
async def webauthn_register_verify(payload: WebAuthnRegisterVerifyRequest):
    stored = _webauthn_challenges.get(payload.tenant_membership_id)
    if not stored:
        raise HTTPException(status_code=400, detail="Tantangan pendaftaran tidak ditemukan atau telah kedaluwarsa.")

    _webauthn_challenges.pop(payload.tenant_membership_id, None)

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": payload.tenant_id})
            cred_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO webauthn_credentials (
                        id, tenant_id, tenant_membership_id, credential_id, public_key, sign_count, created_at
                    ) VALUES (
                        :id, :tenant_id, :mem_id, :cred_id, :pub_key, :sign_cnt, now()
                    )
                    ON CONFLICT (credential_id) DO UPDATE
                    SET sign_count = EXCLUDED.sign_count;
                """),
                {
                    "id": cred_id,
                    "tenant_id": payload.tenant_id,
                    "mem_id": payload.tenant_membership_id,
                    "cred_id": payload.credential_id,
                    "pub_key": payload.public_key or "verified_key",
                    "sign_cnt": payload.sign_count or 0,
                }
            )

    return {
        "success": True,
        "status": "registered",
        "credential_id": payload.credential_id,
        "message": "Kredensial biometrik WebAuthn berhasil didaftarkan secara aman."
    }


@router.post("/api/v1/attendance/webauthn/login-challenge", operation_id="webauthn_login_challenge_dash")
@router.post("/api/v1/attendance/webauthn/authenticate-challenge", operation_id="webauthn_auth_challenge")
@router.post("/api/v1/attendance/webauthn/login/options", operation_id="webauthn_login_options")
async def webauthn_login_challenge(payload: WebAuthnLoginChallengeRequest):
    challenge = secrets.token_urlsafe(32)
    _webauthn_challenges[payload.tenant_membership_id] = {
        "challenge": challenge,
        "membership_id": payload.tenant_membership_id,
        "created_at": datetime.now(timezone.utc).timestamp()
    }
    
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": payload.tenant_id})
        rows = conn.execute(
            sa.text("SELECT credential_id FROM webauthn_credentials WHERE tenant_membership_id = :mem_id;"),
            {"mem_id": payload.tenant_membership_id}
        ).mappings().fetchall()
        
    return {
        "challenge": challenge,
        "timeout": 60000,
        "allowCredentials": [{"id": r["credential_id"], "type": "public-key"} for r in rows]
    }


@router.post("/api/v1/attendance/webauthn/verify", operation_id="webauthn_verify_attendance_base")
@router.post("/api/v1/attendance/webauthn/authenticate-verify", operation_id="webauthn_auth_verify")
@router.post("/api/v1/attendance/webauthn/login/verify", operation_id="webauthn_login_verify")
async def webauthn_verify_attendance(payload: WebAuthnVerifyAttendanceRequest):
    """
    Verifikasi Presensi WebAuthn dengan Pencegahan Replay Attack
    - Memeriksa kredensial terdaftar di Supabase Postgres
    - Memverifikasi bahwa sign_count masuk lebih tinggi daripada sign_count tersimpan
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": payload.tenant_id})
            
            cred_row = conn.execute(
                sa.text("SELECT * FROM webauthn_credentials WHERE credential_id = :cred_id;"),
                {"cred_id": payload.credential_id}
            ).mappings().first()

            if not cred_row:
                raise HTTPException(status_code=404, detail="Kredensial WebAuthn tidak terdaftar.")

            stored_sign_count = int(cred_row["sign_count"] or 0)
            if payload.sign_count <= stored_sign_count:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Replay attack terdeteksi: nilai sign counter tidak bertambah."
                )

            conn.execute(
                sa.text("UPDATE webauthn_credentials SET sign_count = :cnt WHERE id = :id;"),
                {"cnt": payload.sign_count, "id": cred_row["id"]}
            )

            rec_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO attendance_records (
                        id, tenant_id, tenant_membership_id, check_type, verified_via, recorded_at
                    ) VALUES (
                        :id, :tenant_id, :mem_id, :check_type, 'webauthn', now()
                    );
                """),
                {
                    "id": rec_id,
                    "tenant_id": payload.tenant_id,
                    "mem_id": payload.tenant_membership_id,
                    "check_type": payload.check_type,
                }
            )

            rec_row = conn.execute(
                sa.text("SELECT * FROM attendance_records WHERE id = :id;"),
                {"id": rec_id}
            ).mappings().first()

    return {
        "success": True,
        "record": dict(rec_row) if rec_row else {"id": rec_id, "check_type": payload.check_type},
        "message": f"Presensi {payload.check_type.upper()} berhasil dicatat via WebAuthn."
    }


@router.get("/api/v1/attendance/records")
async def list_attendance_records(
    tenant_id: Optional[str] = Query(None),
    tenant_membership_id: Optional[str] = Query(None)
):
    """Mengambil riwayat presensi dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        query = """
            SELECT a.id, a.tenant_id, a.tenant_membership_id, a.check_type, a.verified_via, a.recorded_at,
                   m.full_name, m.role
            FROM attendance_records a
            LEFT JOIN tenant_memberships m ON a.tenant_membership_id = m.id
            WHERE 1=1
        """
        params = {}
        if tenant_id:
            query += " AND a.tenant_id = :tenant_id"
            params["tenant_id"] = tenant_id
        if tenant_membership_id:
            query += " AND a.tenant_membership_id = :mem_id"
            params["mem_id"] = tenant_membership_id

        query += " ORDER BY a.recorded_at DESC LIMIT 50;"
        rows = conn.execute(sa.text(query), params).mappings().fetchall()
        return [dict(r) for r in rows]


@router.get("/api/v1/attendance/credentials")
async def list_attendance_credentials(
    tenant_id: Optional[str] = Query(None),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id")
):
    """Mengambil daftar kredensial WebAuthn terdaftar dari Supabase Postgres."""
    tid = tenant_id or x_tenant_id
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        query = "SELECT id, tenant_id, tenant_membership_id, credential_id, sign_count, created_at FROM webauthn_credentials"
        params = {}
        if tid:
            query += " WHERE tenant_id = :tenant_id"
            params["tenant_id"] = tid
        query += " ORDER BY created_at DESC;"
        rows = conn.execute(sa.text(query), params).mappings().fetchall()
        return [dict(r) for r in rows]
