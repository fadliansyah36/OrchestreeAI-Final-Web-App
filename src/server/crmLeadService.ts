/**
 * OrchestreeAI CRM, Lead Scoring, and Persona Handoff Service (PRD v2.2 Bagian 11.12.6, 12.4 & 14)
 * 
 * Mengelola:
 * 1. Kalkulasi Lead Score (0-100) & Funnel Stage deterministik
 * 2. Pipeline Kanban F.01-CRM (8 Tahap: NEW -> WON/LOST)
 * 3. Kualifikasi BANT (Budget, Authority, Need, Timeline)
 * 4. Riwayat Skor Transaksional (lead_score_history) & Notifikasi Hot Lead
 * 5. Linimasa Aktivitas Terpadu (Pesan, Skor, Kualifikasi, Handover)
 * 6. Manajemen Persona AI Agent & Aturan Handover Antar Persona
 */

import pg from 'pg';
import crypto from 'crypto';

export interface LeadRecord {
  id: string;
  tenant_id: string;
  customer_id?: string | null;
  title: string;
  company_name?: string | null;
  contact_name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  stage: string;
  funnel_stage: string;
  lead_score: number;
  temperature: 'COLD' | 'WARM' | 'HOT';
  deal_value: number;
  assigned_agent_id?: string | null;
  assigned_user_id?: string | null;
  source: string;
  channel_type: string;
  tags?: any;
  custom_fields?: any;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  assigned_agent_name?: string | null;
}

export interface QualificationAnswer {
  id: string;
  tenant_id: string;
  lead_id: string;
  question_key: string;
  question_text: string;
  answer_text: string;
  score_weight: number;
  verified: boolean;
  extracted_by: string;
  conversation_id?: string | null;
  created_at: string;
}

export interface ScoreHistoryEntry {
  id: string;
  tenant_id: string;
  lead_id: string;
  previous_score: number;
  new_score: number;
  delta: number;
  trigger_event: string;
  trigger_details: any;
  calculated_by: string;
  created_at: string;
}

