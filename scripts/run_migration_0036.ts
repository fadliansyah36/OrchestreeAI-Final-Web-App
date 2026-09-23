import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  await client.connect();
  console.log('=== Terkoneksi ke Supabase PostgreSQL untuk Migrasi 0036 ===');
  console.log('Target: ai_job_titles, ai_structural_roles, job_levels, job_subtitles & Shadow Mapping\n');

  try {
    await client.query('BEGIN;');

    // 1. Eksekusi file SQL migrasi
    const sqlPath = path.resolve('infra/supabase/migrations/20260923000001_ai_job_titles_and_structural_roles_shadow_mapping.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('1. Menerapkan skema DDL dan reference data platform...');
    await client.query(sqlContent);
    console.log('✓ Skema DDL dan reference data berhasil dibuat.');

    // 2. Verifikasi jumlah katalog reference resmi
    const rolesRes = await client.query('SELECT COUNT(*) FROM ai_structural_roles WHERE is_reference = true;');
    const levelsRes = await client.query('SELECT COUNT(*) FROM job_levels WHERE is_reference = true;');
    const titlesRes = await client.query('SELECT COUNT(*) FROM ai_job_titles WHERE is_reference = true;');
    const subtitlesRes = await client.query('SELECT COUNT(*) FROM job_subtitles WHERE is_reference = true;');
    const rulesRes = await client.query('SELECT COUNT(*) FROM job_title_mapping_rules WHERE is_reference = true;');

    console.log('\n--- Status Reference Data Resmi (is_reference = true) ---');
    console.log(`- ai_structural_roles: ${rolesRes.rows[0].count} entri`);
    console.log(`- job_levels:          ${levelsRes.rows[0].count} entri`);
    console.log(`- ai_job_titles:       ${titlesRes.rows[0].count} katalog terstandarisasi`);
    console.log(`- job_subtitles:       ${subtitlesRes.rows[0].count} sub-spesialisasi`);
    console.log(`- mapping_rules:       ${rulesRes.rows[0].count} aturan pemetaan persona`);

    // 3. Rekonsiliasi & Shadow Mapping pada ai_agents
    console.log('\n2. Menjalankan Rekonsiliasi & Shadow Mapping pada ai_agents...');
    const agentsRes = await client.query(`
      SELECT id, tenant_id, persona_type, display_name, status, job_title_id
      FROM ai_agents
      ORDER BY created_at ASC;
    `);

    const rules = await client.query(`
      SELECT r.source_persona_type, r.target_job_title_code, r.mapping_confidence, r.requires_manual_review, r.notes,
             t.id as target_job_title_id, t.title_name as target_title_name
      FROM job_title_mapping_rules r
      LEFT JOIN ai_job_titles t ON t.title_code = r.target_job_title_code;
    `);

    const ruleMap = new Map<string, any>();
    rules.rows.forEach((r) => {
      ruleMap.set(r.source_persona_type.toLowerCase(), r);
    });

    const reportMappings: any[] = [];
    let autoMappedCount = 0;
    let ambiguousCount = 0;

    for (const agent of agentsRes.rows) {
      const personaKey = (agent.persona_type || '').toLowerCase();
      const matchedRule = ruleMap.get(personaKey);

      if (matchedRule && !matchedRule.requires_manual_review && matchedRule.target_job_title_id) {
        // Auto-mapping dapat diterapkan secara aman (Shadow Mapping)
        await client.query(`
          UPDATE ai_agents
          SET job_title_id = $1
          WHERE id = $2;
        `, [matchedRule.target_job_title_id, agent.id]);

        autoMappedCount++;
        reportMappings.push({
          agent_id: agent.id,
          agent_display_name: agent.display_name,
          persona_type: agent.persona_type,
          tenant_id: agent.tenant_id,
          resolution_status: 'AUTO_MAPPED',
          target_job_title_id: matchedRule.target_job_title_id,
          target_job_title_code: matchedRule.target_job_title_code,
          target_title_name: matchedRule.target_title_name,
          confidence: matchedRule.mapping_confidence,
          requires_manual_review: false,
          notes: matchedRule.notes
        });
      } else {
        // Ambigu atau tidak dikenali -> butuh keputusan manual
        ambiguousCount++;
        reportMappings.push({
          agent_id: agent.id,
          agent_display_name: agent.display_name,
          persona_type: agent.persona_type,
          tenant_id: agent.tenant_id,
          resolution_status: 'ACTION_REQUIRED',
          target_job_title_id: null,
          target_job_title_code: null,
          target_title_name: null,
          confidence: matchedRule ? matchedRule.mapping_confidence : 'UNKNOWN',
          requires_manual_review: true,
          notes: matchedRule ? matchedRule.notes : 'Persona tidak terdaftar pada katalog ontologi; memerlukan telaah admin organisasi'
        });
      }
    }

    // 4. Catat laporan rekonsiliasi ke job_title_migration_reports
    const batchId = `BATCH_RECON_${Date.now()}`;
    const reportInsert = await client.query(`
      INSERT INTO job_title_migration_reports (
        report_batch_id,
        total_agents_audited,
        auto_mapped_count,
        ambiguous_count,
        reconciliation_status,
        mappings,
        summary_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, report_batch_id, generated_at;
    `, [
      batchId,
      agentsRes.rows.length,
      autoMappedCount,
      ambiguousCount,
      ambiguousCount > 0 ? 'ACTION_REQUIRED' : 'COMPLETED',
      JSON.stringify(reportMappings),
      `Audit rekonsiliasi jabatan AI: ${autoMappedCount} agen berhasil dipetakan otomatis via Shadow Mapping, ${ambiguousCount} agen berstatus ambigu memerlukan penetapan manual.`
    ]);

    await client.query('COMMIT;');

    console.log('\n=== LAPORAN REKONSILIASI JOB TITLE MIGRATION ===');
    console.log(`Report ID:              ${reportInsert.rows[0].id}`);
    console.log(`Batch ID:               ${batchId}`);
    console.log(`Total AI Agents:        ${agentsRes.rows.length}`);
    console.log(`Auto-Mapped (Shadow):   ${autoMappedCount}`);
    console.log(`Ambigu / Manual Review: ${ambiguousCount}`);
    console.log(`Status Rekonsiliasi:    ${ambiguousCount > 0 ? 'ACTION_REQUIRED' : 'COMPLETED'}`);
    console.log('Rincian Pemetaan Agen:');
    console.log(JSON.stringify(reportMappings, null, 2));

    console.log('\n✓ Migrasi 0036 dan Laporan Rekonsiliasi selesai dengan sukses.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('✗ Gagal menjalankan migrasi 0036:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
