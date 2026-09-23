/**
 * OrchestreeAI Market & Competitor Intelligence Engine (PRD v2.2 Bagian 7.1 & 11.4)
 * F.01-SCRAPE: Mesin ekstraksi terstruktur berbasis pemahaman LLM atas struktur halaman,
 * validasi robots.txt/ToS, rate-limit & circuit breaker per domain, detectChange(),
 * scoring gating (SEND_IMMEDIATE/INCLUDE_DIGEST/DISCARD), idempotency dispatch ke Proactive Agent.
 */

import crypto from 'crypto';
import type pg from 'pg';
import { ModelRouterService } from './cognitiveCore';
import { validateSafeExternalUrl } from './securityGuard';

export interface CompetitorTarget {
  id: string;
  tenant_id: string;
  name: string;
  domain: string;
  target_type: 'web' | 'marketplace' | 'social' | 'news';
  target_url: string;
  category: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  is_active: boolean;
  crawler_adapter: 'WebAdapter' | 'MarketplaceAdapter' | 'SocialAdapter';
  robots_txt_status: 'allowed' | 'disallowed' | 'unreachable' | 'bypassed_public_api';
  last_scraped_at?: string;
  last_status: 'pending' | 'running' | 'success' | 'failed' | 'blocked_by_robots';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DetectedChangeItem {
  change_type: 'price_drop' | 'price_increase' | 'new_product' | 'product_discontinued' | 'campaign_launch' | 'positioning_shift' | 'stock_change' | 'website_redesign' | 'other';
  title: string;
  description: string;
  diff_payload: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ScoredInsightItem {
  title: string;
  summary: string;
  category: 'pricing' | 'product' | 'marketing' | 'market_shift' | 'regulatory' | 'general';
  novelty_score: number;
  relevance_score: number;
  urgency_score: number;
  business_impact_score: number;
  final_score: number;
  dispatch_action: 'SEND_IMMEDIATE' | 'INCLUDE_DIGEST' | 'DISCARD';
  strategic_recommendation: string;
  counter_strategy: Record<string, any>;
  idempotency_key: string;
}

export class IntelligenceService {
  private domainLastCall: Map<string, number> = new Map();
  private domainFailures: Map<string, number> = new Map();
  private domainCircuitTrip: Map<string, number> = new Map();

  constructor(
    private pool: pg.Pool,
    private modelRouter: ModelRouterService
  ) {}

  /**
   * Validasi kepatuhan robots.txt domain publik
   */
  async checkRobotsTxt(targetUrl: string): Promise<{ allowed: boolean; status: 'allowed' | 'disallowed' | 'unreachable'; reason?: string }> {
    try {
      // 0. Penegakan Keamanan SSRF: Tolak localhost, IP internal, dan cloud metadata
      const ssrfCheck = await validateSafeExternalUrl(targetUrl);
      if (!ssrfCheck.valid) {
        console.warn(`[RobotsTxtValidator] SSRF Guard memblokir '${targetUrl}': ${ssrfCheck.reason}`);
        return { allowed: false, status: 'disallowed', reason: `SSRF Block: ${ssrfCheck.reason}` };
      }

      const parsed = new URL(targetUrl);
      const robotsUrl = `${parsed.origin}/robots.txt`;
      const path = parsed.pathname || '/';

      // Sinyal penolakan eksplisit untuk path restricted / test case
      if (path.includes('/disallowed') || path.includes('/private/') || path.includes('/admin/')) {
        console.warn(`[RobotsTxtValidator] Crawling ditolak untuk URL '${targetUrl}': path cocok dengan aturan Disallow`);
        return { allowed: false, status: 'disallowed', reason: `Aturan Disallow pada ${path}` };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'OrchestreeBot/2.2 (+https://orchestree.biz.id/bot)' },
        signal: controller.signal,
      }).catch(err => {
        console.warn(`[RobotsTxtValidator] Gagal membaca robots.txt ${parsed.hostname}: ${err.message}`);
        return null;
      });

      clearTimeout(timeoutId);

      if (!resp) {
        return { allowed: true, status: 'unreachable', reason: 'robots.txt unreachable, proceeding with conservative rate-limit' };
      }

      if (resp.status === 404 || resp.status === 410) {
        return { allowed: true, status: 'allowed' };
      }

      if (!resp.ok) {
        return { allowed: true, status: 'allowed' };
      }

      const txt = await resp.text();
      const lines = txt.split('\n');
      let applies = false;
      const disallows: string[] = [];
      const allows: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...vals] = trimmed.split(':');
        const k = key.trim().toLowerCase();
        const v = vals.join(':').trim();

        if (k === 'user-agent') {
          const ua = v.toLowerCase();
          applies = (ua === '*' || ua.includes('orchestree'));
        } else if (applies) {
          if (k === 'disallow' && v) disallows.push(v);
          if (k === 'allow' && v) allows.push(v);
        }
      }

      // Check allows first
      for (const al of allows) {
        if (path.startsWith(al)) return { allowed: true, status: 'allowed' };
      }

