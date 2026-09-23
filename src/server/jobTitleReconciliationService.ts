import pg from 'pg';

export interface AIStructuralRole {
  id: string;
  role_code: string;
  name: string;
  description: string | null;
  hierarchy_rank: number;
  is_reference: boolean;
}

export interface JobLevel {
  id: string;
  level_code: string;
  name: string;
  description: string | null;
  level_rank: number;
  min_complexity_multiplier: number;
  is_reference: boolean;
}

export interface JobSubtitle {
  id: string;
  job_title_id: string;
  subtitle_code: string;
  subtitle_name: string;
  description: string | null;
  focus_areas: string[];
  is_reference: boolean;
}

export interface StandardizedJobTitle {
  id: string;
  title_code: string;
  title_name: string;
  category_tag: string;
  badge_stars: string;
  primary_duties: string;
  recommended_tools: string[];
  primary_deliverable: string;
  is_reference: boolean;
  structural_role: AIStructuralRole;
  job_level: JobLevel;
  subtitles: JobSubtitle[];
}

export interface ReconciliationMappingItem {
  agent_id: string;
  agent_display_name: string;
  department_name: string;
  persona_type: string;
  tenant_id: string;
  resolution_status: 'AUTO_MAPPED' | 'ACTION_REQUIRED';
  target_job_title_id: string | null;
  target_job_title_code: string | null;
  target_title_name: string | null;
  structural_role_name: string | null;
  level_code: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'AMBIGUOUS' | 'UNKNOWN';
  requires_manual_review: boolean;
  notes: string;
}

export interface JobTitleMigrationReport {
  id?: string;
  report_batch_id: string;
  tenant_id: string | null;
  total_agents_audited: number;
  auto_mapped_count: number;
  ambiguous_count: number;
  reconciliation_status: 'COMPLETED' | 'ACTION_REQUIRED';
  mappings: ReconciliationMappingItem[];
  summary_notes: string;
  generated_at: string;
}

export class JobTitleReconciliationService {
  constructor(private pool: pg.Pool) {}

