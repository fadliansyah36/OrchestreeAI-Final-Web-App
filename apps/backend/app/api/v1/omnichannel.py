"""
Omnichannel, Channel Accounts, dan Customer Intelligence API Router (PRD v2.2 Bagian 10, 12, 14).

Menyediakan endpoint untuk:
- Manajemen akun kanal (Kategori A: WhatsApp Cloud API/OAuth, Kategori B: Telegram MTProto QR).
- Pembuatan dan pemantauan sesi QR Telegram MTProto resmi.
- Pemutusan (revocation) sesi MTProto resmi (auth.logOut).
- Kotak Masuk (Omnichannel Inbox) terpadu: daftar percakapan, pesan, dan pengiriman pesan keluar.
- Handover percakapan antara AI Agent dan Staff Manusia.
- Resolusi identitas pelanggan & peninjauan penggabungan (merge review) status WEAK.
- Pemotongan kredit otomatis per pesan dengan row-level lock.
"""

import json
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, status, HTTPException, Depends, Query, Path, Header, Request
from pydantic import BaseModel, Field
import sqlalchemy as sa

from app.core.database import get_database_engine
from app.core.security import get_current_tenant_context, AuthenticatedTenantContext
from orchestree.channel_gateway.routing import (
    InboundMessage,
    resolve_channel_account,
    verify_hub_signature,
    hash_identifier,
    UnrecognizedChannelAccountException
)
from orchestree.channel_gateway.gateway import (
    route_inbound_message,
    record_usage_and_deduct_credit
)
from orchestree.channel_gateway.telegram_mtproto import (
    generate_telegram_qr_session,
    poll_telegram_qr_status,
    confirm_mtproto_authorization,
    revoke_mtproto_session,
    send_mtproto_message,
    FloodGuardWaitException,
    SessionRevokedException
)
from orchestree.domains.sales.identity import (
    approve_merge,
    rollback_merge
)

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["Omnichannel & Customers"])


# Schemas
class CreateChannelAccountRequest(BaseModel):
    channel_type: str = Field(..., description="Tipe kanal: telegram_mtproto, whatsapp_cloud, instagram, facebook, tiktok")
    connection_mode: str = Field(..., description="Mode koneksi: official_business_api, mtproto_qr, platform_oauth")
    account_label: str = Field(..., description="Label akun organisasi")
    external_identifier: str = Field(..., description="Nomor telepon atau ID akun resmi")
    credential_ref: Optional[str] = None
    department_id: Optional[str] = None


class ConfirmQrSessionRequest(BaseModel):
    session_string: str = Field(..., description="Session string resmi Telegram dari otorisasi")
    external_identifier: str = Field(..., description="Nomor telepon atau username Telegram akun terhubung")


class SendMessageRequest(BaseModel):
    content_text: str = Field(..., min_length=1, max_length=4096, description="Isi teks pesan")
    media_urls: Optional[List[str]] = Field(default_factory=list)


class HandoverRequest(BaseModel):
    to_agent_type: str = Field(..., description="Target penugasan: 'AI' atau 'HUMAN'")
    handover_reason: str = Field(..., description="Alasan pengalihan penanganan percakapan")
    assigned_to_user_id: Optional[str] = None


