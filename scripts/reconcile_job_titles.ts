import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

export async function runReconciliation(tenantId?: string): Promise<{
  report_batch_id: string;
  total_agents_audited: number;
  auto_mapped_count: number;
  ambiguous_count: number;
  reconciliation_status: string;
  mappings: any[];
  summary_notes: string;
  generated_at: string;
}> {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    // 1. Ambil rules pemetaan resmi
    const rulesRes = await client.query(`
      SELECT r.source_persona_type, r.target_job_title_code, r.mapping_confidence,
             r.requires_manual_review, r.notes,
             t.id as target_job_title_id, t.title_name as target_title_name,
             sr.name as structural_role_name, jl.level_code
      FROM job_title_mapping_rules r
      LEFT JOIN ai_job_titles t ON t.title_code = r.target_job_title_code
      LEFT JOIN ai_structural_roles sr ON sr.id = t.structural_role_id
      LEFT JOIN job_levels jl ON jl.id = t.job_level_id;
    `);

    const ruleMap = new Map<string, any>();
    rulesRes.rows.forEach((r) => {
      ruleMap.set(r.source_persona_type.toLowerCase(), r);
    });

    // 2. Ambil agen AI
    let agentsQuery = `
      SELECT a.id, a.tenant_id, a.persona_type, a.display_name, a.status, a.job_title_id,
             d.name as department_name
      FROM ai_agents a
      LEFT JOIN departments d ON d.id = a.department_id
    `;
    const params: any[] = [];
    if (tenantId) {
      agentsQuery += ` WHERE a.tenant_id = $1`;
      params.push(tenantId);
    }
    agentsQuery += ` ORDER BY a.created_at ASC;`;

    const agentsRes = await client.query(agentsQuery, params);

    const reportMappings: any[] = [];
    let autoMappedCount = 0;
    let ambiguousCount = 0;

    for (const agent of agentsRes.rows) {
      const personaKey = (agent.persona_type || '').toLowerCase();
      const matchedRule = ruleMap.get(personaKey);

      if (matchedRule && !matchedRule.requires_manual_review && matchedRule.target_job_title_id) {
        // Pemetaan otomatis valid (Shadow Mapping)
        if (agent.job_title_id !== matchedRule.target_job_title_id) {
          await client.query(
            `UPDATE ai_agents SET job_title_id = $1 WHERE id = $2;`,
            [matchedRule.target_job_title_id, agent.id]
          );
        }

        autoMappedCount++;
        reportMappings.push({
          agent_id: agent.id,
          agent_display_name: agent.display_name,
          department_name: agent.department_name || 'Umum',
          persona_type: agent.persona_type,
          tenant_id: agent.tenant_id,
          resolution_status: 'AUTO_MAPPED',
          target_job_title_id: matchedRule.target_job_title_id,
          target_job_title_code: matchedRule.target_job_title_code,
          target_title_name: matchedRule.target_title_name,
          structural_role_name: matchedRule.structural_role_name,
          level_code: matchedRule.level_code,
          confidence: matchedRule.mapping_confidence,
          requires_manual_review: false,
          notes: matchedRule.notes || 'Dipetakan secara otomatis via Shadow Mapping ontologi platform.'
        });
      } else {
        // Butuh keputusan manual / ambigu
        ambiguousCount++;
        reportMappings.push({
          agent_id: agent.id,
          agent_display_name: agent.display_name,
          department_name: agent.department_name || 'Umum',
          persona_type: agent.persona_type,
          tenant_id: agent.tenant_id,
          resolution_status: 'ACTION_REQUIRED',
          target_job_title_id: agent.job_title_id || null,
          target_job_title_code: null,
          target_title_name: null,
          structural_role_name: null,
          level_code: null,
          confidence: matchedRule ? matchedRule.mapping_confidence : 'UNKNOWN',
          requires_manual_review: true,
          notes: matchedRule
            ? matchedRule.notes
            : 'Persona bebas tidak terdaftar dalam ontologi resmi; butuh penetapan jabatan manual oleh admin.'
        });
      }
    }

    const batchId = `RECON_${Date.now()}`;
    const statusVal = ambiguousCount > 0 ? 'ACTION_REQUIRED' : 'COMPLETED';
    const summaryNotes = `Rekonsiliasi Jabatan AI: ${autoMappedCount} agen terpetakan otomatis via Shadow Mapping, ${ambiguousCount} agen berstatus ambigu membutuhkan keputusan manual admin.`;

    const reportRes = await client.query(
      `INSERT INTO job_title_migration_reports (
         tenant_id, report_batch_id, total_agents_audited, auto_mapped_count,
         ambiguous_count, reconciliation_status, mappings, summary_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, report_batch_id, generated_at;`,
      [
        tenantId || null,
        batchId,
        agentsRes.rows.length,
        autoMappedCount,
        ambiguousCount,
        statusVal,
        JSON.stringify(reportMappings),
        summaryNotes,
      ]
    );

    return {
      report_batch_id: batchId,
      total_agents_audited: agentsRes.rows.length,
      auto_mapped_count: autoMappedCount,
      ambiguous_count: ambiguousCount,
      reconciliation_status: statusVal,
      mappings: reportMappings,
      summary_notes: summaryNotes,
      generated_at: reportRes.rows[0].generated_at.toISOString(),
    };
  } finally {
    await client.end();
  }
}

// Eksekusi CLI jika dipanggil langsung
if (process.argv[1]?.endsWith('reconcile_job_titles.ts')) {
  (async () => {
    // Seed representasi agen jika dibutuhkan
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    
    // Pastikan tenant a01aef1c-8274-4de9-a7bc-1618631a4961 memiliki representasi variatif
    const tenantId = 'a01aef1c-8274-4de9-a7bc-1618631a4961';
    const sampleAgents = [
      { name: 'Arya (Chief of Staff)', persona: 'chief_of_staff' },
      { name: 'Darma (Sales Closer Specialist)', persona: 'sales_agent' },
      { name: 'Maya (HR & People Ops Specialist)', persona: 'hr_agent' },
      { name: 'Budi (Asisten Kantor Terbuka)', persona: 'general_assistant' },
      { name: 'Bot Perayap Berkas Usang', persona: 'unspecified' }
    ];

    for (const ag of sampleAgents) {
      const chk = await client.query('SELECT id FROM ai_agents WHERE tenant_id = $1 AND display_name = $2;', [tenantId, ag.name]);
      if (chk.rows.length === 0) {
        await client.query(
          'INSERT INTO ai_agents (id, tenant_id, display_name, persona_type, status, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now());',
          [tenantId, ag.name, ag.persona, 'active']
        );
        console.log(`[Seed] Agen '${ag.name}' (persona: ${ag.persona}) didaftarkan.`);
      }
    }
    await client.end();

    const res = await runReconciliation();
    console.log('\n=== HASIL REKONSILIASI PEMETAAN JABATAN AI ===');
    console.log(`Batch ID:          ${res.report_batch_id}`);
    console.log(`Total Agen:        ${res.total_agents_audited}`);
    console.log(`Auto-Mapped:       ${res.auto_mapped_count}`);
    console.log(`Ambigu / Manual:   ${res.ambiguous_count}`);
    console.log(`Status:            ${res.reconciliation_status}`);
    console.log('Rincian Pemetaan:');
    res.mappings.forEach((m, idx) => {
      console.log(`[${idx + 1}] ${m.agent_display_name} | Persona: ${m.persona_type} -> Status: ${m.resolution_status} | Target: ${m.target_title_name || 'N/A'} (Confidence: ${m.confidence})`);
    });
  })().catch(console.error);
}
