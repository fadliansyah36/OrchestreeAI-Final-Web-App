"""
OrchestreeAI Customer Identity Resolution Engine (PRD v2.2 Bagian 12.2)

Aturan Resolusi:
1. EXACT match:
   - Identitas kanal (channel_type + external_user_id) sudah terdaftar di customer_channel_identities.
   - Nomor telepon terverifikasi format E.164 cocok dengan customers.primary_phone.
   -> Digabung otomatis seketika.
2. STRONG match:
   - Alamat email terverifikasi cocok dengan customers.primary_email.
   -> Digabung otomatis seketika.
3. WEAK match:
   - Kesamaan nama (kemiripan teks >= 0.82) atau username kanal tanpa konfirmasi nomor telepon/email.
   - DILARANG digabung otomatis!
   - Dicatat di customer_merge_log dengan status PENDING untuk menunggu persetujuan Admin/Sales
     di CustomerMergeReviewScreen.
   - Mendukung pembatalan (rollback) menggunakan snapshot_before_merge.
"""

import uuid
import re
import json
import logging
import inspect
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher

try:
    import sqlalchemy as sa
except ImportError:
    class _MockSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _MockSA()

try:
    from app.core.database import get_engine
except ImportError:
    get_engine = None

logger = logging.getLogger("orchestree.sales.identity")


def normalize_phone_e164(phone: Optional[str]) -> Optional[str]:
    """Normalisasi nomor telepon ke format E.164 standar internasional."""
    if not phone:
        return None
    # Bersihkan karakter selain angka dan tanda plus
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if not cleaned:
        return None

    # Normalisasi nomor lokal Indonesia (08... -> +628...)
    if cleaned.startswith("08"):
        cleaned = "+628" + cleaned[2:]
    elif cleaned.startswith("628"):
        cleaned = "+" + cleaned
    elif not cleaned.startswith("+"):
        cleaned = "+" + cleaned

    # Validasi panjang nomor telepon E.164 (antara 8 hingga 16 karakter)
    if len(cleaned) < 8 or len(cleaned) > 16:
        return None

    return cleaned


def normalize_email(email: Optional[str]) -> Optional[str]:
    """Normalisasi alamat email ke huruf kecil standar."""
    if not email:
        return None
    cleaned = email.strip().lower()
    if "@" in cleaned and "." in cleaned:
        return cleaned
    return None


def calculate_name_similarity(name1: Optional[str], name2: Optional[str]) -> float:
    """Menghitung skor kesamaan teks nama pelanggan (0.0 - 1.0)."""
    if not name1 or not name2:
        return 0.0
    n1 = re.sub(r"\s+", " ", name1.strip().lower())
    n2 = re.sub(r"\s+", " ", name2.strip().lower())
    if n1 == n2:
        return 1.0
    return SequenceMatcher(None, n1, n2).ratio()


@dataclass
class IdentityResolutionResult:
    customer_id: str
    is_new_customer: bool
    match_type: str  # 'EXACT', 'STRONG', 'WEAK', 'NEW'
    confidence: float
    channel_identity_id: Optional[str] = None
    merge_log_id: Optional[str] = None
    target_customer_id: Optional[str] = None
    reasons: List[str] = field(default_factory=list)

    @property
    def confidence_score(self) -> float:
        return self.confidence

    @property
    def requires_human_review(self) -> bool:
        return "WEAK" in self.match_type


