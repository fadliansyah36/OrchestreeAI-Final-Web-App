"""
F.01-AGENTCAT: Pipeline Ingest Blueprint Katalog AI Agent (PRD v2.2 Bagian 11.3 & F.01)

Mekanisme ingest terbimbing manual (manual-assisted):
1. propose_blueprint_from_reference():
   Menerima input manual terstruktur dari Super Admin (bukan scraping otomatis),
   memvalidasi perkakas, dan menyimpan dengan status rilis 'internal_review'.
2. validate_blueprint_tools():
   Memverifikasi bahwa seluruh recommended_tool_keys benar-benar ada dan aktif
   di registri mcp_tools platform.
3. promote_blueprint_stage():
   Transisi rilis bertingkat (internal_review -> beta_tenant -> general_availability / deprecated)
   disertai pencatatan audit log dan rollout log lengkap.
4. get_blueprint_adoption_stats():
   Mengambil data adopsi nyata agen AI yang menggunakan blueprint dari database.
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.skills.f01_agentcat.ingest")

VALID_ROLLOUT_STAGES = {
    "internal_review",
    "beta_tenant",
    "general_availability",
    "deprecated",
}

# Daftar perkakas MCP bawaan resmi platform OrchestreeAI
OFFICIAL_BUILTIN_TOOLS = {
    "knowledge.lookup",
    "task.create_from_intent",
    "crm.contact_verify",
    "product.recommend",
    "cart.create",
    "sales.discount.apply",
    "sales.refund.process",
    "sales.order.cancel",
    "sales.custom_contract.create",
    "crm.lead.create",
    "crm.lead.update_stage",
    "crm.lead.record_qualification",
    "crm.lead.recalculate_score",
    "crm.activity.get_timeline",
    "scrape.crawl_target",
    "memory.search",
    "memory.remember",
    "memory.session_resume",
    "memory.consolidate",
}


def compute_source_reference_hash(reference_identity: str) -> str:
    """Menghasilkan hash satu arah SHA-256 untuk deduplikasi internal tanpa mengekspos rujukan asli."""
    if not reference_identity:
        reference_identity = f"orchestree:blueprint:{uuid.uuid4()}"
    return hashlib.sha256(reference_identity.encode("utf-8")).hexdigest()


async def validate_blueprint_tools(recommended_tool_keys: List[str]) -> Tuple[bool, List[str]]:
    """
    Memvalidasi apakah seluruh recommended_tool_keys terdaftar dan aktif di mcp_tools.
    Mengembalikan (is_valid, missing_tools).
    """
    if not recommended_tool_keys:
        return True, []

    missing: List[str] = []
    engine = None
    try:
        engine = get_database_engine()
    except Exception:
        engine = None

    if engine:
        try:
            with engine.connect() as conn:
                res = conn.execute(
                    sa.text("""
                        SELECT DISTINCT COALESCE(tool_name, name) as key_name
                        FROM mcp_tools
                        WHERE is_active = true;
                    """)
                ).fetchall()
                active_tools = {str(r[0]) for r in res if r[0]}

                # Gabungkan dengan perkakas bawaan resmi
                all_valid_tools = active_tools.union(OFFICIAL_BUILTIN_TOOLS)

                for k in recommended_tool_keys:
                    clean_k = k.strip()
                    if clean_k and clean_k not in all_valid_tools:
                        missing.append(clean_k)
        except Exception as e:
            logger.warning(f"Validasi basis data mcp_tools dialihkan ke registri resmi: {e}")
            for k in recommended_tool_keys:
                clean_k = k.strip()
                if clean_k and clean_k not in OFFICIAL_BUILTIN_TOOLS:
                    missing.append(clean_k)
    else:
        # Fallback ke registri perkakas bawaan
        for k in recommended_tool_keys:
            clean_k = k.strip()
            if clean_k and clean_k not in OFFICIAL_BUILTIN_TOOLS:
                missing.append(clean_k)

    return len(missing) == 0, missing


async def propose_blueprint_from_reference(
    industry_category: str,
    display_name: str,
    description: str,
    job_title_id: str,
    structural_role_id: Optional[str] = None,
    default_skill_summary: str = "",
    recommended_tool_keys: Optional[List[str]] = None,
    recommended_model_capability: Optional[str] = "text_reasoning",
    blueprint_code: Optional[str] = None,
    reference_identity: Optional[str] = None,
    operator_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Input manual terstruktur oleh Super Admin untuk mengusulkan blueprint baru.
    Menghasilkan entri agent_blueprint_catalog dengan status 'internal_review'.
    """
    tools = recommended_tool_keys or []
    is_valid, missing = await validate_blueprint_tools(tools)
    if not is_valid:
        raise ValueError(
            f"Perkakas berikut belum terdaftar di MCP Tool Registry: {', '.join(missing)}. "
            f"Daftarkan perkakas tersebut terlebih dahulu atau sesuaikan rekomendasi perkakas."
        )

    if not description or len(description.strip()) < 10:
        raise ValueError("Deskripsi fungsional blueprint wajib diisi secara jelas dengan bahasa sendiri.")

    if not display_name or len(display_name.strip()) < 3:
        raise ValueError("Nama tampilan blueprint wajib diisi secara representatif.")

    if not blueprint_code:
        rand_suffix = uuid.uuid4().hex[:6].upper()
        blueprint_code = f"BP-{industry_category[:4].upper()}-{rand_suffix}"

    source_hash = compute_source_reference_hash(reference_identity or blueprint_code)
    new_id = str(uuid.uuid4())

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))

            # 1. Simpan ke agent_blueprint_catalog
            conn.execute(
                sa.text("""
                    INSERT INTO agent_blueprint_catalog (
                        id, blueprint_code, display_name, description, industry_category,
                        job_title_id, structural_role_id, default_skill_summary,
                        recommended_tool_keys, recommended_model_capability,
                        rollout_stage, source_reference_hash, created_at
                    ) VALUES (
                        :id, :blueprint_code, :display_name, :description, :industry_category,
                        :job_title_id, :structural_role_id, :default_skill_summary,
                        :recommended_tool_keys, :recommended_model_capability,
                        'internal_review', :source_reference_hash, now()
                    );
                """),
                {
                    "id": new_id,
                    "blueprint_code": blueprint_code.strip(),
                    "display_name": display_name.strip(),
                    "description": description.strip(),
                    "industry_category": industry_category.strip(),
                    "job_title_id": job_title_id,
                    "structural_role_id": structural_role_id,
                    "default_skill_summary": default_skill_summary.strip(),
                    "recommended_tool_keys": tools,
                    "recommended_model_capability": recommended_model_capability,
                    "source_reference_hash": source_hash,
                },
            )

            # 2. Catat riwayat tahap awal ke agent_blueprint_rollout_log
            admin_uuid = operator_id or "00000000-0000-0000-0000-000000000001"
            conn.execute(
                sa.text("""
                    INSERT INTO agent_blueprint_rollout_log (
                        id, blueprint_id, from_stage, to_stage, changed_by, reason, changed_at
                    ) VALUES (
                        gen_random_uuid(), :blueprint_id, NULL, 'internal_review', :changed_by,
                        'Pendaftaran usulan blueprint baru oleh Super Admin', now()
                    );
                """),
                {
                    "blueprint_id": new_id,
                    "changed_by": admin_uuid,
                },
            )

            # 3. Catat ke audit_logs
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action,
                        resource_type, resource_id, payload_after
                    ) VALUES (
                        NULL, 'human_user', :actor_id, 'blueprint.proposed',
                        'agent_blueprint_catalog', :res_id,
                        jsonb_build_object(
                            'blueprint_code', :bcode,
                            'display_name', :dname,
                            'rollout_stage', 'internal_review'
                        )
                    );
                """),
                {
                    "actor_id": admin_uuid,
                    "res_id": new_id,
                    "bcode": blueprint_code,
                    "dname": display_name,
                },
            )

    return {
        "id": new_id,
        "blueprint_code": blueprint_code,
        "display_name": display_name,
        "industry_category": industry_category,
        "rollout_stage": "internal_review",
        "recommended_tool_keys": tools,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def promote_blueprint_stage(
    blueprint_id: str,
    to_stage: str,
    reason: str,
    changed_by: str,
) -> Dict[str, Any]:
    """
    Mentransisikan tahap rollout blueprint secara bertingkat:
    internal_review -> beta_tenant -> general_availability / deprecated.
    Merekam agent_blueprint_rollout_log dan audit_logs.
    """
    if to_stage not in VALID_ROLLOUT_STAGES:
        raise ValueError(
            f"Tahap rilis '{to_stage}' tidak valid. Pilihan yang diizinkan: {', '.join(VALID_ROLLOUT_STAGES)}"
        )

    if not reason or len(reason.strip()) < 5:
        raise ValueError("Alasan perubahan tahap rilis wajib dicantumkan secara lengkap untuk keperluan audit.")

    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))

            # Ambil blueprint saat ini
            row = conn.execute(
                sa.text("""
                    SELECT id, blueprint_code, display_name, rollout_stage, recommended_tool_keys
                    FROM agent_blueprint_catalog
                    WHERE id = :id;
                """),
                {"id": blueprint_id},
            ).mappings().first()

            if not row:
                raise ValueError(f"Blueprint dengan ID '{blueprint_id}' tidak ditemukan.")

            current_stage = row["rollout_stage"]

            # Jika akan dipromosikan ke tahap aktif (beta atau general_availability), re-validasi perkakas
            if to_stage in ("beta_tenant", "general_availability"):
                tools = row["recommended_tool_keys"] or []
                is_valid, missing = await validate_blueprint_tools(tools)
                if not is_valid:
                    raise ValueError(
                        f"Blueprint tidak dapat dipromosikan karena perkakas berikut tidak aktif: {', '.join(missing)}"
                    )

            # Update tahap rilis
            conn.execute(
                sa.text("""
                    UPDATE agent_blueprint_catalog
                    SET rollout_stage = :to_stage,
                        updated_at = now()
                    WHERE id = :id;
                """),
                {"to_stage": to_stage, "id": blueprint_id},
            )

            # Catat ke agent_blueprint_rollout_log
            admin_uuid = changed_by or "00000000-0000-0000-0000-000000000001"
            conn.execute(
                sa.text("""
                    INSERT INTO agent_blueprint_rollout_log (
                        id, blueprint_id, from_stage, to_stage, changed_by, reason, changed_at
                    ) VALUES (
                        gen_random_uuid(), :blueprint_id, :from_stage, :to_stage, :changed_by, :reason, now()
                    );
                """),
                {
                    "blueprint_id": blueprint_id,
                    "from_stage": current_stage,
                    "to_stage": to_stage,
                    "changed_by": admin_uuid,
                    "reason": reason.strip(),
                },
            )

            # Catat ke audit_logs
            conn.execute(
                sa.text("""
                    INSERT INTO audit_logs (
                        tenant_id, actor_type, actor_id, action,
                        resource_type, resource_id, payload_after
                    ) VALUES (
                        NULL, 'human_user', :actor_id, 'blueprint.stage_promoted',
                        'agent_blueprint_catalog', :res_id,
                        jsonb_build_object(
                            'blueprint_code', :bcode,
                            'from_stage', :from_stage,
                            'to_stage', :to_stage,
                            'reason', :reason
                        )
                    );
                """),
                {
                    "actor_id": admin_uuid,
                    "res_id": blueprint_id,
                    "bcode": row["blueprint_code"],
                    "from_stage": current_stage,
                    "to_stage": to_stage,
                    "reason": reason.strip(),
                },
            )

    return {
        "blueprint_id": blueprint_id,
        "blueprint_code": row["blueprint_code"],
        "display_name": row["display_name"],
        "from_stage": current_stage,
        "to_stage": to_stage,
        "reason": reason.strip(),
        "changed_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_blueprint_adoption_stats(blueprint_id: str) -> Dict[str, Any]:
    """
    Mengambil statistik adopsi nyata blueprint dari tabel ai_agents dan audit_logs.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        # 1. Total agent aktif yang menggunakan blueprint ini
        active_agents = conn.execute(
            sa.text("""
                SELECT count(*) as count
                FROM ai_agents
                WHERE blueprint_id = :bp_id AND status = 'active';
            """),
            {"bp_id": blueprint_id},
        ).scalar() or 0

        # 2. Total seluruh agen yang pernah dibuat dari blueprint ini
        total_created = conn.execute(
            sa.text("""
                SELECT count(*) as count
                FROM ai_agents
                WHERE blueprint_id = :bp_id;
            """),
            {"bp_id": blueprint_id},
        ).scalar() or 0

        # 3. Jumlah tenant unik yang mengadopsi
        tenant_count = conn.execute(
            sa.text("""
                SELECT count(DISTINCT tenant_id) as count
                FROM ai_agents
                WHERE blueprint_id = :bp_id;
            """),
            {"bp_id": blueprint_id},
        ).scalar() or 0

        # 4. Riwayat perubahan tahap rilis
        rollout_rows = conn.execute(
            sa.text("""
                SELECT from_stage, to_stage, reason, changed_at
                FROM agent_blueprint_rollout_log
                WHERE blueprint_id = :bp_id
                ORDER BY changed_at DESC
                LIMIT 10;
            """),
            {"bp_id": blueprint_id},
        ).mappings().all()

        rollout_history = [
            {
                "from_stage": r["from_stage"],
                "to_stage": r["to_stage"],
                "reason": r["reason"],
                "changed_at": r["changed_at"].isoformat() if r["changed_at"] else None,
            }
            for r in rollout_rows
        ]

    return {
        "blueprint_id": blueprint_id,
        "active_agents_count": active_agents,
        "total_agents_created": total_created,
        "tenant_adoption_count": tenant_count,
        "rollout_history": rollout_history,
    }


