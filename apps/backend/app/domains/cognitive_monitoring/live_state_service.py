"""
Layanan State Live Agen AI & Pemantauan Kognitif (PRD v2.2 Bagian 25.2, 8.1 & 18).
Mengelola persistensi state berjalan, detak heartbeat, pembersihan entri stale (>90 detik),
serta penegakan privasi operasional mutlak tanpa kebocoran konten prompt/output bisnis.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
import uuid
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import get_database_engine
from app.domains.cognitive_monitoring.realtime_broadcaster import get_realtime_broadcaster

logger = logging.getLogger("orchestree.cognitive_monitoring.live_state")

ALLOWED_STATUSES = {
    "idle",
    "thinking",
    "calling_tool",
    "generating_image",
    "retrieving_memory",
    "waiting_approval",
    "error",
    "completed",
}


def sanitize_step_label(raw_label: Optional[str], node_type: Optional[str] = None, tool_name: Optional[str] = None) -> str:
    """
    Penegakan Privasi Mutlak (PRD v2.2 Bagian 25.2):
    Memastikan current_step_label murni deskripsi generik operasional tanpa potongan teks prompt,
    isi memori, atau data transaksi pengguna/tenant.
    """
    if tool_name:
        sanitized_tool = str(tool_name).strip().split("(")[0].strip()
        if "img" in sanitized_tool.lower() or "image" in sanitized_tool.lower():
            return "Menghasilkan gambar via AI Engine"
        if "mem" in sanitized_tool.lower() or "memory" in sanitized_tool.lower():
            return "Mengambil konteks memori organisasi"
        return f"Memanggil tool: {sanitized_tool}"

    type_to_label = {
        "LLM_GENERATE": "Sintesis kognitif & penalaran konteks",
        "TOOL_CALL": "Mengeksekusi tool sistem",
        "HUMAN_APPROVAL": "Menunggu persetujuan manusia",
        "CLASSIFY": "Analisis klasifikasi intent tugas",
        "PLAN": "Penyusunan rencana eksekusi multi-langkah",
        "PERSONA_HANDOFF": "Alih tugas antar persona agen",
        "DELIVER": "Penyampaian hasil akhir eksekusi",
        "SELECTION_READ": "Membaca sumber kandidat data",
        "SELECTION_UNDERSTAND": "Pemahaman semantik kriteria seleksi",
        "SELECTION_VALIDATE": "Validasi integritas data kandidat",
        "SELECTION_SELECT": "Penyaringan awal kandidat terpilih",
        "SELECTION_SCORE": "Kalkulasi skor multi-dimensi",
        "SELECTION_RANK": "Peringkat dan perankingan cerdas",
        "SELECTION_ANALYZE": "Analisis komparatif kualitatif",
        "SELECTION_VISUALIZE": "Generasi matriks diagram seleksi",
        "SELECTION_RECOMMEND": "Sintesis rekomendasi keputusan",
        "SELECTION_RESULT": "Konsolidasi hasil seleksi data",
    }

    if node_type and node_type.upper() in type_to_label:
        return type_to_label[node_type.upper()]

    if raw_label:
        # Hapus interpolasi kalimat panjang atau karakter rentan
        cleaned = raw_label.strip()
        # Jika label mengandung petunjuk prompt atau kutipan teks panjang, ganti dengan generik
        if any(marker in cleaned.lower() for marker in ["prompt", "input:", "text:", "query:", "hasil:", "response:"]):
            return "Pemrosesan kognitif berlangsung"
        if len(cleaned) > 80:
            return cleaned[:77] + "..."
        return cleaned

    return "Sedang memproses instruksi"


def ensure_live_state_table(conn: sa.Connection) -> None:
    """Memastikan tabel ai_agent_live_state dan indeks pendukung telah terdefinisi."""
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_agent_live_state (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            ai_agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
            workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
            current_status text NOT NULL CHECK (current_status IN (
                'idle', 'thinking', 'calling_tool', 'generating_image',
                'retrieving_memory', 'waiting_approval', 'error', 'completed'
            )),
            current_step_label text NOT NULL,
            current_tool_name text,
            confidence_score numeric(5,2),
            source_channel text DEFAULT 'internal',
            started_at timestamptz NOT NULL DEFAULT now(),
            last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_ai_agent_workflow_execution UNIQUE (ai_agent_id, workflow_execution_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_tenant ON ai_agent_live_state(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_agent ON ai_agent_live_state(ai_agent_id);
        CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_status ON ai_agent_live_state(current_status);
        CREATE INDEX IF NOT EXISTS idx_ai_agent_live_state_heartbeat ON ai_agent_live_state(last_heartbeat_at);
    """))


