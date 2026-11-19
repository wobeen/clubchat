import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Database, QueryResult } from './types.js';

type Queryable = {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<
    | { rows: any[]; rowCount?: number | null; affectedRows?: number }
    | Array<{ rows: any[]; rowCount?: number | null; affectedRows?: number }>
  >;
  exec?(sql: string): Promise<Array<{ rows: any[]; affectedRows?: number }>>;
};

function adapter(queryable: Queryable): Database {
  return {
    async query<Row>(sql: string, params: unknown[] = []): Promise<QueryResult<Row>> {
      if (queryable.exec && params.length === 0 && sql.includes(';')) {
        const results = await queryable.exec(sql);
        const result = results.at(-1) ?? { rows: [], affectedRows: 0 };
        return { rows: result.rows as Row[], rowCount: result.affectedRows ?? result.rows.length };
      }
      const raw = await queryable.query(sql, params);
      const result = Array.isArray(raw) ? (raw.at(-1) ?? { rows: [], rowCount: 0 }) : raw;
      return {
        rows: result.rows as Row[],
        rowCount: result.rowCount ?? (result.rows.length || result.affectedRows || 0),
      };
    },
    async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
      await queryable.query('begin');
      try {
        const value = await fn(adapter(queryable));
        await queryable.query('commit');
        return value;
      } catch (error) {
        await queryable.query('rollback');
        throw error;
      }
    },
  };
}

export function createPgDatabase(
  connectionString: string,
  searchPath?: string,
  caFile = process.env.DATABASE_CA_FILE,
): Database {
  const pool = new pg.Pool({
    connectionString,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
    ...(caFile ? { ssl: { ca: readFileSync(caFile, 'utf8'), rejectUnauthorized: true } } : {}),
  });
  return {
    async query<Row>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
    },
    async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const value = await fn(adapter(client));
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

export function createPGliteDatabase(pglite: Queryable & { close(): Promise<void> }): Database {
  const base = adapter(pglite);
  let tail: Promise<void> = Promise.resolve();
  const db: Database = {
    query: base.query,
    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await base.transaction(fn);
      } finally {
        release();
      }
    },
  };
  db.close = () => pglite.close();
  return db;
}
