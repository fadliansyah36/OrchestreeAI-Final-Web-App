import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { EnterpriseService } from '../src/server/enterpriseService';
import {
  encryptFabricCredentials,
  decryptFabricCredentials,
  rotateFabricCredentials,
} from '../src/server/fabricKms';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

export async function runKmsRotationRoundtripTest(): Promise<void> {
  console.log('================================================================');
  console.log('UJI ROTASI KUNCI KMS END-TO-END (ENVELOPE ENCRYPTION ROUND-TRIP)');
  console.log('PRD v2.2 Bagian 3.4, 3.5, 12: Zero Data Loss & Legacy Readability');
  console.log('================================================================\n');

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const enterpriseService = new EnterpriseService(pool);
  const testTenantId = '7eb74828-dd1b-438f-962d-2b3174c99836'; // Tenant Enterprise terdaftar
  const testConnectorId = crypto.randomUUID();
  const initialKeyId = `kid-fabric-init-${crypto.randomBytes(6).toString('hex')}`;
  const rotatedKeyId = `kid-fabric-rot-${crypto.randomBytes(6).toString('hex')}`;

  const originalCredentials = {
    sap_client_id: 'CORP_SAP_PROD_99812',
    sap_client_secret: 'sec_live_99f8482abcc910192847162947192847162984',
    mtls_private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----',
    refresh_token: 'rtoken_live_orchestree_corp_enterprise_vault_01928',
    environment: 'production',
  };

  try {
    // 1. SETUP: Buat konektor Fabric baru dengan kunci awal initialKeyId
    console.log('[STEP 1] Menyiapkan konektor dengan enkripsi amplop KMS awal...');
    const initialEnvelope = encryptFabricCredentials(
      originalCredentials,
      testTenantId,
      testConnectorId,
      initialKeyId
    );

    await pool.query(
      `
      INSERT INTO integration_fabric_connectors (
        id, tenant_id, connector_code, connector_name, connector_type,
        status, auth_type, credential_key_id, credentials_encrypted,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'ERP', 'DRAFT', 'API_KEY', $5, $6, now(), now())
    `,
      [
        testConnectorId,
        testTenantId,
        `ROT_TEST_${Date.now()}`,
        'Test ERP KMS Rotation Connector',
        initialKeyId,
        initialEnvelope.encryptedPayload,
      ]
    );

    console.log(`✓ Konektor dibuat: ${testConnectorId}`);
    console.log(`  - Kunci Awal (Key ID 1): ${initialKeyId}`);
    console.log(`  - Ciphertext Awal (Bytes): ${initialEnvelope.encryptedPayload.length}`);

    // 2. VERIFIKASI SEBELUM ROTASI: Data terbaca normal dengan kunci awal
    console.log('\n[STEP 2] Memverifikasi data awal terbaca sempurna dengan Key ID 1...');
    const decryptedInitial = decryptFabricCredentials(
      initialEnvelope.encryptedPayload,
      testTenantId,
      testConnectorId,
      initialKeyId
    );
    if (JSON.stringify(decryptedInitial) !== JSON.stringify(originalCredentials)) {
      throw new Error('Dekripsi awal gagal: data tidak cocok dengan aslinya!');
    }
    console.log('✓ Dekripsi kunci awal berhasil dan identik 100% dengan plaintext asli.');

    // 3. ROTASI KUNCI KMS: Panggil rotasi nyata melalui EnterpriseService
    console.log('\n[STEP 3] Menjalankan rotasi kunci KMS (Re-wrap ke Key ID 2)...');
    const rotationResult = await enterpriseService.rotateConnectorKmsKey(
      testTenantId,
      testConnectorId,
      rotatedKeyId
    );

    console.log('✓ Hasil Rotasi:');
    console.log(`  - Status: ${rotationResult.status}`);
    console.log(`  - Previous Key ID: ${rotationResult.previous_key_id}`);
    console.log(`  - New Key ID: ${rotationResult.new_key_id}`);
    console.log(`  - Rotated At: ${rotationResult.rotated_at}`);
    console.log(`  - Roundtrip Verified: ${rotationResult.roundtrip_verified}`);

    // 4. VERIFIKASI DATABASE PASCA-ROTASI
    console.log('\n[STEP 4] Memverifikasi update state pada Supabase database...');
    const dbRes = await pool.query(
      `SELECT credential_key_id, credentials_encrypted FROM integration_fabric_connectors WHERE id = $1`,
      [testConnectorId]
    );
    const updatedConn = dbRes.rows[0];

    if (updatedConn.credential_key_id !== rotatedKeyId) {
      throw new Error(
        `Database mismatch: credential_key_id seharusnya '${rotatedKeyId}', ditemukan '${updatedConn.credential_key_id}'`
      );
    }
    if (updatedConn.credentials_encrypted === initialEnvelope.encryptedPayload) {
      throw new Error('Database error: credentials_encrypted tidak berubah setelah rotasi!');
    }
    console.log('✓ Database terupdate dengan credential_key_id dan ciphertext terenkripsi baru.');

    // 5. VERIFIKASI ROUND-TRIP KUNCI BARU
    console.log('\n[STEP 5] Memverifikasi dekripsi dengan kunci baru (Key ID 2)...');
    const decryptedRotated = decryptFabricCredentials(
      updatedConn.credentials_encrypted,
      testTenantId,
      testConnectorId,
      rotatedKeyId
    );

    if (JSON.stringify(decryptedRotated) !== JSON.stringify(originalCredentials)) {
      throw new Error('Dekripsi pasca-rotasi gagal: kredensial tidak cocok dengan plaintext awal!');
    }
    console.log('✓ Plaintext pasca-rotasi COCOK 100% dengan kredensial asli:');
    console.log(`  - sap_client_id: ${decryptedRotated.sap_client_id}`);
    console.log(`  - sap_client_secret: [TERLINDUNGI - Cocok Hash]`);
    console.log(`  - mtls_private_key: [TERLINDUNGI - Cocok Hash]`);

    // 6. VERIFIKASI PEMBACAAN DATA LAMA (LEGACY READABILITY)
    console.log('\n[STEP 6] Uji Legacy Readability: Memastikan payload lama tetap terbaca...');
    const legacyReadCheck = decryptFabricCredentials(
      initialEnvelope.encryptedPayload,
      testTenantId,
      testConnectorId,
      initialKeyId
    );
    if (JSON.stringify(legacyReadCheck) !== JSON.stringify(originalCredentials)) {
      throw new Error('Legacy Readability Terlanggar: Data lama gagal didekripsi!');
    }
    console.log('✓ Payload lama tetap 100% terbaca dengan key ID lamanya (Zero Data Loss).');

    // 7. VERIFIKASI PENDETEKSIAN TAMPER (ANTI-SABOTASE) PADA CIPHERTEXT ROTASI
    console.log('\n[STEP 7] Uji Tamper Detection pada ciphertext rotasi baru...');
    const rawJson = Buffer.from(updatedConn.credentials_encrypted, 'base64').toString('utf-8');
    const envelopeObj = JSON.parse(rawJson);

    // Rusak 1 karakter pada ciphertext
    const ctBuf = Buffer.from(envelopeObj.ct, 'base64');
    ctBuf[0] ^= 0xff; // Invert first byte
    envelopeObj.ct = ctBuf.toString('base64');
    const tamperedPayload = Buffer.from(JSON.stringify(envelopeObj)).toString('base64');

    let tamperDetected = false;
    try {
      decryptFabricCredentials(tamperedPayload, testTenantId, testConnectorId, rotatedKeyId);
    } catch (err: any) {
      tamperDetected = true;
      console.log(`✓ Tamper terdeteksi oleh KMS: "${err.message}"`);
    }

    if (!tamperDetected) {
      throw new Error('Gawat: Manipulasi ciphertext tidak terdeteksi oleh KMS MAC!');
    }

    // 8. VERIFIKASI CATATAN AUDIT LOG
    console.log('\n[STEP 8] Memverifikasi immutable audit log rotasi kunci di Supabase...');
    const auditRes = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE tenant_id = $1 AND action = 'integration.fabric.kms.rotate'
       ORDER BY created_at DESC LIMIT 1`,
      [testTenantId]
    );

    if (auditRes.rows.length === 0) {
      throw new Error('Audit log untuk rotasi kunci KMS tidak ditemukan di database!');
    }

    const auditLog = auditRes.rows[0];
    console.log(`✓ Audit Log ID: ${auditLog.id}`);
    console.log(`  - Aksi: ${auditLog.action}`);
    console.log(`  - Aktor: ${auditLog.actor_type}`);
    console.log(`  - Payload After:`, auditLog.payload_after);

    console.log('\n================================================================');
    console.log('🎉 UJI ROTASI KUNCI KMS END-TO-END BERHASIL DAN LULUS 100%!');
    console.log('================================================================\n');
  } finally {
    // Bersihkan data uji dari database
    await pool.query(
      `DELETE FROM integration_fabric_connectors WHERE id = $1`,
      [testConnectorId]
    );
    await pool.end();
  }
}

// Jalankan langsung bila dieksekusi via CLI
if (process.argv[1]?.endsWith('test_kms_key_rotation_roundtrip.ts')) {
  runKmsRotationRoundtripTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
