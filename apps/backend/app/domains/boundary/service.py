"""
OrchestreeAI Strict Boundary & Blocking Service (PRD v2.2 Bagian 3.5, 8.4, 10.3, 10.5, 12, 14).

Tujuan Utama:
Data internal tenant TIDAK PERNAH bisa sampai ke customer melalui jalur manapun:
1. Memory Retrieval Boundary (Hybrid RAG audience_scope filtering)
2. Tool Call Boundary (enforce_tool_context_boundary pada titik ketiga authorize())
3. Agent Dual-Context Boundary (Pencegahan penugasan agent internal ke channel customer-facing dan sebaliknya)
4. Verified Sender Boundary (Allowlist pengirim pada kanal proactive resmi)
5. Output Sanitization Pass (Defense-in-depth output validator)
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import sqlalchemy as sa

from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.boundary")


# =============================================================================
# EXCEPTIONS RESMI STRICT BOUNDARY
# =============================================================================

class ToolContextBoundaryException(PermissionError):
    """Dilempar saat tool berstatus internal_only dicoba dieksekusi dari konteks omnichannel."""
    def __init__(self, tool_name: str, detail: Optional[str] = None):
        self.tool_name = tool_name
        msg = detail or f"Pemanggilan tool '{tool_name}' berstatus 'internal_only' dilarang dari konteks omnichannel."
        super().__init__(msg)


class AgentContextMismatchException(ValueError):
    """Dilempar saat AI Agent dicoba ditugaskan ke kanal yang tidak sesuai dengan context_scope-nya."""
    def __init__(self, agent_id: str, required_scope: str, actual_scope: Optional[str] = None):
        self.agent_id = agent_id
        self.required_scope = required_scope
        self.actual_scope = actual_scope
        msg = (
            f"AI Agent '{agent_id}' memiliki context_scope='{actual_scope or 'unknown'}', "
            f"tetapi kanal membutuhkan scope '{required_scope}'."
        )
        super().__init__(msg)


class OutputBoundaryViolationException(PermissionError):
    """Dilempar saat sanitizer mendeteksi jejak dokumen internal_only pada draf balasan customer."""
    def __init__(self, leaked_doc_ids: Optional[List[str]] = None):
        self.leaked_doc_ids = leaked_doc_ids or []
        msg = (
            f"Output boundary violation: Jejak dokumen internal_only ({self.leaked_doc_ids}) "
            f"terdeteksi pada draf respons customer. Pesan dialihkan ke status HUMAN_APPROVAL."
        )
        super().__init__(msg)


class UnverifiedSenderException(PermissionError):
    """Dilempar saat pengirim tidak terdaftar dalam allow-list kanal proaktif resmi."""
    def __init__(self, sender_identifier: str):
        self.sender_identifier = sender_identifier
        super().__init__(f"Pengirim '{sender_identifier}' tidak terdaftar dalam allow-list pengirim resmi.")


# =============================================================================
# HELPER MASKING & HASHING IDENTIFIER
# =============================================================================

def hash_identifier(identifier: str) -> str:
    """Menghasilkan hash SHA256 deterministik dari nomor telepon/ID chat."""
    cleaned = identifier.strip().replace(" ", "").replace("-", "")
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def mask_identifier(identifier: str) -> str:
    """Menyensor identifier untuk pencatatan log audit aman tanpa membocorkan data pribadi (PII)."""
    s = identifier.strip()
    if len(s) <= 4:
        return "***"
    return s[:3] + "****" + s[-3:]


# =============================================================================
# AUDIT LOGGING: CROSS BOUNDARY VIOLATION
# =============================================================================

async def record_boundary_violation(
    violation_type: str,
    context_detail: Dict[str, Any],
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Mencatat percobaan pelanggaran batas secara persisten ke tabel cross_boundary_violation_log.
    Jenis pelanggaran yang valid:
    - memory_leak_blocked
    - tool_call_blocked
    - unverified_sender_blocked
    - agent_dual_context_blocked
    - output_sanitization_blocked
    """
    valid_types = {
        "memory_leak_blocked",
        "tool_call_blocked",
        "unverified_sender_blocked",
        "agent_dual_context_blocked",
        "output_sanitization_blocked",
    }
    if violation_type not in valid_types:
        raise ValueError(f"Tipe pelanggaran '{violation_type}' tidak valid. Harus salah satu dari: {valid_types}")

    log_id = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)

    try:
        engine = get_database_engine()
        with engine.begin() as conn:
            if tenant_id:
                try:
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                        {"tid": str(tenant_id)},
                    )
                except Exception:
                    pass

            conn.execute(
                sa.text("""
                    INSERT INTO cross_boundary_violation_log (
                        id, tenant_id, violation_type, context_detail, blocked_at
                    ) VALUES (
                        :id, :tenant_id, :violation_type, :context_detail, :blocked_at
                    )
                """),
                {
                    "id": log_id,
                    "tenant_id": str(tenant_id) if tenant_id else None,
                    "violation_type": violation_type,
                    "context_detail": json.dumps(context_detail),
                    "blocked_at": now_dt,
                },
            )
    except Exception as e:
        logger.error(f"Gagal mencatat audit pelanggaran boundary ke database: {e}")

    logger.warning(
        f"[STRICT_BOUNDARY_BLOCKED] Type: {violation_type} | Tenant: {tenant_id} | Detail: {context_detail}"
    )

    return {
        "id": log_id,
        "tenant_id": tenant_id,
        "violation_type": violation_type,
        "context_detail": context_detail,
        "blocked_at": now_dt.isoformat(),
    }


