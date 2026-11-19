import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '../../server/src/testing.js';
import { buildApp } from '../../server/src/app.js';
import { loadConfig, type Config } from '../../server/src/config.js';
import { createPGliteDatabase } from '../../server/src/db.js';
import { createPgDatabase } from '../../server/src/db.js';
import { migrate } from '../../server/src/migrate.js';

const origin = 'http://itda.test';
const baseConfig: Config = {
  nodeEnv: 'test',
  databaseUrl: 'pglite:',
  appOrigin: origin,
  sessionSecret: 'x'.repeat(32),
  port: 8080,
  authDevLogin: true,
};

async function fixture() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const raw = testUrl ? null : new PGlite();
  const schema = `itda_test_${randomUUID().replaceAll('-', '')}`;
  const admin = testUrl ? createPgDatabase(testUrl) : null;
  if (admin) await admin.query(`create schema ${schema}`);
  const db = testUrl ? createPgDatabase(testUrl, schema) : createPGliteDatabase(raw!);
  await migrate(db);
  const app = buildApp({ db, config: baseConfig });
  async function login(userId = randomUUID()) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/dev-login',
      headers: { origin },
      payload: { userId },
    });
    assert.equal(res.statusCode, 200, res.body);
    return { userId, cookie: String(res.headers['set-cookie']).split(';')[0] };
  }
  async function organization(cookie: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { name: '잇다' },
    });
    assert.equal(res.statusCode, 200, res.body);
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
  async function addMember(orgId: string, userId: string) {
    await db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'member')", [orgId, userId]);
  }
  async function command(
    cookie: string,
    capsuleId: string,
    name: string,
    expectedVersion: number | undefined,
    payload: any,
    key = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/v1/capsules/${capsuleId}/commands/${name}`,
      headers: { origin, cookie, 'idempotency-key': key },
      payload: { expectedVersion, payload },
    });
  }
  return {
    raw,
    db,
    app,
    login,
    organization,
    capsule,
    addMember,
    command,
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

test('migration applies to an empty database and is safe to rerun', async () => {
  const f = await fixture();
  const db = f.db;
  await migrate(db);
  const migrations = await db.query<any>('select name from schema_migrations');
  const tables = await db.query<any>("select table_name from information_schema.tables where table_schema='public'");
  assert.deepEqual(
    migrations.rows.map((x) => x.name),
    ['0001_init.sql', '0002_capsule_domain_fields.sql'],
  );
  assert.ok(tables.rows.some((x) => x.table_name === 'capsules'));
  await f.close();
});

test('calendar notifications exclude capsule members who are not event participants', async () => {
  const f = await fixture();
  const owner = await f.login();
  const member = await f.login();
  await f.db.query("update users set name='소유자' where id=$1", [owner.userId]);
  await f.db.query("update users set name='비참여자' where id=$1", [member.userId]);
  const org = await f.organization(owner.cookie);
  await f.addMember(org, member.userId);
  const id = await f.capsule(owner.cookie, org, [member.userId]);
  let response = await f.command(owner.cookie, id, 'send-message', undefined, {
    text: '일정: 소유자만 참석 | 12월 3일 19:00 | 회의실 | 소유자',
  });
  let version = response.json().capsule.version;
  response = await f.command(owner.cookie, id, 'extract-draft', version, {});
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, id, 'confirm', version, {});
  version = response.json().capsule.version;
  response = await f.command(member.cookie, id, 'confirm', version, {});
  assert.equal(response.statusCode, 200, response.body);
  const recipients = await f.db.query<any>('select user_id from notifications where capsule_id=$1 order by user_id', [
    id,
  ]);
  assert.deepEqual(
    recipients.rows.map((row) => row.user_id),
    [owner.userId],
  );
  const outbox = await f.db.query<any>("select count(*)::int n from outbox where topic='notification'");
  assert.equal(outbox.rows[0].n, 1);
  await f.close();
});

const capsuleCommands = [
  'send-message',
  'delegate',
  'extract-draft',
  'update-draft-item',
  'remove-draft-item',
  'restore-draft',
  'resume-conversation',
  'confirm',
  'set-confirmation-members',
  'mark-member-departed',
  'transfer-facilitator',
  'set-agenda-status',
  'dispose-child',
  'create-correction',
  'start-scheduled',
];

test('every command hides capsules from nonparticipants and rejects disallowed states', async () => {
  const f = await fixture();
  const owner = await f.login();
  const member = await f.login();
  const outsider = await f.login();
  const org = await f.organization(owner.cookie);
  await f.addMember(org, member.userId);
  const id = await f.capsule(owner.cookie, org, [member.userId]);
  for (const name of ['set-confirmation-members', 'mark-member-departed', 'transfer-facilitator', 'dispose-child']) {
    const denied = await f.command(member.cookie, id, name, 0, {});
    assert.equal(denied.statusCode, 403, `${name}: ${denied.body}`);
  }
  await f.db.query("update capsules set status='cancelled' where id=$1", [id]);
  for (const name of capsuleCommands) {
    const hidden = await f.command(outsider.cookie, id, name, 0, {});
    assert.equal(hidden.statusCode, 404, `${name}: ${hidden.body}`);
    const invalid = await f.command(owner.cookie, id, name, 0, {});
    assert.equal(invalid.statusCode, 422, `${name}: ${invalid.body}`);
  }
  await f.close();
});

test('confirmation targets are enforced separately from capsule membership', async () => {
  const f = await fixture();
  const owner = await f.login();
  const member = await f.login();
  const org = await f.organization(owner.cookie);
  await f.addMember(org, member.userId);
  const id = await f.capsule(owner.cookie, org, [member.userId]);
  await f.db.query("update capsules set status='review',draft=$2 where id=$1", [
    id,
    { decisions: [], tasks: [], unresolved: [], events: [] },
  ]);
  await f.db.query('update capsule_members set is_confirmation_target=false where capsule_id=$1 and user_id=$2', [
    id,
    member.userId,
  ]);
  const denied = await f.command(member.cookie, id, 'confirm', 0, {});
  assert.equal(denied.statusCode, 403, denied.body);
  await f.close();
});

test('delegation, confirmations, conclusions, calendar and carryover persist end to end', async () => {
  const f = await fixture();
  const owner = await f.login();
  const member = await f.login();
  const viewer = await f.login();
  const org = await f.organization(owner.cookie);
  await f.addMember(org, member.userId);
  await f.addMember(org, viewer.userId);
  const parent = await f.capsule(owner.cookie, org, [member.userId, viewer.userId]);
  let version = 0;
  let response: any;
  for (const text of [
    '결정: 위임할 결론',
    '미결: 다음 캡슐에서 이어갈 안건',
    '일정: 결과 공유 | 12월 1일 19:00 | 회의실 | 전원',
    '다음 회의: 후속 점검 | 12월 2일 19:00 | 온라인 | 전원',
  ]) {
    response = await f.command(owner.cookie, parent, 'send-message', undefined, { text });
    assert.equal(response.statusCode, 200, response.body);
    version = response.json().capsule.version;
  }
  const sourceId = response.json().capsule.messages[0].id;
  response = await f.command(owner.cookie, parent, 'delegate', version, {
    title: '하위 안건',
    messageIds: [sourceId],
    memberIds: [owner.userId, member.userId],
  });
  assert.equal(response.statusCode, 200, response.body);
  version = response.json().capsule.version;
  const child = response.json().affected.find((item: any) => item.id !== parent).id;
  const copied = await f.db.query<any>('select source_message_id from messages where capsule_id=$1 and is_source', [
    child,
  ]);
  assert.equal(copied.rows[0].source_message_id, sourceId);

  response = await f.command(owner.cookie, child, 'send-message', undefined, { text: '결정: 하위 결론' });
  let childVersion = response.json().capsule.version;
  response = await f.command(owner.cookie, child, 'extract-draft', childVersion, {});
  childVersion = response.json().capsule.version;
  response = await f.command(owner.cookie, child, 'confirm', childVersion, {});
  childVersion = response.json().capsule.version;
  response = await f.command(member.cookie, child, 'confirm', childVersion, {});
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().capsule.status, 'confirmed');

  const parentAfterChild = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${parent}`,
    headers: { cookie: viewer.cookie },
  });
  assert.equal(parentAfterChild.json().conclusions.length, 1);
  version = parentAfterChild.json().version;
  const childMeta = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${child}`,
    headers: { cookie: viewer.cookie },
  });
  assert.equal(childMeta.statusCode, 200);
  assert.equal(childMeta.json().messages, undefined);
  assert.equal(childMeta.json().draft, undefined);
  const list = await f.app.inject({
    method: 'GET',
    url: `/v1/organizations/${org}/capsules`,
    headers: { cookie: viewer.cookie },
  });
  assert.ok(list.json().some((item: any) => item.id === child));

  response = await f.command(owner.cookie, parent, 'extract-draft', version, {});
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, parent, 'confirm', version, {});
  version = response.json().capsule.version;
  response = await f.command(member.cookie, parent, 'confirm', version, {});
  version = response.json().capsule.version;
  const finalKey = randomUUID();
  response = await f.command(viewer.cookie, parent, 'confirm', version, {}, finalKey);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().capsule.status, 'confirmed');
  const replay = await f.command(viewer.cookie, parent, 'confirm', version, {}, finalKey);
  assert.deepEqual(replay.json(), response.json());
  const events = await f.db.query<any>('select count(*)::int n from calendar_events where capsule_id=$1', [parent]);
  assert.equal(events.rows[0].n, 2);
  const next = await f.db.query<any>(
    'select id,carryover from capsules where previous_id=$1 and scheduled_from is not null',
    [parent],
  );
  assert.equal(next.rowCount, 1);
  assert.equal(next.rows[0].carryover.length, 1);
  await f.close();
});

test('last confirmation and draft edit with one expectedVersion have one winner', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  let response = await f.command(owner.cookie, id, 'send-message', undefined, { text: '결정: 원안' });
  let version = response.json().capsule.version;
  response = await f.command(owner.cookie, id, 'extract-draft', version, {});
  version = response.json().capsule.version;
  const item = response.json().capsule.draft.decisions[0];
  const [confirm, edit] = await Promise.all([
    f.command(owner.cookie, id, 'confirm', version, {}),
    f.command(owner.cookie, id, 'update-draft-item', version, { type: 'decisions', item: { ...item, text: '수정안' } }),
  ]);
  assert.deepEqual([confirm.statusCode, edit.statusCode].sort(), [200, 409]);
  await f.close();
});

test('domain errors roll back rows and versions', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  const before = await f.db.query<any>('select version,revision from capsules where id=$1', [id]);
  const failed = await f.command(owner.cookie, id, 'delegate', 0, {
    title: '실패',
    messageIds: [randomUUID()],
    memberIds: [owner.userId],
  });
  assert.equal(failed.statusCode, 422, failed.body);
  const after = await f.db.query<any>('select version,revision from capsules where id=$1', [id]);
  const count = await f.db.query<any>('select count(*)::int n from capsules where org_id=$1', [org]);
  assert.deepEqual(after.rows[0], before.rows[0]);
  assert.equal(count.rows[0].n, 1);
  await f.close();
});

test('the remaining capsule commands persist their domain changes', async () => {
  const f = await fixture();
  const owner = await f.login();
  const member = await f.login();
  const org = await f.organization(owner.cookie);
  await f.addMember(org, member.userId);

  const draftCapsule = await f.capsule(owner.cookie, org, [member.userId]);
  let response: any;
  let version = 0;
  for (const text of ['결정: 첫 항목', '결정: 둘째 항목']) {
    response = await f.command(owner.cookie, draftCapsule, 'send-message', undefined, { text });
    version = response.json().capsule.version;
  }
  response = await f.command(owner.cookie, draftCapsule, 'extract-draft', version, {});
  version = response.json().capsule.version;
  const [first, second] = response.json().capsule.draft.decisions;
  response = await f.command(owner.cookie, draftCapsule, 'update-draft-item', version, {
    type: 'decisions',
    item: { ...first, text: '수정한 첫 항목' },
  });
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, draftCapsule, 'remove-draft-item', version, {
    type: 'decisions',
    id: second.id,
  });
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, draftCapsule, 'restore-draft', version, { revision: 1 });
  version = response.json().capsule.version;
  assert.equal(response.json().capsule.draft.decisions.length, 2);
  response = await f.command(owner.cookie, draftCapsule, 'resume-conversation', version, {});
  assert.equal(response.json().capsule.version, version);

  const agendaCapsule = await f.capsule(owner.cookie, org);
  response = await f.command(owner.cookie, agendaCapsule, 'send-message', undefined, { text: '미결: 처리할 안건' });
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, agendaCapsule, 'extract-draft', version, {});
  version = response.json().capsule.version;
  const agendaId = response.json().capsule.draft.unresolved[0].id;
  response = await f.command(owner.cookie, agendaCapsule, 'set-agenda-status', version, {
    agendaId,
    status: 'resolved',
    reason: '해결함',
  });
  assert.equal(response.json().capsule.agendaStatuses[agendaId].status, 'resolved');

  const peopleCapsule = await f.capsule(owner.cookie, org, [member.userId]);
  response = await f.command(owner.cookie, peopleCapsule, 'set-confirmation-members', 0, {
    memberIds: [member.userId],
    reason: '담당자 확인',
  });
  version = response.json().capsule.version;
  response = await f.command(owner.cookie, peopleCapsule, 'transfer-facilitator', version, {
    memberId: member.userId,
    reason: '진행 이관',
  });
  version = response.json().capsule.version;
  response = await f.command(member.cookie, peopleCapsule, 'mark-member-departed', version, {
    memberId: owner.userId,
    reason: '참여 종료',
  });
  assert.deepEqual(response.json().capsule.departedMemberIds, [owner.userId]);

  const scheduled = await f.capsule(owner.cookie, org);
  await f.db.query("update capsules set status='scheduled',starts_at=now() where id=$1", [scheduled]);
  response = await f.command(owner.cookie, scheduled, 'start-scheduled', 0, {});
  assert.equal(response.json().capsule.status, 'open');

  const confirmed = await f.capsule(owner.cookie, org);
  await f.db.query("update capsules set status='confirmed',confirmed_at=now(),draft=$2 where id=$1", [
    confirmed,
    { decisions: [], tasks: [], unresolved: [], events: [] },
  ]);
  response = await f.command(owner.cookie, confirmed, 'create-correction', 0, { reason: '정정 필요' });
  const correction = response.json().affected[0];
  assert.ok(correction.id);
  const correctionRow = await f.db.query<any>('select correction_of,correction_reason from capsules where id=$1', [
    correction.id,
  ]);
  assert.equal(correctionRow.rows[0].correction_of, confirmed);
  assert.equal(correctionRow.rows[0].correction_reason, '정정 필요');

  const parent = await f.capsule(owner.cookie, org, [member.userId]);
  response = await f.command(owner.cookie, parent, 'send-message', undefined, { text: '넘길 메시지' });
  version = response.json().capsule.version;
  const messageId = response.json().capsule.messages[0].id;
  response = await f.command(owner.cookie, parent, 'delegate', version, {
    title: '보류할 하위',
    messageIds: [messageId],
    memberIds: [owner.userId, member.userId],
  });
  version = response.json().capsule.version;
  const child = response.json().affected[0].id;
  response = await f.command(owner.cookie, parent, 'dispose-child', version, {
    childId: child,
    status: 'deferred',
    reason: '나중에 계속',
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().affected.length, 2);
  await f.close();
});

test('dev login is hidden unless enabled and production rejects it', async () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'x',
        APP_ORIGIN: origin,
        SESSION_SECRET: 'x'.repeat(32),
        AUTH_DEV_LOGIN: '1',
      }),
    /AUTH_DEV_LOGIN/,
  );
  const f = await fixture();
  const db = f.db;
  const app = buildApp({ db, config: { ...baseConfig, authDevLogin: false } });
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    headers: { origin },
    payload: { userId: randomUUID() },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
  await f.close();
});

test('a mutating request from another origin is rejected', async () => {
  const f = await fixture();
  const res = await f.app.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    headers: { origin: 'https://evil.test' },
    payload: { userId: randomUUID() },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, 'bad_origin');
  await f.close();
});

test('invalid path UUIDs are hidden and invalid before UUIDs are rejected', async () => {
  const f = await fixture();
  const owner = await f.login();
  const capsule = await f.app.inject({ method: 'GET', url: '/v1/capsules/abc', headers: { cookie: owner.cookie } });
  const members = await f.app.inject({
    method: 'GET',
    url: '/v1/organizations/abc/members',
    headers: { cookie: owner.cookie },
  });
  const before = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${randomUUID()}/messages?before=abc`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(capsule.statusCode, 404);
  assert.equal(members.statusCode, 404);
  // A valid but inaccessible capsule remains hidden before query validation.
  assert.equal(before.statusCode, 404);
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  const invalidBefore = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${id}/messages?before=abc`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(invalidBefore.statusCode, 400);
  assert.equal(invalidBefore.json().error.code, 'invalid_request');
  await f.close();
});

test('session cookies are Secure only for an HTTPS APP_ORIGIN', async () => {
  const f = await fixture();
  const http = await f.app.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    headers: { origin },
    payload: { userId: randomUUID() },
  });
  assert.doesNotMatch(String(http.headers['set-cookie']), /; Secure/);
  const httpsApp = buildApp({ db: f.db, config: { ...baseConfig, appOrigin: 'https://itda.test' } });
  const https = await httpsApp.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    headers: { origin: 'https://itda.test' },
    payload: { userId: randomUUID() },
  });
  assert.match(String(https.headers['set-cookie']), /; Secure/);
  await httpsApp.close();
  await f.close();
});

test('Kakao callback creates a reusable user and rejects a mismatched state', async () => {
  const f = await fixture();
  let profileCalls = 0;
  const fetchMock: typeof fetch = async (input: any) => {
    if (String(input).includes('/oauth/token'))
      return new Response(JSON.stringify({ access_token: 'token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    profileCalls++;
    return new Response(JSON.stringify({ id: 12345, kakao_account: { profile: { nickname: '카카오' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const config = {
    ...baseConfig,
    kakaoClientId: 'client',
    kakaoClientSecret: 'secret',
    kakaoRedirectUri: 'http://itda.test/v1/auth/kakao/callback',
  };
  const app = buildApp({ db: f.db, config, fetch: fetchMock });
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = await app.inject({ method: 'GET', url: '/v1/auth/kakao/start' });
    assert.equal(start.statusCode, 302);
    const state = new URL(String(start.headers.location)).searchParams.get('state')!;
    const cookie = String(start.headers['set-cookie']).split(';')[0];
    const callback = await app.inject({
      method: 'GET',
      url: `/v1/auth/kakao/callback?code=ok&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
    assert.equal(callback.statusCode, 302, callback.body);
    assert.equal(callback.headers.location, origin);
    assert.match(String(callback.headers['set-cookie']), /itda_session=/);
  }
  const users = await f.db.query<any>("select count(*)::int n from users where kakao_id='12345'");
  assert.equal(users.rows[0].n, 1);
  assert.equal(profileCalls, 2);
  const start = await app.inject({ method: 'GET', url: '/v1/auth/kakao/start' });
  const cookie = String(start.headers['set-cookie']).split(';')[0];
  const mismatch = await app.inject({
    method: 'GET',
    url: '/v1/auth/kakao/callback?code=ok&state=wrong',
    headers: { cookie },
  });
  assert.equal(mismatch.statusCode, 400);
  await app.close();
  await f.close();
});

