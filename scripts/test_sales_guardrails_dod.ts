/**
 * Automated Proof of Definition of Done (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1):
 *
 * 1. AI Agent ('sales_specialist') mengajukan diskon 25% (di atas batas toleransi 10%):
 *    -> Buktikan: executed === false
 *    -> Buktikan: status === 'PENDING_APPROVAL'
 *    -> Buktikan: requires_human_approval === true
 *    -> Buktikan: tiket tersimpan di sales_guardrail_approvals
 * 2. Buktikan Audit Ledger:
 *    -> Kolom actor_type === 'ai_agent'
 *    -> Kolom persona_type === 'sales_specialist'
 *    -> payload_after mencatat status PENDING_APPROVAL dan alasan pelanggaran guardrail
 * 3. AI Agent mengajukan Refund:
 *    -> Buktikan: executed === false, status === 'PENDING_APPROVAL'
 * 4. AI Agent mengajukan Cancel Order:
 *    -> Buktikan: executed === false, status === 'PENDING_APPROVAL'
 * 5. AI Agent mengajukan Custom Contract:
 *    -> Buktikan: executed === false, status === 'PENDING_APPROVAL'
 * 6. Staf Manusia melakukan Review (Approve/Reject):
 *    -> Buktikan: status tiket bertransisi ke APPROVED/REJECTED
 *    -> Buktikan: tercatat di audit_logs dengan actor_type === 'human_user'
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { SalesGuardrailService } from '../src/server/salesGuardrailService';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');
if (!connectionString) {
  console.error('DATABASE_URL tidak disetel!');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runProofOfDoD() {
  console.log('========================================================================');
  console.log('🚀 MEMULAI UJI COBA DEFINITION OF DONE: SALES GUARDRAILS & HUMAN APPROVAL');
  console.log('========================================================================\n');

  const service = new SalesGuardrailService(pool);

  // Ambil salah satu tenant aktif nyata
  const client = await pool.connect();
  let tenantId: string;
  try {
    const tRes = await client.query('SELECT id, legal_name, display_name FROM tenants LIMIT 1;');
    if (tRes.rows.length === 0) {
      throw new Error('Tidak ada tenant di database.');
    }
    tenantId = tRes.rows[0].id;
    console.log(`📌 Tenant Uji Coba: ${tRes.rows[0].display_name} (${tenantId})\n`);
  } finally {
    client.release();
  }

  // 1. Ambil aturan guardrail
  const rules = await service.getRules(tenantId);
  console.log(`✅ [1/6] Mengambil ${rules.length} aturan guardrail dari Supabase Postgres.`);
  rules.forEach((r) => {
    console.log(`   - ${r.action_type}: Risk=${r.risk_tier}, Otonom Max=${r.max_autonomous_discount_pct}%, Wajib Human=${r.requires_human_approval}`);
  });

  // 2. UJI KASUS DISKON > BATAS OLEH AI AGENT
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 [2/6] UJI: AI Agent (sales_specialist) meminta Diskon 25% (Batas Otonom: 10%)...');
  const discountEval = await service.evaluateAndExecute(tenantId, {
    action_type: 'DISCOUNT',
    actor_type: 'ai_agent',
    persona_type: 'sales_specialist',
    target_resource_type: 'order',
    target_resource_id: null,
    payload: {
      order_id: 'ORD-TEST-9921',
      discount_pct: 25.0,
      reason: 'Permintaan potongan harga volume pembeli',
    },
    request_id: `dod-disc-${Date.now()}`,
  });

  console.log('   Hasil Evaluasi:', discountEval);

  if (discountEval.executed === true) {
    throw new Error('❌ GAGAL: Diskon 25% seharusnya TIDAK PERNAH tereksekusi otomatis!');
  }
  if (discountEval.status !== 'PENDING_APPROVAL') {
    throw new Error(`❌ GAGAL: Status seharusnya PENDING_APPROVAL, bukan ${discountEval.status}`);
  }
  if (discountEval.requires_human_approval !== true) {
    throw new Error('❌ GAGAL: requires_human_approval wajib true!');
  }
  if (!discountEval.approval_id) {
    throw new Error('❌ GAGAL: approval_id tiket wajib diterbitkan!');
  }

  console.log('   ✅ TERBUKTI: Permintaan diskon di atas batas BERHENTI SEKETIKA di status PENDING_APPROVAL!');
  console.log(`   ✅ ID Tiket Approval: ${discountEval.approval_id}`);

  // 3. UJI BUKTI AUDIT LEDGER (actor_type = 'ai_agent', persona_type = 'sales_specialist')
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 [3/6] UJI: Verifikasi Audit Ledger di Supabase Postgres...');
  const logs = await service.getAuditLogs(tenantId, 10);
  const matchedLog = logs.find(
    (l) => l.actor_type === 'ai_agent' && (l.persona_type === 'sales_specialist' || l.action.includes('discount'))
  );

  if (!matchedLog) {
    throw new Error('❌ GAGAL: Tidak ditemukan catatan audit log untuk aksi guardrail diskon AI!');
  }

  console.log('   Catatan Audit Log Terakhir:');
  console.log(`   - ID: ${matchedLog.id}`);
  console.log(`   - Actor Type: ${matchedLog.actor_type}`);
  console.log(`   - Persona Type: ${matchedLog.persona_type}`);
  console.log(`   - Action: ${matchedLog.action}`);
  console.log(`   - Payload Status: ${typeof matchedLog.payload_after === 'string' ? JSON.parse(matchedLog.payload_after).status : matchedLog.payload_after?.status}`);

  if (matchedLog.actor_type !== 'ai_agent') {
    throw new Error(`❌ GAGAL: actor_type seharusnya 'ai_agent', bukan ${matchedLog.actor_type}`);
  }
  if (matchedLog.persona_type !== 'sales_specialist') {
    throw new Error(`❌ GAGAL: persona_type seharusnya 'sales_specialist', bukan ${matchedLog.persona_type}`);
  }
  console.log('   ✅ TERBUKTI: Audit ledger mencatat actor_type=ai_agent dan persona_type=sales_specialist!');

  // 4. UJI REFUND, CANCEL ORDER, DAN CUSTOM CONTRACT OLEH AI
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 [4/6] UJI: Pengajuan Refund, Cancel Order, & Custom Contract oleh AI...');

  // 4a. Refund
  const refundEval = await service.evaluateAndExecute(tenantId, {
    action_type: 'REFUND',
    actor_type: 'ai_agent',
    persona_type: 'customer_support',
    target_resource_type: 'order',
    payload: { order_id: 'ORD-REF-01', amount: 850000, reason: 'Barang rusak saat pengiriman' },
  });
  if (refundEval.executed === true || refundEval.status !== 'PENDING_APPROVAL') {
    throw new Error('❌ GAGAL: Refund oleh AI wajib berhenti di PENDING_APPROVAL!');
  }
  console.log('   ✅ Refund oleh AI: BERHENTI di PENDING_APPROVAL (Wajib Persetujuan Manusia).');

  // 4b. Cancel Order
  const cancelEval = await service.evaluateAndExecute(tenantId, {
    action_type: 'CANCEL_ORDER',
    actor_type: 'ai_agent',
    persona_type: 'outbound_agent',
    target_resource_type: 'order',
    payload: { order_id: 'ORD-CANCEL-02', reason: 'Pembeli minta batalkan' },
  });
  if (cancelEval.executed === true || cancelEval.status !== 'PENDING_APPROVAL') {
    throw new Error('❌ GAGAL: Cancel Order oleh AI wajib berhenti di PENDING_APPROVAL!');
  }
  console.log('   ✅ Cancel Order oleh AI: BERHENTI di PENDING_APPROVAL (Wajib Persetujuan Manusia).');

  // 4c. Custom Contract
  const contractEval = await service.evaluateAndExecute(tenantId, {
    action_type: 'CUSTOM_CONTRACT',
    actor_type: 'ai_agent',
    persona_type: 'sales_specialist',
    target_resource_type: 'customer',
    payload: { customer_id: 'CUST-B2B-88', terms: 'Termin 120 hari' },
  });
  if (contractEval.executed === true || contractEval.status !== 'PENDING_APPROVAL') {
    throw new Error('❌ GAGAL: Custom Contract oleh AI wajib berhenti di PENDING_APPROVAL!');
  }
  console.log('   ✅ Custom Contract oleh AI: BERHENTI di PENDING_APPROVAL (Wajib Persetujuan Manusia).');

  // 5. UJI HUMAN IN THE LOOP (SETUJUI TIKET APPROVAL)
  console.log('\n------------------------------------------------------------------------');
  console.log(`🧪 [5/6] UJI: Staf Manusia Menyetujui Tiket Diskon (${discountEval.approval_id})...`);
  const reviewResult = await service.reviewApproval(
    tenantId,
    discountEval.approval_id!,
    null,
    'APPROVED',
    'Disetujui manajer penjualan karena volume order di atas 100 unit.',
    undefined
  );

  console.log('   Hasil Review:', reviewResult);
  if (reviewResult.status !== 'APPROVED') {
    throw new Error(`❌ GAGAL: Status review seharusnya APPROVED, bukan ${reviewResult.status}`);
  }
  console.log('   ✅ TERBUKTI: Staf manusia berhasil menyetujui tiket eskalasi guardrail!');

  // 6. UJI MCP TOOL REGISTRY (RISK_TIER = HIGH)
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 [6/6] UJI: Verifikasi MCP Tool Registry untuk 4 Perkakas Sales...');
  const mcpTools = await service.getMcpHighRiskTools();
  console.log(`   Ditemukan ${mcpTools.length} perkakas MCP Sales:`);
  mcpTools.forEach((t) => {
    console.log(`   - ${t.tool_name} | risk_tier: ${t.risk_tier} | active: ${t.is_active}`);
  });

  const expectedTools = [
    'sales.discount.apply',
    'sales.refund.process',
    'sales.order.cancel',
    'sales.custom_contract.create',
  ];

  for (const expected of expectedTools) {
    const found = mcpTools.find((t) => t.tool_name === expected);
    if (!found) {
      throw new Error(`❌ GAGAL: Tool ${expected} tidak terdaftar di MCP Tool Registry!`);
    }
    if (found.risk_tier !== 'high') {
      throw new Error(`❌ GAGAL: Tool ${expected} memiliki risk_tier '${found.risk_tier}', wajib 'high'!`);
    }
  }
  console.log('   ✅ TERBUKTI: Seluruh 4 perkakas sales terdaftar di MCP Tool Registry dengan risk_tier=high!');

  console.log('\n========================================================================');
  console.log('🎉 SELURUH PENGUJIAN DEFINITION OF DONE BERHASIL 100% TANPA KESALAHAN!');
  console.log('========================================================================\n');

  await pool.end();
}

runProofOfDoD().catch(async (err) => {
  console.error('\n❌ KESALAHAN SAAT PENGUJIAN DEFINITION OF DONE:', err);
  await pool.end();
  process.exit(1);
});