async def upsert_live_state(
    tenant_id: str,
    ai_agent_id: str,
    workflow_execution_id: Optional[str],
    current_status: str,
    current_step_label: str,
    current_tool_name: Optional[str] = None,
    confidence_score: Optional[float] = None,
    source_channel: str = "internal",
) -> Dict[str, Any]:
    """
    Membuat atau memperbarui state berjalan live agen AI secara real-time.
    Dipanggil dari hook on_node_started() atau transisi status OrchestrationEngine.
    """
    if current_status not in ALLOWED_STATUSES:
        current_status = "thinking"

    sanitized_label = sanitize_step_label(current_step_label, tool_name=current_tool_name)
    now_dt = datetime.now(timezone.utc)

    engine = get_database_engine()
    with engine.begin() as conn:
        ensure_live_state_table(conn)

        stmt = sa.text("""
            INSERT INTO ai_agent_live_state (
                tenant_id, ai_agent_id, workflow_execution_id,
                current_status, current_step_label, current_tool_name,
                confidence_score, source_channel, started_at, last_heartbeat_at
            )
            VALUES (
                :tenant_id, :ai_agent_id, :workflow_execution_id,
                :current_status, :current_step_label, :current_tool_name,
                :confidence_score, :source_channel, :started_at, :last_heartbeat_at
            )
            ON CONFLICT (ai_agent_id, workflow_execution_id)
            DO UPDATE SET
                current_status = EXCLUDED.current_status,
                current_step_label = EXCLUDED.current_step_label,
                current_tool_name = EXCLUDED.current_tool_name,
                confidence_score = COALESCE(EXCLUDED.confidence_score, ai_agent_live_state.confidence_score),
                source_channel = EXCLUDED.source_channel,
                last_heartbeat_at = EXCLUDED.last_heartbeat_at
            RETURNING id, tenant_id, ai_agent_id, workflow_execution_id,
                      current_status, current_step_label, current_tool_name,
                      confidence_score, source_channel, started_at, last_heartbeat_at;
        """)

        row = conn.execute(stmt, {
            "tenant_id": tenant_id,
            "ai_agent_id": ai_agent_id,
            "workflow_execution_id": workflow_execution_id,
            "current_status": current_status,
            "current_step_label": sanitized_label,
            "current_tool_name": current_tool_name,
            "confidence_score": Decimal(str(confidence_score)) if confidence_score is not None else None,
            "source_channel": source_channel or "internal",
            "started_at": now_dt,
            "last_heartbeat_at": now_dt,
        }).mappings().first()

        result = dict(row) if row else {}

    # Publikasikan ke WebSocket Realtime channel
    broadcaster = get_realtime_broadcaster()
    await broadcaster.publish("platform:ai-agent-live", {
        "event": "state_update",
        "tenant_id": tenant_id,
        "ai_agent_id": ai_agent_id,
        "workflow_execution_id": workflow_execution_id,
        "current_status": current_status,
        "current_step_label": sanitized_label,
        "current_tool_name": current_tool_name,
        "confidence_score": float(confidence_score) if confidence_score else None,
        "source_channel": source_channel,
        "last_heartbeat_at": now_dt.isoformat(),
    })

    return result


async def touch_heartbeat(workflow_execution_id: str) -> bool:
    """
    Memperbarui timestamp last_heartbeat_at untuk eksekusi berdurasi panjang.
    Mencegah agen ditandai stale/hang saat memproses generasi gambar atau tool lambat.
    """
    now_dt = datetime.now(timezone.utc)
    engine = get_database_engine()
    with engine.begin() as conn:
        ensure_live_state_table(conn)
        res = conn.execute(sa.text("""
            UPDATE ai_agent_live_state
            SET last_heartbeat_at = :now_dt
            WHERE workflow_execution_id = :wf_id
            RETURNING ai_agent_id, tenant_id;
        """), {"now_dt": now_dt, "wf_id": workflow_execution_id}).mappings().first()

        if not res:
            return False

        agent_id = str(res["ai_agent_id"])
        tenant_id = str(res["tenant_id"])

    broadcaster = get_realtime_broadcaster()
    await broadcaster.publish("platform:ai-agent-live", {
        "event": "heartbeat",
        "tenant_id": tenant_id,
        "ai_agent_id": agent_id,
        "workflow_execution_id": workflow_execution_id,
        "last_heartbeat_at": now_dt.isoformat(),
    })
    return True


