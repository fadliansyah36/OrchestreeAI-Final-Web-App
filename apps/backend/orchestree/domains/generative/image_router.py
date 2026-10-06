"""Generative Studio Image Router & Workforce Visual Skill (PRD v2.2 Bagian 11.10, 13.2)

Arsitektur:
- Model Router: OpenAI image model (server-configured) via the canonical Model Router
- Universal Prompt Composer dengan integrasi Brand Asset Locks
- Image Validation Gate dengan penegakan kepatuhan palet warna brand terkunci
- Metadata Stripping Gate: Retrofit menyeluruh untuk seluruh berkas hasil generasi
- Integrasi Credit Wallet: Reserve sebelum eksekusi, Consume saat sukses, Refund saat penolakan/gagal
"""

import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import tenant_tx
from app.core.model_router import get_model_router
from app.domains.billing.credits import (
    reserve_credit,
    consume_credit,
    refund_credit,
    InsufficientCreditError,
)
from apps.backend.orchestree.skills.f01_img.skill import (
    UniversalPromptComposer,
    ImageValidationGate,
    MetadataStripper,
    ValidationResult,
)


class ImageRouterService:
    """
    Layanan orkestrasi generasi gambar AI, validasi kepatuhan brand,
    dan pembersihan metadata menyeluruh.
    """

    DEFAULT_CREDIT_COST = 5.0

    @staticmethod
    def list_prompt_templates(
        tenant_id: str, category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Mengambil template prompt siap pakai untuk tenant."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT id, tenant_id, title, category, template_body,
                       default_negative_prompt, recommended_aspect_ratio,
                       style_tags, credit_estimate, usage_count, created_at
                FROM prompt_library_templates
                WHERE tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if category:
                query += " AND category = :category"
                params["category"] = category
            query += " ORDER BY usage_count DESC, created_at DESC"

            res = conn.execute(sa.text(query), params)
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def create_prompt_template(
        tenant_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Membuat template prompt baru."""
        template_id = str(uuid.uuid4())
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO prompt_library_templates (
                        id, tenant_id, title, category, template_body,
                        default_negative_prompt, recommended_aspect_ratio,
                        style_tags, credit_estimate, created_at
                    ) VALUES (
                        :id, :tenant_id, :title, :category, :template_body,
                        :default_negative_prompt, :recommended_aspect_ratio,
                        :style_tags, :credit_estimate, now()
                    )
                """),
                {
                    "id": template_id,
                    "tenant_id": tenant_id,
                    "title": payload["title"],
                    "category": payload.get("category", "PRODUCT_SHOWCASE"),
                    "template_body": payload["template_body"],
                    "default_negative_prompt": payload.get("default_negative_prompt"),
                    "recommended_aspect_ratio": payload.get("recommended_aspect_ratio", "1:1"),
                    "style_tags": json.dumps(payload.get("style_tags", [])),
                    "credit_estimate": payload.get("credit_estimate", 5.0),
                },
            )
            res = conn.execute(
                sa.text("SELECT * FROM prompt_library_templates WHERE id = :id"),
                {"id": template_id},
            )
            return dict(res.fetchone()._mapping)

    @staticmethod
    def list_brand_locks(tenant_id: str) -> List[Dict[str, Any]]:
        """Mengambil konfigurasi kunci aset brand organisasi."""
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("""
                    SELECT * FROM brand_asset_locks
                    WHERE tenant_id = :tenant_id
                    ORDER BY is_active DESC, created_at DESC
                """),
                {"tenant_id": tenant_id},
            )
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def create_brand_lock(
        tenant_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Mendaftarkan aturan penguncian identitas brand."""
        lock_id = str(uuid.uuid4())
        with tenant_tx(tenant_id) as conn:
            # Jika is_active = true, nonaktifkan lock lama
            if payload.get("is_active", True):
                conn.execute(
                    sa.text("UPDATE brand_asset_locks SET is_active = false WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )

            palette = payload.get("palette_hex_codes") or [payload.get("primary_color", "#1FA35A")]
            conn.execute(
                sa.text("""
                    INSERT INTO brand_asset_locks (
                        id, tenant_id, brand_name, logo_url, primary_color,
                        secondary_color, accent_color, palette_hex_codes,
                        typography_fonts, brand_voice_guidelines,
                        visual_style_keywords, negative_style_keywords,
                        enforce_strict_palette, enforce_logo_presence,
                        max_color_delta_e, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :brand_name, :logo_url, :primary_color,
                        :secondary_color, :accent_color, :palette_hex_codes,
                        :typography_fonts, :brand_voice_guidelines,
                        :visual_style_keywords, :negative_style_keywords,
                        :enforce_strict_palette, :enforce_logo_presence,
                        :max_color_delta_e, :is_active, now(), now()
                    )
                """),
                {
                    "id": lock_id,
                    "tenant_id": tenant_id,
                    "brand_name": payload["brand_name"],
                    "logo_url": payload.get("logo_url"),
                    "primary_color": payload.get("primary_color", "#1FA35A"),
                    "secondary_color": payload.get("secondary_color", "#0B1220"),
                    "accent_color": payload.get("accent_color", "#38BDF8"),
                    "palette_hex_codes": json.dumps(palette),
                    "typography_fonts": json.dumps(payload.get("typography_fonts", ["Plus Jakarta Sans", "Inter"])),
                    "brand_voice_guidelines": payload.get("brand_voice_guidelines", ""),
                    "visual_style_keywords": json.dumps(payload.get("visual_style_keywords", ["clean", "minimalist"])),
                    "negative_style_keywords": json.dumps(payload.get("negative_style_keywords", ["blurry", "low quality"])),
                    "enforce_strict_palette": payload.get("enforce_strict_palette", True),
                    "enforce_logo_presence": payload.get("enforce_logo_presence", False),
                    "max_color_delta_e": payload.get("max_color_delta_e", 25.0),
                    "is_active": payload.get("is_active", True),
                },
            )
            res = conn.execute(
                sa.text("SELECT * FROM brand_asset_locks WHERE id = :id"),
                {"id": lock_id},
            )
            return dict(res.fetchone()._mapping)

    @staticmethod
    def get_active_brand_lock(tenant_id: str) -> Optional[Dict[str, Any]]:
        """Mengambil kunci brand aktif organisasi."""
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("""
                    SELECT * FROM brand_asset_locks
                    WHERE tenant_id = :tenant_id AND is_active = true
                    LIMIT 1
                """),
                {"tenant_id": tenant_id},
            )
            row = res.fetchone()
            return dict(row._mapping) if row else None

    @staticmethod
    def list_jobs(tenant_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Mengambil daftar seluruh pekerjaan generasi gambar."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT j.*, a.public_url as output_image_url, a.verified_clean as output_verified_clean,
                       b.brand_name as locked_brand_name
                FROM generative_jobs j
                LEFT JOIN file_artifacts a ON j.output_artifact_id = a.id
                LEFT JOIN brand_asset_locks b ON j.brand_lock_id = b.id
                WHERE j.tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if status:
                query += " AND j.status = :status"
                params["status"] = status
            query += " ORDER BY j.created_at DESC"

            res = conn.execute(sa.text(query), params)
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def get_job_detail(tenant_id: str, job_id: str) -> Dict[str, Any]:
        """Mengambil detail lengkap pekerjaan generasi gambar beserta scrub log."""
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("""
                    SELECT j.*, a.public_url as output_image_url, a.file_name as output_file_name,
                           a.file_size_bytes as output_file_size, a.checksum_sha256,
                           a.verified_clean as output_verified_clean,
                           b.brand_name as locked_brand_name, b.primary_color as brand_primary_color
                    FROM generative_jobs j
                    LEFT JOIN file_artifacts a ON j.output_artifact_id = a.id
                    LEFT JOIN brand_asset_locks b ON j.brand_lock_id = b.id
                    WHERE j.id = :job_id AND j.tenant_id = :tenant_id
                """),
                {"job_id": job_id, "tenant_id": tenant_id},
            )
            row = res.fetchone()
            if not row:
                raise ValueError(f"Generative job {job_id} tidak ditemukan.")
            job_data = dict(row._mapping)

            # Ambil log pembersihan metadata jika ada
            scrub_res = conn.execute(
                sa.text("""
                    SELECT * FROM content_metadata_scrub_log
                    WHERE job_id = :job_id AND tenant_id = :tenant_id
                    ORDER BY scrubbed_at DESC
                """),
                {"job_id": job_id, "tenant_id": tenant_id},
            )
            job_data["scrub_logs"] = [dict(s._mapping) for s in scrub_res.fetchall()]
            return job_data

    @staticmethod
    def create_and_execute_job(
        tenant_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Alur Lengkap Generative Studio:
        1. Universal Prompt Composer (injeksi brand lock jika aktif).
        2. Reserve kredit dari dompet tenant.
        3. Model Router generasi visual (Prioritas 1: GPT-Image-2, Fallback: NVIDIA NIM).
        4. Image Validation Gate:
           - Memeriksa integritas dan kepatuhan palet warna terkunci.
           - Jika menyimpang: TOLAK (status REJECTED), refund kredit, batalkan publikasi.
        5. Metadata Stripping Gate:
           - Pembersihan 100% EXIF, XMP, C2PA, model signatures.
           - Catat log pembersihan (`stripped_fields`, `verified_clean = true`).
        6. Simpan file artifact bersih (`verified_clean = true`).
        7. Selesaikan pemotongan kredit (Consume).
        """
        job_id = str(uuid.uuid4())
        raw_prompt = payload.get("prompt", "").strip()
        if not raw_prompt:
            raise ValueError("Prompt deskripsi visual tidak boleh kosong.")

        job_type = payload.get("job_type", "IMAGE_GENERATION")
        aspect_ratio = payload.get("aspect_ratio", "1:1")
        style_preset = payload.get("style_preset")
        # The browser may provide a display hint, but the executable model is
        # always selected server-side by the canonical Model Router.
        model_selection = settings.OPENAI_IMAGE_MODEL or "unconfigured"
        credit_cost = float(payload.get("credit_cost", ImageRouterService.DEFAULT_CREDIT_COST))
        force_fail_for_test = bool(payload.get("force_fail_for_test", False))

        # 1. Periksa Brand Asset Lock
        brand_lock_id = payload.get("brand_lock_id")
        brand_lock = None
        with tenant_tx(tenant_id) as conn:
            if brand_lock_id:
                res = conn.execute(
                    sa.text("SELECT * FROM brand_asset_locks WHERE id = :id AND tenant_id = :tenant_id"),
                    {"id": brand_lock_id, "tenant_id": tenant_id},
                )
                row = res.fetchone()
                if row:
                    brand_lock = dict(row._mapping)
            else:
                res = conn.execute(
                    sa.text("SELECT * FROM brand_asset_locks WHERE tenant_id = :tenant_id AND is_active = true LIMIT 1"),
                    {"tenant_id": tenant_id},
                )
                row = res.fetchone()
                if row:
                    brand_lock = dict(row._mapping)
                    brand_lock_id = brand_lock["id"]

        # 2. Universal Prompt Composer
        composed_prompt, clean_negatives = UniversalPromptComposer.compose(
            user_prompt=raw_prompt,
            category=job_type,
            aspect_ratio=aspect_ratio,
            negative_prompt=payload.get("negative_prompt"),
            style_preset=style_preset,
            brand_lock=brand_lock,
        )

        # 3. Reserve Credit (Fase 8 Ledger)
        reservation = reserve_credit(
            tenant_id=tenant_id,
            estimated_cost=credit_cost,
            reference_type="GENERATIVE_JOB",
            reference_id=job_id,
            metadata={"job_type": job_type, "model_used": model_selection, "aspect_ratio": aspect_ratio},
        )

        # Simpan state awal job PENDING
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO generative_jobs (
                        id, tenant_id, job_type, prompt, composed_prompt,
                        negative_prompt, aspect_ratio, style_preset,
                        model_used, status, brand_lock_applied,
                        brand_lock_id, credit_cost, credit_reserved,
                        credit_consumed, created_at
                    ) VALUES (
                        :id, :tenant_id, :job_type, :prompt, :composed_prompt,
                        :negative_prompt, :aspect_ratio, :style_preset,
                        :model_used, 'GENERATING', :brand_lock_applied,
                        :brand_lock_id, :credit_cost, true, false, now()
                    )
                """),
                {
                    "id": job_id,
                    "tenant_id": tenant_id,
                    "job_type": job_type,
                    "prompt": raw_prompt,
                    "composed_prompt": composed_prompt,
                    "negative_prompt": clean_negatives,
                    "aspect_ratio": aspect_ratio,
                    "style_preset": style_preset,
                    "model_used": model_selection,
                    "brand_lock_applied": bool(brand_lock),
                    "brand_lock_id": brand_lock_id,
                    "credit_cost": credit_cost,
                },
            )

        # 4. Model Router Dispatch
        # Menjalankan generasi visual nyata melalui Model Router GPT-Image-2 (Prioritas Tunggal)
        raw_image_bytes = ImageRouterService._generate_via_openai_image(
            prompt=composed_prompt,
            aspect_ratio=aspect_ratio,
            tenant_id=tenant_id,
            job_id=job_id,
            workflow_execution_id=payload.get("workflow_execution_id"),
        )

        # 5. Image Validation Gate
        validation: ValidationResult = ImageValidationGate.validate(
            image_bytes=raw_image_bytes,
            aspect_ratio=aspect_ratio,
            brand_lock=brand_lock,
            force_fail_for_test=force_fail_for_test,
        )

        if not validation.is_valid:
            # Output Validator Menolak hasil yang menyimpang dari Brand Lock!
            # Refund kredit yang sebelumnya di-reserve
            refund_credit(
                reservation_id=reservation.id,
                refund_reason=f"Generative Output Gate: {validation.rejection_reason}",
            )

            with tenant_tx(tenant_id) as conn:
                conn.execute(
                    sa.text("""
                        UPDATE generative_jobs
                        SET status = 'REJECTED',
                            rejection_reason = :rejection_reason,
                            quality_metrics = :quality_metrics,
                            credit_reserved = false,
                            credit_consumed = false,
                            completed_at = now()
                        WHERE id = :id AND tenant_id = :tenant_id
                    """),
                    {
                        "id": job_id,
                        "tenant_id": tenant_id,
                        "rejection_reason": validation.rejection_reason,
                        "quality_metrics": json.dumps(validation.quality_metrics),
                    },
                )

            return ImageRouterService.get_job_detail(tenant_id, job_id)

        # 6. Metadata Stripping Gate (100% EXIF, XMP, C2PA, AI Model Signatures Stripped)
        filename = f"gen_asset_{job_id[:8]}.png"
        clean_bytes, stripped_fields, scrub_details = MetadataStripper.strip(
            raw_bytes=raw_image_bytes, filename=filename
        )

        # 7. Simpan File Artifacts Bersih
        artifact_id = str(uuid.uuid4())
        public_url = f"/api/v1/storage/artifacts/{artifact_id}.png"
        storage_path = f"artifacts/{tenant_id}/{artifact_id}.png"
        width = validation.quality_metrics.get("width", 1024)
        height = validation.quality_metrics.get("height", 1024)
        checksum = scrub_details["checksum_sha256"]

        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO file_artifacts (
                        id, tenant_id, job_id, file_name, storage_path,
                        public_url, mime_type, file_size_bytes, width,
                        height, checksum_sha256, verified_clean, created_at
                    ) VALUES (
                        :id, :tenant_id, :job_id, :file_name, :storage_path,
                        :public_url, 'image/png', :file_size_bytes, :width,
                        :height, :checksum_sha256, true, now()
                    )
                """),
                {
                    "id": artifact_id,
                    "tenant_id": tenant_id,
                    "job_id": job_id,
                    "file_name": filename,
                    "storage_path": storage_path,
                    "public_url": public_url,
                    "file_size_bytes": len(clean_bytes),
                    "width": width,
                    "height": height,
                    "checksum_sha256": checksum,
                },
            )

            # Catat Audit Log Pembersihan Metadata
            conn.execute(
                sa.text("""
                    INSERT INTO content_metadata_scrub_log (
                        id, tenant_id, artifact_id, job_id, source_module,
                        original_filename, cleaned_filename, stripped_fields,
                        verified_clean, scrub_details, scrubbed_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :artifact_id, :job_id,
                        'GENERATIVE_STUDIO', :orig_name, :clean_name,
                        :stripped_fields, true, :scrub_details, now()
                    )
                """),
                {
                    "tenant_id": tenant_id,
                    "artifact_id": artifact_id,
                    "job_id": job_id,
                    "orig_name": filename,
                    "clean_name": f"clean_{filename}",
                    "stripped_fields": json.dumps(stripped_fields),
                    "scrub_details": json.dumps(scrub_details),
                },
            )

        # 8. Selesaikan Konsumsi Kredit (Consume)
        consume_credit(
            reservation_id=reservation.id,
            actual_cost=credit_cost,
            audit_metadata={"job_id": job_id, "artifact_id": artifact_id, "checksum": checksum},
        )

        # 9. Update Status Generative Job Menjadi COMPLETED
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    UPDATE generative_jobs
                    SET status = 'COMPLETED',
                        output_artifact_id = :artifact_id,
                        credit_reserved = false,
                        credit_consumed = true,
                        quality_metrics = :quality_metrics,
                        completed_at = now()
                    WHERE id = :id AND tenant_id = :tenant_id
                """),
                {
                    "id": job_id,
                    "tenant_id": tenant_id,
                    "artifact_id": artifact_id,
                    "quality_metrics": json.dumps(validation.quality_metrics),
                },
            )

            # Catat jejak pemakaian template jika pekerjaan ini berasal dari template pustaka
            template_id = payload.get("template_id")
            if template_id:
                try:
                    conn.execute(
                        sa.text("""
                            INSERT INTO prompt_template_usage_log (
                                id, template_id, tenant_id, generative_job_id, used_at
                            ) VALUES (
                                gen_random_uuid(), :template_id, :tenant_id, :job_id, now()
                            )
                        """),
                        {
                            "template_id": template_id,
                            "tenant_id": tenant_id,
                            "job_id": job_id,
                        },
                    )
                    conn.execute(
                        sa.text("""
                            UPDATE prompt_template_library
                            SET usage_count = usage_count + 1,
                                updated_at = now()
                            WHERE id = :template_id
                        """),
                        {"template_id": template_id},
                    )
                except Exception as log_err:
                    import logging
                    logging.getLogger("uvicorn.error").warning("Gagal mencatat jejak pemakaian template prompt: %s", log_err)

        return ImageRouterService.get_job_detail(tenant_id, job_id)

    @staticmethod
    def _generate_via_openai_image(
        prompt: str,
        aspect_ratio: str,
        tenant_id: str,
        job_id: str,
        workflow_execution_id: Optional[str] = None,
    ) -> bytes:
        """
        Generate a real image through the single canonical Model Router.

        Provider credentials, endpoint, and model are server-side only.
        There is no direct provider SDK/API call in the Generative Studio domain.
        """
        result = get_model_router().generate_image_sync(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            tenant_id=tenant_id,
            workflow_execution_id=workflow_execution_id or job_id,
        )
        if result.status != "success" or not result.content_bytes:
            raise RuntimeError(result.error_message or "OpenAI image generation failed.")
        return result.content_bytes

    @staticmethod
    def list_artifacts(tenant_id: str, verified_only: bool = True) -> List[Dict[str, Any]]:
        """Mengambil galeri berkas visual bersih milik tenant."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT a.*, j.prompt, j.job_type, j.model_used, j.quality_metrics
                FROM file_artifacts a
                LEFT JOIN generative_jobs j ON a.job_id = j.id
                WHERE a.tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if verified_only:
                query += " AND a.verified_clean = true"
            query += " ORDER BY a.created_at DESC"

            res = conn.execute(sa.text(query), params)
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def list_scrub_logs(tenant_id: str, artifact_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Mengambil audit trail pembersihan metadata."""
        with tenant_tx(tenant_id) as conn:
            query = """
                SELECT * FROM content_metadata_scrub_log
                WHERE tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if artifact_id:
                query += " AND artifact_id = :artifact_id"
                params["artifact_id"] = artifact_id
            query += " ORDER BY scrubbed_at DESC"

            res = conn.execute(sa.text(query), params)
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def list_prompt_categories(tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Mengambil seluruh kategori master data template prompt beserta jumlah template aktif."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.connect() as conn:
            res = conn.execute(
                sa.text("""
                    SELECT c.id, c.category_code, c.display_name, c.description, c.icon_key, c.display_order, c.created_at,
                           COUNT(t.id) as template_count
                    FROM prompt_template_categories c
                    LEFT JOIN prompt_template_library t ON c.id = t.category_id AND (t.is_global = true OR (:tid IS NOT NULL AND t.tenant_id = CAST(:tid AS uuid)))
                    GROUP BY c.id, c.category_code, c.display_name, c.description, c.icon_key, c.display_order, c.created_at
                    ORDER BY c.display_order ASC, c.category_code ASC
                """),
                {"tid": tenant_id}
            )
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def create_prompt_category(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Menambahkan kategori master data template baru."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        cat_id = str(uuid.uuid4())
        with engine.begin() as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO prompt_template_categories (
                        id, category_code, display_name, description, icon_key, display_order, created_at
                    ) VALUES (
                        :id, :code, :name, :desc, :icon, :order, now()
                    )
                """),
                {
                    "id": cat_id,
                    "code": payload["category_code"],
                    "name": payload["display_name"],
                    "desc": payload.get("description", ""),
                    "icon": payload.get("icon_key", "layers"),
                    "order": payload.get("display_order", 0),
                }
            )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_template_categories WHERE id = :id"),
                {"id": cat_id}
            ).fetchone()
            return dict(row._mapping)

    @staticmethod
    def update_prompt_category(category_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Memperbarui master data kategori template."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.begin() as conn:
            fields = []
            params: Dict[str, Any] = {"id": category_id}
            for k in ["display_name", "description", "icon_key", "display_order"]:
                if k in payload and payload[k] is not None:
                    fields.append(f"{k} = :{k}")
                    params[k] = payload[k]
            if fields:
                conn.execute(
                    sa.text(f"UPDATE prompt_template_categories SET {', '.join(fields)} WHERE id = :id"),
                    params
                )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_template_categories WHERE id = :id"),
                {"id": category_id}
            ).fetchone()
            if not row:
                raise ValueError(f"Kategori {category_id} tidak ditemukan.")
            return dict(row._mapping)

    @staticmethod
    def delete_prompt_category(category_id: str) -> bool:
        """Menghapus kategori template."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.begin() as conn:
            conn.execute(
                sa.text("DELETE FROM prompt_template_categories WHERE id = :id"),
                {"id": category_id}
            )
            return True

    # ==============================================================================
    # KELUARGA GAYA VISUAL (SUMBU KEDUA) (PRD v2.2 Bagian 11.10, 13.2, H.1)
    # ==============================================================================

    @staticmethod
    def list_prompt_styles(tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Mengambil seluruh keluarga gaya visual beserta jumlah template yang menggunakannya."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.connect() as conn:
            res = conn.execute(
                sa.text("""
                    SELECT s.id, s.style_code, s.display_name, s.description, s.icon_key, s.display_order, s.created_at,
                           COUNT(t.id) as template_count
                    FROM prompt_style_families s
                    LEFT JOIN prompt_template_library t ON s.id = t.style_family_id AND (t.is_global = true OR (:tid IS NOT NULL AND t.tenant_id = CAST(:tid AS uuid)))
                    GROUP BY s.id, s.style_code, s.display_name, s.description, s.icon_key, s.display_order, s.created_at
                    ORDER BY s.display_order ASC, s.style_code ASC
                """),
                {"tid": tenant_id}
            )
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def create_prompt_style(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Menambahkan keluarga gaya visual baru."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        style_id = str(uuid.uuid4())
        with engine.begin() as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO prompt_style_families (
                        id, style_code, display_name, description, icon_key, display_order, created_at
                    ) VALUES (
                        :id, :code, :name, :desc, :icon, :order, now()
                    )
                """),
                {
                    "id": style_id,
                    "code": payload["style_code"],
                    "name": payload["display_name"],
                    "desc": payload.get("description", ""),
                    "icon": payload.get("icon_key", "shapes"),
                    "order": payload.get("display_order", 0),
                }
            )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_style_families WHERE id = :id"),
                {"id": style_id}
            ).fetchone()
            return dict(row._mapping)

    @staticmethod
    def update_prompt_style(style_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Memperbarui metadata keluarga gaya visual."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.begin() as conn:
            fields = []
            params: Dict[str, Any] = {"id": style_id}
            for k in ["display_name", "description", "icon_key", "display_order"]:
                if k in payload and payload[k] is not None:
                    fields.append(f"{k} = :{k}")
                    params[k] = payload[k]
            if fields:
                conn.execute(
                    sa.text(f"UPDATE prompt_style_families SET {', '.join(fields)} WHERE id = :id"),
                    params
                )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_style_families WHERE id = :id"),
                {"id": style_id}
            ).fetchone()
            if not row:
                raise ValueError(f"Gaya visual {style_id} tidak ditemukan.")
            return dict(row._mapping)

    @staticmethod
    def delete_prompt_style(style_id: str) -> bool:
        """Menghapus keluarga gaya visual."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.begin() as conn:
            conn.execute(
                sa.text("DELETE FROM prompt_style_families WHERE id = :id"),
                {"id": style_id}
            )
            return True

    # ==============================================================================
    # SEEDING BATCHES (AUDIT & APPROVAL KONTROL BIAYA)
    # ==============================================================================

    @staticmethod
    def list_seeding_batches() -> List[Dict[str, Any]]:
        """Mengambil riwayat dan status batch seeding template prompt."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.connect() as conn:
            res = conn.execute(
                sa.text("""
                    SELECT b.*,
                           (SELECT count(*) FROM prompt_template_library WHERE seeding_batch_id = b.id) as generated_count
                    FROM prompt_library_seeding_batches b
                    ORDER BY b.created_at DESC
                """)
            )
            return [dict(r._mapping) for r in res.fetchall()]

    @staticmethod
    def create_seeding_batch(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Membuat batch seeding baru dengan status awal pending_approval."""
        from app.core.database import get_database_engine
        import json
        engine = get_database_engine()
        batch_id = str(uuid.uuid4())
        plan_details = payload.get("plan_details", [])
        with engine.begin() as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO prompt_library_seeding_batches (
                        id, batch_label, requested_template_count, estimated_total_credit,
                        actual_total_credit, status, plan_details, created_at
                    ) VALUES (
                        :id, :label, :req_count, :est_credit, 0, 'pending_approval',
                        :plan_details, now()
                    )
                """),
                {
                    "id": batch_id,
                    "label": payload["batch_label"],
                    "req_count": payload["requested_template_count"],
                    "est_credit": payload.get("estimated_total_credit", payload["requested_template_count"] * 5.0),
                    "plan_details": json.dumps(plan_details),
                }
            )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_library_seeding_batches WHERE id = :id"),
                {"id": batch_id}
            ).fetchone()
            return dict(row._mapping)

    @staticmethod
    def update_seeding_batch_status(batch_id: str, status_val: str, approved_by: Optional[str] = None) -> Dict[str, Any]:
        """Memperbarui status batch seeding (approval, running, completed, failed)."""
        from app.core.database import get_database_engine
        engine = get_database_engine()
        with engine.begin() as conn:
            fields = ["status = :status"]
            params: Dict[str, Any] = {"id": batch_id, "status": status_val}
            if approved_by:
                fields.append("approved_by = CAST(:approved_by AS uuid)")
                params["approved_by"] = approved_by
            if status_val == "completed":
                fields.append("completed_at = now()")

            conn.execute(
                sa.text(f"UPDATE prompt_library_seeding_batches SET {', '.join(fields)} WHERE id = :id"),
                params
            )
            row = conn.execute(
                sa.text("SELECT * FROM prompt_library_seeding_batches WHERE id = :id"),
                {"id": batch_id}
            ).fetchone()
            if not row:
                raise ValueError(f"Batch seeding {batch_id} tidak ditemukan.")
            return dict(row._mapping)

    @staticmethod
    def execute_seeding_batch(
        batch_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        workflow_execution_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mengeksekusi batch seeding template prompt yang telah disetujui (approved):
        1. Memvalidasi status batch adalah 'approved'.
        2. Mengambil detail rencana (plan_details).
        3. Menjalankan generasi visual via Model Router & Stripping Gate untuk setiap template.
        4. Memotong kredit secara riil melalui credit ledger (tenant_credit_transactions) per generasi.
        5. Menyimpan template atomik baru ke prompt_template_library dengan seeding_batch_id.
        6. Mencatat actual_total_credit nyata dan menandai batch sebagai completed.
        """
        from app.core.database import get_database_engine
        import json
        engine = get_database_engine()

        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT * FROM prompt_library_seeding_batches WHERE id = :id"),
                {"id": batch_id}
            ).fetchone()
            if not row:
                raise ValueError(f"Batch seeding {batch_id} tidak ditemukan.")
            batch = dict(row._mapping)

        if batch.get("status") != "approved":
            raise ValueError(f"Batch seeding harus berstatus 'approved' sebelum dieksekusi. Status saat ini: '{batch.get('status')}'.")

        # Update status menjadi 'running' sesuai check constraint DB
        with engine.begin() as conn:
            conn.execute(
                sa.text("UPDATE prompt_library_seeding_batches SET status = 'running' WHERE id = :id"),
                {"id": batch_id}
            )

        plan = batch.get("plan_details")
        if isinstance(plan, str):
            try:
                plan = json.loads(plan)
            except Exception:
                plan = []
        if not isinstance(plan, list) or len(plan) == 0:
            plan = [{
                "template_name": f"Koleksi Batch {batch.get('batch_label')} #1",
                "concept_summary": "Template visual terkurasi dari batch seeding",
                "category_code": "social_media_post",
                "style_code": "studio_realism",
                "subject_field": "Produk UMKM unggulan dengan kemasan profesional",
                "scene_context_field": "Studio foto minimalis dengan pencahayaan hangat",
                "lighting_field": "Soft studio diffused lighting dengan rim light lembut",
                "material_texture_field": "Tekstur material tajam, matte finish",
                "composition_layout_field": "Center hero framing dengan depth of field sinematik",
                "color_palette_field": "Palet warna harmonis hangat",
                "style_reference_field": "Editorial commercial studio product photography",
                "avoid_terms": ["blurry", "watermark", "oversaturated", "amateur"],
                "prefer_terms": ["crisp detail", "sharp focus"],
                "recommended_aspect_ratio": "1:1",
                "recommended_platform": ["instagram", "marketplace"]
            }]

        total_consumed_credits = 0.0
        generated_templates = []

        try:
            for item in plan:
                tpl_name = item.get("template_name", "Template Batch Seeding")
                concept = item.get("concept_summary", "Batch generated template")
                cat_code = item.get("category_code", "social_media_post")
                style_code = item.get("style_code", "studio_realism")

                job_payload = {
                    "job_type": cat_code.upper(),
                    "prompt": f"{item.get('subject_field', tpl_name)}, {item.get('scene_context_field', '')}, {item.get('lighting_field', '')}, {item.get('style_reference_field', '')}",
                    "negative_prompt": ", ".join(item.get("avoid_terms", ["blurry", "low quality"])),
                    "aspect_ratio": item.get("recommended_aspect_ratio", "1:1"),
                    "style_preset": style_code,
                    "model_used": "gpt-image-2",
                    "credit_cost": 5.0,
                    "workflow_execution_id": workflow_execution_id,
                }

                gen_job = ImageRouterService.create_and_execute_job(tenant_id, job_payload)
                consumed_credit = 5.0
                total_consumed_credits += consumed_credit

                with engine.begin() as conn:
                    cat_r = conn.execute(
                        sa.text("SELECT id FROM prompt_template_categories WHERE category_code = :c"),
                        {"c": cat_code}
                    ).fetchone()
                    cat_id = str(cat_r[0]) if cat_r else None
                    if not cat_id:
                        cat_first = conn.execute(sa.text("SELECT id FROM prompt_template_categories LIMIT 1")).fetchone()
                        cat_id = str(cat_first[0])

                    style_r = conn.execute(
                        sa.text("SELECT id FROM prompt_style_families WHERE style_code = :s"),
                        {"s": style_code}
                    ).fetchone()
                    style_id = str(style_r[0]) if style_r else None

                    tpl_id = str(uuid.uuid4())
                    conn.execute(
                        sa.text("""
                            INSERT INTO prompt_template_library (
                                id, category_id, style_family_id, template_name, concept_summary,
                                subject_field, scene_context_field, lighting_field,
                                material_texture_field, composition_layout_field,
                                color_palette_field, style_reference_field, constraints_field,
                                avoid_terms, prefer_terms, recommended_aspect_ratio,
                                recommended_platform, example_generated_file_artifact_id,
                                is_global, tenant_id, usage_count, seeding_batch_id,
                                created_at, updated_at
                            ) VALUES (
                                :id, :cat_id, :style_id, :name, :concept,
                                :subject, :scene, :lighting,
                                :material, :composition,
                                :color, :style_ref, :constraints,
                                :avoid_terms, :prefer_terms, :aspect_ratio,
                                :platforms, :artifact_id,
                                true, null, 0, :batch_id,
                                now(), now()
                            )
                        """),
                        {
                            "id": tpl_id,
                            "cat_id": cat_id,
                            "style_id": style_id,
                            "name": tpl_name,
                            "concept": concept,
                            "subject": item.get("subject_field", ""),
                            "scene": item.get("scene_context_field", ""),
                            "lighting": item.get("lighting_field", ""),
                            "material": item.get("material_texture_field", ""),
                            "composition": item.get("composition_layout_field", ""),
                            "color": item.get("color_palette_field", ""),
                            "style_ref": item.get("style_reference_field", ""),
                            "constraints": item.get("constraints_field", ""),
                            "avoid_terms": item.get("avoid_terms", []),
                            "prefer_terms": item.get("prefer_terms", []),
                            "aspect_ratio": item.get("recommended_aspect_ratio", "1:1"),
                            "platforms": item.get("recommended_platform", []),
                            "artifact_id": gen_job.get("output_artifact_id"),
                            "batch_id": batch_id,
                        }
                    )
                    generated_templates.append({
                        "id": tpl_id,
                        "template_name": tpl_name,
                        "artifact_id": gen_job.get("output_artifact_id")
                    })

            with engine.begin() as conn:
                conn.execute(
                    sa.text("""
                        UPDATE prompt_library_seeding_batches
                        SET status = 'completed',
                            actual_total_credit = :actual_credit,
                            completed_at = now()
                        WHERE id = :id
                    """),
                    {"id": batch_id, "actual_credit": total_consumed_credits}
                )

            return {
                "batch_id": batch_id,
                "status": "completed",
                "actual_total_credit": total_consumed_credits,
                "generated_count": len(generated_templates),
                "templates": generated_templates,
            }

        except Exception as exc:
            with engine.begin() as conn:
                conn.execute(
                    sa.text("""
                        UPDATE prompt_library_seeding_batches
                        SET status = 'failed',
                            actual_total_credit = :actual_credit
                        WHERE id = :id
                    """),
                    {"id": batch_id, "actual_credit": total_consumed_credits}
                )
            raise exc

    @staticmethod
    def list_prompt_library_templates(
        tenant_id: str,
        category_code: Optional[str] = None,
        style_code: Optional[str] = None,
        scope: str = "all",
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Mengambil pustaka template prompt atomik dengan gambar contoh nyata,
        diurutkan berdasarkan rekomendasi riwayat penggunaan tenant dan popularitas.
        Mendukung filter taksonomi dua sumbu: Kebutuhan Bisnis (category_code) × Gaya Visual (style_code).
        """
        with tenant_tx(tenant_id) as conn:
            # Identifikasi kategori yang paling sering digunakan oleh tenant ini
            frequent_categories_res = conn.execute(
                sa.text("""
                    SELECT c.category_code, COUNT(u.id) as freq
                    FROM prompt_template_usage_log u
                    JOIN prompt_template_library t ON u.template_id = t.id
                    JOIN prompt_template_categories c ON t.category_id = c.id
                    WHERE u.tenant_id = :tenant_id
                    GROUP BY c.category_code
                    ORDER BY freq DESC
                    LIMIT 3;
                """),
                {"tenant_id": tenant_id},
            )
            top_cats = [r[0] for r in frequent_categories_res.fetchall()]

            query = """
                SELECT t.id, t.category_id, c.category_code, c.display_name as category_name,
                       c.icon_key as category_icon, t.template_name, t.concept_summary,
                       t.subject_field, t.scene_context_field, t.lighting_field,
                       t.material_texture_field, t.composition_layout_field,
                       t.color_palette_field, t.style_reference_field, t.constraints_field,
                       t.avoid_terms, t.prefer_terms, t.recommended_aspect_ratio,
                       t.recommended_platform, t.example_generated_file_artifact_id,
                       t.is_global, t.tenant_id, t.usage_count, t.created_at, t.updated_at,
                       s.id as style_family_id, s.style_code, s.display_name as style_name,
                       s.description as style_description, s.icon_key as style_icon,
                       t.seeding_batch_id,
                       a.public_url as example_image_url, a.file_name as example_file_name,
                       a.width as example_width, a.height as example_height
                FROM prompt_template_library t
                JOIN prompt_template_categories c ON t.category_id = c.id
                LEFT JOIN prompt_style_families s ON t.style_family_id = s.id
                LEFT JOIN file_artifacts a ON t.example_generated_file_artifact_id = a.id
                WHERE (t.is_global = true OR t.tenant_id = :tenant_id)
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}

            if category_code and category_code != "all":
                query += " AND c.category_code = :cat_code"
                params["cat_code"] = category_code

            if style_code and style_code != "all":
                query += " AND s.style_code = :style_code"
                params["style_code"] = style_code

            if scope == "private":
                query += " AND t.is_global = false AND t.tenant_id = :tenant_id"
            elif scope == "global":
                query += " AND t.is_global = true"

            if search:
                query += """ AND (
                    t.template_name ILIKE :search
                    OR t.concept_summary ILIKE :search
                    OR t.subject_field ILIKE :search
                    OR c.display_name ILIKE :search
                    OR s.display_name ILIKE :search
                )"""
                params["search"] = f"%{search}%"

            # Urutkan: Jika ada kategori sering dipakai tenant, beri prioritas rekomendasi di atas
            if top_cats and scope != "private":
                top_cats_sql = ", ".join(f"'{cat}'" for cat in top_cats)
                query += f"""
                    ORDER BY 
                        CASE WHEN c.category_code IN ({top_cats_sql}) THEN 0 ELSE 1 END,
                        t.usage_count DESC,
                        t.created_at DESC
                """
            else:
                query += " ORDER BY t.usage_count DESC, t.created_at DESC"

            res = conn.execute(sa.text(query), params)
            templates = []
            for row in res.fetchall():
                d = dict(row._mapping)
                d["is_recommended"] = bool(d.get("category_code") in top_cats)
                templates.append(d)

            return templates

    @staticmethod
    def get_surprise_prompt_template(
        tenant_id: str,
        category_code: Optional[str] = None,
        style_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mode 'Kejutkan Saya': Memilih satu template secara acak dari kombinasi yang
        BELUM pernah dipakai oleh tenant ini (NOT EXISTS terhadap prompt_template_usage_log).
        Jika seluruh template sudah pernah dicoba, pilih template acak secara adil.
        """
        with tenant_tx(tenant_id) as conn:
            base_select = """
                SELECT t.id, t.category_id, c.category_code, c.display_name as category_name,
                       c.icon_key as category_icon, t.template_name, t.concept_summary,
                       t.subject_field, t.scene_context_field, t.lighting_field,
                       t.material_texture_field, t.composition_layout_field,
                       t.color_palette_field, t.style_reference_field, t.constraints_field,
                       t.avoid_terms, t.prefer_terms, t.recommended_aspect_ratio,
                       t.recommended_platform, t.example_generated_file_artifact_id,
                       t.is_global, t.tenant_id, t.usage_count, t.created_at, t.updated_at,
                       s.id as style_family_id, s.style_code, s.display_name as style_name,
                       s.description as style_description, s.icon_key as style_icon,
                       t.seeding_batch_id,
                       a.public_url as example_image_url, a.file_name as example_file_name,
                       a.width as example_width, a.height as example_height
                FROM prompt_template_library t
                JOIN prompt_template_categories c ON t.category_id = c.id
                LEFT JOIN prompt_style_families s ON t.style_family_id = s.id
                LEFT JOIN file_artifacts a ON t.example_generated_file_artifact_id = a.id
                WHERE (t.is_global = true OR t.tenant_id = :tenant_id)
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}

            if category_code and category_code != "all":
                base_select += " AND c.category_code = :cat_code"
                params["cat_code"] = category_code

            if style_code and style_code != "all":
                base_select += " AND s.style_code = :style_code"
                params["style_code"] = style_code

            # 1. Cari yang belum pernah dipakai tenant ini
            query_unused = base_select + """
                AND NOT EXISTS (
                    SELECT 1 FROM prompt_template_usage_log u
                    WHERE u.template_id = t.id AND u.tenant_id = :tenant_id
                )
                ORDER BY RANDOM()
                LIMIT 1
            """
            row = conn.execute(sa.text(query_unused), params).fetchone()

            if not row:
                # 2. Fallback: pilih template acak mana pun
                query_fallback = base_select + " ORDER BY RANDOM() LIMIT 1"
                row = conn.execute(sa.text(query_fallback), params).fetchone()

            if not row:
                raise ValueError("Tidak ada template prompt yang cocok dengan kombinasi filter saat ini.")

            return dict(row._mapping)

    @staticmethod
    def get_prompt_library_template(tenant_id: str, template_id: str) -> Dict[str, Any]:
        """Mengambil detail lengkap satu template prompt atomik."""
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("""
                    SELECT t.*, c.category_code, c.display_name as category_name,
                           c.icon_key as category_icon,
                           s.style_code, s.display_name as style_name,
                           s.icon_key as style_icon, s.description as style_description,
                           a.public_url as example_image_url
                    FROM prompt_template_library t
                    JOIN prompt_template_categories c ON t.category_id = c.id
                    LEFT JOIN prompt_style_families s ON t.style_family_id = s.id
                    LEFT JOIN file_artifacts a ON t.example_generated_file_artifact_id = a.id
                    WHERE t.id = :tid AND (t.is_global = true OR t.tenant_id = :tenant_id)
                """),
                {"tid": template_id, "tenant_id": tenant_id},
            )
            row = res.fetchone()
            if not row:
                raise ValueError(f"Template prompt {template_id} tidak ditemukan atau akses ditolak.")
            return dict(row._mapping)

    @staticmethod
    def create_prompt_library_template(
        tenant_id: str, payload: Dict[str, Any], is_global: bool = False
    ) -> Dict[str, Any]:
        """Menyimpan template prompt atomik baru (privat untuk tenant atau global oleh super admin)."""
        template_id = str(uuid.uuid4())
        category_code = payload.get("category_code")
        category_id = payload.get("category_id")

        with tenant_tx(tenant_id) as conn:
            if not category_id and category_code:
                cat_row = conn.execute(
                    sa.text("SELECT id FROM prompt_template_categories WHERE category_code = :cc"),
                    {"cc": category_code},
                ).fetchone()
                if cat_row:
                    category_id = str(cat_row[0])
                else:
                    raise ValueError(f"Kategori '{category_code}' tidak valid.")

            if not category_id:
                raise ValueError("category_id atau category_code wajib disediakan.")

            style_code = payload.get("style_code")
            style_family_id = payload.get("style_family_id")
            if not style_family_id and style_code:
                st_row = conn.execute(
                    sa.text("SELECT id FROM prompt_style_families WHERE style_code = :sc"),
                    {"sc": style_code},
                ).fetchone()
                if st_row:
                    style_family_id = str(st_row[0])

            conn.execute(
                sa.text("""
                    INSERT INTO prompt_template_library (
                        id, category_id, style_family_id, template_name, concept_summary,
                        subject_field, scene_context_field, lighting_field,
                        material_texture_field, composition_layout_field,
                        color_palette_field, style_reference_field, constraints_field,
                        avoid_terms, prefer_terms, recommended_aspect_ratio,
                        recommended_platform, is_global, tenant_id, usage_count,
                        created_at, updated_at
                    ) VALUES (
                        :id, :category_id, :style_family_id, :template_name, :concept_summary,
                        :subject_field, :scene_context_field, :lighting_field,
                        :material_texture_field, :composition_layout_field,
                        :color_palette_field, :style_reference_field, :constraints_field,
                        :avoid_terms, :prefer_terms, :recommended_aspect_ratio,
                        :recommended_platform, :is_global, :tenant_id, 0,
                        now(), now()
                    )
                """),
                {
                    "id": template_id,
                    "category_id": category_id,
                    "style_family_id": style_family_id,
                    "template_name": payload["template_name"],
                    "concept_summary": payload["concept_summary"],
                    "subject_field": payload["subject_field"],
                    "scene_context_field": payload.get("scene_context_field"),
                    "lighting_field": payload.get("lighting_field"),
                    "material_texture_field": payload.get("material_texture_field"),
                    "composition_layout_field": payload.get("composition_layout_field"),
                    "color_palette_field": payload.get("color_palette_field"),
                    "style_reference_field": payload.get("style_reference_field"),
                    "constraints_field": payload.get("constraints_field"),
                    "avoid_terms": payload.get("avoid_terms", []),
                    "prefer_terms": payload.get("prefer_terms", []),
                    "recommended_aspect_ratio": payload.get("recommended_aspect_ratio", "1:1"),
                    "recommended_platform": payload.get("recommended_platform", []),
                    "is_global": is_global,
                    "tenant_id": tenant_id if not is_global else None,
                },
            )

        return ImageRouterService.get_prompt_library_template(tenant_id, template_id)

    @staticmethod
    def update_prompt_library_template(
        tenant_id: str, template_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Memperbarui template prompt privat milik tenant."""
        with tenant_tx(tenant_id) as conn:
            # Pastikan template milik tenant
            tpl_check = conn.execute(
                sa.text("SELECT id, is_global, tenant_id FROM prompt_template_library WHERE id = :tid"),
                {"tid": template_id},
            ).fetchone()

            if not tpl_check:
                raise ValueError(f"Template {template_id} tidak ditemukan.")
            if tpl_check[1] and str(tpl_check[2]) != tenant_id:
                raise ValueError("Template global platform tidak dapat diubah oleh tenant.")

            fields_to_update = []
            params: Dict[str, Any] = {"id": template_id, "tenant_id": tenant_id}

            style_code = payload.get("style_code")
            style_family_id = payload.get("style_family_id")
            if not style_family_id and style_code:
                st_row = conn.execute(
                    sa.text("SELECT id FROM prompt_style_families WHERE style_code = :sc"),
                    {"sc": style_code},
                ).fetchone()
                if st_row:
                    style_family_id = str(st_row[0])
            if style_family_id:
                fields_to_update.append("style_family_id = :style_family_id")
                params["style_family_id"] = style_family_id

            allowed_fields = [
                "template_name", "concept_summary", "subject_field", "scene_context_field",
                "lighting_field", "material_texture_field", "composition_layout_field",
                "color_palette_field", "style_reference_field", "constraints_field",
                "avoid_terms", "prefer_terms", "recommended_aspect_ratio", "recommended_platform"
            ]

            for field in allowed_fields:
                if field in payload and payload[field] is not None:
                    fields_to_update.append(f"{field} = :{field}")
                    params[field] = payload[field]

            if fields_to_update:
                fields_to_update.append("updated_at = now()")
                sql = f"""
                    UPDATE prompt_template_library
                    SET {', '.join(fields_to_update)}
                    WHERE id = :id AND (tenant_id = :tenant_id OR is_global = false)
                """
                conn.execute(sa.text(sql), params)

        return ImageRouterService.get_prompt_library_template(tenant_id, template_id)

    @staticmethod
    def delete_prompt_library_template(tenant_id: str, template_id: str) -> bool:
        """Menghapus template prompt privat milik tenant."""
        with tenant_tx(tenant_id) as conn:
            tpl_check = conn.execute(
                sa.text("SELECT id, is_global, tenant_id FROM prompt_template_library WHERE id = :tid"),
                {"tid": template_id},
            ).fetchone()

            if not tpl_check:
                raise ValueError(f"Template {template_id} tidak ditemukan.")
            if tpl_check[1]:
                raise ValueError("Template global platform tidak dapat dihapus oleh tenant.")

            conn.execute(
                sa.text("DELETE FROM prompt_template_library WHERE id = :tid AND tenant_id = :tenant_id"),
                {"tid": template_id, "tenant_id": tenant_id},
            )
            return True

    @staticmethod
    def compose_prompt_from_template(
        tenant_id: str, template_id: str, overrides: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Merangkai prompt final dan negative prompt dari template atomik
        dengan integrasi brand lock aktif tenant dan overrides opsional pengguna.
        """
        tpl = ImageRouterService.get_prompt_library_template(tenant_id, template_id)

        # Cari brand lock aktif
        brand_lock = None
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("SELECT * FROM brand_asset_locks WHERE tenant_id = :tenant_id AND is_active = true LIMIT 1"),
                {"tenant_id": tenant_id},
            )
            b_row = res.fetchone()
            if b_row:
                brand_lock = dict(b_row._mapping)

        composed_prompt, clean_negatives = UniversalPromptComposer.compose_from_atomic_template(
            template_fields=tpl,
            brand_lock=brand_lock,
            overrides=overrides,
        )

        return {
            "template_id": template_id,
            "template_name": tpl.get("template_name"),
            "category_code": tpl.get("category_code"),
            "composed_prompt": composed_prompt,
            "negative_prompt": clean_negatives,
            "avoid_terms": tpl.get("avoid_terms", []),
            "prefer_terms": tpl.get("prefer_terms", []),
            "aspect_ratio": (overrides or {}).get("recommended_aspect_ratio") or tpl.get("recommended_aspect_ratio", "1:1"),
            "brand_lock_applied": bool(brand_lock),
            "brand_name": brand_lock.get("brand_name") if brand_lock else None,
        }

    @staticmethod
    def execute_job_from_template(
        tenant_id: str,
        template_id: str,
        overrides: Optional[Dict[str, Any]] = None,
        brand_lock_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mengeksekusi generasi visual nyata dari template prompt atomik:
        1. Rangkai prompt dari skema atomik template + overrides.
        2. Jalankan siklus generasi visual via Model Router (Credit reserve -> Synthesize -> Validate -> Strip -> Artifact -> Consume).
        3. Catat jejak pemakaian ke prompt_template_usage_log.
        4. Tingkatkan penghitung usage_count pada template.
        """
        tpl = ImageRouterService.get_prompt_library_template(tenant_id, template_id)
        overrides = overrides or {}

        # 1. Rangkai prompt
        composed_data = ImageRouterService.compose_prompt_from_template(tenant_id, template_id, overrides)

        # 2. Siapkan payload eksekusi
        job_payload = {
            "job_type": tpl.get("category_code", "IMAGE_GENERATION").upper(),
            "prompt": composed_data["composed_prompt"],
            "negative_prompt": composed_data["negative_prompt"],
            "aspect_ratio": overrides.get("recommended_aspect_ratio") or tpl.get("recommended_aspect_ratio", "1:1"),
            "style_preset": overrides.get("style_reference_field") or tpl.get("style_reference_field"),
            "model_used": settings.OPENAI_IMAGE_MODEL or "unconfigured",
            "brand_lock_id": brand_lock_id,
            "credit_cost": 5.0,
        }

        # 3. Jalankan pekerjaan generasi
        result_job = ImageRouterService.create_and_execute_job(tenant_id, job_payload)

        # 4. Catat jejak pemakaian dan perbarui usage_count
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO prompt_template_usage_log (
                        id, template_id, tenant_id, generative_job_id, used_at
                    ) VALUES (
                        gen_random_uuid(), :template_id, :tenant_id, :job_id, now()
                    )
                """),
                {
                    "template_id": template_id,
                    "tenant_id": tenant_id,
                    "job_id": result_job["id"],
                },
            )

            conn.execute(
                sa.text("""
                    UPDATE prompt_template_library
                    SET usage_count = usage_count + 1,
                        updated_at = now()
                    WHERE id = :template_id
                """),
                {"template_id": template_id},
            )

        result_job["template_id"] = template_id
        result_job["template_name"] = tpl.get("template_name")
        return result_job

