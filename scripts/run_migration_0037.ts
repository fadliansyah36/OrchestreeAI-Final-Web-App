import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function run() {
  const connectionString =
    process.env.DATABASE_URL ||
    (process.env.DATABASE_URL || '');

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Supabase PostgreSQL for Migration 0037...');

  const sqlPath = path.join(process.cwd(), 'infra/supabase/migrations/20260923000002_enforce_not_null_job_title_fk_on_ai_agents.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration 20260923000002...');
  await client.query(sql);

  console.log('Migration 0037 executed successfully. Verifying constraints...');
  const conRes = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'ai_agents'::regclass AND conname = 'ai_agents_job_title_id_fkey';
  `);
  console.log('Foreign key constraint:', conRes.rows);

  const colRes = await client.query(`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'ai_agents' AND column_name IN ('job_title_id', 'structural_role_id', 'job_subtitle_id');
  `);
  console.log('Columns metadata:', colRes.rows);

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
