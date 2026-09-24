import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0031 (8 Dimensi Company Context Fabric & AI Research Agent).');

  try {
    await client.query('BEGIN;');

    console.log('1. Membuat tabel company_context_dimensions (8 Dimensi Inti)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_context_dimensions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        dimension_code VARCHAR(50) NOT NULL CHECK (dimension_code IN (
          'ORGANIZATIONAL_STRUCTURE',
          'STRATEGY_AND_OBJECTIVES',
          'PRODUCTS_AND_SERVICES',
          'PROCESSES_AND_SOPS',
          'BRAND_AND_IDENTITY',
          'FINANCIALS_AND_BUDGET',
          'COMPLIANCE_AND_LEGAL',
          'CUSTOMER_AND_MARKET'
        )),
        dimension_name VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING_REVIEW', 'ARCHIVED')),
        weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_context_dimension UNIQUE (tenant_id, dimension_code)
      );

      CREATE INDEX IF NOT EXISTS idx_company_context_dimensions_tenant
      ON company_context_dimensions(tenant_id, dimension_code);
    `);

    console.log('2. Membuat tabel company_context_knowledge_nodes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_context_knowledge_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        dimension_id UUID REFERENCES company_context_dimensions(id) ON DELETE CASCADE,
        dimension_code VARCHAR(50) NOT NULL,
        node_key VARCHAR(150) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        priority_level INT NOT NULL DEFAULT 1 CHECK (priority_level BETWEEN 1 AND 6),
        source_classification VARCHAR(20) NOT NULL CHECK (source_classification IN ('Native', 'Synced', 'Uploaded', 'External')),
        source_reference VARCHAR(255),
        tags TEXT[] NOT NULL DEFAULT '{}',
        is_verified BOOLEAN NOT NULL DEFAULT true,
        verified_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_dimension_node_key UNIQUE (tenant_id, dimension_code, node_key)
      );

      CREATE INDEX IF NOT EXISTS idx_company_context_nodes_lookup
      ON company_context_knowledge_nodes(tenant_id, dimension_code, priority_level);
    `);

    console.log('3. Membuat tabel tenant_research_policies...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_research_policies (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        allow_public_web_search BOOLEAN NOT NULL DEFAULT false,
        max_research_depth INT NOT NULL DEFAULT 3,
        require_traceability_citations BOOLEAN NOT NULL DEFAULT true,
        allowed_domains TEXT[] NOT NULL DEFAULT '{}',
        blocked_domains TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    console.log('4. Membuat tabel ai_research_queries...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_research_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID,
        query_text TEXT NOT NULL,
        research_objective TEXT,
        knowledge_levels_consulted INT[] NOT NULL DEFAULT '{}',
        sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
        public_web_search_attempted BOOLEAN NOT NULL DEFAULT false,
        public_web_search_allowed BOOLEAN NOT NULL DEFAULT false,
        answer_text TEXT NOT NULL,
        traceability_report JSONB NOT NULL DEFAULT '{}'::jsonb,
        confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9000,
        latency_ms INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_research_queries_tenant
      ON ai_research_queries(tenant_id, created_at DESC);
    `);

    console.log('5. Mengaktifkan Row Level Security (FORCE)...');
    await client.query(`
      ALTER TABLE company_context_dimensions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE company_context_dimensions FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_company_context_dimensions ON company_context_dimensions;
      CREATE POLICY tenant_isolation_company_context_dimensions ON company_context_dimensions
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE company_context_knowledge_nodes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE company_context_knowledge_nodes FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_company_context_knowledge_nodes ON company_context_knowledge_nodes;
      CREATE POLICY tenant_isolation_company_context_knowledge_nodes ON company_context_knowledge_nodes
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE tenant_research_policies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_research_policies FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_tenant_research_policies ON tenant_research_policies;
      CREATE POLICY tenant_isolation_tenant_research_policies ON tenant_research_policies
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE ai_research_queries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ai_research_queries FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_ai_research_queries ON ai_research_queries;
      CREATE POLICY tenant_isolation_ai_research_queries ON ai_research_queries
        FOR ALL TO PUBLIC
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

      GRANT ALL ON company_context_dimensions TO authenticated, orchestree_app;
      GRANT ALL ON company_context_knowledge_nodes TO authenticated, orchestree_app;
      GRANT ALL ON tenant_research_policies TO authenticated, orchestree_app;
      GRANT ALL ON ai_research_queries TO authenticated, orchestree_app;
    `);

    console.log('6. Mendaftarkan kapabilitas baru pada feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description) VALUES
        ('context.fabric.dimensions.view', 2, 'Melihat 8 dimensi Company Context Fabric korporat'),
        ('context.fabric.dimensions.manage', 3, 'Mengonfigurasi bobot dan entitas 8 dimensi Company Context Fabric'),
        ('enterprise.research_agent.execute', 3, 'Menjalankan AI Research Agent dengan 6 tingkat Knowledge Priority Hierarchy'),
        ('enterprise.research_agent.web_search', 3, 'Mengonfigurasi dan mengaktifkan akses riset web publik untuk AI Research Agent')
      ON CONFLICT (capability_key) DO UPDATE SET
        min_tier_level = EXCLUDED.min_tier_level,
        description = EXCLUDED.description;
    `);

    console.log('7. Menginisialisasi 8 dimensi default untuk tenant tier 3...');
    await client.query(`
      INSERT INTO company_context_dimensions (tenant_id, dimension_code, dimension_name, description, weight)
      SELECT 
        t.id as tenant_id,
        dim.code as dimension_code,
        dim.name as dimension_name,
        dim.dim_desc as description,
        dim.weight as weight
      FROM tenants t
      JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
      CROSS JOIN (
        VALUES
          ('ORGANIZATIONAL_STRUCTURE', 'Struktur Organisasi & Hierarki', 'Departemen, rantai komando, wewenang divisi, dan hierarki kepemimpinan korporat', 1.00),
          ('STRATEGY_AND_OBJECTIVES', 'Strategi Bisnis & Sasaran', 'Visi, misi korporat, target kuartalan OKR, dan Key Performance Indicators (KPI)', 1.10),
          ('PRODUCTS_AND_SERVICES', 'Produk, Layanan & Katalog', 'Portofolio produk, spesifikasi teknis, daftar layanan, dan Service Level Agreement (SLA)', 1.05),
          ('PROCESSES_AND_SOPS', 'Proses Operasional & SOP', 'Standar Operasional Prosedur antar divisi, alur kerja baku, dan eskalasi insiden', 1.00),
          ('BRAND_AND_IDENTITY', 'Identitas Merek & Komunikasi', 'Pedoman visual, representasi merek, tone of voice komunikasi, dan standarisasi narasi', 0.90),
          ('FINANCIALS_AND_BUDGET', 'Keuangan, Anggaran & Harga', 'Kebijakan anggaran departemen, margin keuntungan, diskon, dan pedoman pembiayaan', 1.15),
          ('COMPLIANCE_AND_LEGAL', 'Kepatuhan, Hukum & Tata Kelola', 'Regulasi industri, audit DPIA, perlindungan data privasi, dan klausul hukum kontrak', 1.20),
          ('CUSTOMER_AND_MARKET', 'Pasar, Kompetitor & Pelanggan', 'Profil pelanggan korporat, dinamika pasar industri, dan analisis kompetitor', 0.95)
      ) AS dim(code, name, dim_desc, weight)
      WHERE sp.tier_level >= 2
      ON CONFLICT (tenant_id, dimension_code) DO NOTHING;
    `);

    console.log('8. Menginisialisasi tenant_research_policies default (web search dinonaktifkan secara default)...');
    await client.query(`
      INSERT INTO tenant_research_policies (tenant_id, allow_public_web_search, max_research_depth, require_traceability_citations)
      SELECT t.id, false, 3, true
      FROM tenants t
      ON CONFLICT (tenant_id) DO NOTHING;
    `);

    await client.query('COMMIT;');
    console.log('✅ Migrasi 0031 berhasil dieksekusi di Supabase Postgres!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Gagal menjalankan migrasi 0031:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch((e) => {
  console.error(e);
  process.exit(1);
});
