/**
 * Message Experimentation & Statistical Significance Engine (PRD v2.2)
 *
 * Mengimplementasikan:
 * 1. Manajemen A/B Testing template pesan bertenant
 * 2. Random assignment 50/50 berdasar hash determinstik/random kriptografis
 * 3. Uji signifikansi statistik nyata (Z-Score dua proporsi & p-value kalkulasi riil)
 *    Hanya dapat mengklaim pemenang (winner_variant) bila:
 *    - Sampel mencapai min_sample_size
 *    - p-value < (1 - confidence_level_threshold), misal p < 0.05
 * 4. Audit ledger dan pencatatan hasil per penerima (message_experiment_results)
 */

import pg from 'pg';
import crypto from 'crypto';

export interface MessageExperiment {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  channel_type: 'WHATSAPP' | 'TELEGRAM' | 'INSTAGRAM' | 'EMAIL';
  status: 'DRAFT' | 'RUNNING' | 'CONCLUDED' | 'CANCELLED';
  variant_a_template: string;
  variant_b_template: string;
  variant_a_name: string;
  variant_b_name: string;
  target_metric: 'CLICK_RATE' | 'REPLY_RATE' | 'CONVERSION_RATE' | 'REVENUE';
  min_sample_size: number;
  confidence_level_threshold: number;
  variant_a_sample_count: number;
  variant_b_sample_count: number;
  variant_a_conversions: number;
  variant_b_conversions: number;
  variant_a_revenue: number;
  variant_b_revenue: number;
  winner_variant?: 'VARIANT_A' | 'VARIANT_B' | 'INCONCLUSIVE';
  p_value?: number;
  z_score?: number;
  is_statistically_significant: boolean;
  conclusion_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface StatisticalEvaluationResult {
  variant_a_rate: number;
  variant_b_rate: number;
  z_score: number;
  p_value: number;
  is_statistically_significant: boolean;
  winner_variant: 'VARIANT_A' | 'VARIANT_B' | 'INCONCLUSIVE';
  conclusion_reason: string;
  sufficient_sample: boolean;
}

export class MessageExperimentService {
  constructor(private pool: pg.Pool) {}

