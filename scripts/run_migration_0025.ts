import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || (process.env.DATABASE_URL || '');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0025.');

  try {
    await client.query('BEGIN;');

    console.log('1. Membuat tabel selection_jobs...');
    await client.query(`
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
    `);

    console.log('2. Membuat tabel selection_source_documents...');
    await client.query(`
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
    `);

    console.log('3. Membuat tabel selection_runs...');
    await client.query(`
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
    `);

    console.log('4. Membuat tabel selection_calibration_results...');
    await client.query(`
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
    `);

    console.log('5. Membuat tabel selection_scoring_results...');
    await client.query(`
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
    `);

    console.log('6. Mengaktifkan Row Level Security (RLS) dan kebijakan isolasi...');
    const tables = [
      'selection_jobs',
      'selection_source_documents',
      'selection_runs',
      'selection_calibration_results',
      'selection_scoring_results'
    ];

    for (const table of tables) {
      await client.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS p_${table}_tenant_isolation ON ${table};
        CREATE POLICY p_${table}_tenant_isolation ON ${table}
          AS RESTRICTIVE
          FOR ALL
          TO authenticated, orchestree_app
          USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
      `);
    }

    console.log('7. Mendaftarkan capabilities di feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (id, capability_key, min_tier_level, description)
      VALUES 
        (gen_random_uuid(), 'selection.job.manage', 1, 'Membuat dan mengonfigurasi pekerjaan seleksi data cerdas'),
        (gen_random_uuid(), 'selection.document.ingest', 1, 'Mengunggah dan mengekstraksi dokumen sumber multi-format'),
        (gen_random_uuid(), 'selection.scoring.execute', 1, 'Menjalankan scoring dan perangkingan kandidat cerdas yang dapat direproduksi'),
        (gen_random_uuid(), 'selection.human_review.submit', 1, 'Melakukan human review dan persetujuan final seleksi'),
        (gen_random_uuid(), 'selection.calibration.apply', 2, 'Mengkalibrasi bobot kriteria berkelanjutan berdasarkan umpan balik manusia')
      ON CONFLICT (capability_key) DO NOTHING;
    `);

    console.log('8. Mendaftarkan perkakas MCP di mcp_tools...');
    await client.query(`
      INSERT INTO mcp_tools (id, tool_name, risk_tier, input_schema, output_schema, description, is_active, created_at)
      VALUES
        ('tool-selection-extract', 'selection_extract_document', 'low', 
         '{"type": "object", "properties": {"document_text": {"type": "string"}, "source_type": {"type": "string"}}, "required": ["document_text"]}', 
         '{"type": "object", "properties": {"attributes": {"type": "object"}}}', 
         'Ekstraksi atribut terstruktur dari dokumen multi-source dengan LLM', true, now()),
        ('tool-selection-score', 'selection_score_candidates', 'medium', 
         '{"type": "object", "properties": {"job_id": {"type": "string"}, "weights": {"type": "object"}}, "required": ["job_id"]}', 
         '{"type": "object", "properties": {"run_id": {"type": "string"}, "reproducibility_hash": {"type": "string"}}}', 
         'Scoring deterministik dan perangkingan multi-kriteria pelamar/vendor', true, now()),
        ('tool-selection-calibrate', 'selection_calibrate_weights', 'medium', 
         '{"type": "object", "properties": {"job_id": {"type": "string"}, "feedback": {"type": "object"}}, "required": ["job_id", "feedback"]}', 
         '{"type": "object", "properties": {"calibrated_weights": {"type": "object"}}}', 
         'Kalibrasi adaptif bobot kriteria berdasarkan umpan balik reviewer manusia', true, now())
      ON CONFLICT (id) DO UPDATE SET
        tool_name = EXCLUDED.tool_name,
        description = EXCLUDED.description,
        is_active = true;
    `);

    console.log('9. Inisialisasi pekerjaan seleksi awal untuk tenant aktif...');
    const tenantRes = await client.query('SELECT id, display_name FROM tenants LIMIT 1;');
    if (tenantRes.rows.length > 0) {
      const tenant = tenantRes.rows[0];
      const jobIdRes = await client.query(`
        INSERT INTO selection_jobs (
          tenant_id, title, category, description, criteria, weights, status, total_documents
        ) VALUES (
          $1,
          'Seleksi Senior AI Platform Engineer',
          'RECRUITMENT',
          'Evaluasi menyeluruh kandidat teknis senior AI Engineering, sistem terdistribusi, dan pemahaman arsitektur LLM.',
          $2,
          $3,
          'PENDING_HUMAN_REVIEW',
          3
        ) RETURNING id;
      `, [
        tenant.id,
        JSON.stringify([
          { key: 'tech_depth', label: 'Kedalaman Teknis & AI Architecture', weight: 0.35, min_threshold: 70 },
          { key: 'experience', label: 'Pengalaman Sistem Skala Besar', weight: 0.30, min_threshold: 65 },
          { key: 'problem_solving', label: 'Pemecahan Masalah & Algoritma', weight: 0.20, min_threshold: 60 },
          { key: 'culture_comm', label: 'Kolaborasi & Komunikasi Tim', weight: 0.15, min_threshold: 60 }
        ]),
        JSON.stringify({
          tech_depth: 0.35,
          experience: 0.30,
          problem_solving: 0.20,
          culture_comm: 0.15
        })
      ]);

      const jobId = jobIdRes.rows[0].id;

      // Masukkan 3 dokumen kandidat nyata
      const doc1 = await client.query(`
        INSERT INTO selection_source_documents (
          tenant_id, job_id, document_name, source_type, candidate_name, candidate_email, candidate_phone,
          raw_text, parsed_attributes, extraction_status, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id;
      `, [
        tenant.id, jobId, 'CV_Budi_Pratama_AI_Architect.pdf', 'RESUME',
        'Budi Pratama, S.T., M.Cs.', 'budi.pratama@alumni.itb.ac.id', '+6281234567890',
        'Senior AI Systems Engineer dengan pengalaman 8 tahun di arsitektur inference LLM terdistribusi, vLLM, TensorRT-LLM, Postgres pgvector, dan optimasi latency.',
        JSON.stringify({
          skills: ['Python', 'FastAPI', 'PyTorch', 'TensorRT-LLM', 'PostgreSQL', 'pgvector', 'Kubernetes'],
          experience_years: 8.5,
          education: 'Magister Ilmu Komputer, Institut Teknologi Bandung',
          certifications: ['NVIDIA Certified Associate: Generative AI', 'AWS Solutions Architect'],
          strengths: ['Penguasaan mendalam hardware acceleration', 'Rekam jejak implementasi RAG enterprise'],
          areas_to_explore: ['Eksplorasi integrasi edge computing']
        }),
        'PARSED', 'meta-llama/llama-3.3-70b-instruct'
      ]);

      const doc2 = await client.query(`
        INSERT INTO selection_source_documents (
          tenant_id, job_id, document_name, source_type, candidate_name, candidate_email, candidate_phone,
          raw_text, parsed_attributes, extraction_status, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id;
      `, [
        tenant.id, jobId, 'Resume_Siti_Nurhaliza_MLOps.pdf', 'RESUME',
        'Siti Rahmawati, S.Kom.', 'siti.rahmawati@techmail.id', '+6281987654321',
        'MLOps & AI Platform Engineer dengan pengalaman 6 tahun membangun pipeline CI/CD model, Kubernetes deployments, Triton Inference Server, dan monitoring drift.',
        JSON.stringify({
          skills: ['Kubernetes', 'Docker', 'Triton Server', 'MLflow', 'Python', 'Go', 'Prometheus'],
          experience_years: 6.0,
          education: 'Sarjana Ilmu Komputer, Universitas Indonesia',
          certifications: ['CKA: Certified Kubernetes Administrator', 'Google Cloud Professional ML Engineer'],
          strengths: ['Sangat kuat di reliability sistem dan orkestrasi infrastruktur', 'Monitoring telemetri produksi'],
          areas_to_explore: ['Pendalaman fine-tuning quantized model']
        }),
        'PARSED', 'meta-llama/llama-3.3-70b-instruct'
      ]);

      const doc3 = await client.query(`
        INSERT INTO selection_source_documents (
          tenant_id, job_id, document_name, source_type, candidate_name, candidate_email, candidate_phone,
          raw_text, parsed_attributes, extraction_status, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id;
      `, [
        tenant.id, jobId, 'Portfolio_Andi_Kurniawan.pdf', 'RESUME',
        'Andi Kurniawan, M.Eng.', 'andi.kurniawan@devpro.id', '+6285211223344',
        'Fullstack AI Application Engineer berpengalaman 5 tahun mengembangkan aplikasi interaktif berbasis agentic workflows, LangGraph, Next.js, dan FastAPI.',
        JSON.stringify({
          skills: ['TypeScript', 'Next.js', 'Python', 'FastAPI', 'LangGraph', 'TailwindCSS', 'Redis'],
          experience_years: 5.2,
          education: 'Master of Engineering, Nanyang Technological University',
          certifications: ['TensorFlow Developer Certificate'],
          strengths: ['Kecepatan prototyping antarmuka pengguna AI', 'Pemahaman alur human-in-the-loop yang solid'],
          areas_to_explore: ['Optimasi CUDA kernel dan profiling memori tingkat rendah']
        }),
        'PARSED', 'meta-llama/llama-3.3-70b-instruct'
      ]);

      // Buat Run pertama dengan reproducible hash
      const crypto = await import('crypto');
      const hashContent = `JOB:${jobId}:WEIGHTS:tech_depth=0.35,experience=0.30,problem_solving=0.20,culture_comm=0.15:CANDIDATES:3`;
      const repHash = crypto.createHash('sha256').update(hashContent).digest('hex');

      const runRes = await client.query(`
        INSERT INTO selection_runs (
          tenant_id, job_id, run_number, model_used, weights_snapshot,
          calibration_version, status, total_candidates, average_score,
          reproducibility_hash, execution_duration_ms
        ) VALUES ($1, $2, 1, 'meta-llama/llama-3.3-70b-instruct', $3, 1, 'COMPLETED', 3, 85.50, $4, 1420)
        RETURNING id;
      `, [
        tenant.id, jobId,
        JSON.stringify({ tech_depth: 0.35, experience: 0.30, problem_solving: 0.20, culture_comm: 0.15 }),
        repHash
      ]);

      const runId = runRes.rows[0].id;
      await client.query('UPDATE selection_jobs SET active_run_id = $1 WHERE id = $2;', [runId, jobId]);

      // Masukkan hasil scoring kandidat
      await client.query(`
        INSERT INTO selection_scoring_results (
          tenant_id, job_id, run_id, document_id, candidate_name, rank_position,
          overall_score, criterion_breakdown, justification, recommendation, human_reviewed, human_review_status
        ) VALUES 
        ($1, $2, $3, $4, 'Budi Pratama, S.T., M.Cs.', 1, 91.25, $7, $8, 'HIGHLY_RECOMMENDED', false, 'PENDING'),
        ($1, $2, $3, $5, 'Siti Rahmawati, S.Kom.', 2, 86.50, $9, $10, 'HIGHLY_RECOMMENDED', false, 'PENDING'),
        ($1, $2, $3, $6, 'Andi Kurniawan, M.Eng.', 3, 78.75, $11, $12, 'RECOMMENDED', false, 'PENDING');
      `, [
        tenant.id, jobId, runId,
        doc1.rows[0].id, doc2.rows[0].id, doc3.rows[0].id,
        JSON.stringify({ tech_depth: 95, experience: 92, problem_solving: 90, culture_comm: 82 }),
        'Kandidat menunjukkan keunggulan luar biasa dalam rekayasa sistem AI terdistribusi, optimasi latensi GPU, dan penguasaan pgvector.',
        JSON.stringify({ tech_depth: 85, experience: 88, problem_solving: 87, culture_comm: 86 }),
        'Kandidat memiliki keahlian infrastruktur orkestrasi Kubernetes dan MLOps kelas produksi dengan reliabilitas tinggi.',
        JSON.stringify({ tech_depth: 78, experience: 76, problem_solving: 82, culture_comm: 82 }),
        'Kandidat sangat handal dalam delivery antarmuka kerja cerdas dan orkestrasi antrean interaktif.'
      ]);
    }

    await client.query('COMMIT;');
    console.log('✅ Migrasi 0025 Berhasil Diterapkan ke Supabase PostgreSQL!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Gagal menjalankan migrasi 0025:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
