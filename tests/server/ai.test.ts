import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '../../server/src/testing.js';
import { buildApp } from '../../server/src/app.js';
import { defaultAiConfig, loadConfig, type AiConfig, type Config } from '../../server/src/config.js';
import { createPGliteDatabase, createPgDatabase } from '../../server/src/db.js';
import { migrate } from '../../server/src/migrate.js';
import { createGeminiExtractor } from '../../server/src/extract/gemini.js';
import { createAnthropicExtractor } from '../../server/src/extract/anthropic.js';
import { maskText } from '../../server/src/extract/mask.js';
import { normalizeCandidates, normalizeDate } from '../../server/src/extract/normalize.js';
import { ExtractorError, type ExtractInput, type Extractor } from '../../server/src/extract/types.js';

const origin = 'http://itda.test';
const baseConfig: Config = {
  nodeEnv: 'test',
  databaseUrl: 'pglite:',
  appOrigin: origin,
  sessionSecret: 'x'.repeat(32),
  port: 8080,
  authDevLogin: true,
};

// ---------- mask ----------
const members = [
  { id: 'id-minsu', name: '김민수' },
  { id: 'id-jiyoung', name: '이지영' },
  { id: 'id-alex', name: 'Alex' },
];

test('mask hides phone, account/card numbers and emails', () => {
  const out = maskText(
    '연락처 010-1234-5678, +82 10 1234 5678, 계좌 110-123-456789 카드 1234 5678 9012 3456 메일 kim.min@example.com 숫자 1234567890123',
    [],
  );
  assert.equal(out.includes('1234'), false, out);
  assert.equal(out.includes('example.com'), false, out);
  for (const tag of ['[전화]', '[계좌]', '[이메일]']) assert.ok(out.includes(tag), `${tag} in ${out}`);
});

test('mask keeps dates and short numbers', () => {
  assert.equal(maskText('12월 3일 19:00, 2026-12-03, 5명, 3만원', []), '12월 3일 19:00, 2026-12-03, 5명, 3만원');
});

test('mask replaces member names (full, given name, honorifics) with @id', () => {
  const out = maskText('김민수가 맡고, 민수 씨도 보고, 지영님은 검토. 이지영 확인. alex 와 ALEX', members);
  assert.equal(
    out,
    '@id-minsu가 맡고, @id-minso도 보고, @id-jiyoung은 검토. @id-jiyoung 확인. @id-alex 와 @id-alex'.replace(
      'id-minso',
      'id-minsu',
    ),
  );
  for (const name of ['김민수', '민수', '지영', '이지영']) assert.equal(out.includes(name), false, name);
});

// ---------- normalize ----------
const m1 = randomUUID();
const m2 = randomUUID();
const ownerA = randomUUID();
const ownerB = randomUUID();
const context = {
  messages: new Map([
    [m1, '2026-11-20T01:00:00.000Z'],
    [m2, '2026-11-21T01:00:00.000Z'],
  ]),
  memberIds: new Set([ownerA, ownerB]),
};

test('normalize drops items without valid evidence and fake evidence ids', () => {
  const out = normalizeCandidates(
    {
      decisions: [
        { text: '근거 없음', evidenceIds: [] },
        { text: '가짜 근거', evidenceIds: [randomUUID()] },
        { text: '일부 가짜', evidenceIds: [m1, randomUUID()] },
        { text: '', evidenceIds: [m1] },
      ],
      unresolved: [{ text: '미결', evidenceIds: [m2] }],
    },
    context,
  );
  assert.deepEqual(out.decisions, [{ text: '일부 가짜', evidenceIds: [m1], source: 'ai' }]);
  assert.deepEqual(out.unresolved, [{ text: '미결', evidenceIds: [m2], source: 'ai' }]);
  assert.deepEqual(out.tasks, []);
  assert.deepEqual(out.events, []);
});