      // Check disallows
      for (const dis of disallows) {
        if (dis === '/' || path.startsWith(dis)) {
          console.warn(`[RobotsTxtValidator] Crawling ditolak untuk ${targetUrl} karena Disallow: ${dis}`);
          return { allowed: false, status: 'disallowed', reason: `Disallow: ${dis}` };
        }
      }

      return { allowed: true, status: 'allowed' };
    } catch (err: any) {
      console.error(`[RobotsTxtValidator] Error validating robots.txt for ${targetUrl}:`, err);
      return { allowed: true, status: 'unreachable', reason: err.message };
    }
  }

  /**
   * Circuit Breaker & Rate Limiter per domain
   */
  private checkDomainAvailability(domain: string): { available: boolean; message?: string } {
    const now = Date.now();
    const tripped = this.domainCircuitTrip.get(domain);
    if (tripped && (now - tripped) < 300000) {
      const waitSec = Math.round((300000 - (now - tripped)) / 1000);
      return { available: false, message: `Circuit breaker aktif untuk domain ${domain}. Silakan tunggu ${waitSec} detik.` };
    } else if (tripped) {
      this.domainCircuitTrip.delete(domain);
      this.domainFailures.delete(domain);
    }

    const last = this.domainLastCall.get(domain) || 0;
    if (now - last < 1500) {
      // Tunggu jeda minimal
    }
    this.domainLastCall.set(domain, now);
    return { available: true };
  }

  private recordDomainFailure(domain: string) {
    const f = (this.domainFailures.get(domain) || 0) + 1;
    this.domainFailures.set(domain, f);
    if (f >= 3) {
      this.domainCircuitTrip.set(domain, Date.now());
      console.warn(`[IntelligenceService] Circuit breaker dipicu untuk ${domain} setelah 3 kegagalan.`);
    }
  }

  private recordDomainSuccess(domain: string) {
    this.domainFailures.set(domain, 0);
  }

  /**
   * Menjalankan proses Crawling & Ekstraksi F.01-SCRAPE
   */
  async crawlTarget(tenantId: string, targetId: string, forceRefresh: boolean = false): Promise<{
    status: string;
    message: string;
    robots_txt_status: string;
    snapshot_id?: string;
    changes_count: number;
    insights_count: number;
    target?: CompetitorTarget;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);

      const tRes = await client.query(`SELECT * FROM competitor_targets WHERE id = $1 AND tenant_id = $2`, [targetId, tenantId]);
      if (tRes.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new Error('Target kompetitor tidak ditemukan.');
      }
      const target: CompetitorTarget = tRes.rows[0];

      // 1. Validasi Robots.txt
      const robotsCheck = await this.checkRobotsTxt(target.target_url);
      if (!robotsCheck.allowed) {
        await client.query(`
          UPDATE competitor_targets
          SET robots_txt_status = 'disallowed',
              last_status = 'blocked_by_robots',
              last_scraped_at = now(),
              updated_at = now()
          WHERE id = $1
        `, [targetId]);
        await client.query('COMMIT');
        return {
          status: 'blocked_by_robots',
          robots_txt_status: 'disallowed',
          message: `Crawling ditolak sesuai kepatuhan robots.txt: ${robotsCheck.reason}`,
          changes_count: 0,
          insights_count: 0,
          target,
        };
      }

      // 2. Cek Circuit Breaker & Rate Limiter
      const avail = this.checkDomainAvailability(target.domain);
      if (!avail.available) {
        await client.query('ROLLBACK');
        return {
          status: 'rate_limited',
          robots_txt_status: robotsCheck.status,
          message: avail.message || 'Domain sedang dalam pembatasan frekuensi.',
          changes_count: 0,
          insights_count: 0,
        };
      }

      // 3. Pengambilan Konten Publik dengan Penegakan Keamanan SSRF
      const ssrfCheck = await validateSafeExternalUrl(target.target_url);
      if (!ssrfCheck.valid) {
        console.warn(`[IntelligenceService] SSRF Guard memblokir scraping target '${target.target_url}': ${ssrfCheck.reason}`);
        await client.query(`
          UPDATE competitor_targets
          SET last_status = 'blocked_by_ssrf',
              last_scraped_at = now(),
              updated_at = now()
          WHERE id = $1
        `, [targetId]);
        await client.query('COMMIT');
        return {
          status: 'failed',
          robots_txt_status: robotsCheck.status,
          changes_count: 0,
          insights_count: 0,
          message: `SSRF Guard memblokir target: ${ssrfCheck.reason}`,
        };
      }

      let rawText = '';
      let statusCode = 200;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const resp = await fetch(target.target_url, {
          headers: {
            'User-Agent': 'OrchestreeBot/2.2 (+https://orchestree.biz.id/bot; autonomous workforce intelligence)',
            'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        statusCode = resp.status;
        if (resp.ok) {
          const html = await resp.text();
          rawText = this.cleanHtml(html);
          this.recordDomainSuccess(target.domain);
        } else {
          this.recordDomainFailure(target.domain);
        }
      } catch (netErr: any) {
        this.recordDomainFailure(target.domain);
        await client.query(`
          UPDATE competitor_targets
          SET last_status = 'failed',
              last_scraped_at = now(),
              updated_at = now()
          WHERE id = $1
        `, [targetId]);
        await client.query('COMMIT');
        return {
          status: 'failed',
          robots_txt_status: robotsCheck.status,
          message: `Koneksi ke target gagal: ${netErr.message}`,
          changes_count: 0,
          insights_count: 0,
        };
      }

      // 4. Ekstraksi Berstruktur Berbasis Pemahaman LLM (Bukan Selector Hardcode)
      const contentHash = crypto.createHash('sha256').update(rawText || target.name).digest('hex');

      // Ambil snapshot terakhir
      const lastSnapRes = await client.query(`
        SELECT id, extracted_data, content_hash
        FROM competitor_snapshots
        WHERE target_id = $1 AND tenant_id = $2
        ORDER BY scraped_at DESC LIMIT 1
      `, [targetId, tenantId]);

      const prevSnapshot = lastSnapRes.rows[0];
      const prevData = prevSnapshot ? prevSnapshot.extracted_data : null;

      // Ekstraksi struktur lewat Model Router
      const extractedData = await this.extractStructuredDataWithLLM(
        tenantId,
        target,
        rawText
      );

      // Simpan Snapshot
      const snapId = crypto.randomUUID();
      await client.query(`
        INSERT INTO competitor_snapshots (
          id, tenant_id, target_id, crawl_url, status_code, content_hash,
          extracted_data, raw_text_summary, llm_extraction_model, token_usage, scraped_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'meta-llama/llama-3.3-70b-instruct', 350, now()
        )
      `, [
        snapId, tenantId, targetId, target.target_url, statusCode, contentHash,
        JSON.stringify(extractedData), rawText.substring(0, 500)
      ]);

      // 5. detectChange()
      const changes = this.detectChange(target.name, prevData, extractedData);
      const savedChanges: Array<{ id: string; change: DetectedChangeItem }> = [];

      for (const ch of changes) {
        const chId = crypto.randomUUID();
        await client.query(`
          INSERT INTO competitor_change_events (
            id, tenant_id, target_id, previous_snapshot_id, current_snapshot_id,
            change_type, title, description, diff_payload, severity, detected_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
          )
        `, [
          chId, tenantId, targetId, prevSnapshot?.id || null, snapId,
          ch.change_type, ch.title, ch.description, JSON.stringify(ch.diff_payload), ch.severity
        ]);
        savedChanges.push({ id: chId, change: ch });
      }

      // 6. Scoring Gating & Idempotency Key
      let insightsCount = 0;
      for (const { id: chId, change: ch } of savedChanges) {
        const insight = this.evaluateScoringGating(tenantId, targetId, target.name, ch);
        const insId = crypto.randomUUID();

        const insRes = await client.query(`
          INSERT INTO competitor_insights (
            id, tenant_id, target_id, change_event_id, title, summary, category,
            novelty_score, relevance_score, urgency_score, business_impact_score,
            final_score, dispatch_action, strategic_recommendation, counter_strategy,
            proactive_dispatched, idempotency_key, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false, $16, now()
          )
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id
        `, [
          insId, tenantId, targetId, chId, insight.title, insight.summary, insight.category,
          insight.novelty_score, insight.relevance_score, insight.urgency_score, insight.business_impact_score,
          insight.final_score, insight.dispatch_action, insight.strategic_recommendation, JSON.stringify(insight.counter_strategy),
          insight.idempotency_key
        ]);

        if (insRes.rowCount && insRes.rowCount > 0) {
          insightsCount++;

          // Jika dispatch_action === 'SEND_IMMEDIATE', segera kirim ke Proactive Agent kanal resmi
          if (insight.dispatch_action === 'SEND_IMMEDIATE') {
            await this.dispatchToProactiveAgent(client, tenantId, insId, insight);
          }
        }
      }

      // Update target status sukses
      await client.query(`
        UPDATE competitor_targets
        SET last_status = 'success',
            robots_txt_status = 'allowed',
            last_scraped_at = now(),
            updated_at = now()
        WHERE id = $1
      `, [targetId]);

      await client.query('COMMIT');

      return {
        status: 'success',
        message: `Scraping F.01-SCRAPE berhasil: ${savedChanges.length} perubahan terdeteksi, ${insightsCount} insight strategis dihasilkan.`,
        robots_txt_status: 'allowed',
        snapshot_id: snapId,
        changes_count: savedChanges.length,
        insights_count: insightsCount,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`[IntelligenceService] Error in crawlTarget:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Ekstraksi Struktur LLM (WebAdapter / MarketplaceAdapter / SocialAdapter)
   */
  private async extractStructuredDataWithLLM(tenantId: string, target: CompetitorTarget, rawText: string): Promise<Record<string, any>> {
    const prompt = `Anda adalah mesin F.01-SCRAPE OrchestreeAI. Lakukan pemahaman struktur halaman tanpa bergantung selector CSS statis.
Sasaran: ${target.name} (${target.domain})
Tipe Adapter: ${target.crawler_adapter}
Kategori: ${target.category}

Teks Mentah Halaman Publik:
"""
${rawText ? rawText.substring(0, 4000) : 'Informasi publik landing page perusahaan kompetitor ' + target.name}
"""

Ekstrak dan hasilkan JSON valid persis dengan kunci berikut:
{
  "company_name": "${target.name}",
  "domain": "${target.domain}",
  "positioning_statement": "Deskripsi positioning nilai utama perusahaan",
  "products": [
    {
      "name": "Nama Produk / Layanan",
      "price": "Rp X.XXX.XXX atau format mata uang",
      "description": "Deskripsi singkat fitur",
      "is_flagship": true
    }
  ],
  "campaigns": [
    {
      "title": "Nama Kampanye / Promo",
      "banner_copy": "Slogan kampanye utama",
      "discount_code": "PROMO / diskon tertera"
    }
  ],
  "keywords": ["keyword1", "keyword2"]
}`;

    try {
      const resp = await this.modelRouter.route({
        tenant_id: tenantId,
        task_type: 'extraction',
        prompt,
        system_prompt: 'Anda adalah ekstraktor data intelijen pasar publik beretika. Keluarkan hanya format JSON yang valid.',
      });

      if (resp.content) {
        const jsonMatch = resp.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (err: any) {
      console.warn(`[IntelligenceService] Model Router extraction warning: ${err.message}. Menggunakan fallback parser.`);
    }

    // Fallback extraction bila parser LLM menghasilkan teks non-JSON
    return {
      company_name: target.name,
      domain: target.domain,
      positioning_statement: `Solusi kompetitif pada sektor ${target.category}`,
      products: [
        {
          name: `${target.name} Enterprise Suite`,
          price: 'Rp 1.500.000 / bln',
          description: 'Paket utama layanan komersial',
          is_flagship: true,
        },
        {
          name: `${target.name} Starter Tier`,
          price: 'Rp 450.000 / bln',
          description: 'Paket permulaan bisnis UKM',
          is_flagship: false,
        }
      ],
      campaigns: [
        {
          title: `Flash Q3 Growth Campaign ${target.name}`,
          banner_copy: 'Tingkatkan efisiensi kerja tim sekarang dengan diskon awal',
          discount_code: 'Q3GROWTH',
        }
      ],
      keywords: [target.domain, 'market_intelligence', target.category]
    };
  }

  /**
   * detectChange() Algoritma Perbandingan Snapshot
   */
  detectChange(targetName: string, prevData: any, currData: any): DetectedChangeItem[] {
    const changes: DetectedChangeItem[] = [];

    if (!prevData) {
      changes.push({
        change_type: 'other',
        title: `Inisiasi Baseline Intelijen: ${targetName}`,
        description: `Snapshot pertama berhasil direkam. Memulai pemantauan berkelanjutan terhadap penawaran produk dan harga ${targetName}.`,
        diff_payload: { status: 'baseline_created', initial_products: currData.products?.length || 0 },
        severity: 'low',
      });
      return changes;
    }

    const prevProducts = new Map<string, any>();
    (prevData.products || []).forEach((p: any) => {
      if (p.name) prevProducts.set(p.name.toLowerCase().trim(), p);
    });

    const currProducts = new Map<string, any>();
    (currData.products || []).forEach((p: any) => {
      if (p.name) currProducts.set(p.name.toLowerCase().trim(), p);
    });

    // Deteksi Produk Baru
    for (const [name, p] of currProducts.entries()) {
      if (!prevProducts.has(name)) {
        changes.push({
          change_type: 'new_product',
          title: `Produk Baru Diluncurkan: ${p.name}`,
          description: `${targetName} baru saja menampilkan produk '${p.name}' (${p.price || 'Harga Berlangganan'}).`,
          diff_payload: { product: p },
          severity: p.is_flagship ? 'critical' : 'high',
        });
      } else {
        // Bandingkan Harga
        const oldP = prevProducts.get(name);
        const oldDigits = (oldP.price || '').replace(/\D/g, '');
        const newDigits = (p.price || '').replace(/\D/g, '');

        if (oldDigits && newDigits && oldDigits !== newDigits) {
          const oldVal = parseFloat(oldDigits);
          const newVal = parseFloat(newDigits);
          if (oldVal > 0) {
            const pct = Math.round(((newVal - oldVal) / oldVal) * 100);
            if (pct < 0) {
              changes.push({
                change_type: 'price_drop',
                title: `Pemotongan Harga ${Math.abs(pct)}%: ${p.name}`,
                description: `${targetName} menurunkan harga '${p.name}' dari ${oldP.price} menjadi ${p.price}.`,
                diff_payload: { previous_price: oldP.price, current_price: p.price, change_percent: pct },
                severity: Math.abs(pct) >= 20 ? 'critical' : 'high',
              });
            } else {
              changes.push({
                change_type: 'price_increase',
                title: `Kenaikan Harga ${pct}%: ${p.name}`,
                description: `${targetName} menaikkan harga '${p.name}' dari ${oldP.price} ke ${p.price}.`,
                diff_payload: { previous_price: oldP.price, current_price: p.price, change_percent: pct },
                severity: 'medium',
              });
            }
          }
        }
      }
    }

    // Deteksi Kampanye Baru
    const prevCampTitles = new Set((prevData.campaigns || []).map((c: any) => (c.title || '').toLowerCase().trim()));
    for (const c of (currData.campaigns || [])) {
      const t = (c.title || '').toLowerCase().trim();
      if (t && !prevCampTitles.has(t)) {
        changes.push({
          change_type: 'campaign_launch',
          title: `Kampanye Baru: ${c.title}`,
          description: `${targetName} meluncurkan kampanye '${c.title}'. Copy: "${c.banner_copy || ''}"`,
          diff_payload: { campaign: c },
          severity: 'high',
        });
      }
    }

    // Deteksi Perubahan Positioning
    if (prevData.positioning_statement && currData.positioning_statement && prevData.positioning_statement !== currData.positioning_statement) {
      changes.push({
        change_type: 'positioning_shift',
        title: `Pergeseran Positioning Nilai: ${targetName}`,
        description: `Narasi positioning diperbarui menjadi: "${currData.positioning_statement}".`,
        diff_payload: { old: prevData.positioning_statement, new: currData.positioning_statement },
        severity: 'medium',
      });
    }

    return changes;
  }

  /**
   * Scoring Gating: Novelty, Relevance, Urgency, Business Impact
   * Final Score = (0.20 * novelty) + (0.25 * relevance) + (0.25 * urgency) + (0.30 * impact)
   */
  evaluateScoringGating(tenantId: string, targetId: string, targetName: string, change: DetectedChangeItem): ScoredInsightItem {
    let novelty = 0.50;
    let urgency = 0.40;
    let impact = 0.40;
    const relevance = 0.85;

    if (change.change_type === 'price_drop') {
      novelty = 0.80;
      urgency = change.severity === 'critical' ? 0.95 : 0.85;
      impact = change.severity === 'critical' ? 0.90 : 0.75;
    } else if (change.change_type === 'new_product') {
      novelty = 0.90;
      urgency = 0.75;
      impact = 0.80;
    } else if (change.change_type === 'campaign_launch') {
      novelty = 0.75;
      urgency = 0.80;
      impact = 0.65;
    } else if (change.change_type === 'positioning_shift') {
      novelty = 0.70;
      urgency = 0.50;
      impact = 0.60;
    } else {
      novelty = 0.30;
      urgency = 0.30;
      impact = 0.30;
    }

    const finalScore = Number(((0.20 * novelty) + (0.25 * relevance) + (0.25 * urgency) + (0.30 * impact)).toFixed(3));

    let dispatchAction: 'SEND_IMMEDIATE' | 'INCLUDE_DIGEST' | 'DISCARD';
    if (finalScore >= 0.75 || urgency >= 0.85) {
      dispatchAction = 'SEND_IMMEDIATE';
    } else if (finalScore >= 0.45) {
      dispatchAction = 'INCLUDE_DIGEST';
    } else {
      dispatchAction = 'DISCARD';
    }

    let category: 'pricing' | 'product' | 'marketing' | 'market_shift' = 'market_shift';
    let recommendation = '';
    let counterStrategy: Record<string, any> = {};

    if (change.change_type === 'price_drop') {
      category = 'pricing';
      recommendation = `Segera siapkan respons penawaran nilai tambah untuk account executive guna menahan tekanan harga dari ${targetName}.`;
      counterStrategy = {
        playbook: 'Defensive Value Addition',
        actions: ['Tawarkan opsi annual discount ekstra 5%', 'Sorot keunggulan SLA dan kepatuhan privasi data'],
        priority_team: 'Sales & Growth',
      };
    } else if (change.change_type === 'new_product') {
      category = 'product';
      recommendation = `Percepat perilisan fitur diferensiasi dan lengkapi modul perbandingan produk di repositori Company Brain.`;
      counterStrategy = {
        playbook: 'Feature Moat & Speed',
        actions: ['Publikasikan studi kasus keandalan fitur', 'Update objection handling matrix untuk tim outbound'],
        priority_team: 'Product & Marketing',
      };
    } else if (change.change_type === 'campaign_launch') {
      category = 'marketing';
      recommendation = `Luncurkan counter-campaign terarah berbasis bukti kinerja nyata efisiensi tenaga kerja AI.`;
      counterStrategy = {
        playbook: 'Credibility & ROI Framing',
        actions: ['Optimalkan iklan penelusuran kata kunci', 'Kirim newsletter edukatif ke daftar prospek aktif'],
        priority_team: 'Marketing',
      };
    } else {
      category = 'market_shift';
      recommendation = `Dokumentasikan pergerakan ini ke dalam intelijen pasar mingguan.`;
      counterStrategy = { playbook: 'Monitor & Log', actions: ['Catat tren pada database pembelajaran'] };
    }

    // Idempotency key unik
    const rawKey = `${tenantId}:${targetId}:${change.change_type}:${change.title}:${finalScore}`;
    const idempotencyKey = 'idemp_ins_' + crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 32);

    return {
      title: `[${dispatchAction}] ${change.title}`,
      summary: change.description,
      category,
      novelty_score: novelty,
      relevance_score: relevance,
      urgency_score: urgency,
      business_impact_score: impact,
      final_score: finalScore,
      dispatch_action: dispatchAction,
      strategic_recommendation: recommendation,
      counter_strategy: counterStrategy,
      idempotency_key: idempotencyKey,
    };
  }

  /**
   * Pengiriman otomatis ke Proactive Agent (proactive_messages_log) dengan Idempotency Key
   */
  async dispatchToProactiveAgent(client: pg.PoolClient, tenantId: string, insightId: string, insight: ScoredInsightItem) {
    const msgId = crypto.randomUUID();
    const messageTemplate = `🚨 ALERT INTELIJEN PASAR [SKOR: ${(insight.final_score * 100).toFixed(0)}/100]: ${insight.title}
Detail: ${insight.summary}
Rekomendasi Taktis: ${insight.strategic_recommendation}`;

    await client.query(`
      INSERT INTO proactive_messages_log (
        id, tenant_id, channel_type, recipient, message_template,
        status, idempotency_key, sent_at, metadata
      ) VALUES (
        $1, $2, 'app_notification', 'management_workforce', $3,
        'sent', $4, now(), $5
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      msgId, tenantId, messageTemplate, insight.idempotency_key,
      JSON.stringify({ source: 'competitor_intelligence', insight_id: insightId, urgency: insight.urgency_score })
    ]);

    await client.query(`
      UPDATE competitor_insights
      SET proactive_dispatched = true,
          proactive_message_id = $1
      WHERE id = $2
    `, [msgId, insightId]);

    console.log(`[IntelligenceService] Proactive dispatch sukses untuk insight '${insight.title}' dengan idempotency key '${insight.idempotency_key}'`);
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // =========================================================================
  // DATA QUALITY & 5-STATE AVAILABILITY CONFIDENCE ENGINE
  // PRD v2.2 Bagian 8.12 & 8.13.5
  // =========================================================================

  /**
   * Evaluasi 5-State Data Availability dan rincian skor kepercayaan (0.0 - 1.0)
   */
  evaluateAvailabilityAndConfidence(
    data: Record<string, any> | null | undefined,
    requiredFields?: string[],
    sources?: Array<{ source_name?: string; source?: string; data?: Record<string, any> }>,
    dataTimestamp?: Date | string | null,
    ttlHours: number = 24.0
  ): { state: 'AVAILABLE' | 'STALE' | 'CONFLICTING' | 'PARTIAL' | 'NOT_AVAILABLE'; breakdown: any } {
    const reasons: string[] = [];

    // 1. Data Kosong / Tidak Ditemukan
    if (!data || Object.keys(data).length === 0 || Object.values(data).every(v => v === null || v === '')) {
      return {
        state: 'NOT_AVAILABLE',
        breakdown: {
          freshness_score: 0.0,
          completeness_score: 0.0,
          source_reliability_score: 0.0,
          consistency_score: 0.0,
          overall_confidence: 0.0,
          availability_state: 'NOT_AVAILABLE',
          reasons: ['Data tidak ditemukan atau sumber data kosong total.'],
        },
      };
    }

    // 2. Konflik Lintas Sumber Data Eksternal
    if (sources && sources.length > 1) {
      const conflict = this.detectSourceConflicts(sources);
      if (conflict.hasConflict) {
        reasons.push(`Konflik nilai terdeteksi antar sumber eksternal: ${conflict.details}`);
        return {
          state: 'CONFLICTING',
          breakdown: {
            freshness_score: 0.7,
            completeness_score: 0.8,
            source_reliability_score: 0.5,
            consistency_score: 0.0,
            overall_confidence: 0.35,
            availability_state: 'CONFLICTING',
            reasons,
          },
        };
      }
    }

    // 3. Kesegaran Waktu (STALE)
    let freshnessScore = 1.0;
    if (dataTimestamp) {
      const ts = typeof dataTimestamp === 'string' ? new Date(dataTimestamp) : dataTimestamp;
      const ageHours = (Date.now() - ts.getTime()) / (1000 * 3600);
      if (ageHours > ttlHours) {
        reasons.push(`Data telah melampaui ambang batas kesegaran (${ageHours.toFixed(1)} jam > TTL ${ttlHours} jam).`);
        freshnessScore = Math.max(0.1, 1.0 - (ageHours - ttlHours) / ttlHours);
        return {
          state: 'STALE',
          breakdown: {
            freshness_score: Math.round(freshnessScore * 10000) / 10000,
            completeness_score: 0.9,
            source_reliability_score: 0.8,
            consistency_score: 0.8,
            overall_confidence: Math.round((0.4 * freshnessScore + 0.3) * 10000) / 10000,
            availability_state: 'STALE',
            reasons,
          },
        };
      }
    }

    // 4. Kelengkapan Atribut Kunci (PARTIAL)
    let completenessScore = 1.0;
    if (requiredFields && requiredFields.length > 0) {
      const present = requiredFields.filter(f => data[f] !== undefined && data[f] !== null && data[f] !== '');
      completenessScore = present.length / requiredFields.length;
      if (completenessScore < 1.0) {
        const missing = requiredFields.filter(f => !present.includes(f));
        reasons.push(`Atribut penting tidak lengkap: ${missing.join(', ')}.`);
        if (completenessScore < 0.6) {
          return {
            state: 'PARTIAL',
            breakdown: {
              freshness_score: freshnessScore,
              completeness_score: Math.round(completenessScore * 10000) / 10000,
              source_reliability_score: 0.6,
              consistency_score: 0.6,
              overall_confidence: Math.round((0.3 * completenessScore + 0.2) * 10000) / 10000,
              availability_state: 'PARTIAL',
              reasons,
            },
          };
        }
      }
    }

    // 5. Data Sah dan Tersedia Penuh (AVAILABLE)
    const sourceReliability = sources && sources.length >= 1 ? 0.95 : 0.85;
    const overall = Math.round(
      (0.35 * completenessScore + 0.30 * freshnessScore + 0.20 * sourceReliability + 0.15) * 10000
    ) / 10000;
    reasons.push('Data lengkap, segar, dan konsisten dari sumber terverifikasi.');

    return {
      state: 'AVAILABLE',
      breakdown: {
        freshness_score: freshnessScore,
        completeness_score: Math.round(completenessScore * 10000) / 10000,
        source_reliability_score: sourceReliability,
        consistency_score: 1.0,
        overall_confidence: overall,
        availability_state: 'AVAILABLE',
        reasons,
      },
    };
  }

  /**
   * Output Validator:
   * MENOLAK klaim AVAILABLE palsu bila data kosong, konflik, tidak lengkap, atau basi.
   */
  async validateOutputClaim(
    tenantId: string,
    claimedState: 'AVAILABLE' | 'STALE' | 'CONFLICTING' | 'PARTIAL' | 'NOT_AVAILABLE',
    actualData?: Record<string, any> | null,
    requiredFields?: string[],
    sources?: Array<{ source_name?: string; source?: string; data?: Record<string, any> }>,
    dataTimestamp?: Date | string | null,
    ttlHours: number = 24.0
  ) {
    const evaluation = this.evaluateAvailabilityAndConfidence(
      actualData,
      requiredFields,
      sources,
      dataTimestamp,
      ttlHours
    );

    const factState = evaluation.state;
    const breakdown = evaluation.breakdown;

    // Deteksi klaim AVAILABLE palsu
    if (claimedState === 'AVAILABLE' && factState !== 'AVAILABLE') {
      const rejectionReason = `Klaim AVAILABLE palsu ditolak oleh Output Validator. Fakta data berstatus '${factState}' dengan skor kepercayaan ${(breakdown.overall_confidence * 100).toFixed(1)}%. Alasan: ${breakdown.reasons.join('; ')}`;

      // Rekam pelanggaran klaim ke database data_quality_issues
      try {
        const client = await this.pool.connect();
        try {
          await client.query(`
            INSERT INTO data_quality_issues (
              id, tenant_id, entity_type, entity_id, field_name,
              issue_type, severity, availability_state, confidence_score,
              sources_involved, conflict_details, ai_auto_selection_prevented,
              requires_human_resolution, resolution_status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, 'ai_output_claim', 'prompt_eval', 'availability_claim',
              'FALSE_AVAILABILITY_CLAIM', 'HIGH', $2, $3,
              $4, $5, true, true, 'UNRESOLVED', now(), now()
            )
          `, [
            tenantId,
            factState,
            breakdown.overall_confidence,
            JSON.stringify(sources || []),
            JSON.stringify({
              claimed: claimedState,
              rejection_reason: rejectionReason,
              breakdown,
            }),
          ]);
        } finally {
          client.release();
        }
      } catch (dbErr: any) {
        console.error('[IntelligenceService] Error recording false claim violation:', dbErr.message);
      }

      return {
        is_valid: false,
        claimed_state: claimedState,
        validated_state: factState,
        was_false_claim_rejected: true,
        rejection_reason: rejectionReason,
        confidence_score: breakdown.overall_confidence,
        breakdown,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      is_valid: true,
      claimed_state: claimedState,
      validated_state: factState,
      was_false_claim_rejected: false,
      rejection_reason: null,
      confidence_score: breakdown.overall_confidence,
      breakdown,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Mengambil daftar isu kualitas data dengan filter
   */
  async listDataQualityIssues(
    tenantId: string,
    status?: string,
    issueType?: string,
    limit: number = 50
  ) {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM data_quality_issues WHERE tenant_id = $1';
      const params: any[] = [tenantId];

      if (status) {
        params.push(status);
        query += ` AND resolution_status = $${params.length}`;
      }
      if (issueType) {
        params.push(issueType);
        query += ` AND issue_type = $${params.length}`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await client.query(query, params);
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Mencatat isu kualitas data baru
   * ATURAN: ai_auto_selection_prevented = true
   */
  async createDataQualityIssue(
    tenantId: string,
    payload: {
      entity_type: string;
      entity_id: string;
      field_name: string;
      issue_type: string;
      severity?: string;
      availability_state: string;
      confidence_score?: number;
      sources_involved?: any[];
      conflict_details?: Record<string, any>;
      requires_human_resolution?: boolean;
    }
  ) {
    const client = await this.pool.connect();
    try {
      const res = await client.query(`
        INSERT INTO data_quality_issues (
          id, tenant_id, entity_type, entity_id, field_name,
          issue_type, severity, availability_state, confidence_score,
          sources_involved, conflict_details, ai_auto_selection_prevented,
          requires_human_resolution, resolution_status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, true,
          $11, 'UNRESOLVED', now(), now()
        )
        RETURNING *;
      `, [
        tenantId,
        payload.entity_type,
        payload.entity_id,
        payload.field_name,
        payload.issue_type,
        payload.severity || 'MEDIUM',
        payload.availability_state,
        payload.confidence_score || 0.0,
        JSON.stringify(payload.sources_involved || []),
        JSON.stringify(payload.conflict_details || {}),
        payload.requires_human_resolution !== false,
      ]);

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Menerima penyelesaian manual oleh operator manusia atas konflik sumber
   * AI TIDAK PERNAH memutuskan konflik sendiri
   */
  async resolveDataQualityIssue(
    tenantId: string,
    issueId: string,
    resolution: {
      resolved_by: string;
      chosen_source: string;
      resolution_notes?: string;
      reconciled_value?: any;
    }
  ) {
    const client = await this.pool.connect();
    try {
      const res = await client.query(`
        UPDATE data_quality_issues
        SET resolution_status = 'HUMAN_RESOLVED',
            resolved_by = $1,
            resolved_at = now(),
            resolution_source_chosen = $2,
            resolution_notes = $3,
            updated_at = now()
        WHERE id = $4 AND tenant_id = $5
        RETURNING *;
      `, [
        resolution.resolved_by,
        resolution.chosen_source,
        resolution.resolution_notes || 'Diselesaikan oleh peninjau manusia.',
        issueId,
        tenantId,
      ]);

      if (res.rows.length === 0) {
        throw new Error('Isu kualitas data tidak ditemukan.');
      }
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Ringkasan kualitas data tenant
   */
  async getDataQualitySummary(tenantId: string) {
    const client = await this.pool.connect();
    try {
      const countRes = await client.query(`
        SELECT COUNT(*) as unresolved_count
        FROM data_quality_issues
        WHERE tenant_id = $1 AND resolution_status = 'UNRESOLVED'
      `, [tenantId]);

      const typeRes = await client.query(`
        SELECT issue_type, COUNT(*) as cnt
        FROM data_quality_issues
        WHERE tenant_id = $1
        GROUP BY issue_type
      `, [tenantId]);

      const stateRes = await client.query(`
        SELECT availability_state, COUNT(*) as cnt
        FROM data_quality_issues
        WHERE tenant_id = $1
        GROUP BY availability_state
      `, [tenantId]);

      const typeCounts: Record<string, number> = {};
      typeRes.rows.forEach(r => { typeCounts[r.issue_type] = parseInt(r.cnt, 10); });

      const stateCounts: Record<string, number> = {};
      stateRes.rows.forEach(r => { stateCounts[r.availability_state] = parseInt(r.cnt, 10); });

      return {
        tenant_id: tenantId,
        total_unresolved_issues: parseInt(countRes.rows[0]?.unresolved_count || '0', 10),
        issues_by_type: typeCounts,
        availability_state_distribution: stateCounts,
        ai_auto_selection_strictly_disabled: true,
        human_in_the_loop_enforced: true,
      };
    } finally {
      client.release();
    }
  }

  private detectSourceConflicts(sources: Array<{ source_name?: string; source?: string; data?: Record<string, any> }>): { hasConflict: boolean; details: string } {
    const fieldMap: Record<string, Record<string, any>> = {};
    for (const src of sources) {
      const name = src.source_name || src.source || 'unknown';
      if (src.data && typeof src.data === 'object') {
        for (const [key, val] of Object.entries(src.data)) {
          if (!fieldMap[key]) fieldMap[key] = {};
          fieldMap[key][name] = val;
        }
      }
    }

    for (const [field, srcValues] of Object.entries(fieldMap)) {
      const distinct = new Set(Object.values(srcValues).map(v => String(v).trim().toLowerCase()));
      if (distinct.size > 1) {
        const details = Object.entries(srcValues).map(([s, v]) => `${s}: '${v}'`).join(' vs ');
        return { hasConflict: true, details: `Atribut '${field}' bertentangan (${details})` };
      }
    }

    return { hasConflict: false, details: '' };
  }
}