async def mark_workflow_completed(
    workflow_execution_id: str,
    status: str = "completed",
    error_detail: Optional[str] = None,
) -> bool:
    """
    Menandai eksekusi selesai atau gagal, lalu menjadwalkan transisi idle.
    """
    final_status = "error" if status in ("failed", "error") else "completed"
    label = "Terjadi kegagalan pemrosesan" if final_status == "error" else "Tugas selesai dieksekusi"
    now_dt = datetime.now(timezone.utc)

    engine = get_database_engine()
    with engine.begin() as conn:
        ensure_live_state_table(conn)
        res = conn.execute(sa.text("""
            UPDATE ai_agent_live_state
            SET current_status = :status,
                current_step_label = :label,
                last_heartbeat_at = :now_dt
            WHERE workflow_execution_id = :wf_id
            RETURNING ai_agent_id, tenant_id;
        """), {
            "status": final_status,
            "label": label,
            "now_dt": now_dt,
            "wf_id": workflow_execution_id,
        }).mappings().first()

        if not res:
            return False

        agent_id = str(res["ai_agent_id"])
        tenant_id = str(res["tenant_id"])

    broadcaster = get_realtime_broadcaster()
    await broadcaster.publish("platform:ai-agent-live", {
        "event": "state_update",
        "tenant_id": tenant_id,
        "ai_agent_id": agent_id,
        "workflow_execution_id": workflow_execution_id,
        "current_status": final_status,
        "current_step_label": label,
        "last_heartbeat_at": now_dt.isoformat(),
    })
    return True


async def cleanup_stale_records(stale_threshold_seconds: int = 90) -> Dict[str, int]:
    """
    Job Pembersihan Otomatis (PRD v2.2 Bagian 25.2 / Bagian A.2):
    1. Baris tanpa heartbeat > 90 detik dan bukan completed/error ditandai 'error' (agen hang/mati).
    2. Baris dengan status 'completed' atau 'error' lebih tua dari 60 detik dibersihkan.
    """
    now_dt = datetime.now(timezone.utc)
    stale_cut = now_dt - timedelta(seconds=stale_threshold_seconds)
    cleanup_cut = now_dt - timedelta(seconds=60)

    marked_error = 0
    deleted_old = 0

    engine = get_database_engine()
    with engine.begin() as conn:
        ensure_live_state_table(conn)

        # 1. Tandai error proses yang macet / tidak ada heartbeat
        res_error = conn.execute(sa.text("""
            UPDATE ai_agent_live_state
            SET current_status = 'error',
                current_step_label = 'Waktu eksekusi habis (stale heartbeat)',
                last_heartbeat_at = :now_dt
            WHERE last_heartbeat_at < :stale_cut
              AND current_status NOT IN ('completed', 'error', 'idle')
            RETURNING id;
        """), {"now_dt": now_dt, "stale_cut": stale_cut}).fetchall()
        marked_error = len(res_error)

        # 2. Hapus status completed/error lama agar tidak menumpuk
        res_del = conn.execute(sa.text("""
            DELETE FROM ai_agent_live_state
            WHERE (current_status IN ('completed', 'error') AND last_heartbeat_at < :cleanup_cut)
               OR (current_status = 'idle' AND last_heartbeat_at < :cleanup_cut)
            RETURNING id;
        """), {"cleanup_cut": cleanup_cut}).fetchall()
        deleted_old = len(res_del)

    if marked_error > 0 or deleted_old > 0:
        broadcaster = get_realtime_broadcaster()
        await broadcaster.publish("platform:ai-agent-live", {
            "event": "cleanup_sync",
            "marked_error_count": marked_error,
            "deleted_count": deleted_old,
            "timestamp": now_dt.isoformat(),
        })

    return {"marked_stale_errors": marked_error, "deleted_stale_completed": deleted_old}