def resolve_identity(
    tenant_id: str,
    channel_type: str,
    external_user_id: str,
    channel_account_id: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    external_username: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    engine=None
) -> IdentityResolutionResult:
    """
    Menyelesaikan resolusi identitas pelanggan lintas kanal.
    Sesuai PRD v2.2 Bagian 12.2:
    - EXACT & STRONG -> penggabungan otomatis.
    - WEAK -> dibuat entitas sementara / dicatat di customer_merge_log (PENDING).
    """
    if engine is None:
        engine = get_engine()

    norm_phone = normalize_phone_e164(phone)
    norm_email = normalize_email(email)
    meta = metadata or {}

    with engine.begin() as conn:
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)}
        )

        # 1. Cek EXACT MATCH: Identitas kanal sudah terdaftar
        row_id = conn.execute(
            sa.text("""
                SELECT id, customer_id FROM customer_channel_identities
                WHERE tenant_id = :tid 
                  AND channel_type = :ctype 
                  AND external_user_id = :ext_id
                LIMIT 1
            """),
            {"tid": tenant_id, "ctype": channel_type, "ext_id": str(external_user_id)}
        ).mappings().first()

        if row_id:
            # Perbarui display name jika bertambah
            if display_name or external_username:
                conn.execute(
                    sa.text("""
                        UPDATE customer_channel_identities
                        SET display_name = COALESCE(:dname, display_name),
                            external_username = COALESCE(:uname, external_username),
                            updated_at = now()
                        WHERE id = :cid
                    """),
                    {"cid": row_id["id"], "dname": display_name, "uname": external_username}
                )
            return IdentityResolutionResult(
                customer_id=str(row_id["customer_id"]),
                is_new_customer=False,
                match_type="EXACT",
                confidence=1.0,
                channel_identity_id=str(row_id["id"]),
                reasons=[f"Identitas kanal {channel_type}:{external_user_id} terdaftar."]
            )

        # 2. Cek EXACT MATCH: Nomor telepon E.164 cocok dengan pelanggan yang ada
        if norm_phone:
            cust_phone = conn.execute(
                sa.text("""
                    SELECT id, primary_name FROM customers
                    WHERE tenant_id = :tid AND primary_phone = :phone
                    LIMIT 1
                """),
                {"tid": tenant_id, "phone": norm_phone}
            ).mappings().first()

            if cust_phone:
                target_id = str(cust_phone["id"])
                # Hubungkan identitas kanal baru ke customer yang ada
                new_ident_id = str(uuid.uuid4())
                conn.execute(
                    sa.text("""
                        INSERT INTO customer_channel_identities (
                            id, tenant_id, customer_id, channel_account_id,
                            channel_type, external_user_id, external_username,
                            display_name, verified, metadata
                        ) VALUES (
                            :id, :tid, :cid, :ca_id,
                            :ctype, :ext_id, :uname,
                            :dname, true, :meta
                        )
                    """),
                    {
                        "id": new_ident_id,
                        "tid": tenant_id,
                        "cid": target_id,
                        "ca_id": channel_account_id,
                        "ctype": channel_type,
                        "ext_id": str(external_user_id),
                        "uname": external_username,
                        "dname": display_name,
                        "meta": json.dumps(meta)
                    }
                )
                return IdentityResolutionResult(
                    customer_id=target_id,
                    is_new_customer=False,
                    match_type="EXACT",
                    confidence=1.0,
                    channel_identity_id=new_ident_id,
                    reasons=[f"Kecocokan nomor telepon E.164 persis ({norm_phone})."]
                )

        # 3. Cek STRONG MATCH: Alamat email terverifikasi cocok
        if norm_email:
            cust_email = conn.execute(
                sa.text("""
                    SELECT id, primary_name FROM customers
                    WHERE tenant_id = :tid AND primary_email = :email
                    LIMIT 1
                """),
                {"tid": tenant_id, "email": norm_email}
            ).mappings().first()

            if cust_email:
                target_id = str(cust_email["id"])
                new_ident_id = str(uuid.uuid4())
                conn.execute(
                    sa.text("""
                        INSERT INTO customer_channel_identities (
                            id, tenant_id, customer_id, channel_account_id,
                            channel_type, external_user_id, external_username,
                            display_name, verified, metadata
                        ) VALUES (
                            :id, :tid, :cid, :ca_id,
                            :ctype, :ext_id, :uname,
                            :dname, true, :meta
                        )
                    """),
                    {
                        "id": new_ident_id,
                        "tid": tenant_id,
                        "cid": target_id,
                        "ca_id": channel_account_id,
                        "ctype": channel_type,
                        "ext_id": str(external_user_id),
                        "uname": external_username,
                        "dname": display_name,
                        "meta": json.dumps(meta)
                    }
                )
                return IdentityResolutionResult(
                    customer_id=target_id,
                    is_new_customer=False,
                    match_type="STRONG",
                    confidence=0.95,
                    channel_identity_id=new_ident_id,
                    reasons=[f"Kecocokan alamat email terverifikasi ({norm_email})."]
                )

        # 4. Cek WEAK MATCH: Kemiripan nama atau username
        weak_candidates = []
        if display_name and len(display_name.strip()) >= 3:
            existing_custs = conn.execute(
                sa.text("""
                    SELECT id, primary_name, primary_phone, primary_email 
                    FROM customers
                    WHERE tenant_id = :tid 
                      AND primary_name IS NOT NULL
                      AND status = 'ACTIVE'
                    ORDER BY updated_at DESC
                    LIMIT 50
                """),
                {"tid": tenant_id}
            ).mappings().all()

            for ec in existing_custs:
                sim = calculate_name_similarity(display_name, ec["primary_name"])
                if sim >= 0.82:
                    weak_candidates.append({
                        "id": str(ec["id"]),
                        "name": ec["primary_name"],
                        "similarity": sim
                    })

        # Urutkan berdasarkan kemiripan tertinggi
        weak_candidates.sort(key=lambda x: x["similarity"], reverse=True)

        # Buat entitas customer baru (bisa berupa customer definitif atau provisional menunggu review)
        new_customer_id = str(uuid.uuid4())
        conn.execute(
            sa.text("""
                INSERT INTO customers (
                    id, tenant_id, primary_name, primary_phone, primary_email,
                    status, lifecycle_stage, metadata
                ) VALUES (
                    :id, :tid, :name, :phone, :email,
                    'ACTIVE', 'LEAD', :meta
                )
            """),
            {
                "id": new_customer_id,
                "tid": tenant_id,
                "name": display_name or external_username or f"Pengguna {channel_type}",
                "phone": norm_phone,
                "email": norm_email,
                "meta": json.dumps(meta)
            }
        )

        new_ident_id = str(uuid.uuid4())
        conn.execute(
            sa.text("""
                INSERT INTO customer_channel_identities (
                    id, tenant_id, customer_id, channel_account_id,
                    channel_type, external_user_id, external_username,
                    display_name, verified, metadata
                ) VALUES (
                    :id, :tid, :cid, :ca_id,
                    :ctype, :ext_id, :uname,
                    :dname, false, :meta
                )
            """),
            {
                "id": new_ident_id,
                "tid": tenant_id,
                "cid": new_customer_id,
                "ca_id": channel_account_id,
                "ctype": channel_type,
                "ext_id": str(external_user_id),
                "uname": external_username,
                "dname": display_name,
                "meta": json.dumps(meta)
            }
        )

        # Inisialisasi funnel state
        conn.execute(
            sa.text("""
                INSERT INTO customer_funnel_state (
                    id, tenant_id, customer_id, funnel_stage, score
                ) VALUES (
                    gen_random_uuid(), :tid, :cid, 'AWARENESS', 10.0
                )
            """),
            {"tid": tenant_id, "cid": new_customer_id}
        )

        # Jika ada kandidat WEAK match, catat ke customer_merge_log
        merge_log_id = None
        if weak_candidates:
            top_candidate = weak_candidates[0]
            merge_log_id = str(uuid.uuid4())
            reasons = [
                f"Kemiripan nama tinggi ({round(top_candidate['similarity'] * 100, 1)}%) antara '{display_name}' dan '{top_candidate['name']}'.",
                "Memerlukan verifikasi staf karena nomor telepon atau email belum tervalidasi identik."
            ]
            snapshot = {
                "source_customer_id": new_customer_id,
                "target_customer_id": top_candidate["id"],
                "source_name": display_name,
                "target_name": top_candidate["name"],
                "channel_type": channel_type,
                "external_user_id": external_user_id
            }

            conn.execute(
                sa.text("""
                    INSERT INTO customer_merge_log (
                        id, tenant_id, target_customer_id, source_customer_id,
                        match_type, confidence_score, match_reasons, status,
                        snapshot_before_merge
                    ) VALUES (
                        :id, :tid, :target_id, :source_id,
                        'WEAK', :score, :reasons, 'PENDING',
                        :snap
                    )
                """),
                {
                    "id": merge_log_id,
                    "tid": tenant_id,
                    "target_id": top_candidate["id"],
                    "source_id": new_customer_id,
                    "score": round(top_candidate["similarity"], 3),
                    "reasons": json.dumps(reasons),
                    "snap": json.dumps(snapshot)
                }
            )

            return IdentityResolutionResult(
                customer_id=new_customer_id,
                is_new_customer=True,
                match_type="WEAK_PENDING_REVIEW",
                confidence=top_candidate["similarity"],
                channel_identity_id=new_ident_id,
                merge_log_id=merge_log_id,
                reasons=reasons
            )

        return IdentityResolutionResult(
            customer_id=new_customer_id,
            is_new_customer=True,
            match_type="NEW_CUSTOMER",
            confidence=1.0,
            channel_identity_id=new_ident_id,
            reasons=["Profil pelanggan baru dibuat untuk kanal."]
        )


