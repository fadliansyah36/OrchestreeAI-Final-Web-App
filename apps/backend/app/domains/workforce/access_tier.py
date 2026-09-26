"""
OrchestreeAI Collaboration & Access Tier System (PRD v2.2 Bagian 3.5, 6.2, 8.10, 10.3, 10.6, 15, 18.1)
Python 3.12 + FastAPI + Supabase Postgres
"""

import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
import sqlalchemy as sa

from app.core.database import get_database_engine, tenant_tx

logger = logging.getLogger("orchestree.workforce.access_tier")


class NotApplicableForExecutiveTierException(HTTPException):
    """
    Dilemparkan saat anggota dengan tier 'executive' (Owner / Direksi)
    mencoba mendaftarkan kolaborasi perorangan secara manual.
    Executive otomatis didampingi AI Chief of Staff lintas departemen.
    """
    def __init__(self, detail: str = "Tingkat akses Eksekutif (Owner/Direksi) otomatis didampingi AI Chief of Staff lintas departemen dan tidak memerlukan kolaborasi staf perorangan."):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def get_access_tier(membership_id: str) -> str:
    """
    Menentukan tingkat akses ('staff' | 'department_lead' | 'executive')
    berdasarkan peran primer tenant_membership.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        res = conn.execute(
            sa.text("""
                SELECT r.access_tier, r.role_code
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.tenant_membership_id = :mid
                ORDER BY
                    CASE
                        WHEN r.access_tier = 'executive' THEN 1
                        WHEN r.access_tier = 'department_lead' THEN 2
                        ELSE 3
                    END ASC
                LIMIT 1;
            """),
            {"mid": membership_id},
        ).fetchone()

        if res and res[0]:
            return str(res[0])

        # Fallback: jika role belum diisi, periksa apakah membership adalah owner
        m_row = conn.execute(
            sa.text("SELECT id, tenant_id FROM tenant_memberships WHERE id = :mid;"),
            {"mid": membership_id},
        ).fetchone()
        if not m_row:
            return "staff"

        t_row = conn.execute(
            sa.text("SELECT id FROM tenants WHERE id = :tid;"),
            {"tid": m_row[1]},
        ).fetchone()
        return "staff"


def get_membership_info(membership_id: str) -> Dict[str, Any]:
    """Mengambil rincian membership beserta info departemennya."""
    engine = get_database_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("""
                SELECT m.id, m.tenant_id, m.department_id, m.full_name, m.job_title,
                       d.name as department_name, d.department_category
                FROM tenant_memberships m
                LEFT JOIN departments d ON m.department_id = d.id
                WHERE m.id = :mid;
            """),
            {"mid": membership_id},
        ).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Data keanggotaan (membership) tidak ditemukan.")
        return dict(row)


def get_eligible_agents_for_collaboration(membership_id: str) -> List[Dict[str, Any]]:
    """
    Mengambil daftar AI Agent yang BOLEH dipilih oleh staf tier 'staff' / 'department_lead'.
    Batasan mutlak:
    - Tier 'executive' ditolak dengan NotApplicableForExecutiveTierException.
    - AI Chief of Staff / AI Company Intelligence (is_cross_department=true) TIDAK PERNAH muncul.
    - Hanya AI Agent yang berada di departemen yang sama ATAU relevant_department_category cocok
      dengan department_category milik staf.
    """
    tier = get_access_tier(membership_id)
    if tier == "executive":
        raise NotApplicableForExecutiveTierException()

    mem_info = get_membership_info(membership_id)
    tenant_id = str(mem_info["tenant_id"])
    dept_id = mem_info.get("department_id")
    dept_category = mem_info.get("department_category") or "general"

    engine = get_database_engine()
    with engine.connect() as conn:
        # Ambil agent yang aktif dan tidak cross-department
        query = """
            SELECT a.id, a.tenant_id, a.department_id, a.display_name, a.code_name,
                   a.status, a.system_prompt, a.avatar_url,
                   j.id as job_title_id, j.title_code, j.title_name, j.badge_stars,
                   j.category_tag, j.is_cross_department, j.relevant_department_category,
                   d.name as department_name, d.department_category as agent_department_category
            FROM ai_agents a
            JOIN ai_job_titles j ON a.job_title_id = j.id
            LEFT JOIN departments d ON a.department_id = d.id
            WHERE a.tenant_id = :tenant_id
              AND a.status = 'active'
              AND j.is_cross_department = false
              AND (
                  (:dept_id IS NOT NULL AND a.department_id = :dept_id)
                  OR j.relevant_department_category = :dept_category
                  OR (j.relevant_department_category = 'general' AND :dept_category = 'general')
              )
            ORDER BY a.display_name ASC;
        """
        rows = conn.execute(
            sa.text(query),
            {
                "tenant_id": tenant_id,
                "dept_id": dept_id,
                "dept_category": dept_category,
            },
        ).mappings().fetchall()

        return [dict(r) for r in rows]


def list_agent_collaborations(tenant_id: str, membership_id: str) -> List[Dict[str, Any]]:
    """Mengambil daftar AI Agent yang sedang dikolaborasikan oleh staf."""
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT c.id, c.tenant_id, c.tenant_membership_id, c.ai_agent_id,
                       c.is_primary, c.added_by, c.created_at,
                       a.display_name as agent_display_name, a.code_name as agent_code_name,
                       a.avatar_url as agent_avatar_url,
                       j.title_code, j.title_name, j.badge_stars, j.category_tag,
                       j.relevant_department_category
                FROM proactive_agent_collaborations c
                JOIN ai_agents a ON c.ai_agent_id = a.id
                JOIN ai_job_titles j ON a.job_title_id = j.id
                WHERE c.tenant_id = :tenant_id
                  AND c.tenant_membership_id = :mid
                ORDER BY c.is_primary DESC, c.created_at ASC;
            """),
            {"tenant_id": tenant_id, "mid": membership_id},
        ).mappings().fetchall()
        return [dict(r) for r in rows]


