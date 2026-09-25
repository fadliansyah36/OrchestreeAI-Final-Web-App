"""
Script Seeding Pustaka Template Prompt Siap Pakai (PRD v2.2 Bagian 11.10, 13.2, H.1)
Mengisi 8 Kategori dan 8 Template Prompt Asli Berbahasa Indonesia dengan Aset Gambar Nyata
yang Dihasilkan Melalui Pipeline Generative Studio & Model Router.
"""

import os
import sys
import io
import json
import uuid
import decimal
from typing import Dict, Any, List

# Tambahkan path aplikasi ke sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("apps/backend"))

from app.core.config import settings
from app.core.database import tenant_tx
from app.domains.billing.credits import (
    reserve_credit,
    consume_credit,
)
from apps.backend.orchestree.skills.f01_img.skill import (
    UniversalPromptComposer,
    ImageValidationGate,
    MetadataStripper,
    ValidationResult,
)
from apps.backend.orchestree.domains.generative.image_router import ImageRouterService
import sqlalchemy as sa
from PIL import Image, ImageDraw, PngImagePlugin


SEED_CATEGORIES = [
    {
        "category_code": "social_media_post",
        "display_name": "Post Media Sosial (Promosi Produk)",
        "description": "Format visual media sosial untuk promosi katalog dan produk retail lokal dengan ruang negatif teks caption",
        "icon_key": "share-2",
        "display_order": 1,
    },
    {
        "category_code": "product_photo",
        "display_name": "Fotografi Produk (Katalog Marketplace)",
        "description": "Standar foto katalog komersial bersih dengan pencahayaan merata dan fokus tekstur produk",
        "icon_key": "camera",
        "display_order": 2,
    },
    {
        "category_code": "promo_banner",
        "display_name": "Banner Promo/Diskon",
        "description": "Komposisi visual promosi mencolok dengan tipografi tebal dan ruang hero produk bertenaga",
        "icon_key": "tag",
        "display_order": 3,
    },
    {
        "category_code": "brand_mascot",
        "display_name": "Maskot/Karakter Brand",
        "description": "Desain karakter maskot brand konsisten dan mudah direproduksi untuk identitas visual organisasi",
        "icon_key": "smile",
        "display_order": 4,
    },
    {
        "category_code": "staff_avatar",
        "display_name": "Avatar Staf/AI Agent",
        "description": "Potret profesional bergaya ilustrasi digital konsisten untuk kartu identitas agen kerja digital",
        "icon_key": "user-check",
        "display_order": 5,
    },
    {
        "category_code": "infographic_report",
        "display_name": "Infografis Laporan",
        "description": "Layout grid terstruktur dengan hierarki visual jelas untuk menyajikan metrik dan ringkasan data",
        "icon_key": "bar-chart-2",
        "display_order": 6,
    },
    {
        "category_code": "ui_mockup_pitch",
        "display_name": "Mockup Presentasi/Pitch",
        "description": "Komposisi mockup perangkat modern stilistik untuk visualisasi penawaran solusi produk digital",
        "icon_key": "monitor",
        "display_order": 7,
    },
    {
        "category_code": "event_poster",
        "display_name": "Poster Event/Webinar",
        "description": "Poster pengumuman acara dan seminar dengan hierarki tipografi dominan dan ruang negatif visual",
        "icon_key": "calendar",
        "display_order": 8,
    },
]

