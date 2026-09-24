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
  console.log('Terkoneksi ke Supabase PostgreSQL untuk migrasi 0041 (Commercial Plans, Subscription & Credit Engine)...');

  try {
    const sqlPath = path.join(process.cwd(), 'infra/supabase/migrations/20260924000001_commercial_plans_subscriptions_and_credit_engine.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.query('BEGIN;');
    await client.query(sqlContent);

    // Tandai juga ke alembic_version agar alembic sinkron
    await client.query(`
      INSERT INTO alembic_version (version_num) 
      VALUES ('0041_commercial_plans_subscription_and_credit_engine')
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT;');

    console.log('Migrasi 0041 berhasil diterapkan ke Supabase Postgres.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Gagal menjalankan migrasi 0041:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