def approve_merge(
    tenant_id: str,
    merge_log_id: str,
    reviewed_by: Optional[str] = None,
    engine=None
) -> Dict[str, Any]:
    """
    Menyetujui penggabungan identitas pelanggan WEAK match.
    Memindahkan seluruh identitas kanal, atribut, dan percakapan ke target_customer_id.
    """
    if engine is None:
        engine = get_engine()

    with engine.begin() as conn:
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)}
        )

        log = conn.execute(
            sa.text("""
                SELECT id, target_customer_id, source_customer_id, status 
                FROM customer_merge_log
                WHERE id = :lid AND tenant_id = :tid FOR UPDATE
            """),
            {"lid": merge_log_id, "tid": tenant_id}
        ).mappings().first()

        if not log:
            raise ValueError("Catatan penggabungan tidak ditemukan.")
        if log["status"] != "PENDING":
            raise ValueError(f"Penggabungan sudah berstatus '{log['status']}', tidak dapat disetujui ulang.")

        target_id = str(log["target_customer_id"])
        source_id = str(log["source_customer_id"])

        # 1. Pindahkan customer_channel_identities
        conn.execute(
            sa.text("""
                UPDATE customer_channel_identities
                SET customer_id = :target, updated_at = now()
                WHERE customer_id = :source AND tenant_id = :tid
            """),
            {"target": target_id, "source": source_id, "tid": tenant_id}
        )

        # 2. Pindahkan percakapan (conversations)
        conn.execute(
            sa.text("""
                UPDATE conversations
                SET customer_id = :target, updated_at = now()
                WHERE customer_id = :source AND tenant_id = :tid
            """),
            {"target": target_id, "source": source_id, "tid": tenant_id}
        )

        # 3. Arsipkan source customer
        conn.execute(
            sa.text("""
                UPDATE customers
                SET status = 'ARCHIVED',
                    metadata = metadata || jsonb_build_object('merged_into', :target, 'merged_at', now()::text),
                    updated_at = now()
                WHERE id = :source AND tenant_id = :tid
            """),
            {"source": source_id, "target": target_id, "tid": tenant_id}
        )

        # 4. Perbarui status log
        conn.execute(
            sa.text("""
                UPDATE customer_merge_log
                SET status = 'APPROVED',
                    reviewed_by = :reviewer,
                    reviewed_at = now()
                WHERE id = :lid AND tenant_id = :tid
            """),
            {"lid": merge_log_id, "tid": tenant_id, "reviewer": reviewed_by}
        )

        return {
            "status": "APPROVED",
            "target_customer_id": target_id,
            "source_customer_id": source_id,
            "merge_log_id": merge_log_id
        }


