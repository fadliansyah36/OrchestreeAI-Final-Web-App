"""Enforce NOT NULL and FOREIGN KEY constraint on ai_agents.job_title_id

Revision ID: 0037_enforce_not_null_job_title_fk_on_ai_agents
Revises: 0036_ai_job_titles_and_structural_roles_shadow_mapping
Create Date: 2026-09-23 18:00:00.000000

PRD v2.2 Bagian 2.4 (Rekonsiliasi Arsitektur) & Bagian 9.1:
- Menegakkan constraint NOT NULL dan FOREIGN KEY ON DELETE RESTRICT pada ai_agents.job_title_id
- Menambahkan kolom struktural opsional: structural_role_id & job_subtitle_id
- Transisi resmi dari Shadow Mapping (opsional) menjadi Katalog Wajib (mandatory)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0037_enforce_not_null_job_title_fk_on_ai_agents"
down_revision: Union[str, None] = "0036_ai_job_titles_and_structural_roles_shadow_mapping"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tambahkan kolom struktural opsional bila belum ada
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ai_agents' AND column_name = 'structural_role_id'
        ) THEN
            ALTER TABLE ai_agents ADD COLUMN structural_role_id uuid REFERENCES ai_structural_roles(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ai_agents' AND column_name = 'job_subtitle_id'
        ) THEN
            ALTER TABLE ai_agents ADD COLUMN job_subtitle_id uuid REFERENCES job_subtitles(id) ON DELETE SET NULL;
        END IF;
    END
    $$;
    """)

    # 2. Pastikan tidak ada ai_agents dengan job_title_id bernilai NULL
    op.execute("""
    DO $$
    DECLARE
        default_title_id uuid;
    BEGIN
        SELECT id INTO default_title_id FROM ai_job_titles WHERE title_code = 'AI_OPERATIONS_FLEET' LIMIT 1;
        IF default_title_id IS NOT NULL THEN
            UPDATE ai_agents SET job_title_id = default_title_id WHERE job_title_id IS NULL;
        END IF;
    END
    $$;
    """)

    # 3. Ganti foreign key constraint menjadi ON DELETE RESTRICT
    op.execute("ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_job_title_id_fkey;")
    op.execute("""
    ALTER TABLE ai_agents
        ADD CONSTRAINT ai_agents_job_title_id_fkey
        FOREIGN KEY (job_title_id)
        REFERENCES ai_job_titles(id)
        ON DELETE RESTRICT;
    """)

    # 4. Terapkan NOT NULL constraint
    op.execute("ALTER TABLE ai_agents ALTER COLUMN job_title_id SET NOT NULL;")

    # 5. Indeks tambahan
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_agents_structural_role_id ON ai_agents(structural_role_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_agents_job_subtitle_id ON ai_agents(job_subtitle_id);")


def downgrade() -> None:
    # Revert NOT NULL constraint
    op.execute("ALTER TABLE ai_agents ALTER COLUMN job_title_id DROP NOT NULL;")

    # Revert foreign key ke ON DELETE SET NULL
    op.execute("ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_job_title_id_fkey;")
    op.execute("""
    ALTER TABLE ai_agents
        ADD CONSTRAINT ai_agents_job_title_id_fkey
        FOREIGN KEY (job_title_id)
        REFERENCES ai_job_titles(id)
        ON DELETE SET NULL;
    """)

    # Hapus indeks dan kolom opsional
    op.execute("DROP INDEX IF EXISTS idx_ai_agents_job_subtitle_id;")
    op.execute("DROP INDEX IF EXISTS idx_ai_agents_structural_role_id;")
    op.execute("ALTER TABLE ai_agents DROP COLUMN IF EXISTS job_subtitle_id;")
    op.execute("ALTER TABLE ai_agents DROP COLUMN IF EXISTS structural_role_id;")
