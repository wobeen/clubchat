import { readdir, readFile } from 'node:fs/promises';
import type { Database } from './types.js';

export async function migrate(db: Database, directory = new URL('../migrations/', import.meta.url)): Promise<void> {
  const path = directory instanceof URL ? directory : directory;
  const files = (await readdir(path)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  await db.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  for (const name of files) {
    const exists = await db.query('select 1 from schema_migrations where name = $1', [name]);
    if (exists.rowCount) continue;
    const file = path instanceof URL ? new URL(name, path) : `${path}/${name}`;
    const sql = await readFile(file, 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [name]);
    });
  }
}
