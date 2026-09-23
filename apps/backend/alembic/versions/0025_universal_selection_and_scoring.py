"""Universal Selection Hub & Scoring Engine (Bagian 13.1, 17.5)

Revision ID: 0025_universal_selection_and_scoring
Revises: 0024_sales_guardrails_matrix_and_human_approval
Create Date: 2026-09-28 00:00:00.000000

Skema:
- Tabel selection_jobs (Pekerjaan seleksi multi-kategori, kriteria, dan bobot evaluasi)
- Tabel selection_source_documents (Dokumen sumber pelamar/vendor, hasil ekstraksi LLM)
- Tabel selection_runs (Snapshot eksekusi scoring deterministik & hash reproduksibilitas)
- Tabel selection_calibration_results (Riwayat kalibrasi bobot kriteria berkelanjutan)
- Tabel selection_scoring_results (Hasil scoring per kandidat dengan evaluasi kriteria & status tinjauan manusia)
- RLS FORCE bertenant pada seluruh tabel seleksi
- Registrasi capabilities dan perkakas MCP
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0025_universal_selection_and_scoring"
down_revision: Union[str, None] = "0024_sales_guardrails_matrix_and_human_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabel selection_jobs
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title text NOT NULL,
        category text NOT NULL DEFAULT 'RECRUITMENT' CHECK (category IN ('RECRUITMENT', 'VENDOR_SELECTION', 'TENDER_EVALUATION', 'LEAD_QUALIFICATION', 'DOCUMENT_AUDIT')),
        description text,
        criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
        weights jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'INGESTING', 'PROCESSING', 'CALIBRATING', 'PENDING_HUMAN_REVIEW', 'FINAL_APPROVED', 'REJECTED')),
        total_documents integer NOT NULL DEFAULT 0,
        active_run_id uuid,
        human_reviewer_id uuid,
        human_review_notes text,
        final_approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_selection_jobs_tenant 
        ON selection_jobs(tenant_id, status);
    """)

    # 2. Tabel selection_source_documents
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_source_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
        document_name text NOT NULL,
        file_url text,
        source_type text NOT NULL DEFAULT 'RESUME' CHECK (source_type IN ('RESUME', 'PROPOSAL', 'PORTFOLIO', 'CERTIFICATE', 'INTERVIEW_TRANSCRIPT', 'FINANCIAL_RECORD')),
        candidate_name text NOT NULL,
        candidate_email text,
        candidate_phone text,
        raw_text text,
        parsed_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        extraction_status text NOT NULL DEFAULT 'PARSED' CHECK (extraction_status IN ('PENDING', 'PARSED', 'FAILED')),
        model_used text NOT NULL DEFAULT 'meta-llama/llama-3.3-70b-instruct',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_selection_source_documents_job 
        ON selection_source_documents(job_id, tenant_id);
    """)

    # 3. Tabel selection_runs
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
        run_number integer NOT NULL DEFAULT 1,
        model_used text NOT NULL DEFAULT 'meta-llama/llama-3.3-70b-instruct',
        weights_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        calibration_version integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING', 'COMPLETED', 'CALIBRATED', 'FAILED')),
        total_candidates integer NOT NULL DEFAULT 0,
        average_score numeric(5, 2) NOT NULL DEFAULT 0.00,
        reproducibility_hash text NOT NULL,
        execution_duration_ms integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_selection_runs_job 
        ON selection_runs(job_id, run_number);
    """)

    # 4. Tabel selection_calibration_results
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_calibration_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
        run_id uuid REFERENCES selection_runs(id) ON DELETE SET NULL,
        criteria_key text NOT NULL,
        old_weight numeric(5, 4) NOT NULL,
        adjusted_weight numeric(5, 4) NOT NULL,
        calibration_factor numeric(5, 4) NOT NULL DEFAULT 1.0000,
        human_reviewer_id uuid,
        human_feedback_notes text,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_selection_calibration_job 
        ON selection_calibration_results(job_id, criteria_key);
    """)

    # 5. Tabel selection_scoring_results
    op.execute("""
    CREATE TABLE IF NOT EXISTS selection_scoring_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        job_id uuid NOT NULL REFERENCES selection_jobs(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES selection_runs(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES selection_source_documents(id) ON DELETE CASCADE,
        candidate_name text NOT NULL,
        rank_position integer NOT NULL,
        overall_score numeric(5, 2) NOT NULL,
        criterion_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
        justification text NOT NULL,
        recommendation text NOT NULL CHECK (recommendation IN ('HIGHLY_RECOMMENDED', 'RECOMMENDED', 'CONSIDER', 'REJECT')),
        human_reviewed boolean NOT NULL DEFAULT false,
        human_override_score numeric(5, 2),
        human_review_status text NOT NULL DEFAULT 'PENDING' CHECK (human_review_status IN ('PENDING', 'ACCEPTED', 'OVERRIDDEN', 'REJECTED')),
        human_reviewer_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_run_document UNIQUE (run_id, document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_selection_scoring_run 
        ON selection_scoring_results(run_id, rank_position);
    """)

    # 6. RLS
    op.execute("""
    ALTER TABLE selection_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_jobs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_jobs_tenant_isolation ON selection_jobs;
    CREATE POLICY p_selection_jobs_tenant_isolation ON selection_jobs
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE selection_source_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_source_documents FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_source_documents_tenant_isolation ON selection_source_documents;
    CREATE POLICY p_selection_source_documents_tenant_isolation ON selection_source_documents
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE selection_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_runs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_runs_tenant_isolation ON selection_runs;
    CREATE POLICY p_selection_runs_tenant_isolation ON selection_runs
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE selection_calibration_results ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_calibration_results FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_calibration_results_tenant_isolation ON selection_calibration_results;
    CREATE POLICY p_selection_calibration_results_tenant_isolation ON selection_calibration_results
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    ALTER TABLE selection_scoring_results ENABLE ROW LEVEL SECURITY;
    ALTER TABLE selection_scoring_results FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_selection_scoring_results_tenant_isolation ON selection_scoring_results;
    CREATE POLICY p_selection_scoring_results_tenant_isolation ON selection_scoring_results
        AS RESTRICTIVE FOR ALL TO authenticated, orchestree_app
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    """)

    # 7. Capabilities
    op.execute("""
    INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
    VALUES 
        (gen_random_uuid(), 'selection.job.manage', 1, 'Membuat dan mengonfigurasi pekerjaan seleksi data cerdas'),
        (gen_random_uuid(), 'selection.document.ingest', 1, 'Mengunggah dan mengekstraksi dokumen sumber multi-format'),
        (gen_random_uuid(), 'selection.scoring.execute', 1, 'Menjalankan scoring dan perangkingan kandidat cerdas yang dapat direproduksi'),
        (gen_random_uuid(), 'selection.human_review.submit', 1, 'Melakukan human review dan persetujuan final seleksi'),
        (gen_random_uuid(), 'selection.calibration.apply', 2, 'Mengkalibrasi bobot kriteria berkelanjutan berdasarkan umpan balik manusia')
    ON CONFLICT (capability_key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS selection_scoring_results CASCADE;
    DROP TABLE IF EXISTS selection_calibration_results CASCADE;
    DROP TABLE IF EXISTS selection_runs CASCADE;
    DROP TABLE IF EXISTS selection_source_documents CASCADE;
    DROP TABLE IF EXISTS selection_jobs CASCADE;
    DELETE FROM feature_capabilities WHERE capability_key LIKE 'selection.%';
    """)