  /**
   * Mendapatkan daftar eksperimen pesan
   */
  async listExperiments(tenantId: string): Promise<MessageExperiment[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `SELECT * FROM message_experiments WHERE tenant_id = $1 ORDER BY created_at DESC;`,
        [tenantId]
      );
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Membuat eksperimen pesan baru
   */
  async createExperiment(
    tenantId: string,
    payload: {
      name: string;
      description?: string;
      channel_type: 'WHATSAPP' | 'TELEGRAM' | 'INSTAGRAM' | 'EMAIL';
      variant_a_template: string;
      variant_b_template: string;
      variant_a_name?: string;
      variant_b_name?: string;
      target_metric?: 'CLICK_RATE' | 'REPLY_RATE' | 'CONVERSION_RATE' | 'REVENUE';
      min_sample_size?: number;
      confidence_level_threshold?: number;
      userId?: string;
    }
  ): Promise<MessageExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `INSERT INTO message_experiments (
          tenant_id, name, description, channel_type, status,
          variant_a_template, variant_b_template,
          variant_a_name, variant_b_name, target_metric,
          min_sample_size, confidence_level_threshold,
          created_by_user_id, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'RUNNING',
          $5, $6,
          $7, $8, $9,
          $10, $11,
          $12, now()
        ) RETURNING *;`,
        [
          tenantId,
          payload.name,
          payload.description || null,
          payload.channel_type,
          payload.variant_a_template,
          payload.variant_b_template,
          payload.variant_a_name || 'Variant A (Kontrol)',
          payload.variant_b_name || 'Variant B (Eksperimen)',
          payload.target_metric || 'CONVERSION_RATE',
          payload.min_sample_size || 50,
          payload.confidence_level_threshold || 0.95,
          payload.userId || null,
        ]
      );
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Random assignment nyata untuk penerima baru
   * Menggunakan random kriptografis acak atau hash ID customer
   */
  async assignVariantAndRecord(
    tenantId: string,
    experimentId: string,
    customerId?: string,
    conversationId?: string,
    templateVariables?: Record<string, string>
  ): Promise<{
    assigned_variant: 'VARIANT_A' | 'VARIANT_B';
    message_text: string;
    result_id: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const expRes = await client.query(
        `SELECT * FROM message_experiments WHERE id = $1 AND tenant_id = $2;`,
        [experimentId, tenantId]
      );
      if (expRes.rows.length === 0) {
        throw new Error('Eksperimen pesan tidak ditemukan.');
      }
      const exp: MessageExperiment = expRes.rows[0];

      // Random assignment nyata (50:50)
      const isA = crypto.randomInt(0, 2) === 0;
      const assigned_variant: 'VARIANT_A' | 'VARIANT_B' = isA ? 'VARIANT_A' : 'VARIANT_B';
      let message_text = isA ? exp.variant_a_template : exp.variant_b_template;

      // Substitusi template variabel jika ada
      if (templateVariables) {
        for (const [key, val] of Object.entries(templateVariables)) {
          message_text = message_text.split(`{{${key}}}`).join(val);
        }
      }

      // Catat ke message_experiment_results
      const insertRes = await client.query(
        `INSERT INTO message_experiment_results (
          tenant_id, experiment_id, customer_id, conversation_id,
          assigned_variant, message_sent_text, is_delivered, delivered_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, true, now()
        ) RETURNING id;`,
        [tenantId, experimentId, customerId || null, conversationId || null, assigned_variant, message_text]
      );

      // Increment count pada eksperimen
      if (isA) {
        await client.query(
          `UPDATE message_experiments
           SET variant_a_sample_count = variant_a_sample_count + 1, updated_at = now()
           WHERE id = $1;`,
          [experimentId]
        );
      } else {
        await client.query(
          `UPDATE message_experiments
           SET variant_b_sample_count = variant_b_sample_count + 1, updated_at = now()
           WHERE id = $1;`,
          [experimentId]
        );
      }

      return {
        assigned_variant,
        message_text,
        result_id: insertRes.rows[0].id,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Merekam konversi atau balasan nyata dari pelanggan
   */
  async recordConversion(
    tenantId: string,
    experimentResultId: string,
    hasReplied: boolean,
    hasConverted: boolean,
    revenueGenerated: number = 0,
    orderId?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      const res = await client.query(
        `UPDATE message_experiment_results
         SET has_replied = coalesce($1, has_replied),
             replied_at = CASE WHEN $1 THEN coalesce(replied_at, now()) ELSE replied_at END,
             has_converted = coalesce($2, has_converted),
             converted_at = CASE WHEN $2 THEN coalesce(converted_at, now()) ELSE converted_at END,
             revenue_generated = revenue_generated + $3,
             order_id = coalesce($4, order_id),
             updated_at = now()
         WHERE id = $5 AND tenant_id = $6
         RETURNING experiment_id, assigned_variant;`,
        [hasReplied, hasConverted, revenueGenerated, orderId || null, experimentResultId, tenantId]
      );

      if (res.rows.length > 0) {
        const { experiment_id, assigned_variant } = res.rows[0];
        if (hasConverted) {
          if (assigned_variant === 'VARIANT_A') {
            await client.query(
              `UPDATE message_experiments
               SET variant_a_conversions = variant_a_conversions + 1,
                   variant_a_revenue = variant_a_revenue + $1,
                   updated_at = now()
               WHERE id = $2;`,
              [revenueGenerated, experiment_id]
            );
          } else {
            await client.query(
              `UPDATE message_experiments
               SET variant_b_conversions = variant_b_conversions + 1,
                   variant_b_revenue = variant_b_revenue + $1,
                   updated_at = now()
               WHERE id = $2;`,
              [revenueGenerated, experiment_id]
            );
          }
        }
        // Evaluasi ulang signifikansi statistik otomatis
        await this.evaluateStatisticalSignificance(tenantId, experiment_id);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Perhitungan Signifikansi Statistik Dua Proporsi (Z-test)
   * Formula:
   * p1 = x1 / n1
   * p2 = x2 / n2
   * p_pooled = (x1 + x2) / (n1 + n2)
   * SE = sqrt( p_pooled * (1 - p_pooled) * (1/n1 + 1/n2) )
   * z = (p2 - p1) / SE
   * p_value = 2 * (1 - Phi(|z|))
   */
  async evaluateStatisticalSignificance(
    tenantId: string,
    experimentId: string
  ): Promise<StatisticalEvaluationResult> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `SELECT * FROM message_experiments WHERE id = $1 AND tenant_id = $2;`,
        [experimentId, tenantId]
      );
      if (res.rows.length === 0) {
        throw new Error('Eksperimen tidak ditemukan.');
      }
      const exp: MessageExperiment = res.rows[0];

      const n1 = Number(exp.variant_a_sample_count) || 0;
      const n2 = Number(exp.variant_b_sample_count) || 0;
      const x1 = Number(exp.variant_a_conversions) || 0;
      const x2 = Number(exp.variant_b_conversions) || 0;
      const totalSample = n1 + n2;
      const minSample = Number(exp.min_sample_size) || 50;

      const rateA = n1 > 0 ? x1 / n1 : 0;
      const rateB = n2 > 0 ? x2 / n2 : 0;

      if (totalSample < minSample || n1 === 0 || n2 === 0) {
        const result: StatisticalEvaluationResult = {
          variant_a_rate: rateA,
          variant_b_rate: rateB,
          z_score: 0,
          p_value: 1.0,
          is_statistically_significant: false,
          winner_variant: 'INCONCLUSIVE',
          conclusion_reason: `Sampel belum mencukupi (total saat ini: ${totalSample}, batas minimum: ${minSample}).`,
          sufficient_sample: false,
        };
        await client.query(
          `UPDATE message_experiments
           SET z_score = 0, p_value = 1.0, is_statistically_significant = false,
               winner_variant = 'INCONCLUSIVE', conclusion_reason = $1, updated_at = now()
           WHERE id = $2;`,
          [result.conclusion_reason, experimentId]
        );
        return result;
      }

      const pPooled = (x1 + x2) / totalSample;
      let zScore = 0;
      let pValue = 1.0;

      if (pPooled > 0 && pPooled < 1) {
        const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
        zScore = se > 0 ? (rateB - rateA) / se : 0;
        // Standard normal CDF approximation (Abramowitz & Stegun)
        const absZ = Math.abs(zScore);
        const t = 1 / (1 + 0.2316419 * absZ);
        const d = 0.39894228 * Math.exp((-absZ * absZ) / 2);
        const cdf = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        pValue = Math.max(0.00001, Math.min(1.0, 2 * (1 - cdf)));
      }

      const alpha = 1 - Number(exp.confidence_level_threshold);
      const isSignificant = pValue < alpha;

      let winner: 'VARIANT_A' | 'VARIANT_B' | 'INCONCLUSIVE' = 'INCONCLUSIVE';
      let reason = 'Tidak ada perbedaan yang signifikan secara statistik.';

      if (isSignificant) {
        if (rateB > rateA) {
          winner = 'VARIANT_B';
          reason = `${exp.variant_b_name} unggul secara signifikan dengan tingkat konversi ${(rateB * 100).toFixed(1)}% vs ${(rateA * 100).toFixed(1)}% (p-value: ${pValue.toFixed(4)}, Z-score: ${zScore.toFixed(2)}).`;
        } else if (rateA > rateB) {
          winner = 'VARIANT_A';
          reason = `${exp.variant_a_name} unggul secara signifikan dengan tingkat konversi ${(rateA * 100).toFixed(1)}% vs ${(rateB * 100).toFixed(1)}% (p-value: ${pValue.toFixed(4)}, Z-score: ${zScore.toFixed(2)}).`;
        }
      } else {
        reason = `Perbedaan tingkat konversi ${(rateB * 100).toFixed(1)}% vs ${(rateA * 100).toFixed(1)}% belum signifikan secara statistik (p-value: ${pValue.toFixed(4)} > ambang ${alpha.toFixed(2)}).`;
      }

      await client.query(
        `UPDATE message_experiments
         SET z_score = $1, p_value = $2, is_statistically_significant = $3,
             winner_variant = $4, conclusion_reason = $5, updated_at = now()
         WHERE id = $6;`,
        [Number(zScore.toFixed(4)), Number(pValue.toFixed(5)), isSignificant, winner, reason, experimentId]
      );

      return {
        variant_a_rate: rateA,
        variant_b_rate: rateB,
        z_score: Number(zScore.toFixed(4)),
        p_value: Number(pValue.toFixed(5)),
        is_statistically_significant: isSignificant,
        winner_variant: winner,
        conclusion_reason: reason,
        sufficient_sample: true,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Mengakhiri eksperimen dan menetapkan pemenang
   */
  async concludeExperiment(tenantId: string, experimentId: string): Promise<MessageExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      await this.evaluateStatisticalSignificance(tenantId, experimentId);
      const res = await client.query(
        `UPDATE message_experiments
         SET status = 'CONCLUDED', concluded_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *;`,
        [experimentId, tenantId]
      );
      return res.rows[0];
    } finally {
      client.release();
    }
  }
}