  /**
   * Mengambil 15 Jabatan Staf AI Terstandarisasi resmi platform (is_reference=true)
   */
  async getStandardizedJobTitles(): Promise<StandardizedJobTitle[]> {
    const client = await this.pool.connect();
    try {
      const titlesRes = await client.query(`
        SELECT 
          t.id, t.title_code, t.title_name, t.category_tag, t.badge_stars,
          t.primary_duties, t.recommended_tools, t.primary_deliverable, t.is_reference,
          sr.id as sr_id, sr.role_code, sr.name as sr_name, sr.description as sr_desc, sr.hierarchy_rank, sr.is_reference as sr_is_ref,
          jl.id as jl_id, jl.level_code, jl.name as jl_name, jl.description as jl_desc, jl.level_rank, jl.min_complexity_multiplier, jl.is_reference as jl_is_ref
        FROM ai_job_titles t
        JOIN ai_structural_roles sr ON sr.id = t.structural_role_id
        JOIN job_levels jl ON jl.id = t.job_level_id
        WHERE t.is_reference = true
        ORDER BY jl.level_rank ASC, t.title_name ASC;
      `);

      const subtitlesRes = await client.query(`
        SELECT id, job_title_id, subtitle_code, subtitle_name, description, focus_areas, is_reference
        FROM job_subtitles
        WHERE is_reference = true
        ORDER BY subtitle_name ASC;
      `);

      const subtitleMap = new Map<string, JobSubtitle[]>();
      subtitlesRes.rows.forEach((sub) => {
        const list = subtitleMap.get(sub.job_title_id) || [];
        list.push({
          id: sub.id,
          job_title_id: sub.job_title_id,
          subtitle_code: sub.subtitle_code,
          subtitle_name: sub.subtitle_name,
          description: sub.description,
          focus_areas: sub.focus_areas || [],
          is_reference: Boolean(sub.is_reference),
        });
        subtitleMap.set(sub.job_title_id, list);
      });

      return titlesRes.rows.map((row) => ({
        id: row.id,
        title_code: row.title_code,
        title_name: row.title_name,
        category_tag: row.category_tag,
        badge_stars: row.badge_stars,
        primary_duties: row.primary_duties,
        recommended_tools: row.recommended_tools || [],
        primary_deliverable: row.primary_deliverable,
        is_reference: Boolean(row.is_reference),
        structural_role: {
          id: row.sr_id,
          role_code: row.role_code,
          name: row.sr_name,
          description: row.sr_desc,
          hierarchy_rank: Number(row.hierarchy_rank),
          is_reference: Boolean(row.sr_is_ref),
        },
        job_level: {
          id: row.jl_id,
          level_code: row.level_code,
          name: row.jl_name,
          description: row.jl_desc,
          level_rank: Number(row.level_rank),
          min_complexity_multiplier: Number(row.min_complexity_multiplier),
          is_reference: Boolean(row.jl_is_ref),
        },
        subtitles: subtitleMap.get(row.id) || [],
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Menjalankan audit rekonsiliasi Shadow Mapping dan mencatat hasilnya ke job_title_migration_reports
   */
  async runReconciliation(tenantId?: string): Promise<JobTitleMigrationReport> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Baca aturan pemetaan resmi
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

      // 2. Baca daftar agen AI
      let agentsQuery = `
        SELECT a.id, a.tenant_id, a.persona_type, a.display_name, a.status, a.job_title_id,
               d.name as department_name,
               jt.title_name as current_job_title_name, jt.title_code as current_job_title_code
        FROM ai_agents a
        LEFT JOIN departments d ON d.id = a.department_id
        LEFT JOIN ai_job_titles jt ON jt.id = a.job_title_id
      `;
      const params: any[] = [];
      if (tenantId) {
        agentsQuery += ` WHERE a.tenant_id = $1`;
        params.push(tenantId);
      }
      agentsQuery += ` ORDER BY a.created_at ASC;`;

      const agentsRes = await client.query(agentsQuery, params);

      const reportMappings: ReconciliationMappingItem[] = [];
      let autoMappedCount = 0;
      let ambiguousCount = 0;

      for (const agent of agentsRes.rows) {
        const personaKey = (agent.persona_type || '').toLowerCase();
        const matchedRule = ruleMap.get(personaKey);

        if (matchedRule && !matchedRule.requires_manual_review && matchedRule.target_job_title_id) {
          // Shadow Mapping: tetapkan job_title_id tanpa merusak persona_type asli
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
            notes: matchedRule.notes || 'Dipetakan otomatis melalui katalog resmi platform.'
          });
        } else if (agent.job_title_id && agent.current_job_title_name) {
          // Sudah ditetapkan manual sebelumnya oleh admin
          autoMappedCount++;
          reportMappings.push({
            agent_id: agent.id,
            agent_display_name: agent.display_name,
            department_name: agent.department_name || 'Umum',
            persona_type: agent.persona_type,
            tenant_id: agent.tenant_id,
            resolution_status: 'AUTO_MAPPED',
            target_job_title_id: agent.job_title_id,
            target_job_title_code: agent.current_job_title_code,
            target_title_name: agent.current_job_title_name,
            structural_role_name: 'Penetapan Manual Admin',
            level_code: 'Ditetapkan',
            confidence: 'HIGH',
            requires_manual_review: false,
            notes: 'Jabatan resmi telah ditetapkan secara manual oleh administrator organisasi.'
          });
        } else {
          // Ambigu atau tidak dikenali -> butuh keputusan manual
          ambiguousCount++;
          reportMappings.push({
            agent_id: agent.id,
            agent_display_name: agent.display_name,
            department_name: agent.department_name || 'Umum',
            persona_type: agent.persona_type,
            tenant_id: agent.tenant_id,
            resolution_status: 'ACTION_REQUIRED',
            target_job_title_id: null,
            target_job_title_code: null,
            target_title_name: null,
            structural_role_name: null,
            level_code: null,
            confidence: matchedRule ? matchedRule.mapping_confidence : 'UNKNOWN',
            requires_manual_review: true,
            notes: matchedRule
              ? matchedRule.notes
              : 'Persona tidak terdaftar dalam ontologi resmi; butuh penugasan jabatan manual oleh admin.'
          });
        }
      }

      const batchId = `RECON_${Date.now()}`;
      const statusVal = ambiguousCount > 0 ? 'ACTION_REQUIRED' : 'COMPLETED';
      const summaryNotes = `Audit Rekonsiliasi Jabatan: ${autoMappedCount} agen AI terpetakan otomatis melalui Shadow Mapping, ${ambiguousCount} agen berstatus ambigu membutuhkan tindakan manual.`;

      const insertRes = await client.query(`
        INSERT INTO job_title_migration_reports (
          tenant_id, report_batch_id, total_agents_audited, auto_mapped_count,
          ambiguous_count, reconciliation_status, mappings, summary_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, generated_at;
      `, [
        tenantId || null,
        batchId,
        agentsRes.rows.length,
        autoMappedCount,
        ambiguousCount,
        statusVal,
        JSON.stringify(reportMappings),
        summaryNotes,
      ]);

      await client.query('COMMIT;');

      return {
        id: insertRes.rows[0].id,
        report_batch_id: batchId,
        tenant_id: tenantId || null,
        total_agents_audited: agentsRes.rows.length,
        auto_mapped_count: autoMappedCount,
        ambiguous_count: ambiguousCount,
        reconciliation_status: statusVal,
        mappings: reportMappings,
        summary_notes: summaryNotes,
        generated_at: insertRes.rows[0].generated_at.toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mengambil laporan rekonsiliasi terbaru
   */
  async getLatestReport(tenantId?: string): Promise<JobTitleMigrationReport | null> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT id, report_batch_id, tenant_id, total_agents_audited, auto_mapped_count,
               ambiguous_count, reconciliation_status, mappings, summary_notes, generated_at
        FROM job_title_migration_reports
      `;
      const params: any[] = [];
      if (tenantId) {
        query += ` WHERE tenant_id = $1 OR tenant_id IS NULL`;
        params.push(tenantId);
      }
      query += ` ORDER BY generated_at DESC LIMIT 1;`;

      const res = await client.query(query, params);
      if (res.rows.length === 0) {
        // Jika belum ada, buat secara dinamis
        return await this.runReconciliation(tenantId);
      }

      const row = res.rows[0];
      return {
        id: row.id,
        report_batch_id: row.report_batch_id,
        tenant_id: row.tenant_id,
        total_agents_audited: Number(row.total_agents_audited),
        auto_mapped_count: Number(row.auto_mapped_count),
        ambiguous_count: Number(row.ambiguous_count),
        reconciliation_status: row.reconciliation_status,
        mappings: Array.isArray(row.mappings) ? row.mappings : JSON.parse(row.mappings || '[]'),
        summary_notes: row.summary_notes,
        generated_at: row.generated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Menetapkan job_title_id secara manual untuk menyelesaikan ambiguitas
   */
  async assignJobTitleManually(tenantId: string, agentId: string, jobTitleId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query('SET LOCAL ROLE orchestree_app;');
      await client.query("SELECT set_config('app.tenant_id', $1, true);", [tenantId]);

      // Validasi keberadaan jabatan resmi
      const jtCheck = await client.query('SELECT id, title_name, title_code FROM ai_job_titles WHERE id = $1;', [jobTitleId]);
      if (jtCheck.rows.length === 0) {
        throw new Error('Jabatan AI tidak ditemukan dalam katalog resmi.');
      }

      const updRes = await client.query(`
        UPDATE ai_agents
        SET job_title_id = $1
        WHERE id = $2 AND tenant_id = $3
        RETURNING id, display_name, persona_type, job_title_id;
      `, [jobTitleId, agentId, tenantId]);

      if (updRes.rows.length === 0) {
        throw new Error('Agen AI tidak ditemukan atau tidak berada dalam lingkup organisasi.');
      }

      await client.query('COMMIT;');
      return {
        agent: updRes.rows[0],
        assigned_title: jtCheck.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}
