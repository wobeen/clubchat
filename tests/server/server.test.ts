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
  return {
    raw,
    db,
    app,
    login,
    organization,
    capsule,
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
    ['0001_init.sql'],
  );
  assert.ok(tables.rows.some((x) => x.table_name === 'capsules'));
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
    payload: { expectedRevision: 0, payload: { text: '비밀' } },
  });
  assert.equal(get.statusCode, 404);
  assert.equal(command.statusCode, 404);
  await f.close();
});

test('send-message rejects stale revisions without creating a message', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const capsule = await f.capsule(owner.cookie, org);
  const ok = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { expectedRevision: 0, payload: { text: '첫 메시지' } },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const stale = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${capsule}/commands/send-message`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { expectedRevision: 0, payload: { text: '두 번째' } },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.details.revision, 1);
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
    payload: { expectedRevision: 0, payload: { text: '한 번만' } },
  };
  const first = await f.app.inject(request);
  const replay = await f.app.inject(request);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(replay.json(), first.json());
  const different = await f.app.inject({
    ...request,
    payload: { expectedRevision: 0, payload: { text: '다른 본문' } },
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
    payload: { expectedRevision: 0, payload: { text: '동시 요청' } },
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
