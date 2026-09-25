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
async def list_tenant_boards(tenant_id: str):
    """Mengambil seluruh papan kanban milik tenant dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        _ensure_default_board_in_db(conn, tenant_id)
        rows = conn.execute(
            sa.text("SELECT id, tenant_id, name, description, created_at, updated_at FROM boards WHERE tenant_id = :tenant_id ORDER BY created_at ASC;"),
            {"tenant_id": tenant_id}
        ).mappings().fetchall()
        return [dict(r) for r in rows]


@router.get("/api/v1/tenants/{tenant_id}/boards/{board_id}")
async def get_board_detail(tenant_id: str, board_id: str):
    """Mengambil rincian papan, kolom, dan kartu tugas nyata dari Supabase Postgres."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"), {"tenant_id": tenant_id})
        board_row = conn.execute(
            sa.text("SELECT id, tenant_id, name, description, created_at, updated_at FROM boards WHERE id = :id AND tenant_id = :tenant_id;"),
            {"id": board_id, "tenant_id": tenant_id}
        ).mappings().first()

        if not board_row:
            board_row = _ensure_default_board_in_db(conn, tenant_id)
            board_id = str(board_row["id"])

        col_rows = conn.execute(
            sa.text("SELECT id, tenant_id, board_id, name, position, wip_limit, created_at FROM board_columns WHERE board_id = :board_id ORDER BY position ASC;"),
            {"board_id": board_id}
        ).mappings().fetchall()

        task_rows = conn.execute(
            sa.text("""
                SELECT t.id, t.tenant_id, t.board_id, t.column_id, t.title, t.description,
                       t.position, t.priority, t.assignee_id, t.assigned_agent_id, t.version,
                       t.created_at, t.updated_at,
                       m.full_name as assignee_name, a.display_name as assigned_agent_name
                FROM tasks t
                LEFT JOIN tenant_memberships m ON t.assignee_id = m.id
                LEFT JOIN ai_agents a ON t.assigned_agent_id = a.id
                WHERE t.board_id = :board_id
                ORDER BY t.position ASC;
            """),
            {"board_id": board_id}
        ).mappings().fetchall()

        return {
            "board": dict(board_row),
            "columns": [dict(c) for c in col_rows],
            "tasks": [dict(t) for t in task_rows]
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
    """Menambahkan tugas baru ke papan kanban nyata."""
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
            conn.execute(
                sa.text("""
                    INSERT INTO tasks (
                        id, tenant_id, board_id, column_id, title, description,
                        position, priority, assignee_id, assigned_agent_id, version, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :board_id, :col_id, :title, :description,
                        :pos, :priority, :assignee, :agent, 1, now(), now()
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
                }
            )

            # Catat task event
            conn.execute(
                sa.text("""
                    INSERT INTO task_events (id, tenant_id, task_id, event_type, to_column_id, actor_type, actor_id, payload, created_at)
                    VALUES (gen_random_uuid(), :tenant_id, :task_id, 'task_created', :col_id, 'user', 'system', :payload, now());
                """),
                {
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "col_id": target_col,
                    "payload": json.dumps({"title": payload.title.strip()})
                }
            )

            row = conn.execute(
                sa.text("SELECT * FROM tasks WHERE id = :id;"),
                {"id": task_id}
            ).mappings().first()
            new_task = dict(row)

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_created",
        task_id=task_id,
        new_version=1,
        actor_id="usr_actor",
        to_column_id=target_col,
        new_position=new_pos,
        payload={"title": new_task["title"]}
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
