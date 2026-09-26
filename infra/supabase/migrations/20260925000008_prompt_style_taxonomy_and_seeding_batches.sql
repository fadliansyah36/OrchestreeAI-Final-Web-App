-- 20260925000008_prompt_style_taxonomy_and_seeding_batches.sql
-- Taksonomi Dua Sumbu Pustaka Template Prompt & Batch Seeding (PRD v2.2 Bagian 11.10, 13.2, H.1)

-- 1. Tabel Keluarga Gaya Visual (Sumbu Kedua)
CREATE TABLE IF NOT EXISTS prompt_style_families (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    style_code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    description text NOT NULL,
    icon_key text NOT NULL,
    display_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_style_families_order ON prompt_style_families(display_order, style_code);

-- 2. Hubungkan ke template (style_family_id)
ALTER TABLE prompt_template_library
    ADD COLUMN IF NOT EXISTS style_family_id uuid REFERENCES prompt_style_families(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_template_library_style ON prompt_template_library(style_family_id);

-- 3. Tabel Batch Seeding Terkontrol
CREATE TABLE IF NOT EXISTS prompt_library_seeding_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_label text NOT NULL,
    requested_template_count int NOT NULL,
    estimated_total_credit numeric(18,4),
    actual_total_credit numeric(18,4),
    status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN
        ('pending_approval','approved','running','completed','failed')),
    approved_by uuid,
    plan_details jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_prompt_library_seeding_batches_status ON prompt_library_seeding_batches(status, created_at DESC);

-- 4. Hubungkan template ke seeding_batch_id
ALTER TABLE prompt_template_library
    ADD COLUMN IF NOT EXISTS seeding_batch_id uuid REFERENCES prompt_library_seeding_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_template_library_batch ON prompt_template_library(seeding_batch_id);

-- 5. Row Level Security & Hak Akses
ALTER TABLE prompt_style_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_style_families FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prompt_style_families_select ON prompt_style_families;
CREATE POLICY p_prompt_style_families_select ON prompt_style_families
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS p_prompt_style_families_admin ON prompt_style_families;
CREATE POLICY p_prompt_style_families_admin ON prompt_style_families
    FOR ALL
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

ALTER TABLE prompt_library_seeding_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_library_seeding_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prompt_library_seeding_batches_select ON prompt_library_seeding_batches;
CREATE POLICY p_prompt_library_seeding_batches_select ON prompt_library_seeding_batches
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS p_prompt_library_seeding_batches_admin ON prompt_library_seeding_batches;
CREATE POLICY p_prompt_library_seeding_batches_admin ON prompt_library_seeding_batches
    FOR ALL
    USING (
        current_user IN ('postgres', 'service_role')
        OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'super_admin'
        OR current_setting('app.actor_type', true) = 'super_admin'
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_style_families TO orchestree_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON prompt_library_seeding_batches TO orchestree_app;
    END IF;
END $$;

-- 6. Seed 6 Kategori Kebutuhan Bisnis Baru (Total 14 Kategori)
INSERT INTO prompt_template_categories (category_code, display_name, description, icon_key, display_order)
VALUES
    ('editorial_illustration', 'Ilustrasi Editorial/Blog', 'Visual pendukung artikel, esai, dan konten edukasi bernuansa cerdas dan reflektif.', 'book-open', 9),
    ('packaging_label', 'Kemasan & Label Produk', 'Mockup kemasan dan label retail untuk produk UMKM dan jenama lokal.', 'package', 10),
    ('brand_identity_system', 'Identitas Brand & Palet Visual', 'Sistem visual logo mark, pola, dan kombinasi warna identitas brand.', 'palette', 11),
    ('interior_property', 'Desain Interior/Properti', 'Visualisasi ruang interior toko, kafe, dan denah estetis properti.', 'home', 12),
    ('technical_diagram', 'Ilustrasi Teknis/Diagram', 'Visual pendukung dokumentasi produk dan panduan SOP operasional teknis.', 'cpu', 13),
    ('seasonal_celebration', 'Konten Musiman/Perayaan', 'Tema hari besar nasional dan keagamaan Indonesia untuk konten promosi musiman.', 'sparkles', 14)
ON CONFLICT (category_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon_key = EXCLUDED.icon_key,
    display_order = EXCLUDED.display_order;

-- 7. Seed 16 Keluarga Gaya Visual (Sumbu Baru)
INSERT INTO prompt_style_families (style_code, display_name, description, icon_key, display_order)
VALUES
    ('studio_realism', 'Fotografi Studio Realistis', 'Pencahayaan studio terkontrol, detail tekstur tinggi, tampak seperti hasil kamera sungguhan.', 'camera', 1),
    ('flat_vector', 'Flat Vector Minimalis', 'Bentuk geometris sederhana, warna blok datar, tanpa gradasi rumit.', 'shapes', 2),
    ('watercolor', 'Ilustrasi Watercolor', 'Sapuan cat air lembut, tepi menyebar organik, palet lembut.', 'droplet', 3),
    ('isometric_3d', 'Isometrik 3D', 'Sudut pandang isometrik, objek miniatur, cocok untuk diagram/infografis.', 'box', 4),
    ('pixel_art', 'Pixel Art Retro', 'Grid piksel jelas, palet warna terbatas, nuansa nostalgia game 8/16-bit.', 'grid', 5),
    ('cyberpunk_neon', 'Cyberpunk Neon', 'Palet gelap dengan aksen neon, suasana kota futuristik.', 'zap', 6),
    ('ink_sketch', 'Sketsa Tinta & Garis', 'Goresan garis tegas hitam-putih, minim warna, gaya gambar tangan.', 'pen-tool', 7),
    ('anime_manga', 'Gaya Anime/Manga', 'Karakter bergaya ilustrasi Jepang, garis bersih, ekspresi ekspresif.', 'smile', 8),
    ('cinematic_dramatic', 'Sinematik Dramatis', 'Pencahayaan kontras tinggi, komposisi seperti bingkai film, mood kuat.', 'film', 9),
    ('fashion_editorial', 'Editorial Fashion', 'Pose model profesional, pencahayaan majalah, fokus pada busana/gaya.', 'shirt', 10),
    ('fine_art_painting', 'Fine Art Lukisan', 'Tekstur kuas/kanvas, komposisi seperti lukisan klasik/kontemporer.', 'brush', 11),
    ('architectural_render', 'Arsitektur & Render Interior', 'Rendering ruang/bangunan bersih, pencahayaan alami, presisi geometris.', 'building', 12),
    ('nusantara_heritage', 'Tradisional Nusantara', 'Motif/ornamen khas budaya Indonesia (batik, ukiran, tenun) sebagai elemen visual.', 'feather', 13),
    ('playful_kids', 'Ilustrasi Anak & Playful', 'Warna cerah ceria, bentuk membulat lembut, kesan ramah/menyenangkan.', 'sun', 14),
    ('natural_candid', 'Dokumentasi Foto Natural', 'Gaya candid/lifestyle, pencahayaan alami, terasa tidak dibuat-buat.', 'image', 15),
    ('retro_vintage', 'Retro Vintage', 'Palet warna pudar era lama, tekstur grain/film klasik.', 'clock', 16)
ON CONFLICT (style_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon_key = EXCLUDED.icon_key,
    display_order = EXCLUDED.display_order;

-- 8. Tautkan 8 template yang sudah ada ke style_family_id masing-masing
UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'natural_candid')
WHERE template_name = 'Promosi Produk Studio Minimalis Tropis' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'studio_realism')
WHERE template_name = 'Katalog Komersial Studio Sudut Tiga Perempat' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'cinematic_dramatic')
WHERE template_name = 'Banner Promosi Musiman Geometris Dinamis' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'flat_vector')
WHERE template_name = 'Karakter Maskot Vektor Flat Ramah' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'fine_art_painting')
WHERE template_name = 'Potret Ilustratif Rekan Kerja Digital Profesional' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'flat_vector')
WHERE template_name = 'Visual Ringkasan Metrik Laporan Eksekutif' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'studio_realism')
WHERE template_name = 'Mockup Perangkat Modern Flat-Lay Studio' AND style_family_id IS NULL;

UPDATE prompt_template_library
SET style_family_id = (SELECT id FROM prompt_style_families WHERE style_code = 'cinematic_dramatic')
WHERE template_name = 'Poster Acara Bisnis & Webinar Tipografi Elegan' AND style_family_id IS NULL;