async def get_job_title_coverage_stats() -> List[Dict[str, Any]]:
    """
    Menghitung sebaran jumlah blueprint per 15 Jabatan Utama.
    Membantu Super Admin mengidentifikasi jabatan yang belum memiliki pilihan template.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT jt.id as job_title_id,
                       jt.title_code,
                       jt.title_name,
                       jt.category_tag,
                       count(bc.id) as blueprint_count,
                       count(bc.id) FILTER (WHERE bc.rollout_stage = 'general_availability') as ga_count,
                       count(bc.id) FILTER (WHERE bc.rollout_stage = 'beta_tenant') as beta_count,
                       count(bc.id) FILTER (WHERE bc.rollout_stage = 'internal_review') as review_count
                FROM ai_job_titles jt
                LEFT JOIN agent_blueprint_catalog bc ON bc.job_title_id = jt.id AND bc.rollout_stage != 'deprecated'
                GROUP BY jt.id, jt.title_code, jt.title_name, jt.category_tag
                ORDER BY blueprint_count ASC, jt.title_name ASC;
            """)
        ).mappings().all()

        return [
            {
                "job_title_id": str(r["job_title_id"]),
                "title_code": r["title_code"],
                "title_name": r["title_name"],
                "category_tag": r["category_tag"],
                "blueprint_count": int(r["blueprint_count"]),
                "ga_count": int(r["ga_count"]),
                "beta_count": int(r["beta_count"]),
                "review_count": int(r["review_count"]),
            }
            for r in rows
        ]
