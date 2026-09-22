"""Implementasi Memory Documents, Memory Embeddings (pgvector HNSW), Memory Access Logs, dan Registrasi Kapabilitas

Revision ID: 0013_memory_pgvector_hnsw_hybrid
Revises: 0012_abac_ai_data_permissions
Create Date: 2026-09-22 17:00:00.000000

Skema Memory & Hybrid Search (PRD v2.2 Bagian 8.4 & 11.5):
- Mengaktifkan ekstensi vector dan pg_trgm.
- Tabel memory_documents: Dokumen memori persisten bertenant dengan metadata, confidence, klasifikasi, tsvector fulltext.
- Tabel memory_embeddings: Embedding vektor representasi chunk memori (dimensi 1536 terkalibrasi ke probe Gemini embedding aktif) dengan HNSW index cosine distance.
- Tabel memory_access_log: Audit trail akses baca/cari memori oleh AI Agent dan pengguna manusia.
- Penegakan RLS FORCE bertenant pada memory_documents, memory_embeddings, dan memory_access_log.
- Registrasi kapabilitas memori pada feature_capabilities.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0013_memory_pgvector_hnsw_hybrid"
down_revision: Union[str, None] = "0012_abac_ai_data_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ekstensi vector dan pg_trgm
    op.execute("""
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    """)

    # 2. Tabel memory_documents
    op.execute("""
    CREATE TABLE IF NOT EXISTS memory_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title text NOT NULL,
        content text NOT NULL,
        summary text,
        category text NOT NULL DEFAULT 'knowledge',
        source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'sop', 'workflow_execution', 'agent_reflection', 'conversation', 'document_upload')),
        source_id text,
        data_classification text NOT NULL DEFAULT 'internal' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
        confidence float NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
        decay_factor float NOT NULL DEFAULT 0.05,
        access_count int NOT NULL DEFAULT 0,
        last_accessed_at timestamptz,
        created_by_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
        created_by_user_id uuid REFERENCES tenant_memberships(id) ON DELETE SET NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        search_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('indonesian', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(summary, ''))
        ) STORED,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_memory_docs_tenant ON memory_documents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memory_docs_category ON memory_documents(tenant_id, category);
    CREATE INDEX IF NOT EXISTS idx_memory_docs_search_vector ON memory_documents USING gin(search_vector);
    CREATE INDEX IF NOT EXISTS idx_memory_docs_title_trgm ON memory_documents USING gin(title gin_trgm_ops);
    """)

    # 3. Tabel memory_embeddings
    # Dimensi 1536 terkalibrasi melalui Model Router probe aktif ke Gemini Embedding dengan outputDimensionality 1536
    # Kompatibel penuh dengan indeks pgvector HNSW (< 2000 batas dimensi).
    op.execute("""
    CREATE TABLE IF NOT EXISTS memory_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES memory_documents(id) ON DELETE CASCADE,
        chunk_index int NOT NULL DEFAULT 0,
        chunk_content text NOT NULL,
        embedding vector(1536) NOT NULL,
        model_name text NOT NULL DEFAULT 'gemini-embedding-001',
        token_count int NOT NULL DEFAULT 0,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_memory_embeddings_tenant ON memory_embeddings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memory_embeddings_doc ON memory_embeddings(tenant_id, document_id);
    CREATE INDEX IF NOT EXISTS idx_memory_embeddings_hnsw ON memory_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    """)

    # 4. Tabel memory_access_log
    op.execute("""
    CREATE TABLE IF NOT EXISTS memory_access_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_id uuid REFERENCES memory_documents(id) ON DELETE CASCADE,
        actor_type text NOT NULL CHECK (actor_type IN ('ai_agent', 'human_user', 'system')),
        actor_id text,
        action text NOT NULL DEFAULT 'search_read' CHECK (action IN ('search_read', 'grounding_inject', 'manual_view', 'decay_update', 'checkpoint_resume')),
        query_text text,
        similarity_score float,
        abac_decision text NOT NULL DEFAULT 'ALLOW',
        context jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_memory_access_log_tenant ON memory_access_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memory_access_log_doc ON memory_access_log(document_id);
    CREATE INDEX IF NOT EXISTS idx_memory_access_log_created ON memory_access_log(tenant_id, created_at DESC);
    """)

    # 5. Penegakan RLS FORCE bertenant
    op.execute("""
    ALTER TABLE memory_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_documents FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_memory_documents ON memory_documents;
    CREATE POLICY tenant_isolation_memory_documents ON memory_documents
        AS RESTRICTIVE
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_embeddings FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_memory_embeddings ON memory_embeddings;
    CREATE POLICY tenant_isolation_memory_embeddings ON memory_embeddings
        AS RESTRICTIVE
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_access_log FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation_memory_access_log ON memory_access_log;
    CREATE POLICY tenant_isolation_memory_access_log ON memory_access_log
        AS RESTRICTIVE
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    """)

    # 6. Registrasi Feature Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES
        (gen_random_uuid(), 'memory.search', 0, 'Pencarian semantik dan hybrid terhadap memori pengetahuan organisasi'),
        (gen_random_uuid(), 'memory.documents.create', 1, 'Membuat dan mengunggah dokumen memori baru ke Company Brain'),
        (gen_random_uuid(), 'memory.documents.manage', 1, 'Mengelola, memperbarui, dan menghapus dokumen memori organisasi'),
        (gen_random_uuid(), 'memory.decay.consolidate', 1, 'Eksekusi job konsolidasi peluruhan confidence memori otomatis')
    ON CONFLICT (capability_key) DO UPDATE
    SET description = EXCLUDED.description,
        min_tier_level = EXCLUDED.min_tier_level;
    """)


def downgrade() -> None:
    # 1. Hapus Feature Capabilities
    op.execute("""
    DELETE FROM feature_capabilities
    WHERE capability_key IN (
        'memory.search',
        'memory.documents.create',
        'memory.documents.manage',
        'memory.decay.consolidate'
    );
    """)

    # 2. Hapus tabel & policies
    op.execute("""
    DROP TABLE IF EXISTS memory_access_log CASCADE;
    DROP TABLE IF EXISTS memory_embeddings CASCADE;
    DROP TABLE IF EXISTS memory_documents CASCADE;
    """)
