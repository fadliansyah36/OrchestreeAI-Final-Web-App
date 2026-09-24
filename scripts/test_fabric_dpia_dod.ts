import pg from 'pg';
import dotenv from 'dotenv';
import { EnterpriseService } from '../src/server/enterpriseService';
import { encryptFabricCredentials, decryptFabricCredentials } from '../src/server/fabricKms';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const enterpriseService = new EnterpriseService(pool);

async function runDoDTests() {
  console.log('=== MEMULAI TEST DEFINITION OF DONE (DoD): INTEGRATION FABRIC & DPIA GATING ===\n');

  // 1. Ambil atau siapkan tenant Enterprise
  const tenantRes = await pool.query(`
    SELECT t.id, t.display_name, sp.plan_code, sp.tier_level
    FROM tenants t
    LEFT JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
    ORDER BY sp.tier_level DESC NULLS LAST
    LIMIT 1
  `);

  if (tenantRes.rows.length === 0) {
    throw new Error('Tidak ada tenant di database.');
  }

  const tenantId = tenantRes.rows[0].id;
  console.log(`[SETUP] Menggunakan tenant: ${tenantId} (Plan: ${tenantRes.rows[0].plan_code || 'N/A'}, Tier: ${tenantRes.rows[0].tier_level})`);

  // Pastikan tenant memiliki tier ENTERPRISE untuk pengujian ini
  const entPlanRes = await pool.query(`SELECT id FROM subscription_plans WHERE plan_code = 'ENTERPRISE' LIMIT 1`);
  if (entPlanRes.rows.length > 0) {
    await pool.query(`UPDATE tenants SET subscription_plan_id = $1 WHERE id = $2`, [entPlanRes.rows[0].id, tenantId]);
    console.log('[SETUP] Tenant dipastikan aktif pada paket ENTERPRISE (Tier 3).\n');
  }

  const testConnectorCode = `ERP_SAP_DOD_${Date.now()}`;

  // TEST 1: Pembuatan konektor dengan enkripsi KMS per-koneksi
  console.log('[TEST 1] Membuat konektor Fabric baru dengan kredensial rahasia (KMS Envelope Encryption)...');
  const secretCreds = {
    apiKey: 'sk-prod-sap-hana-enterprise-9998124',
    apiSecret: 'sec-super-classified-corp-vault-key',
    mtlsCertFingerprint: 'SHA256:9A8B7C6D5E4F3A2B1C0D',
  };

  const createdConn = await enterpriseService.createFabricConnector(tenantId, {
    connector_code: testConnectorCode,
    connector_name: 'SAP S/4HANA Enterprise ERP Core',
    connector_type: 'ERP',
    auth_type: 'API_KEY',
    credentials: secretCreds,
    config: {
      endpoint_url: 'https://erp.corp.internal/sap/odata/v4',
      batch_size: 500,
    },
  });

  console.log('✓ Konektor berhasil dibuat:');
  console.log(`  - ID: ${createdConn.id}`);
  console.log(`  - Status Awal: ${createdConn.status} (Wajib DRAFT, bukan CONNECTED)`);
  console.log(`  - DPIA Status: ${createdConn.dpia_status}`);
  console.log(`  - KMS Key ID: ${createdConn.credential_key_id}`);
  console.log(`  - Has Credentials: ${createdConn.has_credentials}`);

  if (createdConn.status === 'CONNECTED' || createdConn.status === 'ACTIVE') {
    throw new Error('GAGAL: Konektor tidak boleh langsung berstatus CONNECTED saat baru dibuat!');
  }
  if (!createdConn.credential_key_id) {
    throw new Error('GAGAL: credential_key_id KMS tidak terisi!');
  }

  // Verifikasi di DB bahwa kredensial terenkripsi (tidak tersimpan plaintext)
  const dbRaw = await pool.query(
    `SELECT credentials_encrypted FROM integration_fabric_connectors WHERE id = $1`,
    [createdConn.id]
  );
  const encDb = dbRaw.rows[0].credentials_encrypted;
  if (!encDb || encDb.includes('sk-prod-sap-hana') || encDb.includes('sec-super-classified')) {
    throw new Error('GAGAL: Kredensial tersimpan dalam bentuk plaintext di database!');
  }
  console.log('✓ Verifikasi Database: Kredensial tersimpan terenkripsi dengan aman via KMS envelope.\n');

  // TEST 2: Uji Coba Penolakan Aktivasi Tanpa DPIA
  console.log('[TEST 2] Uji Coba: Mencoba mengaktifkan konektor TANPA dokumen DPIA sama sekali...');
  let activationRejectedWithoutDpia = false;
  try {
    await enterpriseService.activateFabricConnector(tenantId, createdConn.id);
  } catch (err: any) {
    console.log(`✓ Aktivasi DITOLAK sistem sebagaimana mestinya:`);
    console.log(`  - Pesan Error: "${err.message}"`);
    console.log(`  - Kode Error: ${err.code}`);
    if (err.code === 'DPIA_INCOMPLETE' || err.message.includes('DPIA_INCOMPLETE')) {
      activationRejectedWithoutDpia = true;
    }
  }

  if (!activationRejectedWithoutDpia) {
    throw new Error('GAGAL: Sistem mengizinkan aktivasi tanpa catatan DPIA!');
  }
  console.log('✓ [DoD PASSED]: Koneksi Fabric tanpa DPIA ditolak sistem secara tegas.\n');

  // TEST 3: Uji Coba Penolakan Aktivasi Dengan DPIA Tidak Lengkap
  console.log('[TEST 3] Uji Coba: Mendaftarkan DPIA TIDAK LENGKAP (is_complete = false, DPO kosong)...');
  await enterpriseService.createOrUpdateDpia(tenantId, createdConn.id, {
    assessment_title: 'DPIA Sementara SAP',
    data_controller_name: 'PT Enterprise Corp',
    data_protection_officer: '', // Kosong!
    processing_purpose: '', // Kosong!
    data_categories: [], // Kosong!
    security_measures_description: '',
    status: 'DRAFT',
    is_complete: false,
  });

  let activationRejectedIncomplete = false;
  try {
    await enterpriseService.activateFabricConnector(tenantId, createdConn.id);
  } catch (err: any) {
    console.log(`✓ Aktivasi DITOLAK sistem karena DPIA tidak lengkap:`);
    console.log(`  - Pesan Error: "${err.message}"`);
    if (err.code === 'DPIA_INCOMPLETE' || err.message.includes('DPIA_INCOMPLETE')) {
      activationRejectedIncomplete = true;
    }
  }

  if (!activationRejectedIncomplete) {
    throw new Error('GAGAL: Sistem mengizinkan aktivasi dengan formulir DPIA yang belum lengkap!');
  }
  console.log('✓ [DoD PASSED]: Koneksi Fabric dengan DPIA tidak lengkap ditolak sistem.\n');

  // TEST 4: Pengisian Dokumen DPIA Lengkap & Disetujui DPO Resmi
  console.log('[TEST 4] Mengisi formulir DPIA Lengkap dan disetujui (APPROVED) oleh DPO...');
  const approvedDpia = await enterpriseService.createOrUpdateDpia(tenantId, createdConn.id, {
    assessment_title: 'Penilaian Dampak Perlindungan Data (DPIA) Integrasi SAP Core ERP',
    data_controller_name: 'PT Orchestree Nusantara Teknologi',
    data_protection_officer: 'Arya Wiryawan, CIPP/E, CIPM (Lead DPO)',
    processing_purpose: 'Sinkronisasi data transaksional penjualan, persediaan gudang, dan buku besar akuntansi korporat secara federasi.',
    data_categories: [
      'TRANSACTIONAL_INVOICES',
      'CUSTOMER_ORDER_RECORDS',
      'SUPPLIER_PAYMENTS',
      'FINANCIAL_LEDGER_ENTRIES'
    ],
    data_subject_categories: ['CUSTOMERS', 'EMPLOYEES', 'VENDORS'],
    transfer_basis: 'INTERNAL_LEGITIMATE_INTEREST_AND_CONTRACTUAL_NECESSITY',
    security_measures_description: 'TLS 1.3 in-transit, KMS Envelope Encryption dengan PBKDF2-HMAC-SHA256 at-rest, isolasi multi-tenant RLS Supabase, audit logging immutable.',
    risk_level: 'MEDIUM',
    residual_risk: 'LOW',
    status: 'APPROVED',
    is_complete: true,
    review_notes: 'DPIA telah diverifikasi dan disetujui tanpa catatan pengecualian. Keamanan enkripsi KMS per-koneksi terverifikasi.',
  });

  console.log('✓ Dokumen DPIA berhasil disimpan & disetujui:');
  console.log(`  - DPIA ID: ${approvedDpia.id}`);
  console.log(`  - DPO: ${approvedDpia.data_protection_officer}`);
  console.log(`  - Status: ${approvedDpia.status}`);
  console.log(`  - Is Complete: ${approvedDpia.is_complete}\n`);

  // TEST 5: Aktivasi Konektor Setelah DPIA Lengkap
  console.log('[TEST 5] Mengaktifkan konektor Fabric setelah DPIA lengkap dan APPROVED...');
  const activationResult = await enterpriseService.activateFabricConnector(tenantId, createdConn.id);
  console.log('✓ Aktivasi BERHASIL:');
  console.log(`  - Status Baru: ${activationResult.status}`);
  console.log(`  - Pesan: "${activationResult.message}"`);
  console.log(`  - DPO Verifikator: ${activationResult.dpia_summary.dpo}\n`);

  if (activationResult.status !== 'CONNECTED') {
    throw new Error('GAGAL: Status konektor harus CONNECTED setelah aktivasi!');
  }

  // TEST 6: Streaming Sinkronisasi & Audit Log Transaksional
  console.log('[TEST 6] Memicu sinkronisasi streaming data Fabric dan memvalidasi integration_fabric_sync_logs...');
  const syncResult = await enterpriseService.syncFabricStream(tenantId, testConnectorCode, 'MANUAL');
  console.log('✓ Sinkronisasi berhasil dieksekusi:');
  console.log(`  - Sync Log ID: ${syncResult.sync_log_id}`);
  console.log(`  - Records Ingested: ${syncResult.records_synced}`);
  console.log(`  - Latency: ${syncResult.latency_ms} ms`);

  const syncLogs = await enterpriseService.listFabricSyncLogs(tenantId, createdConn.id, 5);
  console.log(`✓ Ditemukan ${syncLogs.length} catatan log audit sinkronisasi di database:`);
  console.log(`  - Log ID: ${syncLogs[0].id}`);
  console.log(`  - Sync Type: ${syncLogs[0].sync_type}`);
  console.log(`  - Status: ${syncLogs[0].status}`);
  console.log(`  - Records Ingested: ${syncLogs[0].records_ingested}\n`);

  if (syncLogs.length === 0 || syncLogs[0].status !== 'SUCCESS') {
    throw new Error('GAGAL: Log sinkronisasi tidak tercatat di tabel integration_fabric_sync_logs!');
  }

  // TEST 7: Dekripsi Kredensial KMS & Deteksi Tampering (Anti-Tamper)
  console.log('[TEST 7] Menguji dekripsi KMS terisolasi dan validasi keaslian (anti-tamper)...');
  const decrypted = await enterpriseService.getDecryptedCredentials(tenantId, createdConn.id);
  console.log('✓ Dekripsi kredensial berhasil dengan integritas terverifikasi:');
  console.log(`  - API Key Match: ${decrypted.apiKey === secretCreds.apiKey}`);
  console.log(`  - API Secret Match: ${decrypted.apiSecret === secretCreds.apiSecret}`);

  if (decrypted.apiKey !== secretCreds.apiKey) {
    throw new Error('GAGAL: Hasil dekripsi tidak cocok dengan kredensial asli!');
  }

  // Uji coba manipulasi (tampering): Ubah payload terenkripsi di DB dan pastikan ditolak!
  console.log('  -> Menguji deteksi sabotase (tamper detection): Merusak 1 karakter payload terenkripsi...');
  const rawEnc = await pool.query(
    `SELECT credentials_encrypted FROM integration_fabric_connectors WHERE id = $1`,
    [createdConn.id]
  );
  const tamperedPayload = rawEnc.rows[0].credentials_encrypted.slice(0, -4) + 'AAAA';

  let tamperCaught = false;
  try {
    decryptFabricCredentials(tamperedPayload, tenantId, createdConn.id, createdConn.credential_key_id);
  } catch (err: any) {
    console.log(`  ✓ Tamper BERHASIL dideteksi oleh KMS: "${err.message}"`);
    tamperCaught = true;
  }

  if (!tamperCaught) {
    throw new Error('GAGAL: Sistem tidak mendeteksi tampering pada payload terenkripsi KMS!');
  }
  console.log('✓ [DoD PASSED]: Envelope KMS tahan manipulasi dan melindungi integritas kredensial per koneksi.\n');

  console.log('========================================================================');
  console.log('SELURUH TEST DEFINITION OF DONE (DoD) TELAH BERHASIL DAN LULUS 100%!');
  console.log('========================================================================');
}

runDoDTests()
  .catch((err) => {
    console.error('\n❌ DoD TEST GAGAL:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
