// The shared browser module is intentionally plain JavaScript.
// @ts-expect-error no declaration file is owned by public/
import { sendMessage } from '../../public/domain.js';
import type { Database } from './types.js';
import { ApiError, notFound } from './errors.js';
import { assertCanRead, capsuleRepresentation, domainState } from './capsules.js';
import { withIdempotency } from './idempotency.js';

type Executor = (state: any, capsule: any, payload: any) => unknown;
const executors: Record<string, Executor> = {
  'send-message': (state, capsule, payload) => sendMessage(state, capsule, payload?.text),
};

export async function executeCommand(
  db: Database,
  input: {
    userId: string;
    capsuleId: string;
    command: string;
    key: string;
    expectedRevision: number;
    payload: any;
  },
): Promise<{ status: number; body: any }> {
  const executor = executors[input.command];
  if (!executor) throw notFound();
  const commandRequest = {
    capsuleId: input.capsuleId,
    command: input.command,
    expectedRevision: input.expectedRevision,
    payload: input.payload,
  };
  const body = await withIdempotency(db, input.userId, input.key, commandRequest, async (tx) => {
    await assertCanRead(tx, input.capsuleId, input.userId);
    const locked = await tx.query<any>('select revision from capsules where id=$1 for update', [input.capsuleId]);
    if (!locked.rows[0]) throw notFound();
    if (!Number.isInteger(input.expectedRevision))
      throw new ApiError(400, 'invalid_request', 'expectedRevision이 필요해요.');
    if (locked.rows[0].revision !== input.expectedRevision)
      throw new ApiError(409, 'revision_conflict', '다른 변경이 있어요. 최신 버전을 확인해주세요.', {
        revision: locked.rows[0].revision,
      });
    const state = await domainState(tx, input.capsuleId, input.userId);
    const capsule = state.meetings.find((m: any) => m.id === input.capsuleId);
    let result: any;
    try {
      result = executor(state, capsule, input.payload);
    } catch (error) {
      throw new ApiError(422, 'domain_rule', error instanceof Error ? error.message : String(error));
    }

    if (input.command === 'send-message') {
      await tx.query(`insert into messages (id, capsule_id, author_id, text, created_at) values ($1,$2,$3,$4,$5)`, [
        result.id,
        input.capsuleId,
        result.authorId,
        result.text,
        result.createdAt,
      ]);
    }
    const nextRevision = locked.rows[0].revision + 1;
    await tx.query('update capsules set revision=$2 where id=$1', [input.capsuleId, nextRevision]);
    await tx.query(`insert into outbox (topic,payload) values ('capsule.changed',$1)`, [
      { capsuleId: input.capsuleId, revision: nextRevision },
    ]);
    return { capsule: await capsuleRepresentation(tx, input.capsuleId), affected: [] };
  });
  return { status: 200, body };
}