test('normalize nulls non-participant owners and splits multiple owners', () => {
  const out = normalizeCandidates(
    {
      tasks: [
        {
          text: '공동',
          ownerIds: [ownerA, ownerB, ownerA, randomUUID()],
          dueAt: null,
          dateText: '',
          evidenceIds: [m1],
        },
        { text: '외부인', ownerIds: [randomUUID()], dueAt: null, dateText: '', evidenceIds: [m1] },
        { text: '단수', ownerId: ownerB, evidenceIds: [m1] },
      ],
      events: [{ text: '모임', at: null, hasTime: true, participantIds: [ownerA, randomUUID()], evidenceIds: [m1] }],
    },
    context,
  );
  assert.deepEqual(
    out.tasks.map((t) => [t.text, t.ownerId]),
    [
      ['공동', ownerA],
      ['공동', ownerB],
      ['외부인', null],
      ['단수', ownerB],
    ],
  );
  assert.ok(out.tasks.every((t) => t.source === 'ai'));
  assert.deepEqual(out.events[0].participantIds, [ownerA]);
  assert.equal(out.events[0].hasTime, false, 'no date means no time');
  assert.equal(out.events[0].source, 'ai');
});

test('normalize date range: -1 day to +400 days of the evidence time, else null', () => {
  const t = [Date.parse('2026-11-20T01:00:00.000Z')];
  assert.equal(normalizeDate('2026-12-03T19:00:00+09:00', t), '2026-12-03T10:00:00.000Z');
  assert.equal(normalizeDate('2026-11-19T12:00:00+09:00', t), '2026-11-19T03:00:00.000Z');
  assert.equal(normalizeDate('2026-11-18T12:00:00+09:00', t), null);
  assert.equal(normalizeDate('2027-12-01T00:00:00+09:00', t), '2027-11-30T15:00:00.000Z');
  assert.equal(normalizeDate('2028-01-01T00:00:00+09:00', t), null);
  assert.equal(normalizeDate('내일쯤', t), null);
  assert.equal(normalizeDate(null, t), null);
  const out = normalizeCandidates(
    {
      tasks: [{ text: 'a', ownerIds: [], dueAt: '2020-01-01T00:00:00+09:00', dateText: '작년', evidenceIds: [m1] }],
      events: [{ text: 'b', at: '2030-01-01T00:00:00+09:00', hasTime: true, evidenceIds: [m1], kind: 'next' }],
    },
    context,
  );
  assert.equal(out.tasks[0].dueAt, null);
  assert.equal(out.events[0].at, null);
  assert.equal(out.events[0].hasTime, false);
  assert.equal(out.events[0].kind, 'next');
});

// ---------- anthropic extractor ----------
function extractInput(): ExtractInput {
  return {
    messages: [
      {
        id: m1,
        authorId: ownerA,
        text: '김민수 씨가 금요일까지 정리. 010-1234-5678 로 연락, kim@example.com',
        createdAt: '2026-11-20T01:00:00.000Z',
      },
    ],
    context: [],
    existingTexts: ['이지영 님 확인'],
    members: [
      { id: ownerA, name: '김민수' },
      { id: ownerB, name: '이지영' },
    ],
    referenceTime: '2026-11-20T02:00:00.000Z',
    timeZone: 'Asia/Seoul',
  };
}
const toolResponse = (input: unknown, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'submit_meeting_draft', input }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 200 },
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
const prices = { inputPerMTok: 1, outputPerMTok: 5 };

