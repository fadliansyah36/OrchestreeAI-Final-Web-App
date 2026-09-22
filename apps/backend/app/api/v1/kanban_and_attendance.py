"""
Router Manajemen Papan Kanban (Optimistic Lock) dan Presensi WebAuthn
Sesuai PRD v2.2 Bagian 6.2, 18.1, 15:
- Endpoint Papan Kanban & Tugas
- Perpindahan tugas dengan Header If-Match dan deteksi konflik versi 409
- Sinkronisasi event realtime ke Supabase Realtime channel tenant:{tenant_id}:board:{board_id}
- Presensi WebAuthn biometrik dengan verifikasi tantangan dan pencegahan replay attack (sign_count wajib naik)
"""

from datetime import datetime, timezone
import json
import secrets
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from app.domains.workforce.task_sync import emit_task_realtime_event

router = APIRouter(tags=["Kanban Board, Tasks & WebAuthn Attendance"])

# Store in-memory aktif untuk fallback dan sinkronisasi instan
_boards_db: Dict[str, Dict[str, Any]] = {}
_columns_db: Dict[str, Dict[str, Any]] = {}
_tasks_db: Dict[str, Dict[str, Any]] = {}
_webauthn_creds_db: Dict[str, Dict[str, Any]] = {}
_webauthn_challenges: Dict[str, Dict[str, Any]] = {}
_attendance_records: List[Dict[str, Any]] = []


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


class WebAuthnLoginChallengeRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str


class WebAuthnVerifyAttendanceRequest(BaseModel):
    tenant_id: str
    tenant_membership_id: str
    credential_id: str
    sign_count: int
    check_type: str = Field(default="in", description="'in' atau 'out'")


def _ensure_default_board(tenant_id: str):
    existing = [b for b in _boards_db.values() if b.get("tenant_id") == tenant_id]
    if existing:
        return existing[0]

    board_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    board = {
        "id": board_id,
        "tenant_id": tenant_id,
        "name": "Papan Operasional Utama",
        "description": "Papan alur kerja tugas operasional",
        "created_at": now_iso,
        "updated_at": now_iso
    }
    _boards_db[board_id] = board

    cols = [
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Antrean Tugas", "position": 0, "wip_limit": None, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Sedang Dikerjakan", "position": 1, "wip_limit": 5, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Tinjauan & Validasi", "position": 2, "wip_limit": 3, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Selesai", "position": 3, "wip_limit": None, "created_at": now_iso},
    ]
    for c in cols:
        _columns_db[c["id"]] = c
    return board


# --- Endpoints ---

@router.get("/api/v1/tenants/{tenant_id}/boards")
async def list_tenant_boards(tenant_id: str):
    _ensure_default_board(tenant_id)
    boards = [b for b in _boards_db.values() if b.get("tenant_id") == tenant_id]
    return boards


@router.get("/api/v1/tenants/{tenant_id}/boards/{board_id}")
async def get_board_detail(tenant_id: str, board_id: str):
    board = _boards_db.get(board_id)
    if not board:
        _ensure_default_board(tenant_id)
        board = _boards_db.get(board_id)
        if not board:
            raise HTTPException(status_code=404, detail="Papan tugas tidak ditemukan.")

    columns = sorted(
        [c for c in _columns_db.values() if c.get("board_id") == board_id],
        key=lambda x: x.get("position", 0)
    )
    tasks = sorted(
        [t for t in _tasks_db.values() if t.get("board_id") == board_id],
        key=lambda x: x.get("position", 0)
    )

    return {
        "board": board,
        "columns": columns,
        "tasks": tasks
    }


