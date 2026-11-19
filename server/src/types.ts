export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface Database {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}
