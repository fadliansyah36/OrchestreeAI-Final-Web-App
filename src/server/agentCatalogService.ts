/**
 * F.01-AGENTCAT: Service Katalog Blueprint Agen & Staged Rollout (PRD v2.2 Bagian 11.3)
 * 
 * Mengelola blueprint agen AI untuk Super Admin, pemindaian kebijakan keamanan,
 * dan mekanisme transisi rollout bertahap (INTERNAL -> BETA_TENANT -> GENERAL_AVAILABILITY).
 */

import pg from 'pg';

export type RolloutStage = 'INTERNAL' | 'BETA_TENANT' | 'GENERAL_AVAILABILITY';
export type PolicyScanStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface PolicyScanViolation {
  rule_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  location: string;
}

export interface PolicyScanReport {
  status: PolicyScanStatus;
  safety_score: number;
  scanned_at: string;
  rules_evaluated: number;
  violations_found: PolicyScanViolation[];
  summary: string;
}

export interface AgentSkillBlueprint {
  id: string;
  package_id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  system_prompt_template: string;
  required_capabilities: string[];
  tool_definitions: any[];
  default_config: Record<string, any>;
  rollout_stage: RolloutStage;
  allowed_tenant_ids: string[];
  policy_scan_status: PolicyScanStatus;
  policy_scan_report: PolicyScanReport;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class PolicyScanRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyScanRequiredError';
  }
}

export class AgentCatalogService {
  constructor(private pool: pg.Pool) {}

