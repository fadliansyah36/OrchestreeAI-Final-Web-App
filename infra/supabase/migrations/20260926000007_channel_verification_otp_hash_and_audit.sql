-- 20260926000007_channel_verification_otp_hash_and_audit.sql
-- Penguatan Keamanan & Kepatuhan Verifikasi Kanal Proaktif (PRD v2.2 Bagian 10 & Bagian 15)

ALTER TABLE channel_verification
    ADD COLUMN IF NOT EXISTS otp_code_hash text,
    ADD COLUMN IF NOT EXISTS verify_token_hash text,
    ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS otp_attempt_count int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS otp_sent_via_message_id text,
    ADD COLUMN IF NOT EXISTS chat_id text,
    ADD COLUMN IF NOT EXISTS telegram_username text;

-- Izinkan verification_code bernilai NULL agar plaintext tidak disimpan
ALTER TABLE channel_verification ALTER COLUMN verification_code DROP NOT NULL;

-- Indeks keamanan untuk pencarian token dan hash OTP
CREATE INDEX IF NOT EXISTS idx_channel_verif_token_hash 
    ON channel_verification(verify_token_hash) 
    WHERE verify_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_verif_otp_hash 
    ON channel_verification(channel, otp_code_hash, status) 
    WHERE otp_code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_verif_chat_id 
    ON channel_verification(chat_id) 
    WHERE chat_id IS NOT NULL;

-- Daftarkan kapabilitas otorisasi ke feature_capabilities jika belum ada
INSERT INTO feature_capabilities (id, capability_name, description, default_roles)
VALUES 
    ('proactive.channel.verify', 'Verifikasi Kanal Resmi WhatsApp & Telegram', 'Hak staf dan admin untuk memverifikasi kanal komunikasi proaktif', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'TENANT_MEMBER', 'SUPER_ADMIN']),
    ('proactive.channel.audit', 'Audit Log Kanal Komunikasi Proaktif', 'Hak melihat rekam audit pengiriman OTP dan tiket verifikasi kanal', ARRAY['TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN'])
ON CONFLICT (id) DO NOTHING;