test('anthropic extractor sends a forced tool call without names or raw numbers and prices usage', async () => {
  let seen: { url: string; headers: Record<string, string>; body: any; raw: string } | undefined;
  const extractor = createAnthropicExtractor({
    apiKey: 'sk-test',
    model: 'claude-haiku-5-5',
    prices,
    fetch: (async (url: string, init: any) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body), raw: init.body };
      return toolResponse({
        decisions: [{ text: '정리', evidenceIds: [m1, randomUUID()] }],
        tasks: [
          {
            text: '정리',
            ownerIds: [ownerA, randomUUID()],
            dueAt: '2026-11-27T18:00:00+09:00',
            dateText: '금요일',
            evidenceIds: [m1],
          },
        ],
        unresolved: [],
        events: [],
      });
    }) as any,
  });
  const result = await extractor.extract(extractInput());
  assert.equal(seen!.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen!.headers['x-api-key'], 'sk-test');
  assert.equal(seen!.headers['anthropic-version'], '2023-06-01');
  assert.equal(seen!.body.model, 'claude-haiku-5-5');
  assert.deepEqual(seen!.body.tool_choice, { type: 'tool', name: 'submit_meeting_draft' });
  assert.equal(seen!.body.tools.length, 1);
  assert.equal(seen!.body.tools[0].name, 'submit_meeting_draft');
  assert.ok(seen!.body.max_tokens > 0);
  for (const secret of ['김민수', '민수', '이지영', '지영', '010-1234-5678', 'example.com'])
    assert.equal(seen!.raw.includes(secret), false, `request leaks ${secret}`);
  assert.ok(seen!.raw.includes(`@${ownerA}`));
  assert.equal(result.model, 'claude-haiku-5-5');
  assert.deepEqual(result.usage, { inputTokens: 1000, outputTokens: 200, costUsd: 0.002 });
  assert.deepEqual(result.candidates.decisions[0].evidenceIds, [m1]);
  assert.equal(result.candidates.tasks.length, 1);
  assert.equal(result.candidates.tasks[0].ownerId, ownerA);
  assert.equal(result.candidates.tasks[0].dueAt, '2026-11-27T09:00:00.000Z');
});

test('anthropic extractor maps provider failures, bad output and timeouts to ExtractorError', async () => {
  const make = (fetch: any, timeoutMs?: number) =>
    createAnthropicExtractor({ apiKey: 'k', model: 'm', prices, fetch, timeoutMs });
  await assert.rejects(
    make(async () => new Response('{"error":{}}', { status: 529 })).extract(extractInput()),
    (error: any) => error instanceof ExtractorError && error.code === 'ai_unavailable',
  );
  await assert.rejects(
    make(async () => new Response('not json', { status: 200 })).extract(extractInput()),
    ExtractorError,
  );
  await assert.rejects(
    make(async () => {
      throw new Error('socket hang up');
    }).extract(extractInput()),
    ExtractorError,
  );
  const noTool = await make(
    async () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 5, output_tokens: 2 } }),
      ),
  )
    .extract(extractInput())
    .catch((error) => error);
  assert.ok(noTool instanceof ExtractorError);
  assert.equal(noTool.usage.inputTokens, 5, 'billable usage is kept on schema failure');
  const truncated = await make(async () => toolResponse({ decisions: [] }, { stop_reason: 'max_tokens' }))
    .extract(extractInput())
    .catch((error) => error);
  assert.ok(truncated instanceof ExtractorError);
  const hang = make(
    (_url: string, init: any) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    20,
  );
  await assert.rejects(
    hang.extract(extractInput()),
    (error: any) => error instanceof ExtractorError && /timeout/.test(error.message),
  );
});