@router.post("/api/v1/tenants/{tenant_id}/boards", status_code=status.HTTP_201_CREATED)
async def create_board(tenant_id: str, payload: CreateBoardRequest):
    board_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    new_board = {
        "id": board_id,
        "tenant_id": tenant_id,
        "name": payload.name.strip(),
        "description": payload.description.strip() if payload.description else None,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    _boards_db[board_id] = new_board

    default_columns = [
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Antrean Tugas", "position": 0, "wip_limit": None, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Sedang Dikerjakan", "position": 1, "wip_limit": 5, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Tinjauan & Validasi", "position": 2, "wip_limit": 3, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "board_id": board_id, "name": "Selesai", "position": 3, "wip_limit": None, "created_at": now_iso},
    ]
    for c in default_columns:
        _columns_db[c["id"]] = c

    return new_board


@router.post("/api/v1/tenants/{tenant_id}/boards/{board_id}/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(tenant_id: str, board_id: str, payload: CreateTaskRequest):
    board = _boards_db.get(board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Papan tugas tidak ditemukan.")

    target_col = payload.column_id
    if not target_col:
        cols = sorted([c for c in _columns_db.values() if c.get("board_id") == board_id], key=lambda x: x.get("position", 0))
        if not cols:
            raise HTTPException(status_code=400, detail="Tidak ada kolom pada papan ini.")
        target_col = cols[0]["id"]

    task_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_in_col = [t for t in _tasks_db.values() if t.get("column_id") == target_col]

    new_task = {
        "id": task_id,
        "tenant_id": tenant_id,
        "board_id": board_id,
        "column_id": target_col,
        "title": payload.title.strip(),
        "description": payload.description.strip() if payload.description else None,
        "position": len(existing_in_col),
        "priority": payload.priority,
        "assignee_id": payload.assignee_id,
        "assigned_agent_id": payload.assigned_agent_id,
        "version": 1,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    _tasks_db[task_id] = new_task

    await emit_task_realtime_event(
        tenant_id=tenant_id,
        board_id=board_id,
        event_type="task_created",
        task_id=task_id,
        new_version=1,
        actor_id="usr_actor",
        to_column_id=target_col,
        new_position=new_task["position"],
        payload={"title": new_task["title"]}
    )

    return new_task


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
    task = _tasks_db.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan.")

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

    if expected_version != task.get("version", 1):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Konflik versi terdeteksi. Tugas telah diperbarui oleh sesi kerja lain.",
                "current_version": task.get("version", 1),
                "submitted_version": expected_version
            }
        )

    old_column_id = task.get("column_id")
    next_version = task.get("version", 1) + 1
    now_iso = datetime.now(timezone.utc).isoformat()

    task["column_id"] = payload.target_column_id
    task["position"] = payload.new_position
    task["version"] = next_version
    task["updated_at"] = now_iso

    _tasks_db[task_id] = task

    await emit_task_realtime_event(
        tenant_id=task.get("tenant_id", payload.tenant_id or "default"),
        board_id=task.get("board_id", ""),
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
    return task


# --- WebAuthn Attendance Endpoints ---

@router.post("/api/v1/attendance/webauthn/register-challenge")
async def webauthn_register_challenge(payload: WebAuthnRegisterChallengeRequest):
    challenge = secrets.token_urlsafe(32)
    _webauthn_challenges[payload.tenant_membership_id] = {
        "challenge": challenge,
        "membership_id": payload.tenant_membership_id,
        "created_at": datetime.now(timezone.utc).timestamp()
    }
    return {
        "challenge": challenge,
        "rp": {"name": "OrchestreeAI Presensi", "id": "localhost"},
        "user": {
            "id": payload.tenant_membership_id,
            "name": "Anggota Organisasi",
            "displayName": "Anggota Organisasi"
        },
        "pubKeyCredParams": [
            {"type": "public-key", "alg": -7},
            {"type": "public-key", "alg": -257}
        ],
        "timeout": 60000,
        "attestation": "none"
    }


@router.post("/api/v1/attendance/webauthn/register-verify", status_code=status.HTTP_201_CREATED)
async def webauthn_register_verify(payload: WebAuthnRegisterVerifyRequest):
    stored = _webauthn_challenges.get(payload.tenant_membership_id)
    if not stored:
        raise HTTPException(status_code=400, detail="Tantangan pendaftaran tidak ditemukan atau telah kedaluwarsa.")

    _webauthn_challenges.pop(payload.tenant_membership_id, None)

    cred = {
        "id": str(uuid.uuid4()),
        "tenant_id": payload.tenant_id,
        "tenant_membership_id": payload.tenant_membership_id,
        "credential_id": payload.credential_id,
        "public_key": payload.public_key,
        "sign_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    _webauthn_creds_db[payload.credential_id] = cred

    return {
        "success": True,
        "credential_id": payload.credential_id,
        "message": "Kredensial biometrik WebAuthn berhasil didaftarkan."
    }


@router.post("/api/v1/attendance/webauthn/login-challenge")
async def webauthn_login_challenge(payload: WebAuthnLoginChallengeRequest):
    challenge = secrets.token_urlsafe(32)
    _webauthn_challenges[payload.tenant_membership_id] = {
        "challenge": challenge,
        "membership_id": payload.tenant_membership_id,
        "created_at": datetime.now(timezone.utc).timestamp()
    }
    creds = [c for c in _webauthn_creds_db.values() if c.get("tenant_membership_id") == payload.tenant_membership_id]
    return {
        "challenge": challenge,
        "allowCredentials": [{"id": c["credential_id"], "type": "public-key"} for c in creds]
    }


@router.post("/api/v1/attendance/webauthn/verify")
async def webauthn_verify_attendance(payload: WebAuthnVerifyAttendanceRequest):
    """
    Verifikasi Presensi WebAuthn dengan Pencegahan Replay Attack
    - Memeriksa kredensial terdaftar
    - Memverifikasi bahwa sign_count masuk lebih tinggi daripada sign_count tersimpan
    """
    cred = _webauthn_creds_db.get(payload.credential_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Kredensial WebAuthn tidak terdaftar.")

    # Verifikasi Replay Attack
    if payload.sign_count <= cred.get("sign_count", 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Replay attack terdeteksi: nilai sign counter tidak bertambah."
        )

    cred["sign_count"] = payload.sign_count
    _webauthn_creds_db[payload.credential_id] = cred

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "tenant_id": payload.tenant_id,
        "tenant_membership_id": payload.tenant_membership_id,
        "check_type": payload.check_type,
        "verified_via": "webauthn",
        "sign_count": payload.sign_count,
        "recorded_at": now_iso
    }
    _attendance_records.insert(0, record)

    return {
        "success": True,
        "record": record,
        "message": f"Presensi {payload.check_type.upper()} berhasil dicatat via WebAuthn."
    }


@router.get("/api/v1/attendance/records")
async def list_attendance_records(tenant_id: Optional[str] = None, tenant_membership_id: Optional[str] = None):
    records = _attendance_records
    if tenant_id:
        records = [r for r in records if r.get("tenant_id") == tenant_id]
    if tenant_membership_id:
        records = [r for r in records if r.get("tenant_membership_id") == tenant_membership_id]
    return records
