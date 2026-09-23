import crypto from 'crypto';

/**
 * OrchestreeAI Fabric Connector KMS Envelope Encryption (PRD v2.2 Bagian 3.4, 3.5, 12)
 *
 * Menerapkan enkripsi amplop per-koneksi Fabric:
 * - Mengisolasi kredensial per konektor dan per tenant.
 * - PBKDF2-HMAC-SHA256 (100,000 iterasi) + Authenticated Encryption (Encrypt-then-MAC).
 * - Mendeteksi upaya tampering secara matematis dengan perbandingan timing-safe.
 */

function getFabricKmsMasterKey(): Buffer {
  const key =
    process.env.FABRIC_KMS_MASTER_KEY ||
    process.env.KMS_MASTER_KEY ||
    process.env.MTPROTO_KMS_MASTER_KEY ||
    process.env.APP_SECRET_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    'orchestree-fabric-kms-master-enterprise-v2-seed';
  return Buffer.from(key, 'utf-8');
}

export function deriveConnectorKeys(
  tenantId: string,
  connectorId: string,
  keyId: string,
  salt: Buffer
): { kEnc: Buffer; kMac: Buffer } {
  const masterKey = getFabricKmsMasterKey();
  const context = Buffer.from(`orchestree:fabric:tenant:${tenantId}:conn:${connectorId}:kid:${keyId}`, 'utf-8');
  const password = Buffer.concat([masterKey, context]);

  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
  return {
    kEnc: derived.subarray(0, 32),
    kMac: derived.subarray(32, 64),
  };
}

function generateKeystream(key: Buffer, nonce: Buffer, length: number): Buffer {
  const chunks: Buffer[] = [];
  let counter = 0;
  let accumulated = 0;

  while (accumulated < length) {
    const counterBuf = Buffer.alloc(4);
    counterBuf.writeUInt32BE(counter, 0);
    const block = crypto.createHmac('sha256', key).update(Buffer.concat([nonce, counterBuf])).digest();
    chunks.push(block);
    accumulated += block.length;
    counter++;
  }

  return Buffer.concat(chunks).subarray(0, length);
}

export interface EncryptedFabricEnvelope {
  encryptedPayload: string;
  keyId: string;
}

/**
 * Mengenkripsi kamus kredensial koneksi Fabric dengan amplop KMS per-koneksi.
 */
export function encryptFabricCredentials(
  credentials: Record<string, any>,
  tenantId: string,
  connectorId: string,
  customKeyId?: string
): EncryptedFabricEnvelope {
  const keyId = customKeyId || `kid-fabric-${crypto.randomBytes(8).toString('hex')}`;
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(16);

  const { kEnc, kMac } = deriveConnectorKeys(tenantId, connectorId, keyId, salt);

  const plaintextBuf = Buffer.from(JSON.stringify(credentials), 'utf-8');
  const keystream = generateKeystream(kEnc, nonce, plaintextBuf.length);

  const ciphertext = Buffer.alloc(plaintextBuf.length);
  for (let i = 0; i < plaintextBuf.length; i++) {
    ciphertext[i] = plaintextBuf[i] ^ keystream[i];
  }

  // Authenticated Encryption tag: HMAC-SHA256(kMac, salt + nonce + ciphertext)
  const macPayload = Buffer.concat([salt, nonce, ciphertext]);
  const macTag = crypto.createHmac('sha256', kMac).update(macPayload).digest();

  const envelope = {
    v: 2,
    kid: keyId,
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    ct: ciphertext.toString('base64'),
    mac: macTag.toString('base64'),
  };

  const rawJson = JSON.stringify(envelope);
  const encryptedPayload = Buffer.from(rawJson, 'utf-8').toString('base64');

  return {
    encryptedPayload,
    keyId,
  };
}

/**
 * Mendekripsi kredensial koneksi Fabric dan memvalidasi keaslian (anti-tampering).
 */
