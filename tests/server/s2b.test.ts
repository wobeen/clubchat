import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from '../../server/node_modules/ws/wrapper.mjs';
import { buildApp } from '../../server/src/app.js';
import type { Config } from '../../server/src/config.js';
import { createPgDatabase, createPGliteDatabase, pgPoolConfig } from '../../server/src/db.js';
import { runDueJobs } from '../../server/src/jobs.js';
import { migrate } from '../../server/src/migrate.js';
import { OutboxDispatcher, RealtimeHub } from '../../server/src/realtime.js';
import { PGlite } from '../../server/src/testing.js';

const origin = 'http://itda.test';
const config: Config = {
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
  const schema = `itda_s2b_${randomUUID().replaceAll('-', '')}`;
  const admin = testUrl ? createPgDatabase(testUrl) : null;
  if (admin) await admin.query(`create schema ${schema}`);
  const db = testUrl ? createPgDatabase(testUrl, schema) : createPGliteDatabase(raw!);
  await migrate(db);
  const hub = new RealtimeHub();
  const outbox = new OutboxDispatcher(db, (topic, payload) => hub.publish(db, topic, payload), 25);
  const app = buildApp({ db, config, realtime: hub, wakeOutbox: () => outbox.wake() });
  const login = async (userId = randomUUID()) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/dev-login',
      headers: { origin },
      payload: { userId },
    });
    assert.equal(response.statusCode, 200, response.body);
    return { userId, cookie: String(response.headers['set-cookie']).split(';')[0] };
  };
  const organization = async (cookie: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { name: 'S2b 조직' },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().id as string;
  };
  const capsule = async (cookie: string, orgId: string, memberIds: string[] = [], startsAt?: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/capsules`,
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { title: '캡슐', memberIds, ...(startsAt ? { startsAt } : {}) },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().id as string;
  };
  const command = (
    cookie: string,
    id: string,
    commandName: string,
    expectedVersion: number | undefined,
    payload: any,
  ) =>
    app.inject({
      method: 'POST',
      url: `/v1/capsules/${id}/commands/${commandName}`,
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
      payload: { expectedVersion, payload },
    });
  return {
    db,
    app,
    hub,
    outbox,
    login,
    organization,
    capsule,
    command,
    async close() {
      await outbox.stop();
      hub.close();
      await app.close();
      await db.close?.();
      if (admin) {
        await admin.query(`drop schema ${schema} cascade`);
        await admin.close?.();
      }
    },
  };
}

test('websocket subscriptions publish committed changes only to readable capsules', async () => {
  const f = await fixture();
  const owner = await f.login();
  const outsider = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  const address = await f.app.listen({ port: 0, host: '127.0.0.1' });
  const websocketUrl = `${address.replace(/^http/, 'ws')}/v1/ws`;
  const rejectedUpgrade = (headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(websocketUrl, { headers });
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode || 0));
      socket.once('open', () => reject(new Error('WebSocket upgrade unexpectedly succeeded')));
      socket.on('error', () => {});
    });
  assert.equal(await rejectedUpgrade({ cookie: owner.cookie, origin: 'https://evil.test' }), 403);
  assert.equal(await rejectedUpgrade({ origin }), 401);
  f.outbox.start();
  const openSocket = async (cookie: string) => {
    const socket = new WebSocket(websocketUrl, { headers: { cookie, origin } });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return socket;
  };
  const ownerSocket = await openSocket(owner.cookie);
  const outsiderSocket = await openSocket(outsider.cookie);
  const ownerMessages: any[] = [];
  const outsiderMessages: any[] = [];
  ownerSocket.on('message', (raw) => ownerMessages.push(JSON.parse(raw.toString())));
  outsiderSocket.on('message', (raw) => outsiderMessages.push(JSON.parse(raw.toString())));
  ownerSocket.send(JSON.stringify({ type: 'subscribe', capsuleIds: [id] }));
  outsiderSocket.send(JSON.stringify({ type: 'subscribe', capsuleIds: [id] }));
  await delay(50);

  const rolledBack = await f.command(owner.cookie, id, 'delegate', 0, {
    title: '실패',
    messageIds: [randomUUID()],
    memberIds: [owner.userId],
  });
  assert.equal(rolledBack.statusCode, 422);
  await f.outbox.drain();
  assert.equal(ownerMessages.length, 0);

  const committed = await f.command(owner.cookie, id, 'send-message', undefined, { text: '커밋된 메시지' });
  assert.equal(committed.statusCode, 200, committed.body);
  for (let attempt = 0; attempt < 20 && ownerMessages.length === 0; attempt++) await delay(25);
  assert.deepEqual(ownerMessages, [
    { type: 'capsule.changed', capsuleId: id, version: committed.json().capsule.version },
  ]);
  assert.deepEqual(outsiderMessages, []);
  const notificationId = randomUUID();
  await f.db.query(
    `insert into outbox (topic,payload) values
       ('calendar.changed',$1),('notification',$2)`,
    [
      JSON.stringify({ orgId: org }),
      JSON.stringify({ id: notificationId, userId: owner.userId, text: '새 알림', capsuleId: id }),
    ],
  );
  f.outbox.wake();
  for (let attempt = 0; attempt < 20 && ownerMessages.length < 3; attempt++) await delay(25);
  assert.deepEqual(ownerMessages.slice(1), [
    { type: 'calendar.changed', orgId: org },
    { type: 'notification', id: notificationId, text: '새 알림' },
  ]);
  assert.deepEqual(outsiderMessages, []);
  ownerSocket.close();
  outsiderSocket.close();
  await f.close();
});

test('activate-scheduled jobs run once after their due time', async () => {
  const f = await fixture();
  const health = await f.app.inject({ method: 'GET', url: '/health' });
  assert.deepEqual(health.json(), { ok: true });
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org, [], '2099-01-01T00:00:00Z');
  assert.equal(await runDueJobs(f.db, new Date('2098-12-31T23:59:59Z')), 0);
  let row = await f.db.query<any>('select status,version from capsules where id=$1', [id]);
  assert.deepEqual(row.rows[0], { status: 'scheduled', version: 0 });
  assert.equal(await runDueJobs(f.db, new Date('2099-01-01T00:00:01Z')), 1);
  row = await f.db.query<any>('select status,version from capsules where id=$1', [id]);
  assert.deepEqual(row.rows[0], { status: 'open', version: 1 });
  assert.equal(await runDueJobs(f.db, new Date('2099-01-01T00:00:02Z')), 0);
  await f.close();
});

test('cleanup jobs recur and failed jobs stop after five exponential retries', async () => {
  const f = await fixture();
  const user = await f.login();
  const now = new Date('2027-01-01T00:00:00Z');
  await f.db.query('update sessions set expires_at=$1 where user_id=$2', ['2026-01-01T00:00:00Z', user.userId]);
  await f.db.query(
    `insert into idempotency_keys (user_id,key,request_hash,status,response,created_at)
     values ($1,$2,'hash',200,'{}','2026-01-01T00:00:00Z')`,
    [user.userId, randomUUID()],
  );
  await f.db.query("insert into jobs (kind,payload,run_at) values ('cleanup',$1,$2)", [JSON.stringify({}), now]);
  assert.equal(await runDueJobs(f.db, now), 1);
  assert.equal((await f.db.query<any>('select count(*)::int n from sessions')).rows[0].n, 0);
  assert.equal((await f.db.query<any>('select count(*)::int n from idempotency_keys')).rows[0].n, 0);
  const cleanup = await f.db.query<any>("select status,attempts from jobs where kind='cleanup'");
  assert.deepEqual(cleanup.rows[0], { status: 'pending', attempts: 0 });

  const failed = await f.db.query<any>("insert into jobs (kind,payload,run_at) values ('unknown',$1,$2) returning id", [
    JSON.stringify({ id: randomUUID() }),
    now,
  ]);
  for (let attempt = 0; attempt < 5; attempt++) {
    await f.db.query("update jobs set run_at=$2,status='pending' where id=$1", [failed.rows[0].id, now]);
    assert.equal(await runDueJobs(f.db, now), 1);
  }
  const result = await f.db.query<any>('select status,attempts,last_error from jobs where id=$1', [failed.rows[0].id]);
  assert.equal(result.rows[0].status, 'failed');
  assert.equal(result.rows[0].attempts, 5);
  assert.match(result.rows[0].last_error, /Unknown job kind/);
  await f.close();
});

test('calendar and ICS hide corrected originals and events not visible to the user', async () => {
  const f = await fixture();
  const owner = await f.login();
  const outsider = await f.login();
  const org = await f.organization(owner.cookie);
  await f.db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'member')", [org, outsider.userId]);
  const original = await f.capsule(owner.cookie, org);
  const correction = await f.capsule(owner.cookie, org);
  const privateCapsule = await f.capsule(owner.cookie, org, [outsider.userId]);
  await f.db.query(`update capsules set status='confirmed',confirmed_at=now(),draft=$2 where id=any($1::uuid[])`, [
    [original, correction, privateCapsule],
    JSON.stringify({ decisions: [], tasks: [], unresolved: [], events: [] }),
  ]);
  await f.db.query('update capsules set correction_of=$1 where id=$2', [original, correction]);
  const originalEvent = randomUUID();
  const correctionEvent = randomUUID();
  const privateEvent = randomUUID();
  for (const [eventId, capsuleId, participantId, text] of [
    [originalEvent, original, owner.userId, '원본 일정'],
    [correctionEvent, correction, owner.userId, '정정 일정'],
    [privateEvent, privateCapsule, outsider.userId, '비공개 일정'],
  ])
    await f.db.query(
      `insert into calendar_events (id,org_id,capsule_id,source_id,kind,text,at,participant_ids)
       values ($1,$2,$3,$4,'event',$5,'2027-01-01T00:00:00Z',$6)`,
      [eventId, org, capsuleId, eventId, text, [participantId]],
    );
  const calendar = await f.app.inject({
    method: 'GET',
    url: `/v1/organizations/${org}/calendar?from=2026-12-01T00:00:00Z&to=2027-02-01T00:00:00Z`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(calendar.statusCode, 200, calendar.body);
  assert.deepEqual(
    calendar.json().map((event: any) => event.id),
    [correctionEvent],
  );
  const hiddenIcs = await f.app.inject({
    method: 'GET',
    url: `/v1/events/${originalEvent}.ics`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(hiddenIcs.statusCode, 404);
  const ics = await f.app.inject({
    method: 'GET',
    url: `/v1/events/${correctionEvent}.ics`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(ics.statusCode, 200, ics.body);
  assert.match(String(ics.headers['content-type']), /^text\/calendar/);
  assert.match(ics.body, /SUMMARY:정정 일정/);
  await f.close();
});

test('invites enforce expiry revocation and max uses while acceptance is idempotent for members', async () => {
  const f = await fixture();
  const admin = await f.login();
  const first = await f.login();
  const second = await f.login();
  const org = await f.organization(admin.cookie);
  const createInvite = async (maxUses?: number) => {
    const response = await f.app.inject({
      method: 'POST',
      url: `/v1/organizations/${org}/invites`,
      headers: { origin, cookie: admin.cookie, 'idempotency-key': randomUUID() },
      payload: { expiresInHours: 24, ...(maxUses ? { maxUses } : {}) },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const accept = (cookie: string, code: string) =>
    f.app.inject({
      method: 'POST',
      url: `/v1/invites/${code}/accept`,
      headers: { origin, cookie, 'idempotency-key': randomUUID() },
    });

  const expired = await createInvite();
  await f.db.query("update invites set expires_at=now() - interval '1 second' where id=$1", [expired.id]);
  assert.equal((await accept(first.cookie, expired.code)).statusCode, 404);
  const cancelled = await createInvite();
  const revoke = await f.app.inject({
    method: 'DELETE',
    url: `/v1/organizations/${org}/invites/${cancelled.id}`,
    headers: { origin, cookie: admin.cookie, 'idempotency-key': randomUUID() },
  });
  assert.equal(revoke.statusCode, 200, revoke.body);
  assert.equal((await accept(first.cookie, cancelled.code)).statusCode, 404);

  const singleUse = await createInvite(1);
  assert.equal((await accept(first.cookie, singleUse.code)).statusCode, 200);
  assert.equal((await accept(first.cookie, singleUse.code)).statusCode, 200);
  assert.equal((await accept(second.cookie, singleUse.code)).statusCode, 404);
  const membership = await f.db.query<any>('select role from org_members where org_id=$1 and user_id=$2', [
    org,
    first.userId,
  ]);
  assert.equal(membership.rows[0].role, 'member');
  await f.close();
});

test('last admin demotion is rejected and reads update unread counts', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  let response = await f.command(owner.cookie, id, 'send-message', undefined, { text: '첫째' });
  const firstMessage = response.json().capsule.messages[0].id;
  response = await f.command(owner.cookie, id, 'send-message', undefined, { text: '둘째' });
  const list = async () =>
    f.app.inject({ method: 'GET', url: `/v1/organizations/${org}/capsules`, headers: { cookie: owner.cookie } });
  assert.equal((await list()).json().find((item: any) => item.id === id).unreadCount, 2);
  const read = await f.app.inject({
    method: 'POST',
    url: `/v1/capsules/${id}/read`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { lastMessageId: firstMessage },
  });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal((await list()).json().find((item: any) => item.id === id).unreadCount, 1);
  const demote = await f.app.inject({
    method: 'PATCH',
    url: `/v1/organizations/${org}/members/${owner.userId}`,
    headers: { origin, cookie: owner.cookie, 'idempotency-key': randomUUID() },
    payload: { role: 'member' },
  });
  assert.equal(demote.statusCode, 422, demote.body);
  await f.close();
});

test('dispose-child sees open grandchildren, source messages bypass the ordinary limit, and TypeErrors are 500', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const parent = await f.capsule(owner.cookie, org);
  const child = await f.capsule(owner.cookie, org);
  const grandchild = await f.capsule(owner.cookie, org);
  await f.db.query('update capsules set parent_id=$1 where id=$2', [parent, child]);
  await f.db.query('update capsules set parent_id=$1 where id=$2', [child, grandchild]);
  const disposition = await f.command(owner.cookie, parent, 'dispose-child', 0, {
    childId: child,
    status: 'cancelled',
    reason: '취소',
  });
  assert.equal(disposition.statusCode, 422, disposition.body);

  for (let index = 0; index < 55; index++)
    await f.db.query('insert into messages (capsule_id,author_id,text,created_at) values ($1,$2,$3,$4)', [
      parent,
      owner.userId,
      `일반 ${index}`,
      new Date(Date.UTC(2027, 0, 1, 0, 0, index)).toISOString(),
    ]);
  for (let index = 0; index < 3; index++)
    await f.db.query(
      'insert into messages (capsule_id,author_id,text,is_source,created_at) values ($1,$2,$3,true,$4)',
      [parent, owner.userId, `원본 ${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()],
    );
  const represented = await f.app.inject({
    method: 'GET',
    url: `/v1/capsules/${parent}`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(represented.json().messages.length, 50);
  assert.equal(represented.json().sourceMessages.length, 3);

  await f.db.query("update capsules set status='review',draft='{}'::jsonb where id=$1", [parent]);
  const internal = await f.command(owner.cookie, parent, 'update-draft-item', 0, {
    type: 'decisions',
    item: { id: randomUUID(), text: '깨진 초안', evidenceIds: [] },
  });
  assert.equal(internal.statusCode, 500, internal.body);
  await f.close();
});