def get_live_states(
    tenant_id: Optional[str] = None,
    department_category: Optional[str] = None,
    job_title_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Mengambil snapshot seluruh AI Agent yang sedang termonitor secara live,
    diperkaya metadata jabatan resmi, nama departemen, dan nama tenant (tanpa konten bisnis).
    """
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            ensure_live_state_table(conn)

            query = """
                SELECT
                    ls.id AS live_id,
                    ls.tenant_id,
                    t.display_name AS tenant_display_name,
                    t.legal_name AS tenant_legal_name,
                    ls.ai_agent_id,
                    a.name AS agent_name,
                    a.role_code AS agent_role,
                    a.status AS agent_lifecycle_status,
                    a.department_id,
                    d.name AS department_name,
                    d.category AS department_category,
                    jt.id AS job_title_id,
                    jt.title_code AS job_title_code,
                    jt.title_name AS job_title_name,
                    jt.category_tag AS job_title_category,
                    ls.workflow_execution_id,
                    ls.current_status,
                    ls.current_step_label,
                    ls.current_tool_name,
                    ls.confidence_score,
                    ls.source_channel,
                    ls.started_at,
                    ls.last_heartbeat_at,
                    EXTRACT(EPOCH FROM (now() - ls.started_at))::int AS duration_seconds,
                    EXTRACT(EPOCH FROM (now() - ls.last_heartbeat_at))::int AS seconds_since_heartbeat
                FROM ai_agent_live_state ls
                JOIN tenants t ON t.id = ls.tenant_id
                JOIN ai_agents a ON a.id = ls.ai_agent_id
                LEFT JOIN departments d ON d.id = a.department_id
                LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id
                WHERE 1=1
            """
            params: Dict[str, Any] = {}

            if tenant_id:
                query += " AND ls.tenant_id = :tenant_id"
                params["tenant_id"] = tenant_id

            if department_category:
                query += " AND (d.category = :dept_cat OR jt.category_tag = :dept_cat)"
                params["dept_cat"] = department_category

            if job_title_id:
                query += " AND (a.job_title_id = :job_title_id OR jt.id = :job_title_id)"
                params["job_title_id"] = job_title_id

            if status:
                query += " AND ls.current_status = :status"
                params["status"] = status

            query += " ORDER BY ls.last_heartbeat_at DESC LIMIT 100;"

            rows = conn.execute(sa.text(query), params).mappings().fetchall()

            results = []
            for r in rows:
                tenant_name = r["tenant_display_name"] or r["tenant_legal_name"] or "Organisasi Tenant"
                results.append({
                    "id": str(r["live_id"]),
                    "tenant_id": str(r["tenant_id"]),
                    "tenant_name": tenant_name,
                    "ai_agent_id": str(r["ai_agent_id"]),
                    "agent_name": r["agent_name"] or "Staf Agen AI",
                    "agent_role": r["agent_role"] or "STAFF_AI",
                    "department_id": str(r["department_id"]) if r["department_id"] else None,
                    "department_name": r["department_name"] or "Operasional Umum",
                    "department_category": r["department_category"] or r["job_title_category"] or "Umum",
                    "job_title_id": str(r["job_title_id"]) if r["job_title_id"] else None,
                    "job_title_code": r["job_title_code"] or "STAFF_OPERATIONAL",
                    "job_title_name": r["job_title_name"] or "Spesialis Operasional AI",
                    "workflow_execution_id": str(r["workflow_execution_id"]) if r["workflow_execution_id"] else None,
                    "current_status": r["current_status"],
                    "current_step_label": sanitize_step_label(r["current_step_label"], tool_name=r["current_tool_name"]),
                    "current_tool_name": r["current_tool_name"],
                    "confidence_score": float(r["confidence_score"]) if r["confidence_score"] is not None else 95.0,
                    "source_channel": r["source_channel"] or "internal",
                    "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                    "last_heartbeat_at": r["last_heartbeat_at"].isoformat() if r["last_heartbeat_at"] else None,
                    "duration_seconds": max(0, int(r["duration_seconds"] or 0)),
                    "seconds_since_heartbeat": max(0, int(r["seconds_since_heartbeat"] or 0)),
                })
            return results
    except Exception as exc:
        logger.warning(f"Gagal memuat snapshot live state dari DB: {exc}")
        return []


def get_live_state_summary() -> Dict[str, Any]:
    """
    Ringkasan Platform Nyata (Bagian C):
    - Total AI Agent Aktif Sekarang (current_status != 'idle')
    - Breakdown per status
    - Breakdown per Jabatan Utama
    - Breakdown per tenant (top 10 paling sibuk)
    """
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            ensure_live_state_table(conn)

            # 1. Hitungan Total & Status Breakdown
            status_rows = conn.execute(sa.text("""
                SELECT
                    current_status,
                    COUNT(*) as count
                FROM ai_agent_live_state
                GROUP BY current_status;
            """)).fetchall()

            breakdown_by_status = {
                "idle": 0,
                "thinking": 0,
                "calling_tool": 0,
                "generating_image": 0,
                "retrieving_memory": 0,
                "waiting_approval": 0,
                "error": 0,
                "completed": 0,
            }
            total_tracked = 0
            total_active = 0

            for row in status_rows:
                st = str(row[0])
                cnt = int(row[1])
                breakdown_by_status[st] = cnt
                total_tracked += cnt
                if st in ("thinking", "calling_tool", "generating_image", "retrieving_memory", "waiting_approval"):
                    total_active += cnt

            # 2. Breakdown per Jabatan Utama
            job_title_rows = conn.execute(sa.text("""
                SELECT
                    COALESCE(jt.title_name, 'Spesialis Operasional AI') as title,
                    COUNT(*) as count
                FROM ai_agent_live_state ls
                JOIN ai_agents a ON a.id = ls.ai_agent_id
                LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id
                WHERE ls.current_status IN ('thinking', 'calling_tool', 'generating_image', 'retrieving_memory', 'waiting_approval')
                GROUP BY COALESCE(jt.title_name, 'Spesialis Operasional AI')
                ORDER BY count DESC
                LIMIT 10;
            """)).fetchall()

            breakdown_by_job_title = [
                {"job_title": str(r[0]), "active_count": int(r[1])}
                for r in job_title_rows
            ]

            # 3. Breakdown per Tenant (Top 10 paling sibuk)
            tenant_rows = conn.execute(sa.text("""
                SELECT
                    ls.tenant_id,
                    COALESCE(t.display_name, t.legal_name, 'Organisasi Tenant') as tenant_name,
                    COUNT(*) as active_count
                FROM ai_agent_live_state ls
                JOIN tenants t ON t.id = ls.tenant_id
                WHERE ls.current_status IN ('thinking', 'calling_tool', 'generating_image', 'retrieving_memory', 'waiting_approval')
                GROUP BY ls.tenant_id, COALESCE(t.display_name, t.legal_name, 'Organisasi Tenant')
                ORDER BY active_count DESC
                LIMIT 10;
            """)).fetchall()

            breakdown_by_tenant = [
                {"tenant_id": str(r[0]), "tenant_name": str(r[1]), "active_count": int(r[2])}
                for r in tenant_rows
            ]

            return {
                "total_active_agents": total_active,
                "total_monitored_agents": total_tracked,
                "breakdown_by_status": breakdown_by_status,
                "breakdown_by_job_title": breakdown_by_job_title,
                "breakdown_by_tenant": breakdown_by_tenant,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as exc:
        logger.warning(f"Gagal memuat ringkasan live state dari DB: {exc}")
        return {
            "total_active_agents": 0,
            "total_monitored_agents": 0,
            "breakdown_by_status": {
                "idle": 0,
                "thinking": 0,
                "calling_tool": 0,
                "generating_image": 0,
                "retrieving_memory": 0,
                "waiting_approval": 0,
                "error": 0,
                "completed": 0,
            },
            "breakdown_by_job_title": [],
            "breakdown_by_tenant": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def get_agent_recent_nodes(agent_id: str, limit: int = 6) -> List[Dict[str, Any]]:
    """
    Mengambil riwayat beberapa entri node terakhir dari workflow_node_runs
    untuk panel samping 'Fokus Agent' (hanya label generik, durasi ms/detik, tanpa konten bisnis).
    """
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            rows = conn.execute(sa.text("""
                SELECT
                    nr.id,
                    nr.node_key,
                    nr.node_type,
                    nr.status,
                    nr.error_detail,
                    nr.started_at,
                    nr.finished_at,
                    EXTRACT(EPOCH FROM (COALESCE(nr.finished_at, now()) - nr.started_at)) * 1000.0 as latency_ms
                FROM workflow_node_runs nr
                JOIN workflow_executions we ON we.id = nr.workflow_execution_id
                WHERE we.created_by_membership_id IN (
                    SELECT tm.id FROM tenant_memberships tm
                    WHERE tm.user_id = :agent_id
                ) OR we.id IN (
                    SELECT ls.workflow_execution_id FROM ai_agent_live_state ls
                    WHERE ls.ai_agent_id = :agent_id
                )
                ORDER BY nr.started_at DESC
                LIMIT :limit;
            """), {"agent_id": agent_id, "limit": limit}).mappings().fetchall()

            results = []
            for r in rows:
                clean_label = sanitize_step_label(None, node_type=r["node_type"])
                dur_ms = float(r["latency_ms"] or 0.0)
                results.append({
                    "id": str(r["id"]),
                    "node_key": r["node_key"],
                    "node_type": r["node_type"],
                    "step_label": clean_label,
                    "status": r["status"],
                    "duration_ms": round(dur_ms, 2),
                    "duration_seconds": round(dur_ms / 1000.0, 2),
                    "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                    "finished_at": r["finished_at"].isoformat() if r["finished_at"] else None,
                })
            return results
    except Exception as exc:
        logger.warning(f"Gagal memuat histori recent nodes dari DB: {exc}")
        return []