  static scanPolicy(packageData: any): PolicyScanReport {
    const violations: PolicyScanViolation[] = [];
    const textCorpus = `${packageData.system_prompt_template || ''}\n${packageData.description || ''}`;

    // 1. Validasi metadata wajib
    const required = ['package_id', 'name', 'version', 'description', 'category', 'system_prompt_template'];
    for (const f of required) {
      if (!packageData[f] || typeof packageData[f] !== 'string' || !packageData[f].trim()) {
        violations.push({
          rule_id: 'SEC_RULE_MANDATORY_METADATA',
          severity: 'CRITICAL',
          message: `Atribut wajib '${f}' tidak boleh kosong.`,
          location: 'metadata',
        });
      }
    }

    // 2. Deteksi injeksi prompt & pelarian guardrail
    const injectionPatterns = [
      /\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions\b/i,
      /\babaikan\s+(?:seluruh|semua)?\s*(?:instruksi|perintah)\s+(?:sebelumnya|awal)\b/i,
      /\boverride\s+(?:system\s+prompt|guardrails?|safety\s+filters?)\b/i,
      /\btimpa\s+(?:instruksi\s+sistem|filter\s+keamanan)\b/i,
      /\bdisregard\s+(?:safety|ethics|rules|system)\b/i,
      /\bbypass\s+(?:authorization|authentication|pdp|abac)\b/i,
      /\byou\s+are\s+now\s+(?:DAN|jailbreak|unrestricted)\b/i,
    ];

    for (const pat of injectionPatterns) {
      const match = textCorpus.match(pat);
      if (match) {
        violations.push({
          rule_id: 'SEC_RULE_PROMPT_INJECTION_DEFENSE',
          severity: 'CRITICAL',
          message: `Terdeteksi indikasi injeksi prompt atau pengabaian guardrail: '${match[0]}'`,
          location: 'system_prompt_template',
        });
        break;
      }
    }

    // 3. Deteksi kebocoran kredensial
    const credPatterns = [
      /\bsk-[a-zA-Z0-9]{20,}\b/i,
      /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{12,}['"]/i,
      /\bbearer\s+[a-zA-Z0-9_\-\.]{24,}\b/i,
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
    ];

    for (const pat of credPatterns) {
      if (pat.test(textCorpus)) {
        violations.push({
          rule_id: 'SEC_RULE_CREDENTIAL_LEAK_DEFENSE',
          severity: 'CRITICAL',
          message: 'Terdeteksi hardcoded API key atau kredensial rahasia di dalam blueprint.',
          location: 'content_body',
        });
        break;
      }
    }

    // 4. Deteksi eksekusi sistem berbahaya
    const dangerousPatterns = [
      /\beval\s*\(/i,
      /\bexec\s*\(/i,
      /\bos\.system\s*\(/i,
      /\bsubprocess\./i,
      /\bshutil\.rmtree\s*\(/i,
      /\brm\s+-rf\b/i,
    ];

    for (const pat of dangerousPatterns) {
      const match = textCorpus.match(pat);
      if (match) {
        violations.push({
          rule_id: 'SEC_RULE_DANGEROUS_EXECUTION_DEFENSE',
          severity: 'CRITICAL',
          message: `Terdeteksi pemanggilan eksekusi kode berbahaya: '${match[0]}'`,
          location: 'system_prompt_template',
        });
        break;
      }
    }

    // 5. Validasi skema tool_definitions
    const tools = packageData.tool_definitions || [];
    if (Array.isArray(tools)) {
      tools.forEach((tool: any, idx: number) => {
        if (!tool || typeof tool !== 'object' || !tool.name || !tool.description) {
          violations.push({
            rule_id: 'SEC_RULE_TOOL_SCHEMA_INTEGRITY',
            severity: 'HIGH',
            message: `Tool indeks ${idx} tidak memiliki nama atau deskripsi valid.`,
            location: `tool_definitions[${idx}]`,
          });
        }
      });
    }

    const criticalCount = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length;
    const status: PolicyScanStatus = criticalCount === 0 ? 'PASSED' : 'FAILED';
    const safetyScore = criticalCount === 0 ? 1.0 : Math.max(0.0, Number((1.0 - criticalCount * 0.35).toFixed(2)));

    return {
      status,
      safety_score: safetyScore,
      scanned_at: new Date().toISOString(),
      rules_evaluated: 5,
      violations_found: violations,
      summary: status === 'PASSED'
        ? 'Paket blueprint memenuhi standar kepatuhan kebijakan keamanan.'
        : `Ditemukan ${violations.length} pelanggaran kebijakan keamanan yang wajib diselesaikan.`,
    };
  }

  async ingestPackage(packageData: any, operator: string = 'Super Admin'): Promise<AgentSkillBlueprint> {
    const packageId = String(packageData.package_id || '').trim();
    if (!packageId || !/^[a-z0-9-]+$/.test(packageId)) {
      throw new Error('package_id wajib berupa lowercase kebab-case (contoh: sales-lead-qualifier-v1).');
    }

    const scanReport = AgentCatalogService.scanPolicy(packageData);
    const client = await this.pool.connect();

    try {
      const res = await client.query(
        `INSERT INTO public.agent_skill_blueprints (
           package_id,
           name,
           version,
           description,
           category,
           system_prompt_template,
           required_capabilities,
           tool_definitions,
           default_config,
           rollout_stage,
           allowed_tenant_ids,
           policy_scan_status,
           policy_scan_report,
           is_active,
           created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INTERNAL', '[]'::jsonb, $10, $11, true, $12)
         ON CONFLICT (package_id) DO UPDATE SET
           name = EXCLUDED.name,
           version = EXCLUDED.version,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           system_prompt_template = EXCLUDED.system_prompt_template,
           required_capabilities = EXCLUDED.required_capabilities,
           tool_definitions = EXCLUDED.tool_definitions,
           default_config = EXCLUDED.default_config,
           policy_scan_status = EXCLUDED.policy_scan_status,
           policy_scan_report = EXCLUDED.policy_scan_report,
           updated_at = now()
         RETURNING *;`,
        [
          packageId,
          packageData.name,
          packageData.version || '1.0.0',
          packageData.description || '',
          packageData.category || 'operations',
          packageData.system_prompt_template || '',
          JSON.stringify(packageData.required_capabilities || []),
          JSON.stringify(packageData.tool_definitions || []),
          JSON.stringify(packageData.default_config || {}),
          scanReport.status,
          JSON.stringify(scanReport),
          operator,
        ]
      );

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  async transitionRollout(
    identifier: string,
    targetStage: RolloutStage,
    allowedTenantIds: string[] = [],
    operator: string = 'Super Admin'
  ): Promise<AgentSkillBlueprint> {
    const client = await this.pool.connect();
    try {
      const currentRes = await client.query(
        `SELECT id, package_id, name, rollout_stage, policy_scan_status, policy_scan_report, allowed_tenant_ids
         FROM public.agent_skill_blueprints
         WHERE id::text = $1 OR package_id = $1`,
        [identifier]
      );

      if (currentRes.rows.length === 0) {
        throw new Error(`Blueprint dengan identitas '${identifier}' tidak ditemukan.`);
      }

      const bp = currentRes.rows[0];

      // DEFINITION OF DONE ATURAN KUNCI:
      // Paket skill baru WAJIB lolos pemindai kebijakan ('PASSED')
      // sebelum staged rollout diizinkan berlanjut ke BETA_TENANT atau GENERAL_AVAILABILITY.
      if (targetStage === 'BETA_TENANT' || targetStage === 'GENERAL_AVAILABILITY') {
        if (bp.policy_scan_status !== 'PASSED') {
          throw new PolicyScanRequiredError(
            `Paket skill '${bp.name}' (${bp.package_id}) memiliki status kebijakan '${bp.policy_scan_status}'. ` +
            `Paket skill baru WAJIB lolos pemindai kebijakan ('PASSED') sebelum staged rollout diizinkan berlanjut ke tingkat '${targetStage}'.`
          );
        }
      }

      if (targetStage === 'BETA_TENANT' && (!allowedTenantIds || allowedTenantIds.length === 0)) {
        throw new Error('Tingkat BETA_TENANT memerlukan minimal 1 tenant yang diizinkan (allowedTenantIds).');
      }

      const updateRes = await client.query(
        `UPDATE public.agent_skill_blueprints
         SET rollout_stage = $1,
             allowed_tenant_ids = $2::jsonb,
             updated_at = now()
         WHERE id = $3
         RETURNING *;`,
        [targetStage, JSON.stringify(allowedTenantIds || []), bp.id]
      );

      return updateRes.rows[0];
    } finally {
      client.release();
    }
  }

  async listBlueprints(stage?: string, category?: string, policyStatus?: string): Promise<AgentSkillBlueprint[]> {
    const client = await this.pool.connect();
    try {
      const conditions = ['is_active = true'];
      const values: any[] = [];

      if (stage) {
        values.push(stage);
        conditions.push(`rollout_stage = $${values.length}`);
      }
      if (category) {
        values.push(category);
        conditions.push(`category = $${values.length}`);
      }
      if (policyStatus) {
        values.push(policyStatus);
        conditions.push(`policy_scan_status = $${values.length}`);
      }

      const res = await client.query(
        `SELECT *
         FROM public.agent_skill_blueprints
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC`,
        values
      );

      return res.rows;
    } finally {
      client.release();
    }
  }

  async listAvailableForTenant(tenantId: string, category?: string): Promise<AgentSkillBlueprint[]> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const conditions = [
        'is_active = true',
        `(rollout_stage = 'GENERAL_AVAILABILITY' OR (rollout_stage = 'BETA_TENANT' AND allowed_tenant_ids ? $1))`,
      ];
      const values: any[] = [tenantId];

      if (category) {
        values.push(category);
        conditions.push(`category = $${values.length}`);
      }

      const res = await client.query(
        `SELECT id, package_id, name, version, description, category, required_capabilities, tool_definitions, rollout_stage, created_at
         FROM public.agent_skill_blueprints
         WHERE ${conditions.join(' AND ')}
         ORDER BY name ASC`,
        values
      );

      return res.rows;
    } finally {
      client.release();
    }
  }

  async getBlueprint(identifier: string): Promise<AgentSkillBlueprint | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT *
         FROM public.agent_skill_blueprints
         WHERE id::text = $1 OR package_id = $1`,
        [identifier]
      );
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }
}