test('a nonparticipant cannot read or command a capsule', async () => {
  const f = await fixture();
  const owner = await f.login();
  const outsider = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const get = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${capsule}`,
    headers: { cookie: outsider.cookie },
  });
  const command = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: outsider.cookie, 'idempotency-key': randomUUID() },
    payload: { payload: { text: '비밀' } },
  });
  assert.equal(get.statusCode, 404);
  assert.equal(command.statusCode, 404);
  await f.close();
});

test('a stale expectedVersion is rejected without changing messages', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const ok = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { payload: { text: '첫 메시지' } },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const stale = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${capsule}/commands/extract-draft`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { expectedVersion: 0, payload: {} },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'version_conflict');
  assert.equal(stale.json().error.details.version, 1);
  const count = await f.db.query<any>('select count(*)::int n from messages where capsule_id=$1', [capsule]);
  assert.equal(count.rows[0].n, 1);
  await f.close();
});

test('same idempotency key replays the response and rejects a different body', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const key = randomUUID();
  const request = {
    method: 'POST' as const,
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': key },
    payload: { payload: { text: '한 번만' } },
  };
  const first = await f.app.inject(request);
  const replay = await f.app.inject(request);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(replay.json(), first.json());
  const different = await f.app.inject({
    ...request,
    payload: { payload: { text: '다른 본문' } },
  });
  assert.equal(different.statusCode, 400);
  const count = await f.db.query<any>('select count(*)::int n from messages where capsule_id=$1', [capsule]);
  assert.equal(count.rows[0].n, 1);
  await f.close();
});

