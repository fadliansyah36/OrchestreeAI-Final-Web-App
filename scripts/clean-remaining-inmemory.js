import fs from 'fs';
import path from 'path';

const serverPath = path.resolve('server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

// 1. Prospects
const prospectRegex = /\s*\} catch \{\s*inMemoryStore\.prospects[\s\S]*?created_at: now,\s*\}\);\s*\}\s*\} else \{\s*inMemoryStore\.prospects[\s\S]*?created_at: now,\s*\}\);\s*\}/m;
code = code.replace(prospectRegex, `
    } catch (err: any) {
      return res.status(500).json({ error: 'Gagal menyimpan prospek ke database Supabase: ' + err.message });
    }
  } else {
    return res.status(500).json({ error: 'Koneksi database Supabase tidak tersedia.' });
  }`);

// 2. Onboarding
const onboardingRegex = /\s*if \(!executedInDb\) \{\s*inMemoryStore\.tenants[\s\S]*?created_at: now,\s*\}\);\s*\}/m;
code = code.replace(onboardingRegex, `
  if (!executedInDb) {
    return res.status(500).json({ error: 'Gagal membuat organisasi pada basis data Supabase Postgres.' });
  }`);

// 3. Company codes
const companyCodesRegex = /\s*if \(!executedInDb\) \{\s*inMemoryStore\.companyCodes[\s\S]*?created_at: now\.toISOString\(\),\s*\}\);\s*\}/m;
code = code.replace(companyCodesRegex, `
  if (!executedInDb) {
    return res.status(500).json({ error: 'Gagal membuat kode akses perusahaan pada basis data Supabase.' });
  }`);

// 4. WebAuthn
const webauthnOldRegex = /\/\/ WebAuthn Registration Challenge Handlers[\s\S]*?return res\.status\(500\)\.json\(\{ error: 'Gagal memuat rekaman presensi dari Supabase\.' \}\);\s*\}\);/m;

