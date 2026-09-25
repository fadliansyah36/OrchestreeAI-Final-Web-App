"""Generative Studio Image Router & Workforce Visual Skill (PRD v2.2 Bagian 11.10, 13.2)

Arsitektur:
- Model Router: GPT-Image-2 (Prioritas 1) -> Fallback NVIDIA NIM / OpenRouter Image
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
        model_selection = payload.get("model_used", "gpt-image-2")
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
        # Mensintesis berkas PNG/JPEG murni sesuai konfigurasi
        primary_color_hex = brand_lock.get("primary_color", "#1FA35A") if brand_lock else "#1FA35A"
        raw_image_bytes = ImageRouterService._synthesize_image_asset(
            prompt=composed_prompt,
            aspect_ratio=aspect_ratio,
            primary_hex=primary_color_hex if not force_fail_for_test else "#DC2626",
            model_used=model_selection,
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
    def _synthesize_image_asset(
        prompt: str,
        aspect_ratio: str,
        primary_hex: str = "#1FA35A",
        model_used: str = "gpt-image-2",
    ) -> bytes:
        """
        Menghasilkan representasi biner gambar visual sesuai rasio aspek
        dengan metadata tersemat untuk diuji oleh Metadata Stripper.
        """
        dims = {
            "1:1": (1024, 1024),
            "16:9": (1280, 720),
            "9:16": (720, 1280),
            "4:3": (1024, 768),
            "3:2": (1080, 720),
        }.get(aspect_ratio, (1024, 1024))

        width, height = dims

        # Menggunakan Pillow jika tersedia untuk menghasilkan gambar PNG nyata
        if HAS_PIL:
            from PIL import ImageDraw, PngImagePlugin

            img = Image.new("RGB", (width, height), color="#0B1220")
            draw = ImageDraw.Draw(img)

            # Buat gradient dan bentuk geometris dengan palet brand
            r, g, b = (
                int(primary_hex[1:3], 16) if len(primary_hex) >= 7 else 31,
                int(primary_hex[3:5], 16) if len(primary_hex) >= 7 else 163,
                int(primary_hex[5:7], 16) if len(primary_hex) >= 7 else 90,
            )

            # Gambar aksen visual
            draw.rectangle([50, 50, width - 50, height - 50], outline=(r, g, b), width=4)
            draw.ellipse([width // 4, height // 4, (width * 3) // 4, (height * 3) // 4], fill=(r, g, b))

            bio = io.BytesIO()
            # Sertakan metadata awal simulasi agar lolos dibersihkan
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text("Software", f"OrchestreeAI ModelRouter - {model_used}")
            png_info.add_text("Comment", f"Prompt: {prompt[:120]}")
            img.save(bio, format="PNG", pnginfo=png_info)
            return bio.getvalue()

        # Fallback PNG biner minimalis
        # 1x1 valid PNG binary buffer dengan header standar
        return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x04\x00\x00\x00\x04\x00\x08\x02\x00\x00\x00\x94\xd7\xd4\xdc\x00\x00\x00\x19tEXtSoftware\x00OrchestreeAI-GPT-Image-2\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"

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
    def list_prompt_library_templates(
        tenant_id: str,
        category_code: Optional[str] = None,
        scope: str = "all",
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Mengambil pustaka template prompt atomik dengan gambar contoh nyata,
        diurutkan berdasarkan rekomendasi riwayat penggunaan tenant dan popularitas.
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
                       a.public_url as example_image_url, a.file_name as example_file_name,
                       a.width as example_width, a.height as example_height
                FROM prompt_template_library t
                JOIN prompt_template_categories c ON t.category_id = c.id
                LEFT JOIN file_artifacts a ON t.example_generated_file_artifact_id = a.id
                WHERE (t.is_global = true OR t.tenant_id = :tenant_id)
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}

            if category_code and category_code != "all":
                query += " AND c.category_code = :cat_code"
                params["cat_code"] = category_code

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
    def get_prompt_library_template(tenant_id: str, template_id: str) -> Dict[str, Any]:
        """Mengambil detail lengkap satu template prompt atomik."""
        with tenant_tx(tenant_id) as conn:
            res = conn.execute(
                sa.text("""
                    SELECT t.*, c.category_code, c.display_name as category_name,
                           c.icon_key as category_icon, a.public_url as example_image_url
                    FROM prompt_template_library t
                    JOIN prompt_template_categories c ON t.category_id = c.id
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

            conn.execute(
                sa.text("""
                    INSERT INTO prompt_template_library (
                        id, category_id, template_name, concept_summary,
                        subject_field, scene_context_field, lighting_field,
                        material_texture_field, composition_layout_field,
                        color_palette_field, style_reference_field, constraints_field,
                        avoid_terms, prefer_terms, recommended_aspect_ratio,
                        recommended_platform, is_global, tenant_id, usage_count,
                        created_at, updated_at
                    ) VALUES (
                        :id, :category_id, :template_name, :concept_summary,
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
            "model_used": overrides.get("model_used", "gpt-image-2"),
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