test('concurrent requests with the same idempotency key replay one response', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const key = randomUUID();
  const request = {
    method: 'POST' as const,
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': key },
    payload: { payload: { text: '동시 요청' } },
  };
  const [first, second] = await Promise.all([f.app.inject(request), f.app.inject(request)]);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.deepEqual(first.json(), second.json());
  const count = await f.db.query<any>('select count(*)::int n from messages where capsule_id=$1', [capsule]);
  assert.equal(count.rows[0].n, 1);
  await f.close();
});

test('message pagination is chronological and excludes the before boundary', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (let i = 0; i < ids.length; i++)
    await f.db.query('insert into messages (id,capsule_id,author_id,text,created_at) values ($1,$2,$3,$4,$5)', [
      ids[i],
      capsule,
      owner.userId,
      `m${i + 1}`,
      `2026-01-01T00:00:0${i}Z`,
    ]);
  const latest = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${capsule}/messages?limit=2`,
    headers: { cookie: owner.cookie },
  });
  assert.deepEqual(
    latest.json().map((x: any) => x.text),
    ['m3', 'm4'],
  );
  const older = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${capsule}/messages?before=${ids[2]}&limit=2`,
    headers: { cookie: owner.cookie },
  });
  assert.deepEqual(
    older.json().map((x: any) => x.text),
    ['m1', 'm2'],
  );
  await f.close();
});