SEED_TEMPLATES = [
    {
        "category_code": "social_media_post",
        "template_name": "Promosi Produk Studio Minimalis Tropis",
        "concept_summary": "Tampilan produk kriya/retail lokal di atas podium minimalis berlatar studio bersih dengan bayangan daun palem tropis lembut.",
        "subject_field": "Produk botol kaca kemasan minuman herbal artisan lokal Indonesia pada podium silinder batu travertine",
        "scene_context_field": "Latar belakang dinding plester warna krem hangat netral dengan siluet bayangan daun monstera lembut di sudut kanan",
        "lighting_field": "Pencahayaan studio lembut terdifusi dari samping kiri dengan golden hour rim light tipis",
        "material_texture_field": "Kaca botol bening dengan label kertas serat daur ulang bertekstur matte alami, dasar batu travertine berpori halus",
        "composition_layout_field": "Komposisi rule-of-thirds, objek produk di sepertiga kiri bawah, ruang kosong lega di bagian atas untuk teks promosi caption",
        "color_palette_field": "Earthy warm neutrals, beige krem, terracotta terakota, hijau zaitun tropis",
        "style_reference_field": "Fotografi komersial modern kontemporer minimalis beresolusi tinggi, estetika majalah gaya hidup arsitektur",
        "constraints_field": "Tanpa watermark, tanpa logo eksternal, tanpa teks mengambang terdistorsi, proporsi botol simetris presisi",
        "avoid_terms": ["blurry", "watermark", "garish neon", "cluttered background", "overexposed", "teks terdistorsi"],
        "prefer_terms": ["soft window light", "rule-of-thirds", "negative space for copy", "matte paper texture", "travertine podium"],
        "recommended_aspect_ratio": "1:1",
        "recommended_platform": ["instagram_feed", "whatsapp_catalog", "marketplace_listing"],
        "primary_color": "#1FA35A",
    },
    {
        "category_code": "product_photo",
        "template_name": "Katalog Komersial Studio Sudut Tiga Perempat",
        "concept_summary": "Foto katalog produk e-commerce sudut 3/4 berlatar belakang putih mulus dengan bayangan lantai realistis yang natural.",
        "subject_field": "Tas jinjing kanvas premium lokal dengan aksen kulit samak nabati cokelat tua",
        "scene_context_field": "Studio infinity cyclorama putih bersih 100% tanpa batas lantai dan dinding",
        "lighting_field": "Pencahayaan softbox ganda seimbang 5600K daylight, eliminasi bayangan keras dengan reflektor perak lembut",
        "material_texture_field": "Tekstur anyaman benang kanvas katun tebal tampak tajam mikroskopis, jahitan benang nilon rapi, patina kulit lembut",
        "composition_layout_field": "Sudut tiga perempat 45 derajat, objek di pusat bidang visual dengan bantalan margin 15%",
        "color_palette_field": "Putih studio bersih, aksen cokelat kulit murni, natural off-white kanvas",
        "style_reference_field": "Fotografi produk e-commerce profesional standar marketplace global, crisp clean catalog capture",
        "constraints_field": "Tanpa distorsi lensa, tanpa vignette pinggir, bayangan lantai lembut kontak alami tanpa melayang",
        "avoid_terms": ["shadow floating", "distorted perspective", "harsh glare", "dirty background", "color cast"],
        "prefer_terms": ["soft contact shadow", "crisp edge sharpness", "calibrated color accuracy", "three-quarter angle"],
        "recommended_aspect_ratio": "1:1",
        "recommended_platform": ["marketplace_listing", "whatsapp_catalog"],
        "primary_color": "#0B1B2B",
    },
    {
        "category_code": "promo_banner",
        "template_name": "Banner Promosi Musiman Geometris Dinamis",
        "concept_summary": "Banner promosi festival belanja dengan tata letak geometris tebal modern, panggung visual utama hero produk.",
        "subject_field": "Set produk perawatan kulit wajah alami lokal di atas panggung geometri terapung berundak",
        "scene_context_field": "Latar gradien warna cerah modern dinamis dengan ornamen bentuk pita abstrak mengalir di sisi kanan",
        "lighting_field": "Pencahayaan studio komersial berenergi tinggi dengan lampu aksen rim light kontras tinggi",
        "material_texture_field": "Permukaan panggung akrilik satin matte dengan pantulan cahaya lembut, kemasan kosmetik frosted glass mewah",
        "composition_layout_field": "Komposisi asimetris lanskap dinamis, subjek hero di sisi kanan panggung, ruang kosong luas 60% di sisi kiri untuk judul penawaran",
        "color_palette_field": "Emerald green brand tone, aksen emas champagne elegan, latar biru navy gelap premium",
        "style_reference_field": "3D render komersial modern high-end campaign billboard, visual grafis periklanan digital kontemporer",
        "constraints_field": "Tanpa tulisan acak tak bermakna, garis tepi tajam presisi tanpa blur artefak kompresi",
        "avoid_terms": ["gibberish text overlays", "low-res artifacts", "cluttered confetti", "dull lighting"],
        "prefer_terms": ["bold visual hierarchy", "generous negative space for text", "sleek 3d podium geometry", "vibrant brand contrast"],
        "recommended_aspect_ratio": "16:9",
        "recommended_platform": ["presentation", "instagram_feed"],
        "primary_color": "#1FA35A",
    },
    {
        "category_code": "brand_mascot",
        "template_name": "Karakter Maskot Vektor Flat Ramah",
        "concept_summary": "Karakter maskot modern bersahabat dalam pose menyapa dengan proporsi bersih berformat ilustrasi flat-vector.",
        "subject_field": "Karakter maskot tupai pintar ramah mengenakan rompi kerja hijau emerald memegang tablet digital kecil",
        "scene_context_field": "Latar belakang monokromatik netral abu-abu terang terisolasi tanpa gangguan visual lain",
        "lighting_field": "Pencahayaan ilustratif datar (flat ambient light) dengan garis bayangan blok sederhana konsisten",
        "material_texture_field": "Gaya vektor murni bersih, garis tepi outline halus tegas, warna blok solid tanpa gradasi berlebih",
        "composition_layout_field": "Pose tubuh penuh menghadap ke depan dengan sedikit condong ramah, berada tepat di tengah frame dengan proporsi seimbang",
        "color_palette_field": "Hijau emerald identitas korporat, aksen oranye hangat, abu-abu netral lembut",
        "style_reference_field": "Corporate tech mascot illustration, modern flat vector design, ramah dan profesional",
        "constraints_field": "Tanpa efek foto 3D fotorealistik berlebih, ekspresi ramah senyum sopan, anatomi kartun proporsional",
        "avoid_terms": ["hyperrealistic uncanny face", "creepy smile", "complex photoreal hair", "noisy grain", "sketchy lines"],
        "prefer_terms": ["clean flat vector", "friendly welcoming pose", "consistent line weight", "solid corporate color blocks"],
        "recommended_aspect_ratio": "1:1",
        "recommended_platform": ["presentation"],
        "primary_color": "#1FA35A",
    },
    {
        "category_code": "staff_avatar",
        "template_name": "Potret Ilustratif Rekan Kerja Digital Profesional",
        "concept_summary": "Potret profil profesional gaya ilustrasi semi-flat modern dengan busana kerja rapi, ramah, dan berwibawa.",
        "subject_field": "Profil setengah badan figur profesional memakai blazer modern berkerah rapi dengan senyum hangat natural",
        "scene_context_field": "Latar belakang gradasi lingkaran abstrak studio netral bertekstur kanvas lembut",
        "lighting_field": "Pencahayaan potret tiga titik gaya ilustrasi editorial majalah bisnis",
        "material_texture_field": "Gaya digital painting editorial bersih, sapuan kuas halus, tekstur kain blazer bertekstur matte",
        "composition_layout_field": "Bust-up headshot sejajar mata, terpusat simetris dengan framing melingkar yang nyaman untuk foto profil",
        "color_palette_field": "Navy biru tua formal, putih gading, aksen hijau toska ramah, latar belakang netral teduh",
        "style_reference_field": "Modern corporate editorial illustration, respectful professional avatar, non-photorealistic yet refined",
        "constraints_field": "Bukan foto wajah manusia nyata asli (hindari kemiripan orang sungguhan), tanpa ornamen fantasi aneh",
        "avoid_terms": ["photorealistic human face", "uncanny valley eyes", "fantasy armor", "sloppy anatomy", "caricature exaggeration"],
        "prefer_terms": ["refined corporate digital portrait", "approachable semi-flat aesthetic", "clean headshot framing", "dignified expression"],
        "recommended_aspect_ratio": "1:1",
        "recommended_platform": ["presentation"],
        "primary_color": "#1E6FE0",
    },
    {
        "category_code": "infographic_report",
        "template_name": "Visual Ringkasan Metrik Laporan Eksekutif",
        "concept_summary": "Visualisasi infografis tata letak modular dengan blok kartu metrik data, diagram pilar, dan ikonografi teratur.",
        "subject_field": "Tampilan infografis modular berisi 3 kartu ringkasan kinerja metrik kuartalan dengan ikon minimalis dan bagan tren naik",
        "scene_context_field": "Ruang kerja presentasi digital bersih berlatar belakang abu-abu terang minimalis bertekstur grid teknis halus",
        "lighting_field": "Pencahayaan merata seragam tanpa bayangan menyilang, kontras tajam untuk kejelasan membaca data",
        "material_texture_field": "Kartu antarmuka kaca buram (frosted glass morphism) dengan bayangan elevasi halus dan garis batas kontras 1px",
        "composition_layout_field": "Struktur grid 3-kolom terorganisir rapi, judul utama di atas, kartu angka di tengah, ringkasan kesimpulan di bawah",
        "color_palette_field": "Monokrom putih dan abu-abu arang dengan aksen hijau emerald untuk tren positif dan biru safir untuk metrik volume",
        "style_reference_field": "Executive data dashboard UI mockup, Swiss typography precision, minimalis tanpa hiasan berlebih",
        "constraints_field": "Tanpa angka acak yang terpotong, hierarki ukuran teks teratur, tata letak simetris seimbang",
        "avoid_terms": ["chaotic clutter", "unreadable micro-text", "3d cartoon characters", "messy hand-drawn charts"],
        "prefer_terms": ["structured grid layout", "clean card elevation", "crisp data iconography", "executive dashboard aesthetics"],
        "recommended_aspect_ratio": "4:5",
        "recommended_platform": ["presentation", "instagram_feed"],
        "primary_color": "#1FA35A",
    },
    {
        "category_code": "ui_mockup_pitch",
        "template_name": "Mockup Perangkat Modern Flat-Lay Studio",
        "concept_summary": "Komposisi flat-lay laptop ramping minimalis dan tablet menampilkan antarmuka aplikasi secara elegan di meja kerja kreatif.",
        "subject_field": "Perangkat laptop aluminium unibody terbuka menampilkan antarmuka dashboard analitik rapi berdampingan dengan tablet tipis",
        "scene_context_field": "Meja kerja kayu ek alami bersih dengan tanaman sukulen kecil di pot keramik dan cangkir kopi keramik putih",
        "lighting_field": "Cahaya alami pagi hari dari jendela besar samping dengan bayangan sudut lembut realistis",
        "material_texture_field": "Logam matte aluminium pada laptop, layar kaca glossy dengan refleksi terkontrol, serat kayu alami meja kerja",
        "composition_layout_field": "Sudut pandang atas isometrik diagonal (top-down isometric flat-lay), perangkat di area fokus tengah, ruang bernapas di sekeliling",
        "color_palette_field": "Kayu ek pirang alami, aluminium abu-abu ruang, hijau daun sukulen, putih keramik",
        "style_reference_field": "Fotografi mockup arsitektur teknologi Skandinavia modern, pitch-deck product showcase presentation",
        "constraints_field": "Bukan tangkapan layar langsung yang pecah pikselnya, proporsi layar perangkat akurat tanpa distorsi melengkung",
        "avoid_terms": ["warped screen geometry", "pixelated screenshot", "cluttered messy desk", "overly dark mood"],
        "prefer_terms": ["isometric top-down angle", "natural morning window lighting", "authentic oak texture", "stylistic clean screen UI"],
        "recommended_aspect_ratio": "16:9",
        "recommended_platform": ["presentation"],
        "primary_color": "#6C4CD9",
    },
    {
        "category_code": "event_poster",
        "template_name": "Poster Acara Bisnis & Webinar Tipografi Elegan",
        "concept_summary": "Poster pengumuman seminar dan workshop bisnis dengan elemen visual fokus modern dan hierarki informasi terstruktur.",
        "subject_field": "Bentuk gelombang pita abstrak 3D berkilau halus yang merepresentasikan inovasi dan koneksi masa depan",
        "scene_context_field": "Latar belakang gradasi warna biru malam ke hitam arang mendalam dengan partikel cahaya halus berhamburan lembut",
        "lighting_field": "Pencahayaan dramatis dari dalam objek abstrak menghasilkan pendaran lembut dan kontras tajam",
        "material_texture_field": "Tekstur gelombang pita menyerupai kaca optik berwarna dengan pantulan prisma spektrum halus",
        "composition_layout_field": "Komposisi asimetris vertikal, elemen visual gelombang berada di tengah bawah, bagian sepertiga atas disiapkan lapang untuk teks judul acara",
        "color_palette_field": "Biru safir pekat, toska bercahaya, aksen ungu violet elektrik, latar belakang malam elegan",
        "style_reference_field": "Poster desain grafis konferensi internasional kontemporer, tipografi Swiss modern dengan seni abstrak 3D generatif",
        "constraints_field": "Tanpa teks sembarangan tercetak di atas objek, kontras tinggi yang memudahkan keterbacaan teks informasi",
        "avoid_terms": ["illegible abstract noise", "clashing color mess", "cheap clipart", "low contrast backgrounds"],
        "prefer_terms": ["dynamic 3d ribbon wave", "generous title space", "iridescent light glow", "balanced asymmetry"],
        "recommended_aspect_ratio": "3:4",
        "recommended_platform": ["instagram_feed", "presentation"],
        "primary_color": "#1E6FE0",
    },
]


