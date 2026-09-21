import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

type Direction = 'up' | 'down';

function migrationsDir(): string {
  return path.resolve(__dirname, '../../../infra/migrations');
}

function listMigrationIds(dir: string, direction: Direction): string[] {
  const suffix = direction === 'up' ? '.up.sql' : '.down.sql';
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
}

async function ensureTracking(pool: Pool) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS ricoz;
    CREATE TABLE IF NOT EXISTS ricoz.schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedIds(pool: Pool): Promise<Set<string>> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM ricoz.schema_migrations ORDER BY id`,
  );
  return new Set(r.rows.map((row) => row.id));
}

async function migrateUp(pool: Pool) {
  await ensureTracking(pool);
  const dir = migrationsDir();
  const ids = listMigrationIds(dir, 'up');
  const applied = await appliedIds(pool);

  for (const id of ids) {
    if (applied.has(id)) continue;
    const sql = fs.readFileSync(path.join(dir, `${id}.up.sql`), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO ricoz.schema_migrations (id) VALUES ($1)`,
        [id],
      );
      await client.query('COMMIT');
      console.log(`applied ${id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function migrateDown(pool: Pool) {
  await ensureTracking(pool);
  const dir = migrationsDir();
  const applied = [...(await appliedIds(pool))].sort();
  if (applied.length === 0) {
    console.log('no migrations to roll back');
    return;
  }
  const id = applied[applied.length - 1]!;
  const downPath = path.join(dir, `${id}.down.sql`);
  if (!fs.existsSync(downPath)) {
    throw new Error(`missing down migration for ${id}`);
  }
  const sql = fs.readFileSync(downPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`DELETE FROM ricoz.schema_migrations WHERE id = $1`, [id]);
    await client.query('COMMIT');
    console.log(`rolled back ${id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const direction = (process.argv[2] as Direction) || 'up';
  const url = process.env.DATABASE_MIGRATE_URL;
  if (!url) throw new Error('DATABASE_MIGRATE_URL is required');

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`SET search_path TO ricoz, public`);
    if (direction === 'down') await migrateDown(pool);
    else await migrateUp(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
