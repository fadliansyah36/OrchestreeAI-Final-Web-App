/**
 * Test Definition of Done: Company Context Events & Signal Correlator
 * PRD v2.2 Bagian 8.13.1
 * 
 * Verifikasi:
 * Empat sinyal lintas sistem berbeda menghasilkan satu company_context_events
 * gabungan yang dapat ditelusuri ke masing-masing sumber.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import crypto from 'crypto';
import { EnterpriseService } from '../src/server/enterpriseService';

async function runDoDVerification() {
  console.log('=== Memulai Verifikasi Definition of Done: Korelator Sinyal Lintas Sistem ===\n');

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      (process.env.DATABASE_URL || ''),
    ssl: { rejectUnauthorized: false }
  });

  const tenantRes = await pool.query(
    "SELECT t.id FROM tenants t JOIN subscription_plans sp ON t.subscription_plan_id = sp.id WHERE sp.tier_level = 3 LIMIT 1"
  );
  if (tenantRes.rows.length === 0) {
    throw new Error('Tenant dengan paket Enterprise (tier 3) tidak ditemukan dalam basis data Supabase.');
  }
  const tenantId = tenantRes.rows[0].id;
  console.log(`[1] Menggunakan Tenant ID aktif: ${tenantId}`);

  // 4 Sinyal dari 4 sistem berbeda dan 3 tipe sumber ('Native', 'Synced', 'Uploaded')
  const signal1 = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    source_type: 'Native' as const,
    source_system: 'ORCHESTREE_CRM',
    signal_type: 'DEAL_ESCALATION_HIGH_VALUE',
    title: 'Eskalasi Peluang Penjualan Korporat PT Mega Global Senilai Rp 4.2 Miliar',
    payload: { deal_value: 4200000000, client_tier: 'VIP_ENTERPRISE' },
    metadata: { pipeline_stage: 'PROPOSAL_NEGOTIATION' },
    source_ref_id: 'CRM-DEAL-8821'
  };

  const signal2 = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    source_type: 'Synced' as const,
    source_system: 'ERP_SAP_SUPPLY_CHAIN',
    signal_type: 'SHIPMENT_BACKORDER_DELAY',
    title: 'Keterlambatan Pengiriman Batch Server Rack ke Gudang Cikarang',
    payload: { batch_code: 'SAP-WH-9902', delay_days: 4 },
    metadata: { warehouse_id: 'WH-CKR-02' },
    source_ref_id: 'SAP-DEL-1049'
  };

  const signal3 = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    source_type: 'Uploaded' as const,
    source_system: 'ADMIN_LEGAL_STORE',
    signal_type: 'ENTERPRISE_SLA_PENALTY_CLAUSE',
    title: 'Adendum Kontrak Pengadaan Q3: Klausul Denda Keterlambatan Pengiriman 2% per Hari',
    payload: { penalty_rate_daily: 0.02, max_liability_cap: 0.15 },
    metadata: { document_type: 'CONTRACT_ADDENDUM' },
    source_ref_id: 'DOC-PDF-LEGAL-771'
  };

  const signal4 = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    source_type: 'Synced' as const,
    source_system: 'HRIS_WORKFORCE_OPS',
    signal_type: 'LOGISTICS_TEAM_CAPACITY_BOTTLENECK',
    title: 'Lonjakan Beban Kerja Tim Logistik Gudang Akibat Cuti Bersama',
    payload: { staff_absent_pct: 38, open_shift_count: 6 },
    metadata: { shift_code: 'SHIFT-MORNING' },
    source_ref_id: 'HRIS-ATTN-330'
  };

  const fourSignals = [signal1, signal2, signal3, signal4];

  console.log(`[2] Menyimpan 4 sinyal lintas sistem ke tabel 'company_context_signals'...`);
  for (const s of fourSignals) {
    await pool.query(
      `INSERT INTO company_context_signals (
        id, tenant_id, source_type, source_system, signal_type,
        title, payload, metadata, source_ref_id, ingested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (id) DO NOTHING`,
      [
        s.id, s.tenant_id, s.source_type, s.source_system, s.signal_type,
        s.title, JSON.stringify(s.payload), JSON.stringify(s.metadata), s.source_ref_id
      ]
    );
    console.log(`    ✓ Ingested [${s.source_type}] dari ${s.source_system} (Ref: ${s.source_ref_id}): ${s.title}`);
  }

  console.log(`\n[3] Menjalankan korelasi sinyal lintas sistem melalui Enterprise Service...`);
  const enterpriseService = new EnterpriseService(pool);

  const correlatedEvent = await enterpriseService.correlateCrossSystemSignals(
    tenantId,
    fourSignals.map(s => ({
      id: s.id,
      source_type: s.source_type,
      source_system: s.source_system,
      signal_type: s.signal_type,
      title: s.title,
      payload: s.payload,
      metadata: s.metadata,
      source_ref_id: s.source_ref_id
    })),
    'Penyelarasan SLA Pengadaan & Mitigasi Risiko Keterlambatan'
  );

  console.log(`\n[4] Hasil Korelasi:`);
  console.log(`    - ID Event: ${correlatedEvent.id}`);
  console.log(`    - Judul: ${correlatedEvent.title}`);
  console.log(`    - Skor Korelasi: ${correlatedEvent.correlation_score}`);
  console.log(`    - Klasifikasi Tipe Sumber:`, correlatedEvent.source_types);
  console.log(`    - Ringkasan Eksekutif: ${correlatedEvent.summary}`);

  // Verifikasi ke database langsung
  console.log(`\n[5] Memverifikasi persistensi langsung di tabel 'company_context_events'...`);
  const verifyRes = await pool.query(
    "SELECT * FROM company_context_events WHERE id = $1",
    [correlatedEvent.id]
  );
  if (verifyRes.rows.length === 0) {
    throw new Error('Event korelasi tidak ditemukan di database Supabase!');
  }
  const savedRow = verifyRes.rows[0];
  const sourceSignalsInDb = typeof savedRow.source_signals === 'string' 
    ? JSON.parse(savedRow.source_signals) 
    : savedRow.source_signals;

  console.log(`    ✓ 1 Event gabungan tersimpan di Supabase.`);
  console.log(`    ✓ Memuat ${sourceSignalsInDb.length} sinyal sumber yang dapat ditelusuri:`);

  const sourcesMap: Record<string, any> = {};
  for (const sig of sourceSignalsInDb) {
    sourcesMap[sig.source_system] = sig;
    console.log(`      * [${sig.source_type}] Sistem: ${sig.source_system} | Ref: ${sig.source_ref_id} | Sinyal: ${sig.signal_type}`);
  }

  // Verifikasi 4 sinyal lengkap
  if (sourceSignalsInDb.length !== 4) {
    throw new Error(`DOD GAGAL: Jumlah sinyal sumber adalah ${sourceSignalsInDb.length}, diharapkan tepat 4!`);
  }
  if (!sourcesMap['ORCHESTREE_CRM'] || sourcesMap['ORCHESTREE_CRM'].source_ref_id !== 'CRM-DEAL-8821') {
    throw new Error('DOD GAGAL: Sinyal CRM tidak dapat ditelusuri!');
  }
  if (!sourcesMap['ERP_SAP_SUPPLY_CHAIN'] || sourcesMap['ERP_SAP_SUPPLY_CHAIN'].source_ref_id !== 'SAP-DEL-1049') {
    throw new Error('DOD GAGAL: Sinyal ERP tidak dapat ditelusuri!');
  }
  if (!sourcesMap['ADMIN_LEGAL_STORE'] || sourcesMap['ADMIN_LEGAL_STORE'].source_ref_id !== 'DOC-PDF-LEGAL-771') {
    throw new Error('DOD GAGAL: Sinyal Uploaded Dokumen tidak dapat ditelusuri!');
  }
  if (!sourcesMap['HRIS_WORKFORCE_OPS'] || sourcesMap['HRIS_WORKFORCE_OPS'].source_ref_id !== 'HRIS-ATTN-330') {
    throw new Error('DOD GAGAL: Sinyal HRIS tidak dapat ditelusuri!');
  }

  // Verifikasi update foreign key di company_context_signals
  const linkedSignals = await pool.query(
    "SELECT id, source_system, correlated_event_id FROM company_context_signals WHERE correlated_event_id = $1",
    [correlatedEvent.id]
  );
  console.log(`    ✓ ${linkedSignals.rows.length} sinyal di 'company_context_signals' berhasil dihubungkan ke event korelasi (correlated_event_id set).`);

  console.log('\n=============================================================================');
  console.log('✅ DEFINITION OF DONE BERHASIL DIPENUHI:');
  console.log('   Empat sinyal lintas sistem berbeda menghasilkan satu company_context_events');
  console.log('   gabungan yang dapat ditelusuri ke masing-masing sumber (100% Traceable).');
  console.log('=============================================================================\n');

  await pool.end();
}

runDoDVerification().catch(err => {
  console.error('DoD Verification Failed:', err);
  process.exit(1);
});