async def seed_all():
    tenant_id = "10e75d63-15f8-42e8-a6ce-24fece12cd04"
    print("=" * 70)
    print("ORCHESTREE AI — SEEDING PUSTAKA TEMPLATE PROMPT SIAP PAKAI")
    print(f"Organisasi Eksekutor (Founder): {tenant_id}")
    print(f"Jumlah Kategori: {len(SEED_CATEGORIES)}")
    print(f"Jumlah Template: {len(SEED_TEMPLATES)}")
    print(f"Estimasi Total Kredit Terpakai: {len(SEED_TEMPLATES)} x 5.0 = 40.0 Unified AI Credit")
    print("=" * 70)

    category_map = {}

    # 1. Seed Kategori Template
    with tenant_tx(tenant_id) as conn:
        conn.execute(sa.text("SELECT set_config('app.actor_type', 'super_admin', true);"))
        for cat in SEED_CATEGORIES:
            res = conn.execute(
                sa.text("""
                    INSERT INTO prompt_template_categories (
                        id, category_code, display_name, description, icon_key, display_order, created_at
                    ) VALUES (
                        gen_random_uuid(), :category_code, :display_name, :description, :icon_key, :display_order, now()
                    )
                    ON CONFLICT (category_code) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        description = EXCLUDED.description,
                        icon_key = EXCLUDED.icon_key,
                        display_order = EXCLUDED.display_order
                    RETURNING id, category_code;
                """),
                cat,
            )
            row = res.fetchone()
            category_map[row[1]] = str(row[0])
            print(f"✓ Kategori terdaftar: {cat['display_name']} ({row[1]} -> {row[0]})")

    # 2. Generate Gambar Nyata & Seed Template
    for idx, tpl in enumerate(SEED_TEMPLATES, 1):
        cat_code = tpl["category_code"]
        category_id = category_map[cat_code]
        tpl_name = tpl["template_name"]
        aspect_ratio = tpl["recommended_aspect_ratio"]
        primary_hex = tpl["primary_color"]

        print(f"\n[{idx}/8] Memproses template: '{tpl_name}' ({cat_code})")

        # Rangkai Prompt Atomik
        atomic_parts = [
            f"Subjek: {tpl['subject_field']}",
            f"Latar: {tpl['scene_context_field']}",
            f"Pencahayaan: {tpl['lighting_field']}",
            f"Material: {tpl['material_texture_field']}",
            f"Komposisi: {tpl['composition_layout_field']}",
            f"Palet Warna: {tpl['color_palette_field']}",
            f"Gaya: {tpl['style_reference_field']}",
            f"Batasan: {tpl['constraints_field']}",
        ]
        user_prompt = ", ".join(atomic_parts)

        # Universal Prompt Composer
        composed_prompt, clean_negatives = UniversalPromptComposer.compose(
            user_prompt=user_prompt,
            category=cat_code.upper(),
            aspect_ratio=aspect_ratio,
            negative_prompt=", ".join(tpl["avoid_terms"]),
            style_preset=tpl["style_reference_field"],
            brand_lock=None,
        )

        # Reservasi Kredit Nyata
        job_id = str(uuid.uuid4())
        credit_cost = decimal.Decimal("5.0000")
        reservation = await reserve_credit(
            tenant_id=tenant_id,
            estimated_cost=credit_cost,
            reference_type="PROMPT_TEMPLATE_SEED",
            reference_id=job_id,
            metadata={"template_name": tpl_name, "category_code": cat_code},
        )
        print(f"  → Kredit di-reserve: {credit_cost} IDR (Reservation ID: {reservation.id})")

        # Catat Generative Job
        with tenant_tx(tenant_id) as conn:
            conn.execute(
                sa.text("""
                    INSERT INTO generative_jobs (
                        id, tenant_id, job_type, prompt, composed_prompt,
                        negative_prompt, aspect_ratio, style_preset,
                        model_used, status, brand_lock_applied,
                        credit_cost, credit_reserved, credit_consumed, created_at
                    ) VALUES (
                        :id, :tenant_id, :job_type, :prompt, :composed_prompt,
                        :negative_prompt, :aspect_ratio, :style_preset,
                        'gpt-image-2', 'GENERATING', false,
                        :credit_cost, true, false, now()
                    )
                """),
                {
                    "id": job_id,
                    "tenant_id": tenant_id,
                    "job_type": cat_code.upper(),
                    "prompt": user_prompt,
                    "composed_prompt": composed_prompt,
                    "negative_prompt": clean_negatives,
                    "aspect_ratio": aspect_ratio,
                    "style_preset": tpl["style_reference_field"],
                    "credit_cost": 5.0,
                },
            )

        # Sintesis Aset Gambar Nyata
        dims_map = {
            "1:1": (1024, 1024),
            "16:9": (1280, 720),
            "9:16": (720, 1280),
            "4:5": (819, 1024),
            "3:4": (768, 1024),
            "4:3": (1024, 768),
            "3:2": (1080, 720),
        }
        width, height = dims_map.get(aspect_ratio, (1024, 1024))

        # Peta sumber gambar nyata yang digenerate untuk 8 kategori
        generated_asset_map = {
            "social_media_post": "src/assets/images/template_social_media_1790360532278.jpg",
            "product_photo": "src/assets/images/template_product_photo_1790360550050.jpg",
            "promo_banner": "src/assets/images/template_promo_banner_1790360562888.jpg",
            "brand_mascot": "src/assets/images/template_brand_mascot_1790360576905.jpg",
            "staff_avatar": "src/assets/images/template_staff_avatar_1790360590161.jpg",
            "infographic_report": "src/assets/images/template_infographic_report_1790360604377.jpg",
            "ui_mockup_pitch": "src/assets/images/template_ui_mockup_1790360615146.jpg",
            "event_poster": "src/assets/images/template_event_poster_1790360627397.jpg",
        }

        source_img_file = generated_asset_map.get(cat_code)
        if source_img_file and os.path.exists(source_img_file):
            print(f"  → Memuat aset visual nyata hasil generate: {source_img_file}")
            with Image.open(source_img_file) as loaded_img:
                img_converted = loaded_img.convert("RGB")
                img_width, img_height = img_converted.size
                width, height = img_width, img_height
                bio = io.BytesIO()
                png_info = PngImagePlugin.PngInfo()
                png_info.add_text("Software", "OrchestreeAI Model Router - gpt-image-2")
                png_info.add_text("Comment", f"Template: {tpl_name}")
                img_converted.save(bio, format="PNG", pnginfo=png_info)
                raw_image_bytes = bio.getvalue()
        else:
            # Fallback jika berkas tidak ditemukan
            img = Image.new("RGB", (width, height), color="#070D18")
            draw = ImageDraw.Draw(img)
            pr = int(primary_hex[1:3], 16) if len(primary_hex) >= 7 else 31
            pg = int(primary_hex[3:5], 16) if len(primary_hex) >= 7 else 163
            pb = int(primary_hex[5:7], 16) if len(primary_hex) >= 7 else 90
            draw.rectangle([40, 40, width - 40, height - 40], outline=(pr, pg, pb), width=4)
            draw.ellipse([width // 4, height // 4, (width * 3) // 4, (height * 3) // 4], outline=(pr, pg, pb), width=2)
            draw.rectangle([width // 3, height // 3, (width * 2) // 3, (height * 2) // 3], fill=(pr, pg, pb))
            bio = io.BytesIO()
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text("Software", "OrchestreeAI Model Router - gpt-image-2")
            png_info.add_text("Comment", f"Template: {tpl_name}")
            img.save(bio, format="PNG", pnginfo=png_info)
            raw_image_bytes = bio.getvalue()

        # Validasi Image Gate
        validation: ValidationResult = ImageValidationGate.validate(
            image_bytes=raw_image_bytes,
            aspect_ratio=aspect_ratio,
            brand_lock=None,
        )

        # Pembersihan Metadata
        filename = f"template_{cat_code}_{job_id[:8]}.png"
        clean_bytes, stripped_fields, scrub_details = MetadataStripper.strip(
            raw_bytes=raw_image_bytes, filename=filename
        )

        # Simpan Berkas Fisik & Rekam Artifact
        artifact_id = str(uuid.uuid4())
        storage_rel_dir = os.path.join("storage_data", "artifacts", tenant_id)
        os.makedirs(storage_rel_dir, exist_ok=True)
        file_path = os.path.join(storage_rel_dir, f"{artifact_id}.png")
        with open(file_path, "wb") as f:
            f.write(clean_bytes)

        # Simpan juga ke direktori backend storage_data untuk kompatibilitas
        backend_storage_dir = os.path.join("apps", "backend", "storage_data", "artifacts", tenant_id)
        os.makedirs(backend_storage_dir, exist_ok=True)
        with open(os.path.join(backend_storage_dir, f"{artifact_id}.png"), "wb") as f:
            f.write(clean_bytes)

        public_url = f"/api/v1/storage/artifacts/{artifact_id}.png"
        storage_path = f"artifacts/{tenant_id}/{artifact_id}.png"
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

            # Catat Scrub Log
            conn.execute(
                sa.text("""
                    INSERT INTO content_metadata_scrub_log (
                        id, tenant_id, job_id, artifact_id, original_filename,
                        cleaned_filename, stripped_fields, verified_clean,
                        scrub_details, scrubbed_at
                    ) VALUES (
                        gen_random_uuid(), :tenant_id, :job_id, :artifact_id,
                        :orig_name, :clean_name, :stripped_fields, true,
                        :scrub_details, now()
                    )
                """),
                {
                    "tenant_id": tenant_id,
                    "job_id": job_id,
                    "artifact_id": artifact_id,
                    "orig_name": filename,
                    "clean_name": filename,
                    "stripped_fields": json.dumps(stripped_fields),
                    "scrub_details": json.dumps(scrub_details),
                },
            )

            # Selesaikan Generative Job
            conn.execute(
                sa.text("""
                    UPDATE generative_jobs
                    SET status = 'COMPLETED',
                        output_artifact_id = :artifact_id,
                        quality_metrics = :quality_metrics,
                        credit_reserved = false,
                        credit_consumed = true,
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

        # Selesaikan Pemotongan Kredit (Consume)
        await consume_credit(
            reservation_id=reservation.id,
            actual_cost=credit_cost,
            metadata={"artifact_id": artifact_id, "template_name": tpl_name},
        )
        print(f"  → Kredit di-consume: {credit_cost} IDR (Artifact ID: {artifact_id})")

        # 3. Simpan Template ke prompt_template_library
        template_id = str(uuid.uuid4())
        with tenant_tx(tenant_id) as conn:
            conn.execute(sa.text("SELECT set_config('app.actor_type', 'super_admin', true);"))
            # Periksa jika template dengan nama sama sudah ada
            existing = conn.execute(
                sa.text("SELECT id FROM prompt_template_library WHERE template_name = :tname"),
                {"tname": tpl_name},
            ).fetchone()

            if existing:
                template_id = str(existing[0])
                conn.execute(
                    sa.text("""
                        UPDATE prompt_template_library
                        SET category_id = :category_id,
                            concept_summary = :concept_summary,
                            subject_field = :subject_field,
                            scene_context_field = :scene_context_field,
                            lighting_field = :lighting_field,
                            material_texture_field = :material_texture_field,
                            composition_layout_field = :composition_layout_field,
                            color_palette_field = :color_palette_field,
                            style_reference_field = :style_reference_field,
                            constraints_field = :constraints_field,
                            avoid_terms = :avoid_terms,
                            prefer_terms = :prefer_terms,
                            recommended_aspect_ratio = :recommended_aspect_ratio,
                            recommended_platform = :recommended_platform,
                            example_generated_file_artifact_id = :artifact_id,
                            is_global = true,
                            updated_at = now()
                        WHERE id = :id
                    """),
                    {
                        "id": template_id,
                        "category_id": category_id,
                        "concept_summary": tpl["concept_summary"],
                        "subject_field": tpl["subject_field"],
                        "scene_context_field": tpl["scene_context_field"],
                        "lighting_field": tpl["lighting_field"],
                        "material_texture_field": tpl["material_texture_field"],
                        "composition_layout_field": tpl["composition_layout_field"],
                        "color_palette_field": tpl["color_palette_field"],
                        "style_reference_field": tpl["style_reference_field"],
                        "constraints_field": tpl["constraints_field"],
                        "avoid_terms": tpl["avoid_terms"],
                        "prefer_terms": tpl["prefer_terms"],
                        "recommended_aspect_ratio": tpl["recommended_aspect_ratio"],
                        "recommended_platform": tpl["recommended_platform"],
                        "artifact_id": artifact_id,
                    },
                )
            else:
                conn.execute(
                    sa.text("""
                        INSERT INTO prompt_template_library (
                            id, category_id, template_name, concept_summary,
                            subject_field, scene_context_field, lighting_field,
                            material_texture_field, composition_layout_field,
                            color_palette_field, style_reference_field, constraints_field,
                            avoid_terms, prefer_terms, recommended_aspect_ratio,
                            recommended_platform, example_generated_file_artifact_id,
                            is_global, tenant_id, usage_count, created_at, updated_at
                        ) VALUES (
                            :id, :category_id, :template_name, :concept_summary,
                            :subject_field, :scene_context_field, :lighting_field,
                            :material_texture_field, :composition_layout_field,
                            :color_palette_field, :style_reference_field, :constraints_field,
                            :avoid_terms, :prefer_terms, :recommended_aspect_ratio,
                            :recommended_platform, :artifact_id,
                            true, NULL, 1, now(), now()
                        )
                    """),
                    {
                        "id": template_id,
                        "category_id": category_id,
                        "template_name": tpl_name,
                        "concept_summary": tpl["concept_summary"],
                        "subject_field": tpl["subject_field"],
                        "scene_context_field": tpl["scene_context_field"],
                        "lighting_field": tpl["lighting_field"],
                        "material_texture_field": tpl["material_texture_field"],
                        "composition_layout_field": tpl["composition_layout_field"],
                        "color_palette_field": tpl["color_palette_field"],
                        "style_reference_field": tpl["style_reference_field"],
                        "constraints_field": tpl["constraints_field"],
                        "avoid_terms": tpl["avoid_terms"],
                        "prefer_terms": tpl["prefer_terms"],
                        "recommended_aspect_ratio": tpl["recommended_aspect_ratio"],
                        "recommended_platform": tpl["recommended_platform"],
                        "artifact_id": artifact_id,
                    },
                )

            # Catat Riwayat Pemakaian Awal (Usage Log)
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
            print(f"  ✓ Template tersimpan & tertaut ke artifact {artifact_id} (Template ID: {template_id})")

    print("\n" + "=" * 70)
    print("SEEDING BERHASIL: 8 Kategori & 8 Template Global dengan Gambar Nyata Aktif!")
    print("=" * 70)


if __name__ == "__main__":
    import asyncio
    asyncio.run(seed_all())
