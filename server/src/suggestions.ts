import { ApiError, notFound } from './errors.js';
import { canReadCapsule } from './capsules.js';
import { defaultAiConfig, type AiConfig } from './config.js';
import { estimateCostUsd } from './extract/cost.js';
import { ExtractorError, type ExtractInput, type Extractor, type Usage } from './extract/types.js';
import { requestHash, withIdempotency } from './idempotency.js';
import type { Database } from './types.js';

const MAX_MESSAGES = 200;
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const draftItemTexts = (draft: any): string[] =>
  ['decisions', 'tasks', 'unresolved', 'events'].flatMap((type) =>
    (Array.isArray(draft?.[type]) ? draft[type] : []).map((item: any) => String(item?.text ?? '')).filter(Boolean),
  );

interface Prepared {
  orgId: string;
  version: number;
  input: ExtractInput;
}

async function prepare(db: Database, capsuleId: string, userId: string): Promise<Prepared> {
  if (!(await canReadCapsule(db, capsuleId, userId))) throw notFound();
  const capsule = (await db.query<any>('select * from capsules where id=$1', [capsuleId])).rows[0];
  if (!capsule) throw notFound();
  if (!['open', 'review'].includes(capsule.status))
    throw new ApiError(422, 'domain_rule', '이 상태에서는 제안을 받을 수 없어요.');
  const messages = (
    await db.query<any>(
      'select id,author_id,text,is_source,created_at from messages where capsule_id=$1 order by created_at,id',
      [capsuleId],
    )
  ).rows;
  const members = (
    await db.query<any>(
      `select u.id,u.name from capsule_members cm join users u on u.id=cm.user_id
       where cm.capsule_id=$1 order by u.id`,
      [capsuleId],
    )
  ).rows;
  const existing = capsule.draft != null;
  const reflected = new Set<string>(
    existing ? (capsule.draft_message_ids ?? messages.filter((m) => !m.is_source).map((m) => m.id)) : [],
  );
  const shape = (m: any) => ({ id: m.id, authorId: m.author_id, text: m.text, createdAt: iso(m.created_at) });
  const pending = messages.filter((m) => !m.is_source && !reflected.has(m.id)).slice(0, MAX_MESSAGES);
  if (!pending.length) throw new ApiError(422, 'domain_rule', '새 대화가 없어요.');
  return {
    orgId: capsule.org_id,
    version: capsule.version,
    input: {
      messages: pending.map(shape),
      context: existing ? [] : messages.filter((m) => m.is_source).map(shape),
      existingTexts: existing ? draftItemTexts(capsule.draft) : [],
      members: members.map((m) => ({ id: m.id, name: m.name ?? '' })),
      referenceTime: new Date().toISOString(),
      timeZone: 'Asia/Seoul',
    },
  };
}

/** Checks hourly and monthly limits and reserves the estimated cost (counted by concurrent requests) in one locked transaction. */
async function reserve(
  db: Database,
  ai: AiConfig,
  p: { userId: string; orgId: string; capsuleId: string; estimate: number },
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('ai_usage_budget', 0))");
    const hour = await tx.query<{ n: string }>(
      "select count(*) as n from ai_usage where user_id=$1 and created_at > now() - interval '1 hour'",
      [p.userId],
    );
    if (Number(hour.rows[0].n) >= ai.userHourlyLimit)
      throw new ApiError(429, 'rate_limited', '요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
    const month = await tx.query<{ total: string }>(
      `select coalesce(sum(cost_usd),0) as total from ai_usage
       where created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`,
    );
    if (Number(month.rows[0].total) + p.estimate > ai.monthlyBudgetUsd)
      throw new ApiError(429, 'ai_budget_exceeded', '이번 달 AI 사용 한도를 넘었어요.');
    const row = await tx.query<{ id: string }>(
      `insert into ai_usage (user_id,org_id,capsule_id,model,input_tokens,output_tokens,cost_usd,ok)
       values ($1,$2,$3,$4,0,0,$5,false) returning id`,
      [p.userId, p.orgId, p.capsuleId, ai.model, p.estimate],
    );
    return Number(row.rows[0].id);
  });
}

const settle = (db: Database, id: number, usage: Usage, ok: boolean, model?: string) =>
  db.query(
    'update ai_usage set input_tokens=$2,output_tokens=$3,cost_usd=$4,ok=$5,model=coalesce($6,model) where id=$1',
    [id, Math.round(usage.inputTokens), Math.round(usage.outputTokens), usage.costUsd, ok, model ?? null],
  );

export async function createDraftSuggestion(
  db: Database,
  deps: { extractor?: Extractor | null; ai?: AiConfig },
  input: { userId: string; capsuleId: string; key: string },
): Promise<any> {
  const ai = deps.ai ?? defaultAiConfig;
  const request = { capsuleId: input.capsuleId, op: 'draft-suggestions' };
  const prepared = await prepare(db, input.capsuleId, input.userId);

  const prior = await db.query<any>('select request_hash,response from idempotency_keys where user_id=$1 and key=$2', [
    input.userId,
    input.key,
  ]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_hash !== requestHash(request))
      throw new ApiError(400, 'invalid_request', '같은 Idempotency-Key에 다른 요청을 보낼 수 없어요.');
    return prior.rows[0].response;
  }
  if (!deps.extractor) throw new ApiError(503, 'ai_unavailable', 'AI를 지금 쓸 수 없어요.');

  const estimate = estimateCostUsd(prepared.input, {
    inputPerMTok: ai.priceInputPerMTok,
    outputPerMTok: ai.priceOutputPerMTok,
  });
  const usageId = await reserve(db, ai, {
    userId: input.userId,
    orgId: prepared.orgId,
    capsuleId: input.capsuleId,
    estimate,
  });

  // The model call is outside any transaction. Neither message text nor the raw model output is logged or stored.
  let result;
  try {
    result = await deps.extractor.extract(prepared.input);
  } catch (error) {
    const usage =
      error instanceof ExtractorError && error.usage ? error.usage : { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    await settle(db, usageId, usage, false);
    throw new ApiError(503, 'ai_unavailable', 'AI를 지금 쓸 수 없어요.');
  }
  await settle(db, usageId, result.usage, true, result.model);

  const messageIds = prepared.input.messages.map((m) => m.id);
  return withIdempotency(db, input.userId, input.key, request, async (tx) => {
    const saved = await tx.query<{ id: string }>(
      `insert into draft_suggestions (capsule_id,user_id,based_on_version,message_ids,candidates,model)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [input.capsuleId, input.userId, prepared.version, messageIds, JSON.stringify(result.candidates), result.model],
    );
    return {
      id: saved.rows[0].id,
      capsuleId: input.capsuleId,
      basedOnVersion: prepared.version,
      messageIds,
      candidates: result.candidates,
      model: result.model,
      usage: result.usage,
    };
  });
}
