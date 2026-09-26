"""channel verification otp hash and audit

Revision ID: 0058_channel_verification_otp_hash_and_audit
Revises: 0057_ai_agent_live_state_cognitive_monitoring
Create Date: 2026-09-26 17:00:00.000000

Penguatan Keamanan & Kepatuhan Verifikasi Kanal Proaktif (PRD v2.2 Bagian 10 & Bagian 15):
1. Kolom otp_code_hash, verify_token_hash, otp_expires_at, otp_attempt_count, otp_sent_via_message_id, chat_id, telegram_username
2. Drop NOT NULL pada verification_code agar tidak wajib simpan plaintext
3. Indeks pencarian cepat hash token dan hash OTP
4. Kapabilitas proactive.channel.verify & proactive.channel.audit
5. Reversible upgrade() dan downgrade()
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0058_channel_verification_otp_hash_and_audit'
down_revision: Union[str, None] = '0057_ai_agent_live_state_cognitive_monitoring'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Perluas tabel channel_verification dengan kolom hash keamanan & bukti pengiriman resmi
    op.execute("""
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
    """)

    # 2. Daftarkan kapabilitas otorisasi ke feature_capabilities jika belum ada
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('proactive.channel.verify', 1, 'Hak staf dan admin untuk memverifikasi kanal komunikasi proaktif'),
        ('proactive.channel.audit', 2, 'Hak melihat rekam audit pengiriman OTP dan tiket verifikasi kanal')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX IF EXISTS idx_channel_verif_chat_id;
    DROP INDEX IF EXISTS idx_channel_verif_otp_hash;
    DROP INDEX IF EXISTS idx_channel_verif_token_hash;

    ALTER TABLE channel_verification
        DROP COLUMN IF EXISTS telegram_username,
        DROP COLUMN IF EXISTS chat_id,
        DROP COLUMN IF EXISTS otp_sent_via_message_id,
        DROP COLUMN IF EXISTS otp_attempt_count,
        DROP COLUMN IF EXISTS otp_expires_at,
        DROP COLUMN IF EXISTS verify_token_hash,
        DROP COLUMN IF EXISTS otp_code_hash;

    DELETE FROM feature_capabilities WHERE capability_key IN ('proactive.channel.verify', 'proactive.channel.audit');
    """)
