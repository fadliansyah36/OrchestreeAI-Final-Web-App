import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DATABASE_URL || '');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  await client.connect();
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0040 (Token Optimization & Agent Blueprint Catalog)...');

  try {
    const sqlPath = path.join(process.cwd(), 'infra/supabase/migrations/20260923000005_token_savings_and_agent_blueprints.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.query('BEGIN;');
    await client.query(sqlContent);
    await client.query('COMMIT;');

    console.log('Migrasi 0040 berhasil diterapkan ke Supabase Postgres.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Gagal menjalankan migrasi 0040:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
