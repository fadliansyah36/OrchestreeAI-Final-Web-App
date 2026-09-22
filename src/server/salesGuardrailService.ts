/**
 * Sales Guardrails Matrix & Human Approval Service (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)
 *
 * Mengimplementasikan:
 * 1. Matriks Guardrail Sales:
 *    - Diskon > batas (default 10%)
 *    - Refund
 *    - Cancel Order
 *    - Kontrak Khusus
 *    Seluruhnya berstatus risk_tier='high' dan secara mutlak WAJIB melewati HUMAN_APPROVAL jika diajukan AI.
 * 2. Extended Audit Ledger:
 *    - Pencatatan eksplisit actor_type='ai_agent' + persona_type di tabel audit_logs
 * 3. Persistensi ke Supabase PostgreSQL dengan RLS multi-tenant
 */

import pg from 'pg';
import crypto from 'crypto';

export type GuardrailActionType = 'DISCOUNT' | 'REFUND' | 'CANCEL_ORDER' | 'CUSTOM_CONTRACT';

export interface SalesGuardrailRule {
  id: string;
  tenant_id: string;
  action_type: GuardrailActionType;
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  requires_human_approval: boolean;
  max_autonomous_discount_pct: number;
  max_autonomous_amount: number;
  is_active: boolean;
  description: string | null;
  updated_at: string;
}

export interface SalesGuardrailApproval {
  id: string;
  tenant_id: string;
  action_type: GuardrailActionType;
  risk_tier: 'high';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  requested_by_actor_type: 'ai_agent' | 'human_user' | 'system';
  requested_by_actor_id: string | null;
  requested_by_persona_type: string;
  target_resource_type: string;
  target_resource_id: string | null;
  request_payload: Record<string, any>;
  guardrail_violation_reason: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  approval_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluateResult {
  executed: boolean;
  status: 'PENDING_APPROVAL' | 'AUTONOMOUS_EXECUTED';
  requires_human_approval: boolean;
  action_type: string;
  risk_tier: string;
  reason: string;
  approval_id?: string;
  message: string;
}

export class SalesGuardrailService {
  constructor(private pool: pg.Pool) {}

  /**
   * Mengambil aturan guardrail aktif untuk tenant
   */
  async getRules(tenantId: string): Promise<SalesGuardrailRule[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `SELECT id, tenant_id, action_type, risk_tier, requires_human_approval,
                max_autonomous_discount_pct, max_autonomous_amount, is_active,
                description, updated_at
         FROM sales_guardrail_rules
         WHERE tenant_id = $1
         ORDER BY action_type ASC;`,
        [tenantId]
      );

      // Jika belum ada aturan, inisialisasi default 4 aksi
      if (res.rows.length === 0) {
        await client.query(
          `INSERT INTO sales_guardrail_rules (tenant_id, action_type, risk_tier, requires_human_approval, max_autonomous_discount_pct, max_autonomous_amount, description)
           VALUES 
            ($1, 'DISCOUNT', 'high', true, 10.00, 0.00, 'Diskon di atas 10% wajib persetujuan manusia'),
            ($1, 'REFUND', 'high', true, 0.00, 0.00, 'Setiap pengembalian dana (refund) wajib persetujuan manusia'),
            ($1, 'CANCEL_ORDER', 'high', true, 0.00, 0.00, 'Setiap pembatalan pesanan terkonfirmasi wajib persetujuan manusia'),
            ($1, 'CUSTOM_CONTRACT', 'high', true, 0.00, 0.00, 'Setiap pembuatan kontrak kesepakatan khusus wajib persetujuan manusia')
           ON CONFLICT (tenant_id, action_type) DO NOTHING;`,
          [tenantId]
        );
        const refetch = await client.query(
          `SELECT id, tenant_id, action_type, risk_tier, requires_human_approval,
                  max_autonomous_discount_pct, max_autonomous_amount, is_active,
                  description, updated_at
           FROM sales_guardrail_rules
           WHERE tenant_id = $1
           ORDER BY action_type ASC;`,
          [tenantId]
        );
        return refetch.rows.map(r => ({
          ...r,
          max_autonomous_discount_pct: parseFloat(r.max_autonomous_discount_pct),
          max_autonomous_amount: parseFloat(r.max_autonomous_amount),
        }));
      }

