import { createHash } from 'node:crypto';
import type { Database } from './types.js';
import { ApiError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as any)[key])]),
    );
  return value;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function requireIdempotencyKey(value: unknown): string {
  if (value === undefined) throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key가 필요해요.');
  if (!isUuid(value)) throw new ApiError(400, 'invalid_request', 'Idempotency-Key가 올바른 UUID가 아니에요.');
  return value;
}

export function requestHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export async function withIdempotency<T>(
  db: Database,
  userId: string,
  key: string,
  request: unknown,
  run: (tx: Database) => Promise<T>,
  options: { store?: (response: T) => unknown; replay?: (stored: any) => T } = {},
): Promise<T> {
  const hash = requestHash(request);
  return db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${userId}:${key}`]);
    const prior = await tx.query<any>(
      'select request_hash,response from idempotency_keys where user_id=$1 and key=$2',
      [userId, key],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== hash)
        throw new ApiError(400, 'invalid_request', '같은 Idempotency-Key에 다른 요청을 보낼 수 없어요.');
      return options.replay ? options.replay(prior.rows[0].response) : (prior.rows[0].response as T);
    }
    const response = await run(tx);
    await tx.query('insert into idempotency_keys (user_id,key,request_hash,status,response) values ($1,$2,$3,200,$4)', [
      userId,
      key,
      hash,
      options.store ? options.store(response) : response,
    ]);
    return response;
  });
}