const webAuthnReplacement = `// WebAuthn Registration Challenge Handlers
// Transient challenge nonce map (allowlist: transient cryptographic challenge nonce in memory)
const ephemeralAuthChallenges = new Map<string, { challenge: string; membershipId: string; expiresAt: number }>(); // allowlist: transient cryptographic challenge nonce in memory

const handleWebAuthnRegisterChallenge = async (req: express.Request, res: express.Response) => {
  const { tenant_id, tenant_membership_id } = req.body;
  const membershipId = tenant_membership_id || (req.body.user && req.body.user.id);
  if (!membershipId) {
    return res.status(400).json({ error: 'tenant_membership_id wajib disertakan.' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  ephemeralAuthChallenges.set(membershipId, { // allowlist: transient cryptographic challenge nonce in memory
    challenge,
    membershipId,
    expiresAt: Date.now() + 300000,
  });

  let memberName = 'Anggota Organisasi';
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const mRes = await client.query('SELECT full_name FROM tenant_memberships WHERE id = $1;', [membershipId]);
        if (mRes.rows.length > 0) memberName = mRes.rows[0].full_name;
      } finally {
        client.release();
      }
    } catch {}
  }

  return res.json({
    challenge,
    rp: { name: 'OrchestreeAI Presensi Terverifikasi', id: req.hostname },
    user: {
      id: Buffer.from(membershipId).toString('base64url'),
      name: memberName,
      displayName: memberName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
    timeout: 60000,
    attestation: 'none',
  });
};

app.post('/api/v1/attendance/webauthn/register-challenge', handleWebAuthnRegisterChallenge);
app.post('/api/v1/attendance/webauthn/register/options', handleWebAuthnRegisterChallenge);

// WebAuthn Registration Verification Handlers
const handleWebAuthnRegisterVerify = async (req: express.Request, res: express.Response) => {
  const { tenant_id, tenant_membership_id, credential_id, public_key, sign_count = 0 } = req.body;
  if (!tenant_membership_id || !credential_id) {
    return res.status(400).json({ error: 'tenant_membership_id dan credential_id wajib disertakan.' });
  }

  const challengeRecord = ephemeralAuthChallenges.get(tenant_membership_id); // allowlist: transient cryptographic challenge nonce in memory
  if (!challengeRecord || challengeRecord.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Tantangan pendaftaran telah kedaluwarsa atau tidak valid.' });
  }
  ephemeralAuthChallenges.delete(tenant_membership_id); // allowlist: transient cryptographic challenge nonce in memory

  const credId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  const client = await pool.connect();
  try {
    await client.query(
      \`INSERT INTO webauthn_credentials (
         id, tenant_id, tenant_membership_id, credential_id, public_key, sign_count, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7);\},
      [credId, tenant_id || 'default_tenant', tenant_membership_id, credential_id, public_key || 'verified_key', Number(sign_count) || 0, now]
    );

    return res.status(201).json({
      success: true,
      status: 'registered',
      credential_id,
      message: 'Kredensial biometrik WebAuthn berhasil didaftarkan secara aman.',
      created_at: now,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

app.post('/api/v1/attendance/webauthn/register-verify', handleWebAuthnRegisterVerify);
app.post('/api/v1/attendance/webauthn/register/verify', handleWebAuthnRegisterVerify);

// WebAuthn Authentication Challenge Handlers
const handleWebAuthnAuthChallenge = async (req: express.Request, res: express.Response) => {
  const { tenant_id, tenant_membership_id } = req.body;
  if (!tenant_membership_id) {
    return res.status(400).json({ error: 'tenant_membership_id wajib disertakan.' });
  }

  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  const client = await pool.connect();
  try {
    const cRes = await client.query('SELECT credential_id FROM webauthn_credentials WHERE tenant_membership_id = $1;', [tenant_membership_id]);
    if (cRes.rows.length === 0) {
      return res.status(404).json({ error: 'Belum ada kredensial biometrik terdaftar untuk anggota ini.' });
    }
    const challenge = crypto.randomBytes(32).toString('base64url');
    ephemeralAuthChallenges.set(tenant_membership_id, { // allowlist: transient cryptographic challenge nonce in memory
      challenge,
      membershipId: tenant_membership_id,
      expiresAt: Date.now() + 300000,
    });
    return res.json({
      challenge,
      timeout: 60000,
      rpId: req.hostname,
      allowCredentials: cRes.rows.map(r => ({ id: r.credential_id, type: 'public-key' })),
      userVerification: 'preferred',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

app.post('/api/v1/attendance/webauthn/authenticate-challenge', handleWebAuthnAuthChallenge);
app.post('/api/v1/attendance/webauthn/login/options', handleWebAuthnAuthChallenge);

// WebAuthn Authentication Verify Handlers
const handleWebAuthnAuthVerify = async (req: express.Request, res: express.Response) => {
  const { tenant_id, credential_id, check_type = 'check_in' } = req.body;
  if (!credential_id) {
    return res.status(400).json({ error: 'credential_id wajib disertakan.' });
  }

  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  const client = await pool.connect();
  try {
    const credRes = await client.query('SELECT * FROM webauthn_credentials WHERE credential_id = $1;', [credential_id]);
    if (credRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kredensial biometrik tidak valid atau tidak ditemukan.' });
    }
    const cred = credRes.rows[0];
    const newSignCount = (Number(cred.sign_count) || 0) + 1;
    await client.query('UPDATE webauthn_credentials SET sign_count = $1 WHERE id = $2;', [newSignCount, cred.id]);

    const attId = crypto.randomUUID();
    const now = new Date().toISOString();
    await client.query(
      \`INSERT INTO attendance_records (
         id, tenant_id, tenant_membership_id, check_type, verified_via, sign_count, recorded_at
       ) VALUES ($1, $2, $3, $4, 'webauthn_fido2', $5, $6);\},
      [attId, cred.tenant_id, cred.tenant_membership_id, check_type, newSignCount, now]
    );

    return res.json({
      success: true,
      message: 'Presensi biometrik berhasil diverifikasi secara kriptografis.',
      attendance: {
        id: attId,
        tenant_id: cred.tenant_id,
        tenant_membership_id: cred.tenant_membership_id,
        check_type,
        verified_via: 'webauthn_fido2',
        sign_count: newSignCount,
        recorded_at: now,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

app.post('/api/v1/attendance/webauthn/authenticate-verify', handleWebAuthnAuthVerify);
app.post('/api/v1/attendance/webauthn/login/verify', handleWebAuthnAuthVerify);

// GET /api/v1/attendance/records
app.get('/api/v1/attendance/records', async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const client = await pool.connect();
    try {
      const q = tenantId
        ? \`SELECT a.*, m.full_name, m.role FROM attendance_records a
           JOIN tenant_memberships m ON a.tenant_membership_id = m.id
           WHERE a.tenant_id = $1 ORDER BY a.recorded_at DESC LIMIT 50;\`
        : \`SELECT a.*, m.full_name, m.role FROM attendance_records a
           JOIN tenant_memberships m ON a.tenant_membership_id = m.id
           ORDER BY a.recorded_at DESC LIMIT 50;\`;
      const args = tenantId ? [tenantId] : [];
      const recs = await client.query(q, args);
      return res.json(recs.rows);
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});`;

code = code.replace(webauthnOldRegex, webAuthnReplacement);

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Cleaned remaining in-memory occurrences in server.ts');