async function socketFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const address = await f.app.listen({ port: 0, host: '127.0.0.1' });
  const url = `${address.replace(/^http/, 'ws')}/v1/ws`;
  f.outbox.start();
  const sockets: any[] = [];
  return {
    // Subscribes in the very same tick the connection opens, before any server-side await can finish.
    async open(cookie: string, immediate?: string[]) {
      const socket = new WebSocket(url, { headers: { cookie, origin } });
      const messages: any[] = [];
      let closed = false;
      socket.on('message', (raw: any) => messages.push(JSON.parse(raw.toString())));
      socket.on('close', () => (closed = true));
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => {
          if (immediate) socket.send(JSON.stringify({ type: 'subscribe', capsuleIds: immediate }));
          resolve();
        });
        socket.once('error', reject);
      });
      sockets.push(socket);
      return {
        socket,
        messages,
        isClosed: () => closed,
        subscribe: (capsuleIds: unknown) => socket.send(JSON.stringify({ type: 'subscribe', capsuleIds })),
      };
    },
    closeAll: () => sockets.forEach((socket) => socket.close()),
  };
}

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 80 && !condition(); attempt++) await delay(25);
};

test('a subscribe sent immediately after connect is not lost and subscriptions accumulate', async () => {
  const f = await fixture();
  const owner = await f.login();
  const org = await f.organization(owner.cookie);
  const a = await f.capsule(owner.cookie, org);
  const b = await f.capsule(owner.cookie, org);
  const ws = await socketFixture(f);
  const client = await ws.open(owner.cookie, [a]);
  await delay(100);
  client.subscribe(['not-a-uuid', 42, b, randomUUID()]);
  await delay(100);
  const first = await f.command(owner.cookie, a, 'send-message', undefined, { text: 'A' });
  const second = await f.command(owner.cookie, b, 'send-message', undefined, { text: 'B' });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  await waitFor(() => client.messages.length >= 2);
  assert.deepEqual(client.messages.map((m) => m.capsuleId).sort(), [a, b].sort());
  ws.closeAll();
  await f.close();
});

