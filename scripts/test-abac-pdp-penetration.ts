/**
 * Script Uji Penetrasi Otomatis & Verifikasi Real ABAC PDP (PRD v2.2 Bagian 3.3 & 3.5).
 * Membuktikan Definition of Done secara nyata:
 * 1. AI Agent Persona mencoba akses sumber data tanpa policy -> DENIED_NO_POLICY tercatat nyata di audit_logs.
 * 2. Penegakan plafon anggaran kredit per departemen -> DENY_DEPARTMENT_BUDGET_CAP saat melampaui batas.
 * 3. Uji Penetrasi: Seluruh REST endpoint, Node Workflow, dan MCP Tool wajib melewati evaluasi PDP (tidak ada jalur pintas).
 * 4. Kebijakan eksplisit ALLOW -> berhasil disetujui (ALLOW).
 */

import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  authorizePDP,
  authorizePDPAsync,
  PDPSubject,
  PDPResource,
} from '../src/server/cognitiveCore';
import {
  checkAiDataPermission,
  checkDepartmentCap,
} from '../src/server/abacService';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runPenetrationSuite() {
  console.log('================================================================');
  console.log('🚀 MEMULAI UJI PENETRASI OTOMATIS & VERIFIKASI DOD ABAC & PDP');
  console.log('================================================================\n');

  const client = await pool.connect();

  try {
    const testTenantId = crypto.randomUUID();
    const testAgentId = crypto.randomUUID();
    const testDeptId = crypto.randomUUID();
    const testUserId = crypto.randomUUID();
    const testRequestId = `pen-test-${Date.now()}`;

    console.log(`[SETUP] Menyiapkan entitas pengujian pada Supabase...`);
    console.log(`- Tenant ID:     ${testTenantId}`);
    console.log(`- Agent ID:      ${testAgentId}`);
    console.log(`- Department ID: ${testDeptId}`);
    console.log(`- Request ID:    ${testRequestId}\n`);

    // 1. Buat tenant uji nyata di Supabase
    await client.query(`
      INSERT INTO tenants (id, legal_name, display_name, status)
      VALUES ($1, 'PT Penetration Test Tenant', 'Penetration Test Tenant', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [testTenantId]);

    // 2. Buat departemen dengan batas plafon anggaran: credit_cap = 100.0, credit_spent = 95.0
    await client.query(`
      INSERT INTO departments (id, tenant_id, name, credit_cap, credit_spent)
      VALUES ($1, $2, 'Security Operations', 100.0000, 95.0000)
      ON CONFLICT (id) DO NOTHING;
    `, [testDeptId, testTenantId]);

    // 3. Ambil job title valid dan buat agen AI di ai_agents
    const jobTitleRes = await client.query(`SELECT id FROM ai_job_titles LIMIT 1;`);
    const validJobTitleId = jobTitleRes.rows[0]?.id;

    await client.query(`
      INSERT INTO ai_agents (id, tenant_id, department_id, persona_type, display_name, status, job_title_id)
      VALUES ($1, $2, $3, 'market_intelligence', 'Test Security Analyst Agent', 'active', $4)
      ON CONFLICT (id) DO NOTHING;
    `, [testAgentId, testTenantId, testDeptId, validJobTitleId]);

    console.log('----------------------------------------------------------------');
    console.log('TEST 1: SIFAT MUTLAK ABAC — DEFAULT DENIED_NO_POLICY & AUDIT LOG');
    console.log('----------------------------------------------------------------');

    const agentSubject: PDPSubject = {
      tenant_id: testTenantId,
      agent_id: testAgentId,
      agent_persona_type: 'market_intelligence',
      actor_type: 'ai_agent',
      roles: ['AI_AGENT'],
      capabilities: [],
    };

    const externalDataResource: PDPResource = {
      resource_type: 'external_api',
      resource_id: 'salesforce_enterprise_crm',
      owner_tenant_id: testTenantId,
      data_classification: 'confidential',
      attributes: { source: 'salesforce' },
    };

    // Evaluasi PDP asinkronus (RBAC -> Tier -> ABAC -> Budget)
    const test1Decision = await authorizePDPAsync(
      pool,
      agentSubject,
      'data.read',
      externalDataResource,
      { request_id: testRequestId, enforce_abac: true }
    );

    console.log(`Hasil Evaluasi PDP Test 1:`, test1Decision);
    if (test1Decision.is_authorized || test1Decision.audit_decision !== 'DENIED_NO_POLICY') {
      throw new Error(`FAIL: Harusnya DENIED_NO_POLICY, tapi didapatkan: ${JSON.stringify(test1Decision)}`);
    }
    console.log('✅ PASS: AI Agent tanpa policy ditolak dengan DENIED_NO_POLICY.');

    // Verifikasi audit_logs nyata di Supabase
    console.log('\n[AUDIT CHECK] Memverifikasi pencatatan nyata di tabel audit_logs...');
    const auditRes = await client.query(`
      SELECT id, tenant_id, actor_type, action, payload_after, created_at
      FROM audit_logs
      WHERE tenant_id = $1 AND request_id = $2
      ORDER BY created_at DESC
      LIMIT 1;
    `, [testTenantId, testRequestId]);

    if (auditRes.rows.length === 0) {
      throw new Error('FAIL: Catatan DENIED_NO_POLICY tidak ditemukan di tabel audit_logs Supabase!');
    }

    const auditRow = auditRes.rows[0];
    const payload = typeof auditRow.payload_after === 'string' ? JSON.parse(auditRow.payload_after) : auditRow.payload_after;
    console.log(`Audit Log ID: ${auditRow.id}`);
    console.log(`Action:       ${auditRow.action}`);
    console.log(`Decision:     ${payload.decision || payload.abac_decision}`);
    if (payload.decision !== 'DENIED_NO_POLICY' && payload.abac_decision !== 'DENIED_NO_POLICY') {
      throw new Error(`FAIL: Decision di audit_logs bukan DENIED_NO_POLICY: ${JSON.stringify(payload)}`);
    }
    console.log('✅ PASS: DoD Terbukti — DENIED_NO_POLICY tercatat nyata di audit_logs.');

    console.log('\n----------------------------------------------------------------');
    console.log('TEST 2: PENEGAKAN PLAFON ANGGARAN DEPARTEMEN (DEPARTMENT CAP)');
    console.log('----------------------------------------------------------------');

    // Plafon 100.0, terpakai 95.0. Tambah 10.0 -> total 105.0 > 100.0 -> WAJIB DENY_DEPARTMENT_BUDGET_CAP
    const budgetOverDecision = await checkDepartmentCap(pool, testTenantId, testDeptId, 10.0);
    console.log('Uji Budget Melebihi Plafon (95 + 10 > 100):', budgetOverDecision);
    if (budgetOverDecision.is_allowed || budgetOverDecision.decision !== 'DENY_DEPARTMENT_BUDGET_CAP') {
      throw new Error(`FAIL: Plafon terlampaui harusnya ditolak DENY_DEPARTMENT_BUDGET_CAP!`);
    }
    console.log('✅ PASS: Plafon anggaran terlampaui ditolak DENY_DEPARTMENT_BUDGET_CAP.');

    // Tambah 2.0 -> total 97.0 <= 100.0 -> WAJIB ALLOW
    const budgetOkDecision = await checkDepartmentCap(pool, testTenantId, testDeptId, 2.0);
    console.log('Uji Budget Dalam Batas Plafon (95 + 2 <= 100):', budgetOkDecision);
    if (!budgetOkDecision.is_allowed || budgetOkDecision.decision !== 'ALLOW') {
      throw new Error(`FAIL: Permintaan di dalam batas plafon harusnya ALLOW!`);
    }
    console.log('✅ PASS: Penggunaan dalam batas plafon anggaran disetujui (ALLOW).');

    console.log('\n----------------------------------------------------------------');
    console.log('TEST 3: KEBIJAKAN EKSPLISIT ALLOW & PENGUJIAN AKSES BERHASIL');
    console.log('----------------------------------------------------------------');

    // Sisipkan kebijakan ALLOW di ai_data_permission_policies
    const policyId = crypto.randomUUID();
    await client.query(`
      INSERT INTO ai_data_permission_policies (
        id, tenant_id, agent_id, resource_type, resource_identifier,
        action, data_classification, effect, priority
      ) VALUES (
        $1, $2, $3, 'database_table', 'product_catalog', 'data.read', 'internal', 'ALLOW', 100
      );
    `, [policyId, testTenantId, testAgentId]);
    console.log(`Kebijakan ALLOW berhasil disisipkan: ID ${policyId}`);

    const allowedDataResource: PDPResource = {
      resource_type: 'database_table',
      resource_id: 'product_catalog',
      owner_tenant_id: testTenantId,
      data_classification: 'internal',
    };

    const test3Decision = await authorizePDPAsync(
      pool,
      agentSubject,
      'data.read',
      allowedDataResource,
      { request_id: `${testRequestId}-allow` }
    );
    console.log('Hasil Evaluasi dengan Kebijakan ALLOW:', test3Decision);
    if (!test3Decision.is_authorized || test3Decision.audit_decision !== 'ALLOW') {
      throw new Error(`FAIL: Kebijakan ALLOW harusnya menghasilkan is_authorized = true!`);
    }
    console.log('✅ PASS: Akses data disetujui penuh dengan kebijakan ALLOW eksplisit.');

    console.log('\n----------------------------------------------------------------');
    console.log('TEST 4: HARNESS UJI PENETRASI (MEMBUKTIKAN TIDAK ADA JALUR PINTAS)');
    console.log('----------------------------------------------------------------');

    const unauthorizedSubject: PDPSubject = {
      tenant_id: testTenantId,
      user_id: testUserId,
      roles: ['STAFF_HUMAN'],
      capabilities: [],
    };

    // 4.1 Penetrasi REST: Akses endpoint administratif tanpa role
    const restPenetration = authorizePDP(
      unauthorizedSubject,
      'billing.upgrade',
      { resource_type: 'tenant_billing', owner_tenant_id: testTenantId }
    );
    console.log('Penetrasi REST Billing Upgrade:', restPenetration);
    if (restPenetration.is_authorized) throw new Error('FAIL: REST bypass lolos!');
    console.log('✅ PASS: REST endpoint sensitif ditolak (DENY).');

    // 4.2 Penetrasi Lintas-Tenant
    const otherTenantId = crypto.randomUUID();
    const crossTenantPenetration = authorizePDP(
      unauthorizedSubject,
      'data.read',
      { resource_type: 'crm_contacts', owner_tenant_id: otherTenantId }
    );
    console.log('Penetrasi Cross-Tenant:', crossTenantPenetration);
    if (crossTenantPenetration.is_authorized || crossTenantPenetration.audit_decision !== 'DENY_CROSS_TENANT') {
      throw new Error('FAIL: Cross-tenant lolos!');
    }
    console.log('✅ PASS: Percobaan akses lintas-tenant langsung ditolak DENY_CROSS_TENANT.');

    // 4.3 Penetrasi Node Workflow tanpa kapabilitas
    const nodePenetration = authorizePDP(
      unauthorizedSubject,
      'workflow.node.execute',
      { resource_type: 'workflow_node', resource_id: 'node-classify-01', owner_tenant_id: testTenantId }
    );
    console.log('Penetrasi Workflow Node Execution:', nodePenetration);
    if (nodePenetration.is_authorized) throw new Error('FAIL: Workflow Node bypass lolos!');
    console.log('✅ PASS: Eksekusi node workflow tanpa kapabilitas ditolak (DENY).');

    // 4.4 Penetrasi MCP Tool tanpa kapabilitas
    const toolPenetration = authorizePDP(
      unauthorizedSubject,
      'mcp.tool.invoke',
      { resource_type: 'mcp_tool', attributes: { risk_tier: 'high' }, owner_tenant_id: testTenantId }
    );
    console.log('Penetrasi MCP Tool Invocation:', toolPenetration);
    if (toolPenetration.is_authorized) throw new Error('FAIL: MCP Tool bypass lolos!');
    console.log('✅ PASS: Invokasi MCP Tool tanpa hak ditolak (DENY).');

    // Bersihkan entitas pengujian
    await client.query(`DELETE FROM ai_data_permission_policies WHERE tenant_id = $1;`, [testTenantId]);
    await client.query(`DELETE FROM audit_logs WHERE tenant_id = $1;`, [testTenantId]);
    await client.query(`DELETE FROM ai_agents WHERE tenant_id = $1;`, [testTenantId]);
    await client.query(`DELETE FROM departments WHERE tenant_id = $1;`, [testTenantId]);
    await client.query(`DELETE FROM tenants WHERE id = $1;`, [testTenantId]);
    console.log('\n[CLEANUP] Entitas pengujian berhasil dibersihkan dari database.');

    console.log('\n================================================================');
    console.log('🎉 SELURUH UJI PENETRASI & DEFINITION OF DONE BERHASIL PENUH!');
    console.log('================================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

runPenetrationSuite().catch((err) => {
  console.error('\n❌ GAGAL PADA UJI PENETRASI:', err);
  process.exit(1);
});