async def list_boundary_violations(
    tenant_id: Optional[str] = None,
    violation_type: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Mengambil riwayat log percobaan pelanggaran batas untuk peninjauan admin."""
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            if tenant_id:
                try:
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                        {"tid": str(tenant_id)},
                    )
                except Exception:
                    pass

            query = """
                SELECT id, tenant_id, violation_type, context_detail, blocked_at
                FROM cross_boundary_violation_log
                WHERE 1=1
            """
            params: Dict[str, Any] = {"limit": limit}
            if tenant_id:
                query += " AND (tenant_id = :tenant_id::uuid OR tenant_id IS NULL)"
                params["tenant_id"] = str(tenant_id)
            if violation_type:
                query += " AND violation_type = :vtype"
                params["vtype"] = violation_type

            query += " ORDER BY blocked_at DESC LIMIT :limit"

            rows = conn.execute(sa.text(query), params).mappings().all()
            results = []
            for r in rows:
                item = dict(r)
                if isinstance(item.get("context_detail"), str):
                    try:
                        item["context_detail"] = json.loads(item["context_detail"])
                    except Exception:
                        pass
                if isinstance(item.get("blocked_at"), datetime):
                    item["blocked_at"] = item["blocked_at"].isoformat()
                results.append(item)
            return results
    except Exception as e:
        logger.error(f"Gagal memuat log pelanggaran boundary: {e}")
        return []


# =============================================================================
# 1. TOOL CALL CONTEXT BOUNDARY ENFORCEMENT
# =============================================================================

# Known tools allowlisted for customer-facing omnichannel interactions
CUSTOMER_FACING_ALLOWED_TOOLS = {
    "cart.create",
    "cart.update",
    "cart.view",
    "product.recommend",
    "product.search",
    "product.catalog.view",
    "knowledge.lookup",
    "crm.contact_verify",
    "order.status_lookup",
}


async def get_tool_context_scope(tool_name: str) -> str:
    """Mengambil context_scope perkakas dari tabel mcp_tools atau allowlist bawaan."""
    if tool_name in CUSTOMER_FACING_ALLOWED_TOOLS:
        return "customer_facing_allowed"

    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT context_scope FROM mcp_tools WHERE name = :name LIMIT 1"),
                {"name": tool_name},
            ).mappings().first()
            if row and row["context_scope"]:
                return str(row["context_scope"])
    except Exception:
        pass

    # Default fail-safe mutlak
    return "internal_only"


async def enforce_tool_context_boundary(
    tool_name: str,
    execution_context: str,
    tenant_id: Optional[str] = None,
    tool_context_scope: Optional[str] = None,
) -> None:
    """
    Pemeriksaan wajib di titik eksekusi MCP Tool (titik ketiga authorize()).
    Bila execution_context == 'omnichannel' dan tool berstatus 'internal_only':
    Tolak keras (raise ToolContextBoundaryException) dan catat ke cross_boundary_violation_log.
    """
    scope = tool_context_scope or await get_tool_context_scope(tool_name)

    if execution_context == "omnichannel" and scope != "customer_facing_allowed":
        await record_boundary_violation(
            violation_type="tool_call_blocked",
            tenant_id=tenant_id,
            context_detail={
                "tool": tool_name,
                "context": execution_context,
                "tool_scope": scope,
            },
        )
        raise ToolContextBoundaryException(
            tool_name=tool_name,
            detail=f"Tool '{tool_name}' memiliki context_scope='{scope}' dan dilarang dipanggil dari konteks omnichannel.",
        )


# =============================================================================
# 2. AGENT DUAL-CONTEXT BOUNDARY ENFORCEMENT
# =============================================================================

async def get_ai_agent_scope(agent_id: str, tenant_id: Optional[str] = None) -> Optional[str]:
    """Mengambil context_scope dari AI Agent yang terdaftar di ai_agents."""
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            if tenant_id:
                try:
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
                        {"tid": str(tenant_id)},
                    )
                except Exception:
                    pass

            row = conn.execute(
                sa.text("SELECT context_scope FROM ai_agents WHERE id = :id LIMIT 1"),
                {"id": str(agent_id)},
            ).mappings().first()
            if row and row["context_scope"]:
                return str(row["context_scope"])
    except Exception as e:
        logger.warning(f"Gagal memeriksa context_scope untuk agent {agent_id}: {e}")
    return "internal"


async def assign_agent_to_channel(
    agent_id: str,
    channel_type: str,
    tenant_id: Optional[str] = None,
    agent_context_scope: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Memvalidasi penugasan AI Agent ke akun kanal atau tugas proaktif.
    Kanal omnichannel (customer-facing) WAJIB menerima agen dengan context_scope='customer_facing'.
    Kanal internal/proactive WAJIB menerima agen dengan context_scope='internal'.
    """
    required_scope = "customer_facing" if channel_type in ("omnichannel", "customer_facing") else "internal"
    actual_scope = agent_context_scope or await get_ai_agent_scope(agent_id, tenant_id=tenant_id) or "internal"

    if actual_scope != required_scope:
        await record_boundary_violation(
            violation_type="agent_dual_context_blocked",
            tenant_id=tenant_id,
            context_detail={
                "agent_id": str(agent_id),
                "channel_type": channel_type,
                "required_scope": required_scope,
                "actual_scope": actual_scope,
            },
        )
        raise AgentContextMismatchException(
            agent_id=str(agent_id),
            required_scope=required_scope,
            actual_scope=actual_scope,
        )

    return {
        "agent_id": str(agent_id),
        "channel_type": channel_type,
        "context_scope": actual_scope,
        "status": "APPROVED",
    }


# =============================================================================
# 3. VERIFIED SENDER BOUNDARY (PROACTIVE CHANNELS)
# =============================================================================

async def verify_proactive_sender(
    channel_id: str,
    raw_sender_identifier: str,
    tenant_id: Optional[str] = None,
) -> bool:
    """
    Memvalidasi apakah pengirim pesan terdaftar dalam allow-list kanal proactive resmi platform.
    Bila sender_allowlist_enforced aktif dan pengirim belum terverifikasi:
    Mengembalikan False dan mencatat ke cross_boundary_violation_log.
    """
    hashed = hash_identifier(raw_sender_identifier)

    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            # 1. Periksa apakah channel memberlakukan allowlist
            chan = conn.execute(
                sa.text("SELECT id, sender_allowlist_enforced FROM proactive_official_channels WHERE id = :cid LIMIT 1"),
                {"cid": str(channel_id)},
            ).mappings().first()

            if not chan:
                # Channel tidak ditemukan
                return False

            if not chan.get("sender_allowlist_enforced", True):
                # Allowlist tidak dipaksakan
                return True

            # 2. Periksa apakah pengirim terdaftar pada proactive_verified_senders
            sender = conn.execute(
                sa.text("""
                    SELECT id FROM proactive_verified_senders
                    WHERE proactive_official_channel_id = :cid
                      AND external_identifier_hash = :hash
                    LIMIT 1
                """),
                {"cid": str(channel_id), "hash": hashed},
            ).mappings().first()

            if sender:
                return True
    except Exception as e:
        logger.error(f"Error saat verifikasi pengirim proaktif: {e}")

    # Pengirim tidak terverifikasi -> Catat audit dan tolak
    await record_boundary_violation(
        violation_type="unverified_sender_blocked",
        tenant_id=tenant_id,
        context_detail={
            "channel_id": str(channel_id),
            "sender": mask_identifier(raw_sender_identifier),
            "hash": hashed,
        },
    )
    return False


async def route_proactive_inbound(
    channel_identifier: str,
    sender_identifier: str,
    content_text: str,
    channel_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Jalur kanonik pemrosesan pesan masuk pada kanal proactive_official_channels.
    Bila pengirim TIDAK terverifikasi:
    Pesan DIABAIKAN, TIDAK diteruskan ke Orchestration Engine, dan dicatat di log pelanggaran.
    """
    target_channel_id = channel_id
    if not target_channel_id:
        try:
            engine = get_database_engine()
            with engine.connect() as conn:
                row = conn.execute(
                    sa.text("""
                        SELECT id FROM proactive_official_channels
                        WHERE phone_number_id = :id OR bot_username = :id OR credential_ref = :id
                        LIMIT 1
                    """),
                    {"id": str(channel_identifier)},
                ).mappings().first()
                if row:
                    target_channel_id = str(row["id"])
        except Exception:
            pass

    if not target_channel_id:
        logger.warning(f"Kanal proactive resmi tidak dikenali untuk identifier: {channel_identifier}")
        return None

    is_verified = await verify_proactive_sender(
        channel_id=target_channel_id,
        raw_sender_identifier=sender_identifier,
        tenant_id=tenant_id,
    )

    if not is_verified:
        logger.info(f"Pesan dari pengirim tidak terverifikasi {mask_identifier(sender_identifier)} diabaikan.")
        return None

    # Lanjut ke alur pesan staf terverifikasi
    return {
        "status": "ACCEPTED",
        "channel_id": target_channel_id,
        "sender": mask_identifier(sender_identifier),
        "content_length": len(content_text),
    }


# =============================================================================
# 4. OUTPUT SANITIZATION PASS (DEFENSE-IN-DEPTH)
# =============================================================================

async def sanitize_customer_facing_output(
    draft_reply: str,
    retrieved_doc_ids: List[str],
    tenant_id: Optional[str] = None,
) -> str:
    """
    Lapisan kedua pemeriksaan keamanan (defense-in-depth) sebelum balasan dikirimkan ke pelanggan:
    Mendeteksi apakah terdapat dokumen dengan audience_scope='internal_only' di antara retrieved_doc_ids.
    Jika ditemukan:
    1. Catat ke cross_boundary_violation_log ('output_sanitization_blocked')
    2. Melempar OutputBoundaryViolationException untuk eskalasi ke status HUMAN_APPROVAL.
    """
    if not retrieved_doc_ids:
        return draft_reply

    try:
        from app.domains.memory.engine import get_memory_engine
        engine = get_memory_engine()
        leaked_internal = await engine.filter_internal_only(retrieved_doc_ids, tenant_id=tenant_id)
    except Exception as e:
        logger.warning(f"Fallback direct query internal filter: {e}")
        leaked_internal = []
        try:
            db_engine = get_database_engine()
            with db_engine.connect() as conn:
                res = conn.execute(
                    sa.text("""
                        SELECT id FROM memory_documents
                        WHERE id = ANY(:ids::uuid[]) AND audience_scope = 'internal_only'
                    """),
                    {"ids": retrieved_doc_ids},
                ).fetchall()
                leaked_internal = [str(r[0]) for r in res]
        except Exception:
            pass

    if leaked_internal:
        await record_boundary_violation(
            violation_type="output_sanitization_blocked",
            tenant_id=tenant_id,
            context_detail={
                "docs": leaked_internal,
                "total_retrieved": len(retrieved_doc_ids),
                "draft_length": len(draft_reply),
            },
        )
        raise OutputBoundaryViolationException(leaked_internal)

    return draft_reply