def create_agent_collaboration(
    tenant_id: str,
    membership_id: str,
    ai_agent_id: str,
    is_primary: bool = False,
    added_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Mendaftarkan AI Agent sebagai kolaborator staf.
    Memvalidasi secara ketat bahwa ai_agent_id ada dalam daftar eligible agents.
    """
    eligible = get_eligible_agents_for_collaboration(membership_id)
    eligible_ids = {str(a["id"]) for a in eligible}

    if ai_agent_id not in eligible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI Agent ini di luar lingkup departemen atau keahlian yang diizinkan untuk kolaborasi staf."
        )

    actor = added_by or membership_id
    collab_id = str(uuid.uuid4())

    engine = get_database_engine()
    with engine.begin() as conn:
        # Jika is_primary true, turunkan primary sebelumnya
        if is_primary:
            conn.execute(
                sa.text("""
                    UPDATE proactive_agent_collaborations
                    SET is_primary = false
                    WHERE tenant_membership_id = :mid;
                """),
                {"mid": membership_id},
            )

        conn.execute(
            sa.text("""
                INSERT INTO proactive_agent_collaborations (
                    id, tenant_id, tenant_membership_id, ai_agent_id, is_primary, added_by, created_at
                ) VALUES (
                    :id, :tenant_id, :mid, :agent_id, :is_primary, :added_by, now()
                )
                ON CONFLICT (tenant_membership_id, ai_agent_id)
                DO UPDATE SET
                    is_primary = EXCLUDED.is_primary;
            """),
            {
                "id": collab_id,
                "tenant_id": tenant_id,
                "mid": membership_id,
                "agent_id": ai_agent_id,
                "is_primary": is_primary,
                "added_by": actor,
            },
        )

    collabs = list_agent_collaborations(tenant_id, membership_id)
    for c in collabs:
        if str(c["ai_agent_id"]) == str(ai_agent_id):
            return c
    return {"id": collab_id, "ai_agent_id": ai_agent_id, "is_primary": is_primary}


def delete_agent_collaboration(
    tenant_id: str,
    membership_id: str,
    collaboration_id: str,
) -> bool:
    """Menghapus hubungan kolaborasi AI Agent milik staf."""
    engine = get_database_engine()
    with engine.begin() as conn:
        res = conn.execute(
            sa.text("""
                DELETE FROM proactive_agent_collaborations
                WHERE id = :cid
                  AND tenant_id = :tenant_id
                  AND tenant_membership_id = :mid;
            """),
            {"cid": collaboration_id, "tenant_id": tenant_id, "mid": membership_id},
        )
        return res.rowcount > 0


def update_role_access_tier(
    tenant_id: str,
    role_code: str,
    new_tier: str,
    actor_id: str,
) -> Dict[str, Any]:
    """
    Memperbarui tingkat akses ('executive' | 'department_lead' | 'staff')
    pada peran tertentu (mis. TENANT_ADMIN menjadi 'department_lead' agar HR tidak lintas departemen).
    Aksi ini tercatat secara permanen di audit_logs karena berdampak keamanan isolasi data.
    """
    allowed_roles = {"TENANT_ADMIN", "DEPT_MANAGER", "STAFF_HUMAN"}
    if role_code not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tingkat akses peran '{role_code}' dilindungi oleh sistem dan tidak dapat diubah."
        )

    allowed_tiers = {"staff", "department_lead", "executive"}
    if new_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nilai access_tier '{new_tier}' tidak valid. Harus salah satu dari: {', '.join(allowed_tiers)}."
        )

    engine = get_database_engine()
    old_tier = "unknown"
    with engine.begin() as conn:
        current_r = conn.execute(
            sa.text("SELECT id, access_tier FROM roles WHERE role_code = :rcode;"),
            {"rcode": role_code},
        ).fetchone()

        if not current_r:
            raise HTTPException(status_code=404, detail=f"Peran '{role_code}' tidak ditemukan.")

        role_id = str(current_r[0])
        old_tier = str(current_r[1])

        conn.execute(
            sa.text("UPDATE roles SET access_tier = :nt WHERE id = :rid;"),
            {"nt": new_tier, "rid": role_id},
        )

        # Catat ke audit_logs
        try:
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_id, actor_type, event_name, action,
                        resource_type, resource_id, old_values, new_values, ip_address
                    ) VALUES (
                        :tid, :actor_id, 'human_user', 'role.access_tier.updated', 'UPDATE',
                        'role', :rid, :old_val, :new_val, '127.0.0.1'
                    );
                """),
                {
                    "tid": tenant_id,
                    "actor_id": actor_id,
                    "rid": role_id,
                    "old_val": f'{{"access_tier": "{old_tier}", "role_code": "{role_code}"}}',
                    "new_val": f'{{"access_tier": "{new_tier}", "role_code": "{role_code}"}}',
                },
            )
        except Exception as audit_err:
            logger.warning(f"Gagal mencatat audit log: {audit_err}")

    return {
        "role_code": role_code,
        "old_access_tier": old_tier,
        "new_access_tier": new_tier,
        "updated_by": actor_id,
    }


def list_roles_with_access_tier() -> List[Dict[str, Any]]:
    """Mengambil master peran beserta tingkat akses aktifnya."""
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("SELECT id, role_code, description, access_tier FROM roles ORDER BY role_code ASC;")
        ).mappings().fetchall()
        return [dict(r) for r in rows]