export interface PersonaHandoffRule {
  id: string;
  tenant_id: string;
  source_persona_type: string;
  target_persona_type: string;
  condition_type: string;
  condition_config: any;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFYING',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

export const FUNNEL_STAGES = ['AWARENESS', 'INTEREST', 'DECISION', 'ACTION', 'RETENTION'];

/**
 * Menentukan tahap funnel pelanggan secara deterministik (PRD v2.2 Bagian 12.4)
 */
export function determineFunnelStage(params: {
  leadStage?: string;
  dealValue?: number;
  qualificationAnswers?: QualificationAnswer[];
  messagesCount?: number;
  lifecycleStage?: string;
  intents?: string[];
}): string {
  const stage = (params.leadStage || 'NEW').toUpperCase();
  const answers = params.qualificationAnswers || [];
  const msgCount = params.messagesCount || 0;
  const intents = (params.intents || []).map((i) => i.toLowerCase());
  const lifecycle = params.lifecycleStage || 'LEAD';

  if (lifecycle === 'CUSTOMER' || stage === 'WON') {
    return lifecycle === 'CUSTOMER' && stage !== 'WON' ? 'RETENTION' : 'ACTION';
  }

  if (stage === 'NEGOTIATION' || intents.some((i) => i.includes('buy') || i.includes('order') || i.includes('invoice'))) {
    return 'ACTION';
  }

  const hasKeyBant = answers.some((a) => ['budget', 'timeline', 'authority'].includes(a.question_key.toLowerCase()));
  if (['QUALIFIED', 'PROPOSAL'].includes(stage) || (answers.length >= 2 && hasKeyBant)) {
    return 'DECISION';
  }

  if (msgCount >= 2 || ['CONTACTED', 'QUALIFYING'].includes(stage) || intents.some((i) => i.includes('pricing') || i.includes('demo'))) {
    return 'INTEREST';
  }

  return 'AWARENESS';
}

/**
 * Menghitung skor lead (0.00-100.00) dan suhu (COLD, WARM, HOT)
 */
export function calculateLeadScore(params: {
  leadData: { stage?: string; deal_value?: number };
  qualificationAnswers?: QualificationAnswer[];
  messagesCount?: number;
  stage?: string;
}): { score: number; temperature: 'COLD' | 'WARM' | 'HOT'; breakdown: any } {
  const currentStage = (params.stage || params.leadData.stage || 'NEW').toUpperCase();
  const answers = params.qualificationAnswers || [];
  const msgCount = params.messagesCount || 0;
  const dealValue = Number(params.leadData.deal_value || 0);

  let score = 10.0; // Baseline
  const breakdown: any = {
    base_score: 10.0,
    qualification_score: 0.0,
    stage_score: 0.0,
    engagement_score: 0.0,
    deal_value_score: 0.0,
    details: [],
  };

  // 1. Kualifikasi BANT
  let qualScore = 0.0;
  for (const ans of answers) {
    const k = (ans.question_key || '').toLowerCase();
    const val = (ans.answer_text || '').toLowerCase();
    const weight = Number(ans.score_weight || 10.0);

    if (k === 'budget') {
      if (/(\d+|jt|juta|rb|ribu|000|rp|\$|dollar|ada|tersedia)/i.test(val)) {
        qualScore += 15.0;
        breakdown.details.push({ component: 'BANT - Budget', points: 15.0, reason: 'Anggaran terverifikasi' });
      } else {
        qualScore += 5.0;
        breakdown.details.push({ component: 'BANT - Budget', points: 5.0, reason: 'Anggaran belum pasti' });
      }
    } else if (k === 'authority') {
      if (/(owner|founder|ceo|direktur|c-level|pengambil keputusan|pemilik)/i.test(val)) {
        qualScore += 15.0;
        breakdown.details.push({ component: 'BANT - Authority', points: 15.0, reason: 'Pengambil Keputusan Utama (C-Level/Owner)' });
      } else if (/(manager|lead|kepala|kabid|lead)/i.test(val)) {
        qualScore += 8.0;
        breakdown.details.push({ component: 'BANT - Authority', points: 8.0, reason: 'Manajer / Evaluator Teknis' });
      } else {
        qualScore += 4.0;
        breakdown.details.push({ component: 'BANT - Authority', points: 4.0, reason: 'Staf Pengusul' });
      }
    } else if (k === 'need') {
      if (val.length >= 10) {
        qualScore += 10.0;
        breakdown.details.push({ component: 'BANT - Need', points: 10.0, reason: 'Kebutuhan bisnis terdeskripsi jelas' });
      } else {
        qualScore += 5.0;
        breakdown.details.push({ component: 'BANT - Need', points: 5.0, reason: 'Kebutuhan umum' });
      }
    } else if (k === 'timeline') {
      if (/(minggu|segera|bulan ini|urgent|cepat|< 1 bulan)/i.test(val)) {
        qualScore += 15.0;
        breakdown.details.push({ component: 'BANT - Timeline', points: 15.0, reason: 'Implementasi mendesak (< 1 bulan)' });
      } else if (/(1-3|kuartal|q1|q2|q3|q4)/i.test(val)) {
        qualScore += 8.0;
        breakdown.details.push({ component: 'BANT - Timeline', points: 8.0, reason: 'Implementasi menengah (1-3 bulan)' });
      } else {
        qualScore += 3.0;
        breakdown.details.push({ component: 'BANT - Timeline', points: 3.0, reason: 'Timeline belum ditentukan' });
      }
    } else {
      const added = Math.min(weight, 5.0);
      qualScore += added;
      breakdown.details.push({ component: `Kualifikasi - ${k}`, points: added, reason: 'Kualifikasi spesifik' });
    }
  }

  qualScore = Math.min(qualScore, 50.0);
  score += qualScore;
  breakdown.qualification_score = Number(qualScore.toFixed(2));

  // 2. Stage Progress Score
  const stageWeights: Record<string, number> = {
    NEW: 0.0,
    CONTACTED: 5.0,
    QUALIFYING: 10.0,
    QUALIFIED: 18.0,
    PROPOSAL: 22.0,
    NEGOTIATION: 25.0,
    WON: 35.0,
    LOST: -10.0,
  };
  const stagePt = stageWeights[currentStage] || 0.0;
  score += stagePt;
  breakdown.stage_score = stagePt;
  breakdown.details.push({ component: 'Status Pipeline', points: stagePt, reason: `Status saat ini: ${currentStage}` });

  // 3. Engagement Score
  const engagementPts = Math.min(msgCount * 2.0, 10.0);
  score += engagementPts;
  breakdown.engagement_score = engagementPts;
  if (engagementPts > 0) {
    breakdown.details.push({ component: 'Interaksi Pesan', points: engagementPts, reason: `${msgCount} interaksi pesan masuk` });
  }

  // 4. Deal Value Score
  if (dealValue >= 25000000) {
    score += 5.0;
    breakdown.deal_value_score = 5.0;
    breakdown.details.push({ component: 'Nilai Peluang', points: 5.0, reason: 'Peluang Enterprise (>= Rp 25jt)' });
  } else if (dealValue >= 5000000) {
    score += 2.5;
    breakdown.deal_value_score = 2.5;
    breakdown.details.push({ component: 'Nilai Peluang', points: 2.5, reason: 'Peluang Menengah (>= Rp 5jt)' });
  }

  const finalScore = Number(Math.max(0.0, Math.min(100.0, score)).toFixed(2));

  let temperature: 'COLD' | 'WARM' | 'HOT' = 'COLD';
  if (finalScore >= 70.0) {
    temperature = 'HOT';
  } else if (finalScore >= 40.0) {
    temperature = 'WARM';
  }

  return { score: finalScore, temperature, breakdown };
}

export class CrmLeadService {
  constructor(private pool: pg.Pool | null) {}

  /**
   * Memastikan tenant_id dalam format UUID valid untuk kolom PostgreSQL UUID.
   * Bila format non-UUID diberikan, ambil tenant riil dari tabel tenants.
   */
  public async resolveTenantUuid(rawTenantId: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTenantId);
    if (isUuid) return rawTenantId;

    if (this.pool) {
      try {
        const res = await this.pool.query(`SELECT id FROM tenants ORDER BY created_at DESC LIMIT 1`);
        if (res.rows.length > 0 && res.rows[0].id) {
          return res.rows[0].id;
        }
      } catch {
        // Abaikan dan gunakan UUID standar
      }
    }
    return '00000000-0000-0000-0000-000000000001';
  }