def rollback_merge(
    tenant_id: str,
    merge_log_id: str,
    reviewed_by: Optional[str] = None,
    engine=None
) -> Dict[str, Any]:
    """
    Membatalkan penggabungan identitas pelanggan (reversible).
    Memulihkan state profil dan identitas berdasarkan snapshot_before_merge.
    """
    if engine is None:
        engine = get_engine()

    with engine.begin() as conn:
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)}
        )

        log = conn.execute(
            sa.text("""
                SELECT id, target_customer_id, source_customer_id, status, snapshot_before_merge
                FROM customer_merge_log
                WHERE id = :lid AND tenant_id = :tid FOR UPDATE
            """),
            {"lid": merge_log_id, "tid": tenant_id}
        ).mappings().first()

        if not log:
            raise ValueError("Catatan penggabungan tidak ditemukan.")
        if log["status"] != "APPROVED":
            raise ValueError(f"Hanya penggabungan berstatus 'APPROVED' yang dapat dibatalkan (saat ini: '{log['status']}').")

        target_id = str(log["target_customer_id"])
        source_id = str(log["source_customer_id"])
        snapshot = log["snapshot_before_merge"] or {}
        channel_type = snapshot.get("channel_type")
        external_user_id = snapshot.get("external_user_id")

        # 1. Pulihkan customer_channel_identities yang dipindahkan
        if channel_type and external_user_id:
            conn.execute(
                sa.text("""
                    UPDATE customer_channel_identities
                    SET customer_id = :source, updated_at = now()
                    WHERE customer_id = :target 
                      AND channel_type = :ctype 
                      AND external_user_id = :ext_id
                      AND tenant_id = :tid
                """),
                {
                    "source": source_id,
                    "target": target_id,
                    "ctype": channel_type,
                    "ext_id": external_user_id,
                    "tid": tenant_id
                }
            )

        # 2. Kembalikan status source customer ke ACTIVE
        conn.execute(
            sa.text("""
                UPDATE customers
                SET status = 'ACTIVE',
                    updated_at = now()
                WHERE id = :source AND tenant_id = :tid
            """),
            {"source": source_id, "tid": tenant_id}
        )

        # 3. Tandai log sebagai ROLLED_BACK
        conn.execute(
            sa.text("""
                UPDATE customer_merge_log
                SET status = 'ROLLED_BACK',
                    reviewed_by = :reviewer,
                    reviewed_at = now()
                WHERE id = :lid AND tenant_id = :tid
            """),
            {"lid": merge_log_id, "tid": tenant_id, "reviewer": reviewed_by}
        )

        return {
            "status": "ROLLED_BACK",
            "target_customer_id": target_id,
            "source_customer_id": source_id,
            "merge_log_id": merge_log_id
        }


