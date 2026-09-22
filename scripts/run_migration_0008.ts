import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

async function runMigration0008() {
  console.log('🔄 Memulai eksekusi migrasi DDL 0008_cognitive_core_and_orchestration...');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke database PostgreSQL.');

    await client.query('BEGIN');

    // 1. Pastikan kolom kompatibilitas pada tabel kognitif
    console.log('📦 Menyelaraskan skema tabel-tabel kognitif...');
    await client.query(`
      ALTER TABLE workflow_definitions ALTER COLUMN tenant_id DROP NOT NULL;

      ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS latency_ms int DEFAULT 0;
      ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS error_message text;

      ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS input_payload jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS output_payload jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS error_message text;

      ALTER TABLE workflow_node_runs ADD COLUMN IF NOT EXISTS error_message text;
      ALTER TABLE workflow_node_runs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

      ALTER TABLE tool_health_checks ADD COLUMN IF NOT EXISTS error_message text;
    `);

    // 2. RLS Enforcement
    console.log('🔒 Menegakkan RLS pada tabel-tabel bertenant...');
    const tenantTables = [
      'workflow_executions',
      'workflow_node_runs',
      'llm_usage_logs',
      'tool_invocations',
      'tool_permissions',
      'model_routing_rules'
    ];

    for (const tbl of tenantTables) {
      await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;`);
      await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE schemaname = 'public' AND tablename = '${tbl}' AND policyname = '${tbl}_tenant_isolation'
            ) THEN
                CREATE POLICY ${tbl}_tenant_isolation ON ${tbl}
                AS RESTRICTIVE
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
            END IF;
        END
        $$;
      `);
    }

    // workflow_definitions RLS: Tenant dapat membaca definisi milik tenant-nya atau template sistem (tenant_id IS NULL)
    await client.query(`
      ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_policies 
              WHERE schemaname = 'public' AND tablename = 'workflow_definitions' AND policyname = 'workflow_definitions_tenant_policy'
          ) THEN
              CREATE POLICY workflow_definitions_tenant_policy ON workflow_definitions
              FOR ALL
              USING (
                  tenant_id IS NULL 
                  OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              )
              WITH CHECK (
                  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              );
          END IF;
      END
      $$;
    `);

    // 3. Indeks performa
    console.log('⚡ Menyiapkan indeks performa...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_exec_tenant ON workflow_executions(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_exec ON workflow_node_runs(workflow_execution_id, node_key);
      CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant_time ON llm_usage_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant ON tool_invocations(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
    `);

    // 4. Daftarkan Capability Fitur Baru
    console.log('🛡️ Mendaftarkan kapabilitas ke feature_capabilities...');
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
      VALUES
          ('workflow.dispatch', 1, 'Hak memicu eksekusi alur kerja kognitif otonom'),
          ('workflow.view', 1, 'Hak melihat riwayat eksekusi dan checkpoint alur kerja'),
          ('workflow.manage', 2, 'Hak mengonfigurasi definisi alur kerja graf'),
          ('llm.route', 1, 'Hak meminta inferensi melalui model router'),
          ('llm.provider.view', 2, 'Hak memantau kesehatan dan status provider model AI'),
          ('mcp.tool.invoke', 1, 'Hak memanggil fungsi perkakas MCP'),
          ('mcp.tool.view', 1, 'Hak melihat katalog perkakas MCP terdaftar'),
          ('mcp.tool.manage', 2, 'Hak mengelola pendaftaran dan izin perkakas MCP')
      ON CONFLICT (capability_key) DO UPDATE SET
          description = EXCLUDED.description;
    `);

    // 5. Berikan izin peran
    console.log('🔑 Mengonfigurasi role permissions...');
    await client.query(`
      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, c.capability_key
      FROM roles r
      CROSS JOIN (
          VALUES 
              ('workflow.dispatch'),
              ('workflow.view'),
              ('workflow.manage'),
              ('llm.route'),
              ('llm.provider.view'),
              ('mcp.tool.invoke'),
              ('mcp.tool.view'),
              ('mcp.tool.manage')
      ) AS c(capability_key)
      WHERE r.role_code IN ('TENANT_OWNER', 'TENANT_ADMIN', 'SUPER_ADMIN')
      ON CONFLICT (role_id, capability_key) DO NOTHING;

      INSERT INTO role_permissions (role_id, capability_key)
      SELECT r.id, c.capability_key
      FROM roles r
      CROSS JOIN (
          VALUES 
              ('workflow.dispatch'),
              ('workflow.view'),
              ('llm.route'),
              ('mcp.tool.invoke'),
              ('mcp.tool.view')
      ) AS c(capability_key)
      WHERE r.role_code IN ('DEPT_MANAGER', 'STAFF_HUMAN', 'STAFF_AI')
      ON CONFLICT (role_id, capability_key) DO NOTHING;
    `);

    // 6. Sinkronisasi Data Provider Nyata
    console.log('🌱 Menyinkronkan katalog llm_providers...');
    await client.query(`
      INSERT INTO llm_providers (id, display_name, base_url, is_active, health_status, latency_ms)
      VALUES
          ('nvidia', 'NVIDIA NIM Enterprise API', 'https://integrate.api.nvidia.com/v1', true, 'healthy', 120),
          ('openrouter', 'OpenRouter Multi-LLM Gateway', 'https://openrouter.ai/api/v1', true, 'healthy', 350),
          ('openai', 'GPT-Image-2 (APIMart / OpenAI)', 'https://api.apimart.ai/v1/images/generations', true, 'healthy', 850),
          ('gemini', 'Google Gemini GenAI Multimodal', 'https://generativelanguage.googleapis.com', true, 'healthy', 180)
      ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          base_url = EXCLUDED.base_url,
          is_active = true;
    `);

    // 7. Sinkronisasi Model-model Nyata Terverifikasi
    console.log('🌱 Menyinkronkan katalog llm_models...');
    await client.query(`
      INSERT INTO llm_models (id, provider_id, model_identifier, context_window, input_cost_per_million, output_cost_per_million, capabilities, is_active)
      VALUES
          ('nvidia/meta/llama-3.2-11b-vision-instruct', 'nvidia', 'meta/llama-3.2-11b-vision-instruct', 131072, 0.20, 0.40, '{"chat":true,"vision":true}'::jsonb, true),
          ('nvidia/google/gemma-3-4b-it', 'nvidia', 'google/gemma-3-4b-it', 8192, 0.10, 0.20, '{"chat":true}'::jsonb, true),
          ('openrouter/liquid/lfm-2.5-2.6b:free', 'openrouter', 'liquid/lfm-2.5-2.6b:free', 32768, 0, 0, '{"chat":true,"free":true}'::jsonb, true),
          ('openrouter/qwen/qwen3.8-27b:free', 'openrouter', 'qwen/qwen3.8-27b:free', 32768, 0, 0, '{"chat":true,"free":true}'::jsonb, true),
          ('openai/gpt-image-2', 'openai', 'gpt-image-2', 2048, 0.04, 0.04, '{"image":true}'::jsonb, true),
          ('gemini/gemini-3.6-flash', 'gemini', 'gemini-3.6-flash', 1048576, 0.075, 0.30, '{"chat":true,"multimodal":true,"tools":true}'::jsonb, true)
      ON CONFLICT (id) DO UPDATE SET
          model_identifier = EXCLUDED.model_identifier,
          context_window = EXCLUDED.context_window,
          capabilities = EXCLUDED.capabilities,
          is_active = true;
    `);

    // 8. Sinkronisasi MCP Tools
    console.log('🌱 Menyinkronkan katalog mcp_tools...');
    await client.query(`
      INSERT INTO mcp_tools (id, tool_name, risk_tier, input_schema, output_schema, description, is_active)
      VALUES
          (
              'tool-knowledge-lookup',
              'knowledge.lookup',
              'low',
              '{"type":"object","properties":{"query":{"type":"string"},"category":{"type":"string"}},"required":["query"]}'::jsonb,
              '{"type":"object","properties":{"results":{"type":"array"},"confidence":{"type":"number"}},"required":["results"]}'::jsonb,
              'Mencari rujukan dokumen SOP, kebijakan, dan katalog perusahaan secara semantik',
              true
          ),
          (
              'tool-task-create',
              'task.create_from_intent',
              'medium',
              '{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string","enum":["low","medium","high","urgent"]}},"required":["title"]}'::jsonb,
              '{"type":"object","properties":{"task_id":{"type":"string"},"board_id":{"type":"string"},"column_id":{"type":"string"}},"required":["task_id"]}'::jsonb,
              'Membuat kartu tugas baru di papan koordinasi tim secara otomatis',
              true
          ),
          (
              'tool-crm-verify',
              'crm.contact_verify',
              'low',
              '{"type":"object","properties":{"contact_value":{"type":"string"},"channel_type":{"type":"string"}},"required":["contact_value","channel_type"]}'::jsonb,
              '{"type":"object","properties":{"is_valid":{"type":"boolean"},"formatted_target":{"type":"string"}},"required":["is_valid"]}'::jsonb,
              'Verifikasi format kontak nomor WhatsApp atau email calon klien',
              true
          )
      ON CONFLICT (id) DO UPDATE SET
          tool_name = EXCLUDED.tool_name,
          risk_tier = EXCLUDED.risk_tier,
          input_schema = EXCLUDED.input_schema,
          output_schema = EXCLUDED.output_schema,
          description = EXCLUDED.description,
          is_active = true;
    `);

    // 9. Workflow Definition Default
    console.log('🌱 Menyinkronkan workflow_definitions default...');
    const defaultGraphSpec = {
      nodes: [
        { id: 'node_classify', type: 'CLASSIFY', label: 'Klasifikasi Intent & Kebutuhan Tugas', next: ['node_plan'] },
        { id: 'node_plan', type: 'PLAN', label: 'Perencanaan Alur Eksekusi & Pemilihan Alat', next: ['node_tool_call'] },
        { id: 'node_tool_call', type: 'TOOL_CALL', label: 'Pemanggilan Alat F.01-MCP Terotorisasi PDP', config: { tool: 'task.create_from_intent' }, next: ['node_deliver'] },
        { id: 'node_deliver', type: 'DELIVER', label: 'Penyampaian Hasil & Notifikasi Selesai', next: [] }
      ],
      entry_node: 'node_classify'
    };

    const existingDef = await client.query("SELECT id FROM workflow_definitions WHERE name = 'Standar Pemrosesan Intent Otonom'");
    if (existingDef.rows.length === 0) {
      await client.query(`
        INSERT INTO workflow_definitions (tenant_id, name, graph_spec, version)
        VALUES (
            NULL,
            'Standar Pemrosesan Intent Otonom',
            $1::jsonb,
            1
        );
      `, [JSON.stringify(defaultGraphSpec)]);
    }

    // 10. Update alembic_version
    await client.query(`
      UPDATE alembic_version SET version_num = '0008_cognitive_core'
      WHERE version_num = '0007_boards_tasks_and_webauthn';
    `);

    await client.query('COMMIT');
    console.log('✅ Migrasi 0008_cognitive_core_and_orchestration berhasil diterapkan sempurna!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal menjalankan migrasi 0008:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration0008().catch((err) => {
  console.error(err);
  process.exit(1);
});