export function decryptFabricCredentials(
  encryptedPayload: string,
  tenantId: string,
  connectorId: string,
  expectedKeyId?: string
): Record<string, any> {
  let envelope: any;
  try {
    const rawJson = Buffer.from(encryptedPayload, 'base64').toString('utf-8');
    envelope = JSON.parse(rawJson);
  } catch (err: any) {
    throw new Error(`Payload enkripsi KMS tidak valid atau rusak: ${err.message}`);
  }

  const keyId = expectedKeyId || envelope.kid;
  if (!keyId) {
    throw new Error('Key ID (kid) tidak ditemukan pada amplop enkripsi KMS.');
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const nonce = Buffer.from(envelope.nonce, 'base64');
  const ciphertext = Buffer.from(envelope.ct, 'base64');
  const expectedMac = Buffer.from(envelope.mac, 'base64');

  const { kEnc, kMac } = deriveConnectorKeys(tenantId, connectorId, keyId, salt);

  // Verifikasi integritas MAC sebelum dekripsi
  const macPayload = Buffer.concat([salt, nonce, ciphertext]);
  const actualMac = crypto.createHmac('sha256', kMac).update(macPayload).digest();

  if (actualMac.length !== expectedMac.length || !crypto.timingSafeEqual(actualMac, expectedMac)) {
    throw new Error('Integritas data terlanggar (KMS MAC mismatch / deteksi tamper payload kredensial)');
  }

  const keystream = generateKeystream(kEnc, nonce, ciphertext.length);
  const plaintextBuf = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plaintextBuf[i] = ciphertext[i] ^ keystream[i];
  }

  try {
    return JSON.parse(plaintextBuf.toString('utf-8'));
  } catch (err: any) {
    throw new Error(`Dekripsi berhasil namun payload bukan JSON valid: ${err.message}`);
  }
}

/**
 * Melakukan rotasi kunci enkripsi amplop KMS:
 * 1. Mendekripsi payload lama menggunakan oldKeyId (memastikan data lama tetap terbaca).
 * 2. Menghasilkan newKeyId (atau customNewKeyId).
 * 3. Mengenksipsi ulang (re-wrapping) payload dengan kunci turunan baru.
 * 4. Memverifikasi round-trip dekripsi kunci baru menghasilkan data yang identik 100%.
 */
export function rotateFabricCredentials(
  encryptedPayload: string,
  tenantId: string,
  connectorId: string,
  expectedOldKeyId?: string,
  customNewKeyId?: string
): {
  newEncryptedPayload: string;
  previousKeyId: string;
  newKeyId: string;
  decryptedVerification: Record<string, any>;
} {
  // 1. Dekripsi data lama (memastikan data lama tetap terbaca dan valid)
  const decrypted = decryptFabricCredentials(encryptedPayload, tenantId, connectorId, expectedOldKeyId);
  const rawJson = Buffer.from(encryptedPayload, 'base64').toString('utf-8');
  const oldEnvelope = JSON.parse(rawJson);
  const previousKeyId = expectedOldKeyId || oldEnvelope.kid;

  // 2. Enkripsi ulang dengan Key ID baru
  const newKeyId = customNewKeyId || `kid-fabric-rot-${crypto.randomBytes(8).toString('hex')}`;
  const newEnvelope = encryptFabricCredentials(decrypted, tenantId, connectorId, newKeyId);

  // 3. Verifikasi round-trip dekripsi payload baru
  const reDecrypted = decryptFabricCredentials(newEnvelope.encryptedPayload, tenantId, connectorId, newKeyId);
  const roundtripMatches = JSON.stringify(decrypted) === JSON.stringify(reDecrypted);
  if (!roundtripMatches) {
    throw new Error('KMS Key Rotation Verification Failed: Payload hasil rotasi tidak cocok dengan data asli!');
  }

  return {
    newEncryptedPayload: newEnvelope.encryptedPayload,
    previousKeyId,
    newKeyId,
    decryptedVerification: reDecrypted,
  };
}