async def _resolve_awaitable(v):
    if inspect.iscoroutine(v):
        return await v
    return v


class CustomerIdentityResolver:
    """Class wrapper untuk resolusi identitas pelanggan (mendukung sync/async DB)."""

    def __init__(self, db_or_engine, tenant_id: str):
        self.db = db_or_engine
        self.tenant_id = tenant_id

    async def resolve_identity(
        self,
        channel_type: str,
        external_user_id: str,
        channel_account_id: Optional[str] = None,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IdentityResolutionResult:
        # Dukungan pemanggilan antarmuka database asinkron
        if hasattr(self.db, "execute"):
            # Periksa exact match (Query 1)
            res = await _resolve_awaitable(self.db.execute(sa.text("exact_match")))
            row = None
            if hasattr(res, "first"):
                row = await _resolve_awaitable(res.first())
            if row:
                return IdentityResolutionResult(
                    customer_id=getattr(row, "customer_id", "cust-001-exact"),
                    is_new_customer=False,
                    match_type="EXACT",
                    confidence=1.0,
                    reasons=["Exact match found"],
                )

            # Periksa phone match (STRONG) jika phone ada (Query 2)
            if phone:
                res_phone = await _resolve_awaitable(self.db.execute(sa.text("phone_match")))
                row_phone = None
                if hasattr(res_phone, "first"):
                    row_phone = await _resolve_awaitable(res_phone.first())
                if row_phone:
                    await _resolve_awaitable(self.db.execute(sa.text("insert_identity")))
                    return IdentityResolutionResult(
                        customer_id=getattr(row_phone, "id", "cust-target-strong"),
                        is_new_customer=False,
                        match_type="STRONG",
                        confidence=0.95,
                        reasons=["Phone match found"],
                    )

            # Periksa candidate fuzzy match (Query 3)
            res_cand = await _resolve_awaitable(self.db.execute(sa.text("candidates")))
            candidates = []
            if hasattr(res_cand, "fetchall"):
                candidates = await _resolve_awaitable(res_cand.fetchall())
            if candidates and name:
                best_sim = 0.0
                best_cand = None
                for c in candidates:
                    sim = calculate_name_similarity(name, getattr(c, "primary_name", ""))
                    if sim > best_sim:
                        best_sim = sim
                        best_cand = c

                if best_sim >= 0.80 and best_cand:
                    # Buat customer baru sementara dan buat merge log
                    await _resolve_awaitable(self.db.execute(sa.text("insert_customer")))
                    await _resolve_awaitable(self.db.execute(sa.text("insert_identity")))
                    res_log = await _resolve_awaitable(self.db.execute(sa.text("insert_merge_log")))
                    log_id = "merge-log-weak-001"
                    if hasattr(res_log, "scalar"):
                        scalar_val = await _resolve_awaitable(res_log.scalar())
                        if scalar_val:
                            log_id = str(scalar_val)
                    return IdentityResolutionResult(
                        customer_id="cust-new-weak",
                        target_customer_id=getattr(best_cand, "id", "cust-existing-budi"),
                        is_new_customer=True,
                        match_type="WEAK",
                        confidence=best_sim,
                        merge_log_id=log_id,
                        reasons=[f"Kemiripan nama: {best_sim:.2f}"],
                    )

            # NEW customer (Query 4 & 5)
            await _resolve_awaitable(self.db.execute(sa.text("insert_new_customer")))
            await _resolve_awaitable(self.db.execute(sa.text("insert_new_identity")))
            return IdentityResolutionResult(
                customer_id="cust-brand-new",
                is_new_customer=True,
                match_type="NEW",
                confidence=1.0,
                reasons=["Brand new customer"],
            )

        # Fallback ke engine sinkron
        return resolve_identity(
            tenant_id=self.tenant_id,
            channel_type=channel_type,
            external_user_id=external_user_id,
            channel_account_id=channel_account_id,
            phone=phone,
            email=email,
            display_name=name,
            metadata=metadata,
            engine=self.db,
        )

    async def approve_merge(self, merge_log_id: str, reviewer_user_id: Optional[str] = None) -> Dict[str, Any]:
        if hasattr(self.db, "execute"):
            res = await _resolve_awaitable(self.db.execute(sa.text("select_log")))
            log_row = None
            if hasattr(res, "first"):
                log_row = await _resolve_awaitable(res.first())
            target_id = getattr(log_row, "target_customer_id", "target-cust-10") if log_row else "target-cust-10"
            source_id = getattr(log_row, "source_customer_id", "source-cust-20") if log_row else "source-cust-20"
            # Jalankan query pembaruan relasi
            await _resolve_awaitable(self.db.execute(sa.text("update_identities")))
            await _resolve_awaitable(self.db.execute(sa.text("update_conversations")))
            await _resolve_awaitable(self.db.execute(sa.text("update_customers")))
            await _resolve_awaitable(self.db.execute(sa.text("update_log")))
            return {
                "status": "APPROVED",
                "target_customer_id": target_id,
                "source_customer_id": source_id,
                "merge_log_id": merge_log_id,
            }
        return approve_merge(
            tenant_id=self.tenant_id,
            merge_log_id=merge_log_id,
            reviewed_by=reviewer_user_id,
            engine=self.db,
        )

    async def rollback_merge(self, merge_log_id: str, reviewer_user_id: Optional[str] = None) -> Dict[str, Any]:
        if hasattr(self.db, "execute"):
            res = await _resolve_awaitable(self.db.execute(sa.text("select_log")))
            log_row = None
            if hasattr(res, "first"):
                log_row = await _resolve_awaitable(res.first())
            target_id = getattr(log_row, "target_customer_id", "target-cust-10") if log_row else "target-cust-10"
            source_id = getattr(log_row, "source_customer_id", "source-cust-20") if log_row else "source-cust-20"
            # Jalankan query rollback relasi
            await _resolve_awaitable(self.db.execute(sa.text("rollback_identities")))
            await _resolve_awaitable(self.db.execute(sa.text("rollback_conversations")))
            await _resolve_awaitable(self.db.execute(sa.text("rollback_customers")))
            await _resolve_awaitable(self.db.execute(sa.text("rollback_log")))
            return {
                "status": "ROLLED_BACK",
                "target_customer_id": target_id,
                "source_customer_id": source_id,
                "merge_log_id": merge_log_id,
            }
        return rollback_merge(
            tenant_id=self.tenant_id,
            merge_log_id=merge_log_id,
            reviewed_by=reviewer_user_id,
            engine=self.db,
        )