      return res.rows.map(r => ({
        ...r,
        max_autonomous_discount_pct: parseFloat(r.max_autonomous_discount_pct),
        max_autonomous_amount: parseFloat(r.max_autonomous_amount),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Mengubah parameter guardrail (misal batas toleransi diskon otonom)
   */
  async updateRule(
    tenantId: string,
    actionType: GuardrailActionType,
    updates: {
      max_autonomous_discount_pct?: number;
      max_autonomous_amount?: number;
      requires_human_approval?: boolean;
      is_active?: boolean;
    }
  ): Promise<SalesGuardrailRule> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `UPDATE sales_guardrail_rules
         SET max_autonomous_discount_pct = COALESCE($3, max_autonomous_discount_pct),
             max_autonomous_amount = COALESCE($4, max_autonomous_amount),
             requires_human_approval = COALESCE($5, requires_human_approval),
             is_active = COALESCE($6, is_active),
             updated_at = now()
         WHERE tenant_id = $1 AND action_type = $2
         RETURNING *;`,
        [
          tenantId,
          actionType,
          updates.max_autonomous_discount_pct,
          updates.max_autonomous_amount,
          updates.requires_human_approval,
          updates.is_active,
        ]
      );
      if (res.rows.length === 0) {
        throw new Error(`Aturan guardrail ${actionType} tidak ditemukan untuk tenant ini.`);
      }
      const r = res.rows[0];
      return {
        ...r,
        max_autonomous_discount_pct: parseFloat(r.max_autonomous_discount_pct),
        max_autonomous_amount: parseFloat(r.max_autonomous_amount),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Evaluasi dan Eskalasi Aksi Penjualan:
   * Jika diajukan oleh AI Agent dan melanggar batas (diskon > limit, refund, cancel order, kontrak khusus),
   * SELALU berhenti di status 'PENDING_APPROVAL' dan TIDAK PERNAH tereksekusi otomatis.
   */
  async evaluateAndExecute(
    tenantId: string,
    params: {
      action_type: GuardrailActionType;
      actor_type?: 'ai_agent' | 'human_user' | 'system';
      actor_id?: string | null;
      persona_type?: string;
      target_resource_type?: string;
      target_resource_id?: string | null;
      payload: Record<string, any>;
      request_id?: string;
    }
  ): Promise<EvaluateResult> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      const actorType = params.actor_type || 'ai_agent';
      const personaType = params.persona_type || 'sales_specialist';
      const targetResourceType = params.target_resource_type || 'order';
      const payload = params.payload || {};

      // 1. Ambil aturan guardrail
      const ruleRes = await client.query(
        `SELECT id, action_type, risk_tier, requires_human_approval,
                max_autonomous_discount_pct, max_autonomous_amount, is_active
         FROM sales_guardrail_rules
         WHERE tenant_id = $1 AND action_type = $2;`,
        [tenantId, params.action_type]
      );

      const rule = ruleRes.rows[0] || {
        max_autonomous_discount_pct: '10.00',
        max_autonomous_amount: '0.00',
        requires_human_approval: true,
        risk_tier: 'high',
      };

      const maxDiscountPct = parseFloat(rule.max_autonomous_discount_pct || '10.00');

      let requiresApproval = false;
      let violationReason = '';

      if (params.action_type === 'DISCOUNT') {
        const requestedDiscount = parseFloat(payload.discount_pct || 0);
        if (requestedDiscount > maxDiscountPct) {
          requiresApproval = true;
          violationReason = `Permintaan diskon ${requestedDiscount.toFixed(1)}% oleh agen AI (${personaType}) melebihi batas otonom AI (${maxDiscountPct.toFixed(1)}%). Wajib persetujuan staf manusia (HUMAN_APPROVAL).`;
        } else {
          requiresApproval = false;
          violationReason = `Diskon ${requestedDiscount.toFixed(1)}% berada dalam toleransi otonom AI (${maxDiscountPct.toFixed(1)}%).`;
        }
      } else if (params.action_type === 'REFUND') {
        const amount = parseFloat(payload.amount || 0);
        requiresApproval = true;
        violationReason = `Pengajuan refund sebesar Rp ${amount.toLocaleString('id-ID')} oleh agen AI (${personaType}) termasuk kategori risiko tinggi (risk_tier='high'). Wajib persetujuan staf manusia.`;
      } else if (params.action_type === 'CANCEL_ORDER') {
        requiresApproval = true;
        violationReason = `Pembatalan pesanan order_id '${payload.order_id || 'N/A'}' oleh agen AI (${personaType}) termasuk kategori risiko tinggi. Wajib persetujuan staf manusia.`;
      } else if (params.action_type === 'CUSTOM_CONTRACT') {
        requiresApproval = true;
        violationReason = `Pembuatan kontrak/klausul komersial non-standar untuk pelanggan '${payload.customer_id || 'N/A'}' oleh agen AI (${personaType}) mewajibkan persetujuan staf manusia.`;
      } else {
        requiresApproval = true;
        violationReason = `Aksi penjualan '${params.action_type}' memerlukan tinjauan persetujuan manusia.`;
      }

      // JIKA MEMERLUKAN PERSETUJUAN MANUSIA: BERHENTI SEKETIKA
      if (requiresApproval) {
        const approvalId = crypto.randomUUID();

        await client.query('BEGIN;');

        // 1. Simpan ke sales_guardrail_approvals
        await client.query(
          `INSERT INTO sales_guardrail_approvals (
             id, tenant_id, action_type, risk_tier, status,
             requested_by_actor_type, requested_by_actor_id, requested_by_persona_type,
             target_resource_type, target_resource_id, request_payload,
             guardrail_violation_reason
           ) VALUES ($1, $2, $3, 'high', 'PENDING_APPROVAL', $4, $5, $6, $7, $8, $9, $10);`,
          [
            approvalId,
            tenantId,
            params.action_type,
            actorType,
            params.actor_id || null,
            personaType,
            targetResourceType,
            params.target_resource_id || null,
            JSON.stringify(payload),
            violationReason,
          ]
        );

        // 2. Audit Ledger komprehensif dengan persona_type
        const auditPayload = {
          status: 'PENDING_APPROVAL',
          risk_tier: 'high',
          guardrail_violation_reason: violationReason,
          approval_id: approvalId,
          requested_payload: payload,
          requires_human_approval: true,
        };

        const actorIdUuid = params.actor_id && params.actor_id.length === 36 ? params.actor_id : null;
        const resIdUuid = params.target_resource_id && params.target_resource_id.length === 36 ? params.target_resource_id : null;

        await client.query(
          `INSERT INTO audit_logs (
             tenant_id, actor_type, actor_id, persona_type,
             action, resource_type, resource_id, payload_after, request_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            tenantId,
            actorType,
            actorIdUuid,
            personaType,
            `sales.guardrail.${params.action_type.toLowerCase()}`,
            targetResourceType,
            resIdUuid,
            JSON.stringify(auditPayload),
            params.request_id || null,
          ]
        );

        await client.query('COMMIT;');

        return {
          executed: false,
          status: 'PENDING_APPROVAL',
          requires_human_approval: true,
          action_type: params.action_type,
          risk_tier: 'high',
          reason: violationReason,
          approval_id: approvalId,
          message: 'Permintaan aksi berisiko tinggi oleh AI Agent dihentikan oleh Sales Guardrail dan dialihkan ke persetujuan staf manusia (HUMAN_APPROVAL).',
        };
      }

      // JIKA AMAN (Diskon <= batas)
      const actorIdUuid = params.actor_id && params.actor_id.length === 36 ? params.actor_id : null;
      const resIdUuid = params.target_resource_id && params.target_resource_id.length === 36 ? params.target_resource_id : null;

      await client.query(
        `INSERT INTO audit_logs (
           tenant_id, actor_type, actor_id, persona_type,
           action, resource_type, resource_id, payload_after, request_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          tenantId,
          actorType,
          actorIdUuid,
          personaType,
          `sales.guardrail.${params.action_type.toLowerCase()}`,
          targetResourceType,
          resIdUuid,
          JSON.stringify({
            status: 'AUTONOMOUS_EXECUTED',
            risk_tier: 'low',
            reason: violationReason,
            requested_payload: payload,
            requires_human_approval: false,
          }),
          params.request_id || null,
        ]
      );

      return {
        executed: true,
        status: 'AUTONOMOUS_EXECUTED',
        requires_human_approval: false,
        action_type: params.action_type,
        risk_tier: 'low',
        reason: violationReason,
        message: 'Aksi berhasil dieksekusi secara otonom dalam batas toleransi aman.',
      };
    } catch (err) {
      await client.query('ROLLBACK;').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mengambil daftar tiket persetujuan manusia
   */
  async getApprovals(tenantId: string, statusFilter?: string): Promise<SalesGuardrailApproval[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      let query = `
        SELECT id, tenant_id, action_type, risk_tier, status,
               requested_by_actor_type, requested_by_actor_id, requested_by_persona_type,
               target_resource_type, target_resource_id, request_payload,
               guardrail_violation_reason, reviewed_by_user_id, reviewed_at,
               rejection_reason, approval_notes, created_at, updated_at
        FROM sales_guardrail_approvals
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (statusFilter) {
        query += ` AND status = $2`;
        params.push(statusFilter);
      }
      query += ` ORDER BY created_at DESC;`;

      const res = await client.query(query, params);
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Meninjau tiket persetujuan (Setujui atau Tolak oleh Staf Manusia)
   */
  async reviewApproval(
    tenantId: string,
    approvalId: string,
    reviewerUserId: string | null,
    decision: 'APPROVED' | 'REJECTED',
    approvalNotes?: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; approval_id: string; status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      await client.query('BEGIN;');

      const check = await client.query(
        `SELECT id, action_type, status, target_resource_type, target_resource_id,
                requested_by_persona_type, request_payload
         FROM sales_guardrail_approvals
         WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, approvalId]
      );

      if (check.rows.length === 0) {
        throw new Error(`Tiket persetujuan '${approvalId}' tidak ditemukan.`);
      }

      const existing = check.rows[0];
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new Error(`Tiket sudah ditinjau dengan status '${existing.status}'.`);
      }

      const reviewerUuid = reviewerUserId && reviewerUserId.length === 36 ? reviewerUserId : null;

      await client.query(
        `UPDATE sales_guardrail_approvals
         SET status = $3,
             reviewed_by_user_id = $4,
             reviewed_at = now(),
             approval_notes = $5,
             rejection_reason = $6,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2;`,
        [
          tenantId,
          approvalId,
          decision,
          reviewerUuid,
          approvalNotes || null,
          rejectionReason || null,
        ]
      );

      // Catat ke Audit Ledger bahwa staf manusia telah memberikan keputusan
      await client.query(
        `INSERT INTO audit_logs (
           tenant_id, actor_type, actor_id, persona_type,
           action, resource_type, resource_id, payload_after
         ) VALUES ($1, 'human_user', $2, $3, $4, $5, $6, $7);`,
        [
          tenantId,
          reviewerUuid,
          existing.requested_by_persona_type,
          `sales.guardrail.review_${decision.toLowerCase()}`,
          existing.target_resource_type,
          existing.target_resource_id && existing.target_resource_id.length === 36 ? existing.target_resource_id : null,
          JSON.stringify({
            approval_id: approvalId,
            decision,
            notes: approvalNotes,
            rejection_reason: rejectionReason,
          }),
        ]
      );

      await client.query('COMMIT;');

      return {
        success: true,
        approval_id: approvalId,
        status: decision,
      };
    } catch (err) {
      await client.query('ROLLBACK;').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mengambil riwayat Audit Ledger aksi penjualan berisiko oleh AI
   */
  async getAuditLogs(tenantId: string, limit: number = 50): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `SELECT id, tenant_id, actor_type, actor_id, persona_type,
                action, resource_type, resource_id, payload_after, request_id, created_at
         FROM audit_logs
         WHERE tenant_id = $1 AND (action LIKE 'sales.guardrail%' OR actor_type = 'ai_agent')
         ORDER BY created_at DESC
         LIMIT $2;`,
        [tenantId, limit]
      );
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Mengambil daftar perkakas risiko tinggi di MCP Tool Registry
   */
  async getMcpHighRiskTools(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT id, tool_name, risk_tier, description, is_active, input_schema, output_schema
         FROM mcp_tools
         WHERE risk_tier = 'high' AND tool_name LIKE 'sales.%'
         ORDER BY tool_name ASC;`
      );
      return res.rows;
    } finally {
      client.release();
    }
  }
}
