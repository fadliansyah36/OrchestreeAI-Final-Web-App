/**
 * Layanan ABAC (Attribute-Based Access Control) & Department Budget Guard — PRD v2.2 Bagian 3.3, 3.5 & 14.2
 * Beroperasi langsung pada Supabase Postgres nyata.
 * Default Fail-Closed: DENIED_NO_POLICY jika tidak ada baris kebijakan izin data eksplisit.
 */

import pg from 'pg';

export interface ABACSubjectInput {
  tenant_id: string;
  agent_id?: string;
  agent_persona_type?: string;
  actor_type?: string;
  roles?: string[];
  department_id?: string;
}

export interface ABACResourceInput {
  resource_type: string;
  resource_identifier: string;
  data_classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  owner_tenant_id?: string;
  attributes?: Record<string, any>;
}

export interface ABACDecisionResult {
  is_authorized: boolean;
  decision: 'ALLOW' | 'DENIED_NO_POLICY' | 'DENIED_POLICY_EXPLICIT' | 'DENY_DATA_CLASSIFICATION' | 'DENY_CONDITION_UNMET' | 'DENY_CROSS_TENANT';
  reason: string;
  policy_id?: string;
  matched_policy?: Record<string, any>;
  data_classification?: string;
}

export interface DepartmentBudgetResult {
  is_allowed: boolean;
  decision: 'ALLOW' | 'DENY_DEPARTMENT_BUDGET_CAP' | 'DENY_DEPARTMENT_NOT_FOUND';
  reason: string;
  department_id?: string;
  department_name?: string;
  credit_cap?: number | null;
  credit_spent?: number;
  estimated_cost?: number;
}

const CLASSIFICATION_LEVELS: Record<string, number> = {
  public: 1,
  internal: 2,
  confidential: 3,
  restricted: 4,
};

/**
 * Mencatat keputusan otorisasi ke audit_logs nyata di Supabase.
 */