// ---------- routes ----------
async function fixture(options: { extractor?: Extractor | null; ai?: Partial<AiConfig> } = {}) {
  const testUrl = process.env.TEST_DATABASE_URL;
  const raw = testUrl ? null : new PGlite();
  const schema = `itda_test_${randomUUID().replaceAll('-', '')}`;
  const admin = testUrl ? createPgDatabase(testUrl) : null;
  if (admin) await admin.query(`create schema ${schema}`);
  const db = testUrl ? createPgDatabase(testUrl, schema) : createPGliteDatabase(raw!);
  await migrate(db);
  const config: Config = { ...baseConfig, ai: { ...defaultAiConfig, ...options.ai } };
  const app = buildApp({ db, config, ...(options.extractor !== undefined ? { extractor: options.extractor } : {}) });
  async function login(name: string) {
    const userId = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/dev-login',
      headers: { origin },
      payload: { userId },
    });
    assert.equal(res.statusCode, 200, res.body);
    await db.query('update users set name=$2 where id=$1', [userId, name]);
    return { userId, cookie: String(res.headers['set-cookie']).split(';')[0] };
  }
  async function organization(cookie: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { name: '잇다' },
    });
    return res.json().id as string;
  }
  async function capsule(cookie: string, orgId: string, memberIds: string[] = []) {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/capsules`,
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { title: '회의', memberIds },
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().id as string;
  }
  const command = (cookie: string, id: string, name: string, expectedVersion: number | undefined, payload: any) =>
    app.inject({
      method: 'POST',
      url: `/v1/capsules/${id}/commands/${name}`,
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { expectedVersion, payload },
    });
  const suggest = (cookie: string, id: string, key: string | null = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: `/v1/capsules/${id}/draft-suggestions`,
      headers: { origin, cookie, ...(key ? { 'idempotency-key': key } : {}) },
      payload: {},
    });
  async function send(cookie: string, id: string, text: string) {
    const res = await command(cookie, id, 'send-message', undefined, { text });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().capsule as any;
  }
  async function setup() {
    const owner = await login('김민수');
    const member = await login('이지영');
    const outsider = await login('박외부');
    const org = await organization(owner.cookie);
    for (const user of [member, outsider])
      await db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'member')", [org, user.userId]);
    const id = await capsule(owner.cookie, org, [member.userId]);
    return { owner, member, outsider, org, id };
  }
  return {
    db,
    login,
    organization,
    capsule,
    command,
    suggest,
    send,
    setup,
    async close() {
      await app.close();
      await db.close?.();
      if (admin) {
        await admin.query(`drop schema ${schema} cascade`);
        await admin.close?.();
      }
    },
  };
}

function mockExtractor(calls: ExtractInput[] = [], options: { fail?: boolean } = {}): Extractor {
  return {
    async extract(input) {
      calls.push(structuredClone(input));
      if (options.fail) throw new ExtractorError('boom', { inputTokens: 10, outputTokens: 0, costUsd: 0.00001 });
      const ids = input.messages.map((m) => m.id);
      return {
        model: 'mock-model',
        usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0.002 },
        candidates: {
          decisions: [{ text: '자료는 금요일까지', evidenceIds: [ids[0]], source: 'ai' }],
          tasks: [
            {
              text: '자료 정리',
              ownerId: input.members[0].id,
              dueAt: null,
              dateText: '',
              evidenceIds: [ids[0]],
              source: 'ai',
            },
          ],
          unresolved: [],
          events: [],
        },
      };
    },
  };
}

test('suggestion route rejects non-participants, empty capsules, missing keys and a missing API key', async () => {
  const noKey = await fixture({ extractor: undefined });
  const a = await noKey.setup();
  await noKey.send(a.owner.cookie, a.id, '결정: 시작');
  assert.equal((await noKey.suggest(a.outsider.cookie, a.id)).statusCode, 404);
  let res = await noKey.suggest(a.owner.cookie, a.id);
  assert.equal(res.statusCode, 503, res.body);
  assert.equal(res.json().error.code, 'ai_unavailable');
  await noKey.close();

  const f = await fixture({ extractor: mockExtractor() });
  const s = await f.setup();
  assert.equal((await f.suggest(s.outsider.cookie, s.id)).statusCode, 404);
  res = await f.suggest(s.owner.cookie, s.id);
  assert.equal(res.statusCode, 422, res.body);
  assert.equal(res.json().error.code, 'domain_rule');
  await f.send(s.owner.cookie, s.id, '자료 정리');
  assert.equal((await f.suggest(s.owner.cookie, s.id, null)).statusCode, 400);
  await f.close();
});

test('suggestion sends masked messages to the extractor and stores only normalized candidates', async () => {
  const calls: ExtractInput[] = [];
  const f = await fixture({ extractor: mockExtractor(calls) });
  const s = await f.setup();
  await f.send(s.owner.cookie, s.id, '김민수가 010-1234-5678 로 자료 정리');
  const key = randomUUID();
  const res = await f.suggest(s.owner.cookie, s.id, key);
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.capsuleId, s.id);
  assert.equal(body.model, 'mock-model');
  assert.deepEqual(body.usage, { inputTokens: 1000, outputTokens: 200, costUsd: 0.002 });
  assert.equal(body.messageIds.length, 1);
  assert.equal(body.candidates.decisions[0].source, 'ai');
  assert.equal(typeof body.basedOnVersion, 'number');
  const replay = await f.suggest(s.owner.cookie, s.id, key);
  assert.equal(replay.json().id, body.id);
  assert.equal(calls.length, 1, 'idempotent replay does not call the model again');
  const stored = await f.db.query<any>('select * from draft_suggestions');
  assert.equal(stored.rowCount, 1);
  assert.equal(JSON.stringify(stored.rows[0]).includes('자료 정리'), true, 'candidate text is stored');
  assert.equal(JSON.stringify(stored.rows[0]).includes('010-1234'), false);
  const usage = await f.db.query<any>('select * from ai_usage');
  assert.equal(usage.rowCount, 1);
  assert.equal(usage.rows[0].ok, true);
  assert.equal(usage.rows[0].input_tokens, 1000);
  assert.equal(Number(usage.rows[0].cost_usd), 0.002);
  await f.close();
});

test('provider failure records ai_usage with ok=false and returns 503', async () => {
  const f = await fixture({ extractor: mockExtractor([], { fail: true }) });
  const s = await f.setup();
  await f.send(s.owner.cookie, s.id, '자료 정리');
  const res = await f.suggest(s.owner.cookie, s.id);
  assert.equal(res.statusCode, 503, res.body);
  assert.equal(res.json().error.code, 'ai_unavailable');
  const usage = await f.db.query<any>('select ok,input_tokens from ai_usage');
  assert.deepEqual(usage.rows, [{ ok: false, input_tokens: 10 }]);
  assert.equal((await f.db.query('select 1 from draft_suggestions')).rowCount, 0);
  await f.close();
});

test('monthly budget counts this request estimate; hourly limit is per user', async () => {
  const budget = await fixture({ extractor: mockExtractor(), ai: { monthlyBudgetUsd: 0.001 } });
  const b = await budget.setup();
  await budget.send(b.owner.cookie, b.id, '자료 정리');
  const res = await budget.suggest(b.owner.cookie, b.id);
  assert.equal(res.statusCode, 429, res.body);
  assert.equal(res.json().error.code, 'ai_budget_exceeded');
  assert.equal((await budget.db.query('select 1 from ai_usage')).rowCount, 0);
  await budget.close();

  const calls: ExtractInput[] = [];
  const hourly = await fixture({ extractor: mockExtractor(calls), ai: { userHourlyLimit: 1 } });
  const h = await hourly.setup();
  await hourly.send(h.owner.cookie, h.id, '자료 정리');
  assert.equal((await hourly.suggest(h.owner.cookie, h.id)).statusCode, 200);
  const limited = await hourly.suggest(h.owner.cookie, h.id);
  assert.equal(limited.statusCode, 429, limited.body);
  assert.equal(limited.json().error.code, 'rate_limited');
  assert.equal((await hourly.suggest(h.member.cookie, h.id)).statusCode, 200, 'another user is not limited');
  assert.equal(calls.length, 2);
  await hourly.close();
});

test('suggestion -> extract-draft yields ai items; later messages stay pending; reapply fails', async () => {
  const f = await fixture({ extractor: mockExtractor() });
  const s = await f.setup();
  await f.send(s.owner.cookie, s.id, '자료 정리');
  const suggestion = (await f.suggest(s.owner.cookie, s.id)).json();
  const later = await f.send(s.owner.cookie, s.id, '추가 논의');
  const applied = await f.command(s.owner.cookie, s.id, 'extract-draft', later.version, {
    suggestionId: suggestion.id,
  });
  assert.equal(applied.statusCode, 200, applied.body);
  const capsule = applied.json().capsule;
  assert.equal(capsule.status, 'review');
  assert.equal(capsule.draft.decisions[0].source, 'ai');
  assert.equal(capsule.draft.tasks[0].source, 'ai');
  assert.deepEqual(capsule.draftMessageIds, suggestion.messageIds);
  assert.equal(capsule.messages.length, 2);
  const row = await f.db.query<any>('select applied_at from draft_suggestions where id=$1', [suggestion.id]);
  assert.ok(row.rows[0].applied_at);

  const again = await f.command(s.owner.cookie, s.id, 'extract-draft', capsule.version, {
    suggestionId: suggestion.id,
  });
  assert.equal(again.statusCode, 422, again.body);
  assert.equal(again.json().error.code, 'domain_rule');
  assert.equal(
    (await f.command(s.owner.cookie, s.id, 'extract-draft', capsule.version, { suggestionId: 'nope' })).statusCode,
    400,
  );

  // The leftover message is still pending and can be suggested again (existing draft texts are sent for de-duplication).
  const calls: ExtractInput[] = [];
  const f2 = await fixture({ extractor: mockExtractor(calls) });
  const t = await f2.setup();
  await f2.send(t.owner.cookie, t.id, '자료 정리');
  const first = (await f2.suggest(t.owner.cookie, t.id)).json();
  const v = await f2.send(t.owner.cookie, t.id, '다음 안건');
  await f2.command(t.owner.cookie, t.id, 'extract-draft', v.version, { suggestionId: first.id });
  const second = await f2.suggest(t.owner.cookie, t.id);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().messageIds.length, 1);
  assert.ok(calls[1].existingTexts.includes('자료는 금요일까지'));
  await f2.close();
  await f.close();
});

test('suggestions expire after one hour, are bound to their capsule, and any participant may apply them', async () => {
  const f = await fixture({ extractor: mockExtractor() });
  const s = await f.setup();
  const version = (await f.send(s.owner.cookie, s.id, '자료 정리')).version;
  const old = (await f.suggest(s.owner.cookie, s.id)).json();
  await f.db.query("update draft_suggestions set created_at = now() - interval '61 minutes' where id=$1", [old.id]);
  let res = await f.command(s.owner.cookie, s.id, 'extract-draft', version, { suggestionId: old.id });
  assert.equal(res.statusCode, 422, res.body);

  const other = await f.capsule(s.owner.cookie, s.org, [s.member.userId]);
  const otherVersion = (await f.send(s.owner.cookie, other, '다른 회의 대화')).version;
  const fresh = (await f.suggest(s.owner.cookie, s.id)).json();
  res = await f.command(s.owner.cookie, other, 'extract-draft', otherVersion, { suggestionId: fresh.id });
  assert.equal(res.statusCode, 422, res.body);
  assert.equal(
    (await f.db.query<any>('select applied_at from draft_suggestions where id=$1', [fresh.id])).rows[0].applied_at,
    null,
  );

  res = await f.command(s.member.cookie, s.id, 'extract-draft', version, { suggestionId: fresh.id });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().capsule.draft.decisions[0].source, 'ai');
  await f.close();
});

// ---------- gemini (development adapter) ----------
const geminiResponse = (output: unknown, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
      ...extra,
    }),
    { status: 200 },
  );

test('gemini extractor sends schema-constrained JSON request without names or raw numbers', async () => {
  let seen: { url: string; headers: Record<string, string>; body: any; raw: string } | undefined;
  const extractor = createGeminiExtractor({
    apiKey: 'g-test',
    model: 'gemini-3.8-flash',
    prices: { inputPerMTok: 0, outputPerMTok: 0 },
    fetch: (async (url: string, init: any) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body), raw: init.body };
      return geminiResponse({
        decisions: [{ text: '정리', evidenceIds: [m1, randomUUID()] }],
        tasks: [{ text: '정리', ownerIds: [ownerA], dueAt: null, dateText: '', evidenceIds: [m1] }],
        unresolved: [],
        events: [],
      });
    }) as any,
  });
  const result = await extractor.extract(extractInput());
  assert.ok(seen!.url.endsWith('/v1beta/models/gemini-3.8-flash:generateContent'), seen!.url);
  assert.equal(seen!.headers['x-goog-api-key'], 'g-test');
  assert.equal(seen!.url.includes('g-test'), false, 'key only in the header');
  const config = seen!.body.generationConfig;
  assert.equal(config.responseMimeType, 'application/json');
  assert.equal(config.responseSchema.type, 'OBJECT');
  assert.equal(config.responseSchema.properties.tasks.items.properties.dueAt.nullable, true);
  assert.equal(config.responseSchema.properties.tasks.items.properties.dueAt.type, 'STRING');
  assert.deepEqual(config.responseSchema.required, ['decisions', 'tasks', 'unresolved', 'events']);
  for (const secret of ['김민수', '민수', '이지영', '지영', '010-1234-5678', 'example.com'])
    assert.equal(seen!.raw.includes(secret), false, `request leaks ${secret}`);
  assert.ok(seen!.raw.includes(`@${ownerA}`));
  assert.deepEqual(result.usage, { inputTokens: 800, outputTokens: 150, costUsd: 0 });
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.deepEqual(result.candidates.decisions[0].evidenceIds, [m1]);
  assert.equal(result.candidates.tasks[0].ownerId, ownerA);
});

test('gemini extractor maps bad responses and timeouts to ExtractorError', async () => {
  const prices0 = { inputPerMTok: 0, outputPerMTok: 0 };
  const make = (fetch: any, timeoutMs?: number) =>
    createGeminiExtractor({ apiKey: 'k', model: 'm', prices: prices0, fetch, timeoutMs });
  await assert.rejects(make(async () => new Response('{}', { status: 429 })).extract(extractInput()), ExtractorError);
  await assert.rejects(make(async () => new Response('nope', { status: 200 })).extract(extractInput()), ExtractorError);
  await assert.rejects(
    make(async () => geminiResponse({}, { usageMetadata: undefined })).extract(extractInput()),
    ExtractorError,
  );
  const notJson = await make(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'not json' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
        }),
      ),
  )
    .extract(extractInput())
    .catch((error) => error);
  assert.ok(notJson instanceof ExtractorError);
  assert.equal(notJson.usage.inputTokens, 5);
  const truncated = await make(async () =>
    geminiResponse(
      { decisions: [] },
      { candidates: [{ content: { parts: [{ text: '{"decisions":[]}' }] }, finishReason: 'MAX_TOKENS' }] },
    ),
  )
    .extract(extractInput())
    .catch((error) => error);
  assert.ok(truncated instanceof ExtractorError);
  const hang = make(
    (_url: string, init: any) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    20,
  );
  await assert.rejects(
    hang.extract(extractInput()),
    (error: any) => error instanceof ExtractorError && /timeout/.test(error.message),
  );
});

// ---------- provider config ----------
const baseEnv = { DATABASE_URL: 'postgres://x', APP_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32) };

test('AI provider config: defaults, gemini key/model/free prices, and production refuses gemini', () => {
  let ai = loadConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).ai!;
  assert.deepEqual([ai.provider, ai.apiKey, ai.model, ai.priceInputPerMTok], ['anthropic', 'a', 'claude-haiku-5-5', 1]);
  ai = loadConfig({ ...baseEnv, AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).ai!;
  assert.deepEqual(
    [ai.provider, ai.apiKey, ai.model, ai.priceInputPerMTok, ai.priceOutputPerMTok],
    ['gemini', 'g', 'gemini-3.5-flash', 0, 0],
  );
  assert.equal(loadConfig({ ...baseEnv, AI_PROVIDER: 'gemini' }).ai!.apiKey, undefined, 'anthropic key is not reused');
  assert.equal(loadConfig({ ...baseEnv, AI_PROVIDER: 'gemini', AI_MODEL: 'm' }).ai!.model, 'm');
  assert.equal(loadConfig({ ...baseEnv }).ai!.timeoutMs, 20_000);
  assert.equal(loadConfig({ ...baseEnv, AI_TIMEOUT_MS: '90000' }).ai!.timeoutMs, 90_000);
  assert.throws(() => loadConfig({ ...baseEnv, AI_PROVIDER: 'gemini', NODE_ENV: 'production' }), /production/);
  assert.throws(() => loadConfig({ ...baseEnv, AI_PROVIDER: 'openai' }), /AI_PROVIDER/);
  assert.equal(loadConfig({ ...baseEnv, NODE_ENV: 'production', ANTHROPIC_API_KEY: 'a' }).ai!.provider, 'anthropic');
});