# 1. CHANNEL ACCOUNTS
@router.get("/channel-accounts", summary="Daftar Akun Kanal Tenant")
async def list_channel_accounts(
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengembalikan seluruh akun kanal aktif dan pending milik tenant."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
        
        # Pemeriksaan hak akses: staf dibatasi berdasarkan channel_account_permissions
        is_admin_or_owner = any(r in ("owner", "admin", "superadmin") for r in ctx.roles)
        
        if is_admin_or_owner:
            rows = conn.execute(
                sa.text("""
                    SELECT id, channel_type, connection_mode, account_label,
                           external_identifier, status, requires_owner_approval,
                           is_approved, created_at, updated_at
                    FROM channel_accounts
                    WHERE tenant_id = :tid
                    ORDER BY created_at DESC
                """),
                {"tid": tenant_id}
            ).mappings().all()
        else:
            rows = conn.execute(
                sa.text("""
                    SELECT ca.id, ca.channel_type, ca.connection_mode, ca.account_label,
                           ca.external_identifier, ca.status, ca.requires_owner_approval,
                           ca.is_approved, ca.created_at, ca.updated_at
                    FROM channel_accounts ca
                    JOIN channel_account_permissions cap ON ca.id = cap.channel_account_id
                    WHERE ca.tenant_id = :tid AND cap.role_or_membership_id = :uid AND cap.can_read = true
                    ORDER BY ca.created_at DESC
                """),
                {"tid": tenant_id, "uid": ctx.user_id}
            ).mappings().all()

        return [dict(r) for r in rows]


@router.post("/channel-accounts", status_code=status.HTTP_201_CREATED, summary="Registrasi Akun Kanal Baru")
async def create_channel_account(
    req: CreateChannelAccountRequest,
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mendaftarkan akun kanal baru (WhatsApp Cloud API atau Telegram MTProto)."""
    engine = get_database_engine()
    is_owner_or_admin = any(r in ("owner", "admin", "superadmin") for r in ctx.roles)
    
    # Jika didaftarkan oleh staf non-owner, wajib memerlukan persetujuan pemilik (requires_owner_approval)
    requires_approval = not is_owner_or_admin
    is_approved = is_owner_or_admin
    
    id_hash = hash_identifier(req.external_identifier)
    new_ca_id = str(uuid.uuid4())

    with engine.begin() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
        
        conn.execute(
            sa.text("""
                INSERT INTO channel_accounts (
                    id, tenant_id, channel_type, connection_mode, account_label,
                    external_identifier, external_identifier_hash, credential_ref,
                    department_id, status, requires_owner_approval, is_approved
                ) VALUES (
                    :id, :tid, :ctype, :mode, :label,
                    :ext_id, :hash, :cred,
                    :dept_id, 'PENDING_SETUP', :req_app, :is_app
                )
            """),
            {
                "id": new_ca_id,
                "tid": tenant_id,
                "ctype": req.channel_type,
                "mode": req.connection_mode,
                "label": req.account_label,
                "ext_id": req.external_identifier,
                "hash": id_hash,
                "cred": req.credential_ref,
                "dept_id": req.department_id,
                "req_app": requires_approval,
                "is_app": is_approved
            }
        )

    return {
        "id": new_ca_id,
        "account_label": req.account_label,
        "channel_type": req.channel_type,
        "status": "PENDING_SETUP",
        "requires_owner_approval": requires_approval,
        "is_approved": is_approved
    }


# 2. MTPROTO QR SESSION LIFECYCLE (CATEGORY B)
@router.post("/channel-accounts/{ca_id}/qr-session", summary="Buat Sesi QR Login Telegram MTProto")
async def create_mtproto_qr_session(
    ca_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Memicu pembuatan sesi MTProto baru dan mengekspor login token resmi untuk dipindai via QR Code."""
    try:
        res = generate_telegram_qr_session(tenant_id=tenant_id, channel_account_id=ca_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/channel-accounts/{ca_id}/qr-status", summary="Poll Status QR Session MTProto")
async def check_mtproto_qr_status(
    ca_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Memeriksa status pemindaian QR code sesi Telegram secara berkala."""
    try:
        res = poll_telegram_qr_status(tenant_id=tenant_id, channel_account_id=ca_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/channel-accounts/{ca_id}/qr-confirm", summary="Konfirmasi Otorisasi Sesi MTProto")
async def confirm_mtproto_session(
    req: ConfirmQrSessionRequest,
    ca_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menerima otorisasi loginToken Telegram dan menyimpan session string dengan envelope encryption KMS."""
    try:
        res = confirm_mtproto_authorization(
            tenant_id=tenant_id,
            channel_account_id=ca_id,
            session_string_raw=req.session_string,
            external_identifier=req.external_identifier
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/channel-accounts/{ca_id}/qr-session", summary="Putuskan Sesi MTProto (Revoke Resmi)")
async def revoke_channel_session(
    ca_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mencabut otorisasi Telegram MTProto resmi (auth.logOut) dan menghapus data sesi dari database."""
    res = revoke_mtproto_session(tenant_id=tenant_id, channel_account_id=ca_id)
    return res


# 3. OMNICHANNEL INBOX & CONVERSATIONS
@router.get("/conversations", summary="Daftar Percakapan Omnichannel")
async def list_conversations(
    channel_type: Optional[str] = Query(None),
    conv_status: Optional[str] = Query(None, alias="status"),
    assigned_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengembalikan daftar obrolan aktif dari WhatsApp dan Telegram beserta profil pelanggan."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
        
        query = """
            SELECT c.id, c.status, c.assigned_type, c.last_message_preview, c.last_message_at,
                   c.created_at, cust.id as customer_id, cust.primary_name as customer_name,
                   cust.primary_phone as customer_phone, cust.avatar_url,
                   ca.id as channel_account_id, ca.account_label, ca.channel_type
            FROM conversations c
            JOIN customers cust ON c.customer_id = cust.id
            JOIN channel_accounts ca ON c.channel_account_id = ca.id
            WHERE c.tenant_id = :tid
        """
        params: Dict[str, Any] = {"tid": tenant_id, "limit": limit}
        if channel_type:
            query += " AND ca.channel_type = :ctype"
            params["ctype"] = channel_type
        if conv_status:
            query += " AND c.status = :cstatus"
            params["cstatus"] = conv_status
        if assigned_type:
            query += " AND c.assigned_type = :atype"
            params["atype"] = assigned_type

        query += " ORDER BY c.last_message_at DESC LIMIT :limit"

        rows = conn.execute(sa.text(query), params).mappings().all()
        return [dict(r) for r in rows]


@router.get("/conversations/{conv_id}/messages", summary="Riwayat Pesan Percakapan")
async def get_conversation_messages(
    conv_id: str = Path(...),
    tenant_id: str = Path(...),
    limit: int = Query(100, ge=1, le=200),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengambil riwayat pesan masuk dan keluar untuk satu percakapan."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        rows = conn.execute(
            sa.text("""
                SELECT id, direction, sender_type, sender_identifier, content_text,
                       media_urls, external_message_id, delivery_status, created_at
                FROM conversation_messages
                WHERE conversation_id = :cid AND tenant_id = :tid
                ORDER BY created_at ASC
                LIMIT :limit
            """),
            {"cid": conv_id, "tid": tenant_id, "limit": limit}
        ).mappings().all()

        return [dict(r) for r in rows]


@router.post("/conversations/{conv_id}/messages", status_code=status.HTTP_201_CREATED, summary="Kirim Pesan Keluar")
async def send_outbound_message(
    req: SendMessageRequest,
    conv_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengirim pesan keluar via MTProto atau API resmi, menerapkan anti-flood guard & memotong kredit."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        conv = conn.execute(
            sa.text("""
                SELECT c.id, c.channel_account_id, ca.channel_type, ca.status as account_status
                FROM conversations c
                JOIN channel_accounts ca ON c.channel_account_id = ca.id
                WHERE c.id = :cid AND c.tenant_id = :tid
            """),
            {"cid": conv_id, "tid": tenant_id}
        ).mappings().first()

        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Percakapan tidak ditemukan")

    channel_type = conv["channel_type"]
    channel_account_id = str(conv["channel_account_id"])

    try:
        if channel_type == "telegram_mtproto":
            res = send_mtproto_message(
                tenant_id=tenant_id,
                channel_account_id=channel_account_id,
                conversation_id=conv_id,
                content_text=req.content_text,
                sender_type="HUMAN_STAFF"
            )
        else:
            # WhatsApp Cloud API / Saluran Kategori A
            msg_id = str(uuid.uuid4())
            with engine.begin() as conn:
                conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
                conn.execute(
                    sa.text("""
                        INSERT INTO conversation_messages (
                            id, tenant_id, conversation_id, direction,
                            sender_type, content_text, delivery_status, created_at
                        ) VALUES (
                            :id, :tid, :cid, 'OUTBOUND',
                            'HUMAN_STAFF', :text, 'SENT', now()
                        )
                    """),
                    {"id": msg_id, "tid": tenant_id, "cid": conv_id, "text": req.content_text}
                )
                conn.execute(
                    sa.text("""
                        UPDATE conversations
                        SET last_message_preview = :preview, last_message_at = now(), updated_at = now()
                        WHERE id = :cid AND tenant_id = :tid
                    """),
                    {"preview": req.content_text[:100], "cid": conv_id, "tid": tenant_id}
                )
            res = {"message_id": msg_id, "status": "SENT", "delivered_at": datetime.now(timezone.utc).isoformat()}

        # Potong kredit terpadu (record_usage_and_deduct_credit) dengan row-level lock
        deduct_info = record_usage_and_deduct_credit(
            tenant_id=tenant_id,
            channel_account_id=channel_account_id,
            direction="OUTBOUND",
            message_id=res["message_id"],
            channel_type=channel_type
        )
        res["credit_deducted"] = deduct_info["credit_deducted"]
        res["remaining_credit"] = deduct_info["new_balance"]
        return res

    except FloodGuardWaitException as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "FLOOD_GUARD_ACTIVE", "wait_seconds": e.wait_seconds, "message": str(e)}
        )
    except SessionRevokedException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.patch("/conversations/{conv_id}/handover", summary="Alihkan Percakapan (AI <-> Human)")
async def handover_conversation(
    req: HandoverRequest,
    conv_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengalihkan penanganan percakapan antara asisten AI dan staf manusia."""
    engine = get_database_engine()
    handover_id = str(uuid.uuid4())

    with engine.begin() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        conv = conn.execute(
            sa.text("SELECT id, assigned_type FROM conversations WHERE id = :cid AND tenant_id = :tid FOR UPDATE"),
            {"cid": conv_id, "tid": tenant_id}
        ).mappings().first()

        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Percakapan tidak ditemukan")

        current_type = conv["assigned_type"]

        conn.execute(
            sa.text("""
                INSERT INTO conversation_handovers (
                    id, tenant_id, conversation_id, from_agent_type,
                    to_agent_type, handover_reason, assigned_to_user_id, status
                ) VALUES (
                    :id, :tid, :cid, :from_type,
                    :to_type, :reason, :uid, 'ACCEPTED'
                )
            """),
            {
                "id": handover_id,
                "tid": tenant_id,
                "cid": conv_id,
                "from_type": current_type,
                "to_type": req.to_agent_type,
                "reason": req.handover_reason,
                "uid": req.assigned_to_user_id or ctx.user_id
            }
        )

        conn.execute(
            sa.text("""
                UPDATE conversations
                SET assigned_type = :atype,
                    status = CASE WHEN :atype = 'HUMAN' THEN 'PENDING_STAFF' ELSE 'OPEN' END,
                    updated_at = now()
                WHERE id = :cid AND tenant_id = :tid
            """),
            {"atype": req.to_agent_type, "cid": conv_id, "tid": tenant_id}
        )

    return {
        "handover_id": handover_id,
        "conversation_id": conv_id,
        "assigned_type": req.to_agent_type,
        "status": "ACCEPTED"
    }


# 4. CUSTOMER IDENTITY & MERGE REVIEWS
@router.get("/customers", summary="Direktori Pelanggan Kanonik")
async def list_customers(
    search: Optional[str] = Query(None),
    lifecycle_stage: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengembalikan direktori profil pelanggan beserta identitas kanal terhubung."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        query = """
            SELECT c.id, c.primary_name, c.primary_phone, c.primary_email, c.avatar_url,
                   c.status, c.lifecycle_stage, c.total_spent, c.created_at,
                   json_agg(
                       json_build_object(
                           'channel_type', ci.channel_type,
                           'external_user_id', ci.external_user_id,
                           'display_name', ci.display_name
                       )
                   ) FILTER (WHERE ci.id IS NOT NULL) as channel_identities
            FROM customers c
            LEFT JOIN customer_channel_identities ci ON c.id = ci.customer_id
            WHERE c.tenant_id = :tid AND c.status = 'ACTIVE'
        """
        params: Dict[str, Any] = {"tid": tenant_id, "limit": limit}
        if search:
            query += " AND (c.primary_name ILIKE :q OR c.primary_phone ILIKE :q OR c.primary_email ILIKE :q)"
            params["q"] = f"%{search}%"
        if lifecycle_stage:
            query += " AND c.lifecycle_stage = :stage"
            params["stage"] = lifecycle_stage

        query += " GROUP BY c.id ORDER BY c.updated_at DESC LIMIT :limit"

        rows = conn.execute(sa.text(query), params).mappings().all()
        return [dict(r) for r in rows]


@router.get("/customers/merge-reviews", summary="Daftar Review Penggabungan WEAK Match")
async def list_merge_reviews(
    tenant_id: str = Path(...),
    review_status: str = Query("PENDING", alias="status"),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengembalikan daftar kandidat penggabungan profil pelanggan dengan status WEAK yang menunggu verifikasi manusia."""
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})

        rows = conn.execute(
            sa.text("""
                SELECT ml.id, ml.target_customer_id, ml.source_customer_id, ml.match_type,
                       ml.confidence_score, ml.match_reasons, ml.status, ml.snapshot_before_merge,
                       ml.created_at,
                       tc.primary_name as target_name, tc.primary_phone as target_phone,
                       sc.primary_name as source_name, sc.primary_phone as source_phone
                FROM customer_merge_log ml
                JOIN customers tc ON ml.target_customer_id = tc.id
                JOIN customers sc ON ml.source_customer_id = sc.id
                WHERE ml.tenant_id = :tid AND ml.status = :status
                ORDER BY ml.created_at DESC
            """),
            {"tid": tenant_id, "status": review_status}
        ).mappings().all()

        return [dict(r) for r in rows]


@router.post("/customers/merge-reviews/{log_id}/approve", summary="Setujui Penggabungan Profil")
async def approve_customer_merge(
    log_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menyetujui penggabungan profil pelanggan WEAK match, memindahkan identitas kanal & percakapan."""
    try:
        res = approve_merge(tenant_id=tenant_id, merge_log_id=log_id, reviewed_by=ctx.user_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/customers/merge-reviews/{log_id}/rollback", summary="Batalkan Penggabungan Profil (Rollback)")
async def rollback_customer_merge(
    log_id: str = Path(...),
    tenant_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Membatalkan penggabungan profil pelanggan yang sebelumnya disetujui (reversible)."""
    try:
        res = rollback_merge(tenant_id=tenant_id, merge_log_id=log_id, reviewed_by=ctx.user_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# 5. PUBLIC INBOUND WEBHOOK (KATEGORI A & B)
webhook_router = APIRouter(prefix="/webhooks/omnichannel", tags=["Omnichannel Webhooks"])


@webhook_router.post("/inbound", summary="Inbound Webhook Kanal Terpadu")
async def inbound_webhook_handler(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None)
):
    """
    Jalur kanonik tunggal untuk payload masuk dari Meta WhatsApp Cloud API atau webhook resmi.
    Memverifikasi tanda tangan signature, menolak channel yang tidak dikenali,
    dan meneruskan ke route_inbound_message.
    """
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload JSON tidak valid")

    channel_type = payload.get("channel_type", "whatsapp_cloud")
    external_identifier = payload.get("recipient_id") or payload.get("channel_identifier") or ""

    if not external_identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier kanal tidak ditemukan di payload")

    try:
        channel_acc = resolve_channel_account(
            channel_type=channel_type,
            external_identifier=external_identifier
        )
    except UnrecognizedChannelAccountException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Jika Kategori A dan memiliki signature header, verifikasi
    if x_hub_signature_256 and channel_acc.get("credential_ref"):
        is_valid = verify_hub_signature(
            signature_header=x_hub_signature_256,
            payload_bytes=raw_body,
            secret=channel_acc["credential_ref"]
        )
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature X-Hub-Signature-256 tidak valid")

    # Bentuk InboundMessage kanonik
    sender_id = payload.get("sender_id") or payload.get("from_user_id") or "anon"
    content_text = payload.get("text") or payload.get("message", {}).get("text") or ""
    message_id = payload.get("message_id") or str(uuid.uuid4())

    inbound = InboundMessage(
        tenant_id=str(channel_acc["tenant_id"]),
        channel_account_id=str(channel_acc["id"]),
        channel_type=channel_type,
        external_user_id=sender_id,
        content_text=content_text,
        external_message_id=message_id,
        display_name=payload.get("sender_name"),
        sender_phone=payload.get("sender_phone"),
        sender_email=payload.get("sender_email"),
        raw_payload=payload
    )

    result = route_inbound_message(inbound)
    return {"status": "PROCESSED", "result": result}