test('publish re-authorizes: departed members get nothing, logout closes the socket, new orgs are received', async () => {
  const f = await fixture();
  const owner = await f.login();
  const guest = await f.login();
  const org = await f.organization(owner.cookie);
  const id = await f.capsule(owner.cookie, org);
  const ws = await socketFixture(f);

  await f.db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'member')", [org, guest.userId]);
  await f.db.query('insert into capsule_members (capsule_id,user_id) values ($1,$2)', [id, guest.userId]);
  const ownerSocket = await ws.open(owner.cookie, [id]);
  const guestSocket = await ws.open(guest.cookie, [id]);
  await delay(150);
  await f.command(owner.cookie, id, 'send-message', undefined, { text: '1' });
  await waitFor(() => guestSocket.messages.length >= 1 && ownerSocket.messages.length >= 1);
  assert.equal(guestSocket.messages.length, 1);

  await f.db.query('update capsule_members set departed_at=now() where capsule_id=$1 and user_id=$2', [
    id,
    guest.userId,
  ]);
  await f.command(owner.cookie, id, 'send-message', undefined, { text: '2' });
  await waitFor(() => ownerSocket.messages.length >= 2);
  await delay(100);
  assert.equal(guestSocket.messages.length, 1);

  // A socket opened before joining an organization receives that organization's events afterwards.
  const joined = await f.login();
  const joinedSocket = await ws.open(joined.cookie);
  await f.db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'member')", [org, joined.userId]);
  await f.db.query("insert into outbox (topic,payload) values ('calendar.changed',$1)", [
    JSON.stringify({ orgId: org }),
  ]);
  f.outbox.wake();
  await waitFor(() => joinedSocket.messages.length >= 1);
  assert.deepEqual(joinedSocket.messages, [{ type: 'calendar.changed', orgId: org }]);

  const logout = await f.app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: { origin, cookie: owner.cookie },
  });
  assert.equal(logout.statusCode, 200);
  await waitFor(() => ownerSocket.isClosed());
  assert.equal(ownerSocket.isClosed(), true);
  ws.closeAll();
  await f.close();
});

