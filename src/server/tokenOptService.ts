/**
 * F.01-TOKENOPT: Service Optimasi Token & Semantic Caching (PRD v2.2 Bagian 11.8)
 * 
 * Melayani endpoint analitik penghematan token, riwayat audit,
 * dan pencarian kesamaan semantik pgvector.
 */

import pg from 'pg';

export interface TokenSavingsSummary {
  total_queries: number;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate_pct: number;
  total_tokens_saved: number;
  total_cost_saved_usd: number;
  total_cost_spent_usd: number;
  total_cost_baseline_usd: number;
  avg_latency_saved_ms: number;
}

export interface TokenSavingsLogItem {
  id: string;
  request_id: string | null;
  cache_hit: boolean;
  task_type: string;
  original_prompt_tokens: number;
  tokens_saved: number;
  cost_without_cache_usd: number;
  cost_with_cache_usd: number;
  cost_saved_usd: number;
  latency_saved_ms: number;
  model_tier_selected: string;
  model_id_selected: string;
  similarity_score: number | null;
  created_at: string;
}

export class TokenOptService {
  constructor(private pool: pg.Pool) {}

  async getSummary(tenantId: string): Promise<TokenSavingsSummary> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query(
        `SELECT 
           COUNT(*)::int AS total_queries,
           COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END), 0)::int AS cache_hits,
           COALESCE(SUM(CASE WHEN NOT cache_hit THEN 1 ELSE 0 END), 0)::int AS cache_misses,
           COALESCE(SUM(tokens_saved), 0)::int AS total_tokens_saved,
           COALESCE(SUM(cost_saved_usd), 0.0)::numeric AS total_cost_saved_usd,
           COALESCE(SUM(cost_with_cache_usd), 0.0)::numeric AS total_cost_spent_usd,
           COALESCE(SUM(cost_without_cache_usd), 0.0)::numeric AS total_cost_baseline_usd,
           COALESCE(AVG(CASE WHEN cache_hit THEN latency_saved_ms ELSE NULL END), 0.0)::numeric AS avg_latency_saved_ms
         FROM public.token_savings_log
         WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = res.rows[0];
      const total = Number(row?.total_queries || 0);
      const hits = Number(row?.cache_hits || 0);
      const hitRate = total > 0 ? Number(((hits / total) * 100).toFixed(2)) : 0.0;

      return {
        total_queries: total,
        cache_hits: hits,
        cache_misses: Number(row?.cache_misses || 0),
        cache_hit_rate_pct: hitRate,
        total_tokens_saved: Number(row?.total_tokens_saved || 0),
        total_cost_saved_usd: Number(row?.total_cost_saved_usd || 0.0),
        total_cost_spent_usd: Number(row?.total_cost_spent_usd || 0.0),
        total_cost_baseline_usd: Number(row?.total_cost_baseline_usd || 0.0),
        avg_latency_saved_ms: Number(Number(row?.avg_latency_saved_ms || 0.0).toFixed(1)),
      };
    } finally {
      client.release();
    }
  }

  async getLogs(tenantId: string, limit: number = 50): Promise<TokenSavingsLogItem[]> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query(
        `SELECT 
           id,
           request_id,
           cache_hit,
           task_type,
           original_prompt_tokens,
           tokens_saved,
           cost_without_cache_usd::float,
           cost_with_cache_usd::float,
           cost_saved_usd::float,
           latency_saved_ms,
           model_tier_selected,
           model_id_selected,
           similarity_score::float,
           created_at
         FROM public.token_savings_log
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      return res.rows;
    } finally {
      client.release();
    }
  }
}
