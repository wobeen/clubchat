import { createHash } from 'node:crypto';
// The shared browser module is intentionally plain JavaScript.
// @ts-expect-error no declaration file is owned by public/
import { sendMessage } from '../../public/domain.js';
import type { Database } from './types.js';
import { ApiError, notFound } from './errors.js';
import { assertCanRead, capsuleRepresentation, domainState } from './capsules.js';

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
const hashRequest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

type Executor = (state: any, capsule: any, payload: any) => unknown;
const executors: Record<string, Executor> = {
  'send-message': (state, capsule, payload) => sendMessage(state, capsule, payload?.text),
};

export async function executeCommand(db: Database, input: {
  userId: string; capsuleId: string; command: string; key: string; expectedRevision: number; payload: any;
}): Promise<{ status: number; body: any }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.key))
    throw new ApiError(400, 'invalid_request', 'Idempotency-Key가 올바른 UUID가 아니에요.');
  const executor = executors[input.command];
  if (!executor) throw notFound();
  const requestHash = hashRequest({ capsuleId: input.capsuleId, command: input.command, expectedRevision: input.expectedRevision, payload: input.payload });
  return db.transaction(async (tx) => {
    const prior = await tx.query<any>('select request_hash, status, response from idempotency_keys where user_id=$1 and key=$2', [input.userId, input.key]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== requestHash) throw new ApiError(400, 'invalid_request', '같은 Idempotency-Key에 다른 요청을 보낼 수 없어요.');
      return { status: prior.rows[0].status, body: prior.rows[0].response };
    }
    await assertCanRead(tx, input.capsuleId, input.userId);
    const locked = await tx.query<any>('select revision from capsules where id=$1 for update', [input.capsuleId]);
    if (!locked.rows[0]) throw notFound();
    if (!Number.isInteger(input.expectedRevision)) throw new ApiError(400, 'invalid_request', 'expectedRevision이 필요해요.');
    if (locked.rows[0].revision !== input.expectedRevision)
      throw new ApiError(409, 'revision_conflict', '다른 변경이 있어요. 최신 버전을 확인해주세요.', { revision: locked.rows[0].revision });
    const state = await domainState(tx, input.capsuleId, input.userId);
    const capsule = state.meetings.find((m: any) => m.id === input.capsuleId);
    let result: any;
    try { result = executor(state, capsule, input.payload); }
    catch (error) { throw new ApiError(422, 'domain_rule', error instanceof Error ? error.message : String(error)); }

    if (input.command === 'send-message') {
      await tx.query(`insert into messages (id, capsule_id, author_id, text, created_at) values ($1,$2,$3,$4,$5)`,
        [result.id, input.capsuleId, result.authorId, result.text, result.createdAt]);
    }
    const nextRevision = locked.rows[0].revision + 1;
    await tx.query('update capsules set revision=$2 where id=$1', [input.capsuleId, nextRevision]);
    await tx.query(`insert into outbox (topic,payload) values ('capsule.changed',$1)`, [{ capsuleId: input.capsuleId, revision: nextRevision }]);
    const body = { capsule: await capsuleRepresentation(tx, input.capsuleId), affected: [] };
    await tx.query('insert into idempotency_keys (user_id,key,request_hash,status,response) values ($1,$2,$3,200,$4)', [input.userId, input.key, requestHash, body]);
    return { status: 200, body };
  });
}