test('invite creation never stores the plaintext code and a replay is a 409', async () => {
  const f = await fixture();
  const admin = await f.login();
  const org = await f.organization(admin.cookie);
  const key = randomUUID();
  const request = () =>
    f.app.inject({
      method: 'POST',
      url: `/v1/organizations/${org}/invites`,
      headers: { origin, cookie: admin.cookie, 'idempotency-key': key },
      payload: { expiresInHours: 24 },
    });
  const created = await request();
  assert.equal(created.statusCode, 200, created.body);
  const code = created.json().code;
  assert.ok(code);
  const stored = await f.db.query<any>('select response::text r from idempotency_keys where key=$1', [key]);
  assert.ok(!stored.rows[0].r.includes(code));
  assert.ok(!stored.rows[0].r.includes('invite='));
  const replay = await request();
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.json().error.code, 'invite_already_issued');
  await f.close();
});

test('member updates re-check the requester role on the locked rows', async () => {
  const f = await fixture();
  const first = await f.login();
  const second = await f.login();
  const org = await f.organization(first.cookie);
  await f.db.query("insert into org_members (org_id,user_id,role) values ($1,$2,'admin')", [org, second.userId]);
  const demote = (actor: { cookie: string }, target: string) =>
    f.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${org}/members/${target}`,
      headers: { origin, cookie: actor.cookie, 'idempotency-key': randomUUID() },
      payload: { role: 'member' },
    });
  const results = await Promise.all([demote(first, second.userId), demote(second, first.userId)]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 403]);
  const admins = await f.db.query<any>("select count(*)::int n from org_members where org_id=$1 and role='admin'", [
    org,
  ]);
  assert.equal(admins.rows[0].n, 1);
  await f.close();
});

test('cleanup removes outbox rows sent more than a day ago', async () => {
  const f = await fixture();
  const now = new Date('2027-01-01T00:00:00Z');
  await f.db.query(
    `insert into outbox (topic,payload,sent_at) values
       ('calendar.changed','{}','2026-12-30T00:00:00Z'),('calendar.changed','{}','2026-12-31T23:00:00Z'),
       ('calendar.changed','{}',null)`,
  );
  await f.db.query("insert into jobs (kind,payload,run_at) values ('cleanup',$1,$2)", [JSON.stringify({}), now]);
  await runDueJobs(f.db, now);
  assert.equal((await f.db.query<any>('select count(*)::int n from outbox')).rows[0].n, 2);
  await f.close();
});

test('DATABASE_CA_FILE strips sslmode and enables verified TLS in the pg config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'itda-ca-'));
  const caFile = join(dir, 'ca.pem');
  await writeFile(caFile, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
  const withCa: any = pgPoolConfig(
    'postgres://u:p@db.example:5432/app?sslmode=no-verify&application_name=itda',
    undefined,
    caFile,
  );
  assert.ok(!withCa.connectionString.includes('sslmode'));
  assert.ok(withCa.connectionString.includes('application_name=itda'));
  assert.equal(withCa.ssl.rejectUnauthorized, true);
  assert.match(withCa.ssl.ca, /TEST/);
  const without: any = pgPoolConfig('postgres://u:p@db.example:5432/app?sslmode=require', undefined, undefined);
  assert.ok(without.connectionString.includes('sslmode=require'));
  assert.equal(without.ssl, undefined);
});

test('an empty JSON body is a 400, not a 500', async () => {
  const f = await fixture();
  const user = await f.login();
  const response = await f.app.inject({
    method: 'POST',
    url: '/v1/organizations',
    headers: { origin, cookie: user.cookie, 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
    payload: '',
  });
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(response.json().error.code, 'invalid_request');
  await f.close();
});