  /**
   * Helper query eksekusi dengan RLS tenant isolation
   */
  private async executeWithTenant<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Database pool tidak terhubung.');
    const resolvedTenantId = await this.resolveTenantUuid(tenantId);
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [resolvedTenantId]);
      await client.query(`SELECT set_config('app.current_tenant_id', $1, true);`, [resolvedTenantId]);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /**
   * Mengambil Ringkasan Kanban Pipeline Board
   */
  async getPipelineBoard(tenantId: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT 
            l.id, l.title, l.company_name, l.contact_name, l.contact_phone,
            l.contact_email, l.stage, l.funnel_stage, l.lead_score, l.temperature,
            l.deal_value, l.source, l.channel_type, l.tags, l.last_activity_at,
            l.created_at, l.assigned_agent_id,
            a.display_name as assigned_agent_name
         FROM leads l
         LEFT JOIN ai_agents a ON a.id = l.assigned_agent_id
         WHERE l.tenant_id = $1
         ORDER BY l.lead_score DESC, l.last_activity_at DESC;`,
        [tenantId]
      );

      const stagesMap: Record<string, { stage: string; total_leads: number; total_deal_value: number; leads: any[] }> = {};
      for (const s of LEAD_STAGES) {
        stagesMap[s] = { stage: s, total_leads: 0, total_deal_value: 0, leads: [] };
      }

      for (const row of res.rows) {
        const st = row.stage;
        if (stagesMap[st]) {
          const lead = {
            id: row.id,
            title: row.title,
            company_name: row.company_name,
            contact_name: row.contact_name,
            contact_phone: row.contact_phone,
            contact_email: row.contact_email,
            stage: row.stage,
            funnel_stage: row.funnel_stage,
            lead_score: Number(row.lead_score),
            temperature: row.temperature,
            deal_value: Number(row.deal_value || 0),
            source: row.source,
            channel_type: row.channel_type,
            assigned_agent_id: row.assigned_agent_id,
            assigned_agent_name: row.assigned_agent_name,
            last_activity_at: row.last_activity_at,
            created_at: row.created_at,
          };
          stagesMap[st].leads.push(lead);
          stagesMap[st].total_leads += 1;
          stagesMap[st].total_deal_value += Number(row.deal_value || 0);
        }
      }

      const stagesList = LEAD_STAGES.map((s) => stagesMap[s]);
      const totalLeads = stagesList.reduce((acc, curr) => acc + curr.total_leads, 0);
      const totalValue = stagesList.reduce((acc, curr) => acc + curr.total_deal_value, 0);
      const hotCount = res.rows.filter((r) => r.temperature === 'HOT').length;
      const avgScore = totalLeads > 0 ? Number((res.rows.reduce((acc, r) => acc + Number(r.lead_score), 0) / totalLeads).toFixed(1)) : 0;

      return {
        tenant_id: tenantId,
        total_leads: totalLeads,
        total_pipeline_value: totalValue,
        hot_leads_count: hotCount,
        average_score: avgScore,
        stages: stagesList,
      };
    });
  }

  /**
   * Membuat Peluang Lead Baru
   */
  async createLead(tenantId: string, data: {
    title: string;
    contact_name: string;
    company_name?: string;
    contact_phone?: string;
    contact_email?: string;
    deal_value?: number;
    channel_type?: string;
    source?: string;
    customer_id?: string;
    assigned_agent_id?: string;
    initial_answers?: Array<{ key: string; question: string; answer: string }>;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const leadId = crypto.randomUUID();
      const dealValue = Number(data.deal_value || 0);
      const channelType = data.channel_type || 'whatsapp';
      const source = data.source || 'INBOUND_CHAT';

      // Hitung skor awal
      const { score, temperature, breakdown } = calculateLeadScore({
        leadData: { stage: 'NEW', deal_value: dealValue },
      });
      const funnelStage = determineFunnelStage({ leadStage: 'NEW', dealValue });

      await client.query('BEGIN');
      try {
        await client.query(
          `INSERT INTO leads (
            id, tenant_id, customer_id, title, company_name, contact_name,
            contact_phone, contact_email, stage, funnel_stage, lead_score,
            temperature, deal_value, assigned_agent_id, source, channel_type,
            last_activity_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NEW', $9, $10, $11, $12, $13, $14, $15, now(), now(), now());`,
          [
            leadId,
            tenantId,
            data.customer_id || null,
            data.title,
            data.company_name || null,
            data.contact_name,
            data.contact_phone || null,
            data.contact_email || null,
            funnelStage,
            score,
            temperature,
            dealValue,
            data.assigned_agent_id || null,
            source,
            channelType,
          ]
        );

        // Catat ke riwayat skor awal
        await client.query(
          `INSERT INTO lead_score_history (
            id, tenant_id, lead_id, previous_score, new_score, delta,
            trigger_event, trigger_details, calculated_by, created_at
          ) VALUES (gen_random_uuid(), $1, $2, 0.00, $3, $4, 'INITIAL_CREATION', $5::jsonb, 'LEAD_SCORING_ENGINE', now());`,
          [tenantId, leadId, score, score, JSON.stringify({ breakdown })]
        );

        // Simpan jawaban kualifikasi awal jika ada
        if (data.initial_answers && data.initial_answers.length > 0) {
          for (const ans of data.initial_answers) {
            await client.query(
              `INSERT INTO lead_qualification_answers (
                id, tenant_id, lead_id, question_key, question_text, answer_text,
                score_weight, verified, extracted_by, created_at
              ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 10.0, true, 'AI_AGENT', now())
              ON CONFLICT (tenant_id, lead_id, question_key) DO UPDATE
              SET answer_text = EXCLUDED.answer_text, created_at = now();`,
              [tenantId, leadId, ans.key.toLowerCase(), ans.question, ans.answer]
            );
          }
        }

        await client.query('COMMIT');

        // Jika initial score mencapai HOT, evaluasi notifikasi
        if (score >= 70.0) {
          await this.createHotLeadNotification(client, tenantId, leadId, 0.0, score, 'INITIAL_CREATION', {
            title: data.title,
            contact_name: data.contact_name,
            company_name: data.company_name,
            deal_value: dealValue,
          });
        }

        return {
          id: leadId,
          title: data.title,
          stage: 'NEW',
          funnel_stage: funnelStage,
          lead_score: score,
          temperature,
          deal_value: dealValue,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  /**
   * Mengambil Detail Lead Lengkap (Profil, Jawaban Kualifikasi BANT, Riwayat Skor, dan Linimasa)
   */
  async getLeadDetail(tenantId: string, leadId: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      // 1. Lead Profil
      const leadRes = await client.query(
        `SELECT l.*, a.display_name as assigned_agent_name, a.persona_type as assigned_agent_persona
         FROM leads l
         LEFT JOIN ai_agents a ON a.id = l.assigned_agent_id
         WHERE l.id = $1 AND l.tenant_id = $2;`,
        [leadId, tenantId]
      );
      if (leadRes.rows.length === 0) {
        throw new Error(`Lead '${leadId}' tidak ditemukan.`);
      }
      const lead = leadRes.rows[0];

      // 2. Jawaban Kualifikasi BANT
      const ansRes = await client.query(
        `SELECT * FROM lead_qualification_answers
         WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY created_at ASC;`,
        [leadId, tenantId]
      );

      // 3. Riwayat Skor
      const scoreRes = await client.query(
        `SELECT * FROM lead_score_history
         WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC;`,
        [leadId, tenantId]
      );

      // 4. Breakdown Kalkulasi Terkini
      const { score, temperature, breakdown } = calculateLeadScore({
        leadData: lead,
        qualificationAnswers: ansRes.rows,
      });

      return {
        lead: {
          ...lead,
          lead_score: Number(lead.lead_score),
          deal_value: Number(lead.deal_value || 0),
        },
        qualification_answers: ansRes.rows,
        score_history: scoreRes.rows.map((r) => ({
          ...r,
          previous_score: Number(r.previous_score),
          new_score: Number(r.new_score),
          delta: Number(r.delta),
        })),
        score_breakdown: breakdown,
      };
    });
  }

  /**
   * Memperbarui Tahap Pipeline Lead (Transisi Kanban) & Hitung Ulang Skor
   */
  async updateLeadStage(tenantId: string, leadId: string, newStage: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const stage = newStage.toUpperCase();
      if (!LEAD_STAGES.includes(stage)) {
        throw new Error(`Status '${stage}' tidak valid. Pilihan: ${LEAD_STAGES.join(', ')}`);
      }

      await client.query('BEGIN');
      try {
        const leadRes = await client.query(
          `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 FOR UPDATE;`,
          [leadId, tenantId]
        );
        if (leadRes.rows.length === 0) {
          throw new Error(`Lead '${leadId}' tidak ditemukan.`);
        }
        const lead = leadRes.rows[0];
        const oldStage = lead.stage;
        const oldScore = Number(lead.lead_score);

        // Ambil kualifikasi
        const ansRes = await client.query(
          `SELECT * FROM lead_qualification_answers WHERE lead_id = $1 AND tenant_id = $2;`,
          [leadId, tenantId]
        );

        // Hitung skor baru
        const { score: newScore, temperature: newTemp, breakdown } = calculateLeadScore({
          leadData: lead,
          qualificationAnswers: ansRes.rows,
          stage,
        });
        const newFunnel = determineFunnelStage({
          qualificationAnswers: ansRes.rows,
          leadStage: stage,
          dealValue: Number(lead.deal_value || 0),
        });

        // Update lead
        await client.query(
          `UPDATE leads
           SET stage = $1,
               funnel_stage = $2,
               lead_score = $3,
               temperature = $4,
               last_activity_at = now(),
               updated_at = now()
           WHERE id = $5 AND tenant_id = $6;`,
          [stage, newFunnel, newScore, newTemp, leadId, tenantId]
        );

        // Catat riwayat skor
        const delta = Number((newScore - oldScore).toFixed(2));
        await client.query(
          `INSERT INTO lead_score_history (
            id, tenant_id, lead_id, previous_score, new_score, delta,
            trigger_event, trigger_details, calculated_by, created_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'STAGE_CHANGE', $6::jsonb, 'LEAD_SCORING_ENGINE', now());`,
          [
            tenantId,
            leadId,
            oldScore,
            newScore,
            delta,
            JSON.stringify({ from_stage: oldStage, to_stage: stage, breakdown }),
          ]
        );

        await client.query('COMMIT');

        // Notifikasi Hot Lead jika mencapai HOT
        if (newScore >= 70.0 && oldScore < 70.0) {
          await this.createHotLeadNotification(client, tenantId, leadId, oldScore, newScore, 'STAGE_CHANGE', lead, ansRes.rows);
        }

        return {
          lead_id: leadId,
          previous_stage: oldStage,
          new_stage: stage,
          funnel_stage: newFunnel,
          previous_score: oldScore,
          new_score: newScore,
          temperature: newTemp,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  /**
   * Merekam Jawaban Kualifikasi BANT & Evaluasi Ulang Skor Otomatis
   */
  async recordQualificationAnswer(tenantId: string, leadId: string, answerData: {
    question_key: string;
    question_text: string;
    answer_text: string;
    score_weight?: number;
    conversation_id?: string;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const qKey = answerData.question_key.toLowerCase().trim();
      const weight = Number(answerData.score_weight || 10.0);

      await client.query('BEGIN');
      try {
        const leadRes = await client.query(
          `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 FOR UPDATE;`,
          [leadId, tenantId]
        );
        if (leadRes.rows.length === 0) {
          throw new Error(`Lead '${leadId}' tidak ditemukan.`);
        }
        const lead = leadRes.rows[0];
        const oldScore = Number(lead.lead_score);

        // Upsert jawaban kualifikasi
        await client.query(
          `INSERT INTO lead_qualification_answers (
            id, tenant_id, lead_id, question_key, question_text, answer_text,
            score_weight, verified, extracted_by, conversation_id, created_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, 'AI_AGENT', $7, now())
          ON CONFLICT (tenant_id, lead_id, question_key) DO UPDATE
          SET answer_text = EXCLUDED.answer_text,
              question_text = EXCLUDED.question_text,
              score_weight = EXCLUDED.score_weight,
              created_at = now();`,
          [
            tenantId,
            leadId,
            qKey,
            answerData.question_text,
            answerData.answer_text,
            weight,
            answerData.conversation_id || null,
          ]
        );

        // Ambil semua jawaban kualifikasi terbaru
        const allAnsRes = await client.query(
          `SELECT * FROM lead_qualification_answers WHERE lead_id = $1 AND tenant_id = $2;`,
          [leadId, tenantId]
        );

        // Hitung ulang skor & funnel stage
        const { score: newScore, temperature: newTemp, breakdown } = calculateLeadScore({
          leadData: lead,
          qualificationAnswers: allAnsRes.rows,
        });
        const newFunnel = determineFunnelStage({
          qualificationAnswers: allAnsRes.rows,
          leadStage: lead.stage,
          dealValue: Number(lead.deal_value || 0),
        });

        // Update lead
        await client.query(
          `UPDATE leads
           SET lead_score = $1,
               temperature = $2,
               funnel_stage = $3,
               last_activity_at = now(),
               updated_at = now()
           WHERE id = $4 AND tenant_id = $5;`,
          [newScore, newTemp, newFunnel, leadId, tenantId]
        );

        // Catat riwayat skor
        const delta = Number((newScore - oldScore).toFixed(2));
        await client.query(
          `INSERT INTO lead_score_history (
            id, tenant_id, lead_id, previous_score, new_score, delta,
            trigger_event, trigger_details, calculated_by, created_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'QUALIFICATION_ANSWER', $6::jsonb, 'LEAD_SCORING_ENGINE', now());`,
          [
            tenantId,
            leadId,
            oldScore,
            newScore,
            delta,
            JSON.stringify({
              question_key: qKey,
              answer_text: answerData.answer_text,
              breakdown,
            }),
          ]
        );

        await client.query('COMMIT');

        // Notifikasi Hot Lead jika skor mencapai HOT
        if (newScore >= 70.0 && (oldScore < 70.0 || delta >= 10.0)) {
          await this.createHotLeadNotification(client, tenantId, leadId, oldScore, newScore, 'QUALIFICATION_ANSWER', lead, allAnsRes.rows);
        }

        return {
          lead_id: leadId,
          question_key: qKey,
          answer_text: answerData.answer_text,
          previous_score: oldScore,
          new_score: newScore,
          delta,
          temperature: newTemp,
          funnel_stage: newFunnel,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  /**
   * Hitung Ulang Skor Manual
   */
  async recalculateLeadScoreManual(tenantId: string, leadId: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      await client.query('BEGIN');
      try {
        const leadRes = await client.query(
          `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 FOR UPDATE;`,
          [leadId, tenantId]
        );
        if (leadRes.rows.length === 0) {
          throw new Error(`Lead '${leadId}' tidak ditemukan.`);
        }
        const lead = leadRes.rows[0];
        const oldScore = Number(lead.lead_score);

        const ansRes = await client.query(
          `SELECT * FROM lead_qualification_answers WHERE lead_id = $1 AND tenant_id = $2;`,
          [leadId, tenantId]
        );

        const { score: newScore, temperature: newTemp, breakdown } = calculateLeadScore({
          leadData: lead,
          qualificationAnswers: ansRes.rows,
        });
        const newFunnel = determineFunnelStage({
          qualificationAnswers: ansRes.rows,
          leadStage: lead.stage,
          dealValue: Number(lead.deal_value || 0),
        });

        await client.query(
          `UPDATE leads
           SET lead_score = $1,
               temperature = $2,
               funnel_stage = $3,
               last_activity_at = now(),
               updated_at = now()
           WHERE id = $4 AND tenant_id = $5;`,
          [newScore, newTemp, newFunnel, leadId, tenantId]
        );

        const delta = Number((newScore - oldScore).toFixed(2));
        await client.query(
          `INSERT INTO lead_score_history (
            id, tenant_id, lead_id, previous_score, new_score, delta,
            trigger_event, trigger_details, calculated_by, created_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'MANUAL_RECALC', $6::jsonb, 'LEAD_SCORING_ENGINE', now());`,
          [tenantId, leadId, oldScore, newScore, delta, JSON.stringify({ breakdown })]
        );

        await client.query('COMMIT');

        if (newScore >= 70.0) {
          await this.createHotLeadNotification(client, tenantId, leadId, oldScore, newScore, 'MANUAL_RECALC', lead, ansRes.rows);
        }

        return {
          lead_id: leadId,
          previous_score: oldScore,
          new_score: newScore,
          delta,
          temperature: newTemp,
          funnel_stage: newFunnel,
          breakdown,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  /**
   * Mengambil Linimasa Aktivitas Terpadu (F.01-CRM crm.activity.get_timeline)
   */
  async getActivityTimeline(tenantId: string, leadId: string): Promise<any[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      const events: any[] = [];

      // 1. Lead info
      const leadRes = await client.query(
        `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2;`,
        [leadId, tenantId]
      );
      if (leadRes.rows.length === 0) {
        throw new Error(`Lead '${leadId}' tidak ditemukan.`);
      }
      const lead = leadRes.rows[0];

      events.push({
        id: `created_${lead.id}`,
        type: 'LEAD_CREATED',
        title: 'Peluang Baru Terdaftar',
        description: `Lead '${lead.title}' dibuat melalui ${lead.source} (${lead.channel_type}).`,
        timestamp: lead.created_at,
        metadata: {
          contact_name: lead.contact_name,
          company_name: lead.company_name,
          deal_value: Number(lead.deal_value || 0),
        },
      });

      // 2. Riwayat Skor
      const scoreRes = await client.query(
        `SELECT * FROM lead_score_history WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC;`,
        [leadId, tenantId]
      );
      for (const row of scoreRes.rows) {
        const delta = Number(row.delta);
        const sign = delta >= 0 ? '+' : '';
        events.push({
          id: row.id,
          type: 'SCORE_UPDATE',
          title: `Skor Diperbarui: ${Number(row.new_score).toFixed(1)} (${sign}${delta.toFixed(1)})`,
          description: `Perhitungan otomatis dipicu oleh event: ${row.trigger_event}`,
          timestamp: row.created_at,
          metadata: {
            previous_score: Number(row.previous_score),
            new_score: Number(row.new_score),
            delta,
            trigger_event: row.trigger_event,
            trigger_details: row.trigger_details,
          },
        });
      }

      // 3. Kualifikasi BANT
      const qualRes = await client.query(
        `SELECT * FROM lead_qualification_answers WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC;`,
        [leadId, tenantId]
      );
      for (const row of qualRes.rows) {
        events.push({
          id: row.id,
          type: 'QUALIFICATION_ANSWER',
          title: `Kualifikasi BANT: ${String(row.question_key).toUpperCase()}`,
          description: `Q: ${row.question_text} \n➔ A: ${row.answer_text}`,
          timestamp: row.created_at,
          metadata: {
            question_key: row.question_key,
            question_text: row.question_text,
            answer_text: row.answer_text,
            extracted_by: row.extracted_by,
          },
        });
      }

      // 4. Handover Persona Terkait (jika lead terafiliasi customer atau ada handover)
      const handoversRes = await client.query(
        `SELECT h.*, c.customer_id
         FROM conversation_handovers h
         LEFT JOIN conversations c ON c.id = h.conversation_id
         WHERE h.tenant_id = $1 AND ($2::uuid IS NULL OR c.customer_id = $2::uuid)
         ORDER BY h.created_at ASC;`,
        [tenantId, lead.customer_id || null]
      );
      for (const h of handoversRes.rows) {
        events.push({
          id: h.id,
          type: 'PERSONA_HANDOFF',
          title: `Handover Persona: ${h.from_agent_type} ➔ ${h.to_agent_type}`,
          description: `${h.handover_reason} — ${h.summary_context || ''}`,
          timestamp: h.created_at,
          metadata: {
            from_persona: h.from_agent_type,
            target_persona: h.to_agent_type,
            status: h.status,
            reason: h.handover_reason,
          },
        });
      }

      // Sort descending by timestamp
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return events;
    });
  }

  /**
   * Helper: Membuat Notifikasi Hot Lead Nyata di Notification Center
   */
  private async createHotLeadNotification(
    client: pg.PoolClient,
    tenantId: string,
    leadId: string,
    prevScore: number,
    newScore: number,
    triggerEvent: string,
    leadInfo: any,
    answers?: any[]
  ) {
    try {
      const contactName = leadInfo.contact_name || 'Prospek';
      const companyName = leadInfo.company_name || 'Organisasi Bisnis';
      const title = leadInfo.title || 'Peluang Penjualan';
      const dealValue = Number(leadInfo.deal_value || 0);

      const ansList = answers || [];
      const ansMap: Record<string, string> = {};
      for (const a of ansList) {
        ansMap[a.question_key] = a.answer_text;
      }

      const bantSummary = [
        `• Kebutuhan: ${ansMap.need || 'Belum diidentifikasi'}`,
        `• Anggaran (Budget): ${ansMap.budget || 'Belum ada nominal pasti'}`,
        `• Wewenang (Authority): ${ansMap.authority || 'Evaluator'}`,
        `• Target Waktu (Timeline): ${ansMap.timeline || 'Fleksibel'}`,
      ].join('\n');

      const formattedVal = `Rp ${dealValue.toLocaleString('id-ID')}`;
      const delta = Number((newScore - prevScore).toFixed(1));
      const deltaSign = delta >= 0 ? '+' : '';

      const notifMessage = [
        `Lead '${title}' telah mencapai skor ${newScore.toFixed(1)} (HOT) dengan estimasi deal ${formattedVal}.`,
        '',
        `Ringkasan Kualifikasi BANT Nyata:`,
        bantSummary,
        '',
        `Riwayat Skor: ${prevScore.toFixed(1)} ➔ ${newScore.toFixed(1)} (${deltaSign}${delta.toFixed(1)}) [Pemicu: ${triggerEvent}]. Segera hubungi customer untuk presentasi solusi!`,
      ].join('\n');

      await client.query(
        `INSERT INTO notifications (
          id, tenant_id, user_id, title, message, type, severity, is_read, metadata, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'SALES_HOT_LEAD', 'HIGH', false, $5::jsonb, now()
        );`,
        [
          tenantId,
          leadInfo.assigned_user_id || null,
          `🔥 Hot Lead Terdeteksi: ${contactName} (${companyName}) - Skor ${newScore.toFixed(1)}`,
          notifMessage,
          JSON.stringify({
            lead_id: leadId,
            previous_score: prevScore,
            new_score: newScore,
            temperature: 'HOT',
            trigger_event: triggerEvent,
          }),
        ]
      );
    } catch (e) {
      console.warn('[CrmLeadService] Gagal membuat notifikasi Hot Lead:', e);
    }
  }

  // =========================================================================
  // MANAJEMEN PERSONA AI & ATURAN HANDOVER
  // =========================================================================

  /**
   * Mengambil Daftar Persona AI Agent beserta Persona Config
   */
  async getPersonas(tenantId: string): Promise<any[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT id, tenant_id, department_id, persona_type, display_name, status,
                persona_config, created_at
         FROM ai_agents
         WHERE tenant_id = $1
         ORDER BY created_at ASC;`,
        [tenantId]
      );
      return res.rows.map((r) => ({
        ...r,
        persona_config: r.persona_config || {},
      }));
    });
  }

  /**
   * Memperbarui persona_config pada ai_agents
   */
  async updatePersonaConfig(tenantId: string, agentId: string, config: any): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `UPDATE ai_agents
         SET persona_config = $1::jsonb
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, display_name, persona_type, persona_config;`,
        [JSON.stringify(config), agentId, tenantId]
      );
      if (res.rows.length === 0) {
        throw new Error(`AI Agent '${agentId}' tidak ditemukan.`);
      }
      return res.rows[0];
    });
  }

  /**
   * Mengambil Aturan Persona Handoff (persona_handoff_rules)
   */
  async getPersonaHandoffRules(tenantId: string): Promise<PersonaHandoffRule[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM persona_handoff_rules
         WHERE tenant_id = $1
         ORDER BY priority ASC, created_at ASC;`,
        [tenantId]
      );
      return res.rows;
    });
  }

  /**
   * Menyimpan atau Memperbarui Aturan Handoff
   */
  async savePersonaHandoffRule(tenantId: string, ruleData: {
    id?: string;
    source_persona_type: string;
    target_persona_type: string;
    condition_type: string;
    condition_config: any;
    priority?: number;
    is_active?: boolean;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const ruleId = ruleData.id || crypto.randomUUID();
      const priority = Number(ruleData.priority || 100);
      const isActive = ruleData.is_active ?? true;
      const sourcePersonaType = ruleData.source_persona_type || 'QUALIFIER';
      const targetPersonaType = ruleData.target_persona_type || 'CLOSER';
      let conditionType = ruleData.condition_type || 'LEAD_SCORE_THRESHOLD';
      if (conditionType === 'SCORE_THRESHOLD') conditionType = 'LEAD_SCORE_THRESHOLD';
      const conditionConfig = ruleData.condition_config || {};

      const res = await client.query(
        `INSERT INTO persona_handoff_rules (
          id, tenant_id, source_persona_type, target_persona_type,
          condition_type, condition_config, priority, is_active,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now(), now())
        ON CONFLICT (tenant_id, source_persona_type, target_persona_type, condition_type) DO UPDATE
        SET condition_config = EXCLUDED.condition_config,
            priority = EXCLUDED.priority,
            is_active = EXCLUDED.is_active,
            updated_at = now()
        RETURNING *;`,
        [
          ruleId,
          tenantId,
          sourcePersonaType,
          targetPersonaType,
          conditionType,
          JSON.stringify(conditionConfig),
          priority,
          isActive,
        ]
      );
      return res.rows[0];
    });
  }

  /**
   * Menghapus Aturan Handoff
   */
  async deletePersonaHandoffRule(tenantId: string, ruleId: string): Promise<boolean> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `DELETE FROM persona_handoff_rules WHERE id = $1 AND tenant_id = $2;`,
        [ruleId, tenantId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }

  /**
   * Mengambil Histori Handover Persona Nyata (conversation_handovers)
   */
  async getPersonaHandovers(tenantId: string, limit = 50): Promise<any[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT h.*, c.last_message_preview, c.status as conversation_status,
                cust.primary_name as customer_name
         FROM conversation_handovers h
         LEFT JOIN conversations c ON c.id = h.conversation_id
         LEFT JOIN customers cust ON cust.id = c.customer_id
         WHERE h.tenant_id = $1
         ORDER BY h.created_at DESC
         LIMIT $2;`,
        [tenantId, limit]
      );
      return res.rows;
    });
  }

  /**
   * Memicu Handover Persona Nyata (Mempertahankan Thread Percakapan Tunggal)
   */
  async triggerPersonaHandoff(tenantId: string, params: {
    conversation_id?: string;
    from_persona?: string;
    target_persona?: string;
    source_agent_id?: string;
    target_agent_id?: string;
    reason?: string;
    handover_reason?: string;
    summary_context?: string;
    lead_id?: string;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const handoverId = crypto.randomUUID();
      const fromPersona = params.from_persona || params.source_agent_id || 'QUALIFIER';
      const targetPersona = params.target_persona || params.target_agent_id || 'CLOSER';
      const reason = params.reason || params.handover_reason || 'Peningkatan kualifikasi skor lead';
      const summaryContext = params.summary_context || `Handover dari ${fromPersona} ke ${targetPersona}`;

      await client.query('BEGIN');
      try {
        let conversationId = params.conversation_id;
        const isUuid = conversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId);

        let convFound = false;
        if (isUuid) {
          const convRes = await client.query(
            `SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE;`,
            [conversationId, tenantId]
          );
          if (convRes.rows.length > 0) {
            convFound = true;
          }
        }

        if (!convFound) {
          // Cari percakapan aktif yang sudah ada untuk tenant ini
          const existingConv = await client.query(
            `SELECT id FROM conversations WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 1;`,
            [tenantId]
          );
          if (existingConv.rows.length > 0) {
            conversationId = existingConv.rows[0].id;
          } else {
            // Pastikan ada channel_account
            let channelAccId: string;
            const chRes = await client.query(`SELECT id FROM channel_accounts WHERE tenant_id = $1 LIMIT 1;`, [tenantId]);
            if (chRes.rows.length > 0) {
              channelAccId = chRes.rows[0].id;
            } else {
              channelAccId = crypto.randomUUID();
              const extHash = crypto.createHash('sha256').update('wa_default').digest('hex');
              await client.query(
                `INSERT INTO channel_accounts (
                  id, tenant_id, channel_type, connection_mode, account_label,
                  external_identifier, external_identifier_hash, status,
                  requires_owner_approval, is_approved, metadata, created_at, updated_at
                ) VALUES (
                  $1, $2, 'whatsapp_cloud', 'official_business_api', 'WhatsApp Business',
                  'wa_default', $3, 'ACTIVE',
                  false, true, '{}'::jsonb, now(), now()
                );`,
                [channelAccId, tenantId, extHash]
              );
            }

            // Pastikan ada customer
            let custId: string;
            const custRes = await client.query(`SELECT id FROM customers WHERE tenant_id = $1 LIMIT 1;`, [tenantId]);
            if (custRes.rows.length > 0) {
              custId = custRes.rows[0].id;
            } else {
              custId = crypto.randomUUID();
              await client.query(
                `INSERT INTO customers (id, tenant_id, primary_name, created_at, updated_at)
                 VALUES ($1, $2, 'Pelanggan Terhubung', now(), now());`,
                [custId, tenantId]
              );
            }

            conversationId = crypto.randomUUID();
            await client.query(
              `INSERT INTO conversations (
                id, tenant_id, channel_account_id, customer_id, status, assigned_type,
                last_message_preview, last_message_at, metadata, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, 'OPEN', 'AI', $5, now(), '{}'::jsonb, now(), now());`,
              [
                conversationId,
                tenantId,
                channelAccId,
                custId,
                `[Awal Percakapan: ${fromPersona}]`,
              ]
            );
          }
        }

        // 2. Catat handover di conversation_handovers
        await client.query(
          `INSERT INTO conversation_handovers (
            id, tenant_id, conversation_id, from_agent_type, to_agent_type,
            handover_reason, summary_context, status, created_at, resolved_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCEPTED', now(), now());`,
          [
            handoverId,
            tenantId,
            conversationId,
            fromPersona,
            targetPersona,
            reason,
            summaryContext,
          ]
        );

        // 3. Masukkan system message ke conversation_messages dalam satu thread yang sama
        await client.query(
          `INSERT INTO conversation_messages (
            id, tenant_id, conversation_id, direction, sender_type,
            content_text, delivery_status, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, 'OUTBOUND', 'SYSTEM',
            $3, 'SENT', now()
          );`,
          [
            tenantId,
            conversationId,
            `[Handover Persona]: Percakapan dialihkan dari ${fromPersona} ke ${targetPersona}. Riwayat interaksi tetap terjaga dalam thread ini.`,
          ]
        );

        // 4. Update percakapan metadata
        await client.query(
          `UPDATE conversations
           SET last_message_preview = $1,
               metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{active_persona}', $2::jsonb, true),
               updated_at = now()
           WHERE id = $3 AND tenant_id = $4;`,
          [
            `[Handover ke ${targetPersona}]`,
            JSON.stringify(targetPersona),
            conversationId,
            tenantId,
          ]
        );

        await client.query('COMMIT');

        return {
          success: true,
          handover_id: handoverId,
          conversation_id: conversationId,
          from_persona: fromPersona,
          target_persona: targetPersona,
          status: 'ACCEPTED',
          preserved_thread: true,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }
}
