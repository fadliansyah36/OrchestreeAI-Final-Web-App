import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:2Rup9JXRKGoHVoJx@db.szvbcvmvrucqxfikgjlx.supabase.co:5432/postgres';

async function testDefinitionOfDone() {
  console.log('================================================================');
  console.log('DEFINITION OF DONE VERIFICATION: NOT NULL & FOREIGN KEY CONSTRAINT');
  console.log('Target Table: ai_agents.job_title_id');
  console.log('================================================================\n');

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const tenantRes = await client.query('SELECT id FROM tenants LIMIT 1;');
  if (tenantRes.rows.length === 0) {
    throw new Error('Tenant tidak ditemukan untuk pengujian.');
  }
  const tenantId = tenantRes.rows[0].id;
  console.log(`Menggunakan Tenant ID: ${tenantId}`);

  // Dapatkan satu jabatan resmi dari katalog untuk pengujian valid
  const catalogRes = await client.query('SELECT id, title_code, title_name FROM ai_job_titles WHERE is_reference = true LIMIT 1;');
  if (catalogRes.rows.length === 0) {
    throw new Error('Katalog jabatan resmi tidak ditemukan.');
  }
  const validJobTitle = catalogRes.rows[0];
  console.log(`Jabatan resmi valid: ${validJobTitle.title_name} (${validJobTitle.id})`);

  let testsPassed = 0;

  // UJI 1: SQL Direct INSERT dengan job_title_id = NULL
  console.log('\n[UJI 1] Percobaan SQL Direct INSERT tanpa job_title_id (NULL)...');
  try {
    await client.query('BEGIN;');
    await client.query('SET LOCAL ROLE orchestree_app;');
    await client.query("SELECT set_config('app.tenant_id', $1, true);", [tenantId]);

    const fakeAgentId = '11111111-2222-3333-4444-555555555551';
    await client.query(`
      INSERT INTO ai_agents (id, tenant_id, display_name, persona_type, status, job_title_id, created_at)
      VALUES ($1, $2, 'Uji Agen Tanpa Katalog', 'custom', 'active', NULL, now());
    `, [fakeAgentId, tenantId]);

    await client.query('ROLLBACK;');
    throw new Error('GAGAL: Constraint NOT NULL tidak menolak insert null job_title_id!');
  } catch (err: any) {
    await client.query('ROLLBACK;');
    if (err.code === '23502') {
      console.log('BERHASIL: Database menolak dengan kode 23502 (not_null_violation) pada kolom job_title_id.');
      testsPassed++;
    } else {
      throw err;
    }
  }

  // UJI 2: SQL Direct INSERT dengan job_title_id tidak terdaftar (Foreign Key violation)
  console.log('\n[UJI 2] Percobaan SQL Direct INSERT dengan job_title_id palsu/non-katalog...');
  try {
    await client.query('BEGIN;');
    await client.query('SET LOCAL ROLE orchestree_app;');
    await client.query("SELECT set_config('app.tenant_id', $1, true);", [tenantId]);

    const fakeAgentId = '11111111-2222-3333-4444-555555555552';
    const nonExistentTitleId = '99999999-9999-9999-9999-999999999999';
    await client.query(`
      INSERT INTO ai_agents (id, tenant_id, display_name, persona_type, status, job_title_id, created_at)
      VALUES ($1, $2, 'Uji Agen Katalog Palsu', 'custom', 'active', $3, now());
    `, [fakeAgentId, tenantId, nonExistentTitleId]);

    await client.query('ROLLBACK;');
    throw new Error('GAGAL: Foreign Key constraint tidak menolak id yang tidak ada di katalog!');
  } catch (err: any) {
    await client.query('ROLLBACK;');
    if (err.code === '23503') {
      console.log('BERHASIL: Database menolak dengan kode 23503 (foreign_key_violation) constraint ai_agents_job_title_id_fkey.');
      testsPassed++;
    } else {
      throw err;
    }
  }

  // UJI 3: SQL Direct INSERT dengan job_title_id VALID dari 15 katalog
  console.log('\n[UJI 3] Percobaan SQL Direct INSERT dengan job_title_id resmi dari katalog...');
  const testAgentId = '11111111-2222-3333-4444-555555555553';
  try {
    await client.query('BEGIN;');
    await client.query('SET LOCAL ROLE orchestree_app;');
    await client.query("SELECT set_config('app.tenant_id', $1, true);", [tenantId]);

    const insertRes = await client.query(`
      INSERT INTO ai_agents (id, tenant_id, display_name, persona_type, status, job_title_id, created_at)
      VALUES ($1, $2, 'Agen Uji Terstandarisasi', 'autonomous', 'active', $3, now())
      RETURNING id, display_name, job_title_id;
    `, [testAgentId, tenantId, validJobTitle.id]);

    console.log('BERHASIL: Agen berhasil dibuat dengan referensi katalog:', insertRes.rows[0]);
    await client.query('DELETE FROM ai_agents WHERE id = $1;', [testAgentId]);
    await client.query('COMMIT;');
    testsPassed++;
  } catch (err: any) {
    await client.query('ROLLBACK;');
    throw err;
  }

  // UJI 4: Verifikasi Skema Kolom pada information_schema
  console.log('\n[UJI 4] Verifikasi metadata kolom job_title_id...');
  const colRes = await client.query(`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'ai_agents' AND column_name = 'job_title_id';
  `);
  if (colRes.rows[0]?.is_nullable === 'NO') {
    console.log('BERHASIL: Kolom job_title_id berstatus is_nullable = NO.');
    testsPassed++;
  } else {
    throw new Error('GAGAL: Kolom job_title_id masih bernilai nullable!');
  }

  // UJI 5: Verifikasi RESTRICT Foreign Key Constraint
  console.log('\n[UJI 5] Verifikasi constraint FOREIGN KEY RESTRICT...');
  const fkRes = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'ai_agents'::regclass AND conname = 'ai_agents_job_title_id_fkey';
  `);
  console.log('Definisi FK:', fkRes.rows[0]?.def);
  if (fkRes.rows[0]?.def.includes('RESTRICT')) {
    console.log('BERHASIL: Foreign key ON DELETE RESTRICT aktif.');
    testsPassed++;
  } else {
    throw new Error('GAGAL: Constraint FK tidak menggunakan ON DELETE RESTRICT.');
  }

  await client.end();

  console.log('\n================================================================');
  console.log(`HASIL AKHIR: ${testsPassed}/5 UJI DEFINITION OF DONE LULUS DENGAN SEMPURNA!`);
  console.log('Pembuatan AI Agent tanpa memilih dari katalog resmi DITOLAK MUTLAK oleh database.');
  console.log('================================================================');
}

testDefinitionOfDone().catch((err) => {
  console.error('Pengujian DoD gagal:', err);
  process.exit(1);
});
