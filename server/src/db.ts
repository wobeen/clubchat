import pg from 'pg';
import type { Database, QueryResult } from './types.js';

type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
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
      const result = await queryable.query(sql, params);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? result.rows.length };
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

export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString });
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
    async close() { await pool.end(); },
  };
}

export function createPGliteDatabase(pglite: Queryable & { close(): Promise<void> }): Database {
  const db = adapter(pglite);
  db.close = () => pglite.close();
  return db;
}