export async function logAuditEntry(
  pool: pg.Pool | null,
  entry: {
    tenant_id: string;
    actor_type: string;
    actor_id?: string | null;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    payload_after: Record<string, any>;
    request_id?: string | null;
  }
): Promise<void> {
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      await client.query('SET LOCAL ROLE orchestree_app;');
      if (entry.tenant_id) {
        await client.query("SELECT set_config('app.tenant_id', $1, true);", [entry.tenant_id]);
      }

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const validActorId = entry.actor_id && UUID_REGEX.test(entry.actor_id) ? entry.actor_id : null;
      const validResourceId = entry.resource_id && UUID_REGEX.test(entry.resource_id) ? entry.resource_id : null;

      await client.query(
        `INSERT INTO audit_logs (
          tenant_id,
          actor_type,
          actor_id,
          action,
          resource_type,
          resource_id,
          payload_after,
          request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          entry.tenant_id,
          entry.actor_type,
          validActorId,
          entry.action,
          entry.resource_type,
          validResourceId,
          JSON.stringify(entry.payload_after),
          entry.request_id || null,
        ]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Gagal mencatat audit log:', err);
  }
}

/**
 * Evaluasi Kebijakan Izin Data Agen AI (ABAC) — PRD v2.2 Bagian 3.3.
 * Zero-Trust: Default DENIED_NO_POLICY jika tidak ditemukan baris kebijakan yang cocok.
 */
export async function checkAiDataPermission(
  pool: pg.Pool | null,
  subject: ABACSubjectInput,
  action: string,
  resource: ABACResourceInput,
  context?: Record<string, any>
): Promise<ABACDecisionResult> {
  const dataClass = resource.data_classification || 'internal';

  // 1. Isolasi Batas Tenant
  if (resource.owner_tenant_id && subject.tenant_id !== resource.owner_tenant_id) {
    const decision: ABACDecisionResult = {
      is_authorized: false,
      decision: 'DENY_CROSS_TENANT',
      reason: `Akses data lintas-tenant dilarang (${subject.tenant_id} -> ${resource.owner_tenant_id}).`,
      data_classification: dataClass,
    };
    await logAuditEntry(pool, {
      tenant_id: subject.tenant_id,
      actor_type: subject.actor_type || 'ai_agent',
      actor_id: subject.agent_id || null,
      action: `abac:${action}`,
      resource_type: resource.resource_type,
      resource_id: resource.resource_identifier,
      payload_after: { ...decision, subject, resource },
      request_id: context?.request_id,
    });
    return decision;
  }

  if (!pool) {
    // Fail closed jika pool database tidak terhubung
    return {
      is_authorized: false,
      decision: 'DENIED_NO_POLICY',
      reason: 'Koneksi database tidak tersedia (Fail-closed ABAC).',
      data_classification: dataClass,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('SET LOCAL ROLE orchestree_app;');
    await client.query("SELECT set_config('app.tenant_id', $1, true);", [subject.tenant_id]);

    const res = await client.query(
      `SELECT
        id, tenant_id, agent_id, agent_persona_type, resource_type,
        resource_identifier, action, data_classification, conditions, effect, priority
      FROM ai_data_permission_policies
      WHERE tenant_id = $1
        AND resource_type = $2
        AND (resource_identifier = $3 OR resource_identifier = '*')
        AND (action = $4 OR action = '*')
        AND (
          (agent_id IS NOT NULL AND agent_id = $5)
          OR (agent_persona_type IS NOT NULL AND agent_persona_type = $6)
          OR (agent_id IS NULL AND agent_persona_type IS NULL)
        )
      ORDER BY priority DESC, created_at DESC;`,
      [
        subject.tenant_id,
        resource.resource_type,
        resource.resource_identifier,
        action,
        subject.agent_id || null,
        subject.agent_persona_type || null,
      ]
    );

    const policies = res.rows;

    // --- SIFAT MUTLAK: DEFAULT DENIED_NO_POLICY JIKA TIDAK ADA BARIS POLICY ---
    if (!policies || policies.length === 0) {
      const personaIdent = subject.agent_id || subject.agent_persona_type || 'AI_AGENT';
      const decision: ABACDecisionResult = {
        is_authorized: false,
        decision: 'DENIED_NO_POLICY',
        reason: `Akses data ditolak: Tidak ada baris kebijakan izin data eksplisit (ABAC Policy) untuk persona/agen '${personaIdent}' pada resource '${resource.resource_type}:${resource.resource_identifier}'. Default: DENIED_NO_POLICY.`,
        data_classification: dataClass,
      };

      await logAuditEntry(pool, {
        tenant_id: subject.tenant_id,
        actor_type: subject.actor_type || 'ai_agent',
        actor_id: subject.agent_id || null,
        action: `abac:${action}`,
        resource_type: resource.resource_type,
        resource_id: resource.resource_identifier,
        payload_after: {
          decision: decision.decision,
          is_authorized: false,
          reason: decision.reason,
          agent_persona_type: subject.agent_persona_type,
          resource_type: resource.resource_type,
          resource_identifier: resource.resource_identifier,
          data_classification: dataClass,
        },
        request_id: context?.request_id,
      });

      return decision;
    }

    const requestedLevel = CLASSIFICATION_LEVELS[dataClass.toLowerCase()] || 2;

    for (const pol of policies) {
      const policyLevel = CLASSIFICATION_LEVELS[(pol.data_classification || 'internal').toLowerCase()] || 2;

      // Periksa klasifikasi data
      if (requestedLevel > policyLevel) {
        continue;
      }

      // Periksa kondisi JSONB
      const conditions = typeof pol.conditions === 'string' ? JSON.parse(pol.conditions) : (pol.conditions || {});
      if (conditions.allowed_departments && subject.department_id) {
        if (Array.isArray(conditions.allowed_departments) && !conditions.allowed_departments.includes(subject.department_id)) {
          continue;
        }
      }

      // Keputusan sesuai effect
      if (pol.effect === 'DENY') {
        const decision: ABACDecisionResult = {
          is_authorized: false,
          decision: 'DENIED_POLICY_EXPLICIT',
          reason: `Akses data ditolak secara eksplisit oleh kebijakan ABAC ID ${pol.id}.`,
          policy_id: pol.id,
          matched_policy: pol,
          data_classification: dataClass,
        };
        await logAuditEntry(pool, {
          tenant_id: subject.tenant_id,
          actor_type: subject.actor_type || 'ai_agent',
          actor_id: subject.agent_id || null,
          action: `abac:${action}`,
          resource_type: resource.resource_type,
          resource_id: resource.resource_identifier,
          payload_after: decision,
          request_id: context?.request_id,
        });
        return decision;
      }

      if (pol.effect === 'ALLOW') {
        const decision: ABACDecisionResult = {
          is_authorized: true,
          decision: 'ALLOW',
          reason: `Akses data disetujui berdasarkan kebijakan ABAC ID ${pol.id}.`,
          policy_id: pol.id,
          matched_policy: pol,
          data_classification: dataClass,
        };
        await logAuditEntry(pool, {
          tenant_id: subject.tenant_id,
          actor_type: subject.actor_type || 'ai_agent',
          actor_id: subject.agent_id || null,
          action: `abac:${action}`,
          resource_type: resource.resource_type,
          resource_id: resource.resource_identifier,
          payload_after: decision,
          request_id: context?.request_id,
        });
        return decision;
      }
    }

    // Jika seluruh kandidat kebijakan tidak lolos klasifikasi atau kondisi
    const decision: ABACDecisionResult = {
      is_authorized: false,
      decision: 'DENIED_NO_POLICY',
      reason: `Akses data ditolak: Tidak ada kebijakan yang memenuhi syarat klasifikasi data atau kondisi operasional pada resource '${resource.resource_type}:${resource.resource_identifier}'.`,
      data_classification: dataClass,
    };
    await logAuditEntry(pool, {
      tenant_id: subject.tenant_id,
      actor_type: subject.actor_type || 'ai_agent',
      actor_id: subject.agent_id || null,
      action: `abac:${action}`,
      resource_type: resource.resource_type,
      resource_id: resource.resource_identifier,
      payload_after: decision,
      request_id: context?.request_id,
    });
    return decision;
  } catch (err: any) {
    console.error('Error during checkAiDataPermission:', err);
    return {
      is_authorized: false,
      decision: 'DENIED_NO_POLICY',
      reason: `Kesalahan evaluasi izin data ABAC (Fail-closed): ${err.message}`,
      data_classification: dataClass,
    };
  } finally {
    client.release();
  }
}

/**
 * Memeriksa Plafon Anggaran Kredit Departemen (credit_guard.check_department_cap)
 * PRD v2.2 Bagian 3.5 & 14.2
 */
export async function checkDepartmentCap(
  pool: pg.Pool | null,
  tenant_id: string,
  department_id: string,
  estimated_cost: number = 0
): Promise<DepartmentBudgetResult> {
  if (!tenant_id || !department_id) {
    return {
      is_allowed: true,
      decision: 'ALLOW',
      reason: 'Pemeriksaan anggaran departemen dilewati (tanpa ID departemen).',
    };
  }

  if (!pool) {
    return {
      is_allowed: false,
      decision: 'DENY_DEPARTMENT_BUDGET_CAP',
      reason: 'Koneksi database tidak tersedia untuk validasi anggaran.',
      department_id,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('SET LOCAL ROLE orchestree_app;');
    await client.query("SELECT set_config('app.tenant_id', $1, true);", [tenant_id]);

    const res = await client.query(
      `SELECT id, name, credit_cap, credit_spent
       FROM departments
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       LIMIT 1;`,
      [tenant_id, department_id]
    );

    if (res.rows.length === 0) {
      return {
        is_allowed: false,
        decision: 'DENY_DEPARTMENT_NOT_FOUND',
        reason: `Departemen '${department_id}' tidak ditemukan atau telah dihapus.`,
        department_id,
      };
    }

    const row = res.rows[0];
    const creditSpent = parseFloat(row.credit_spent || '0');
    const creditCap = row.credit_cap !== null ? parseFloat(row.credit_cap) : null;

    if (creditCap === null) {
      return {
        is_allowed: true,
        decision: 'ALLOW',
        reason: `Departemen '${row.name}' tidak memiliki batas plafon kredit anggaran.`,
        department_id: row.id,
        department_name: row.name,
        credit_cap: null,
        credit_spent: creditSpent,
        estimated_cost,
      };
    }

    const totalAfter = creditSpent + estimated_cost;
    if (totalAfter > creditCap || creditSpent >= creditCap) {
      return {
        is_allowed: false,
        decision: 'DENY_DEPARTMENT_BUDGET_CAP',
        reason: `Plafon anggaran kredit departemen '${row.name}' telah terlampaui (Terpakai: ${creditSpent.toFixed(2)} + Estimasi: ${estimated_cost.toFixed(2)} > Batas: ${creditCap.toFixed(2)}).`,
        department_id: row.id,
        department_name: row.name,
        credit_cap: creditCap,
        credit_spent: creditSpent,
        estimated_cost,
      };
    }

    return {
      is_allowed: true,
      decision: 'ALLOW',
      reason: `Penggunaan kredit departemen '${row.name}' berada di dalam batas plafon anggaran.`,
      department_id: row.id,
      department_name: row.name,
      credit_cap: creditCap,
      credit_spent: creditSpent,
      estimated_cost,
    };
  } catch (err: any) {
    console.error('Error checking department cap:', err);
    return {
      is_allowed: false,
      decision: 'DENY_DEPARTMENT_BUDGET_CAP',
      reason: `Gagal memvalidasi plafon anggaran departemen: ${err.message}`,
      department_id,
      estimated_cost,
    };
  } finally {
    client.release();
  }
}
