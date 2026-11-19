import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepository } from '../public/remote-repository.js';

const user = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const capsule = (id, version, extra = {}) => ({
  id,
  title: '회의',
  status: 'open',
  revision: 0,
  version,
  memberIds: [user],
  messages: [],
  sourceMessages: [],
  confirmations: [],
  confirmationRecords: [],
  conclusions: [],
  carryover: [],
  draft: null,
  createdAt: '2026-11-19T00:00:00.000Z',
  ...extra,
});

function fakeApi(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
    const handler = routes[`${init.method} ${url}`];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'not_found', message: '없어요' } }), { status: 404 });
    const [status, body] = await handler(init);
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}
const baseRoutes = (capsules) => ({
  'GET /v1/me': () => [
    200,
    { user: { id: user, name: '민수' }, organizations: [{ id: org, name: '잇다', role: 'admin' }] },
  ],
  [`GET /v1/organizations/${org}/members`]: () => [
    200,
    [{ userId: user, name: '민수', teams: [], grade: null, role: 'admin' }],
  ],
  [`GET /v1/organizations/${org}/capsules?filter=all`]: () => [200, capsules.map(({ id }) => ({ id }))],
  ...Object.fromEntries(capsules.map((c) => [`GET /v1/capsules/${c.id}`, () => [200, c]])),
});

test('loads the signed-in user, organization members and readable capsules into domain state', async () => {
  const { fetch } = fakeApi(baseRoutes([capsule('c1', 3)]));
  const repo = await createRemoteRepository({ fetch });
  const state = repo.get();
  assert.equal(repo.status.kind, 'ready');
  assert.equal(state.profileId, user);
  assert.equal(state.organization, '잇다');
  assert.deepEqual(state.members, [{ id: user, name: '민수', teams: [], grade: null, role: 'admin' }]);
  assert.equal(state.meetings[0].version, 3);
});

test('a command updates the capsule in place so screen references stay current', async () => {
  const routes = baseRoutes([capsule('c1', 0)]);
  routes['POST /v1/capsules/c1/commands/send-message'] = () => [
    200,
    {
      capsule: capsule('c1', 1, {
        messages: [{ id: 'm1', authorId: user, text: '안녕', createdAt: '2026-11-19T01:00:00.000Z' }],
      }),
      affected: [],
    },
  ];
  const { fetch, calls } = fakeApi(routes);
  const repo = await createRemoteRepository({ fetch });
  const held = repo.get().meetings[0];
  await repo.command('c1', 'send-message', { text: '안녕' }, 0);
  assert.equal(held.version, 1);
  assert.equal(held.messages[0].text, '안녕');
  const sent = calls.at(-1);
  assert.deepEqual(sent.body, { expectedVersion: 0, payload: { text: '안녕' } });
  assert.match(sent.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
});

test('affected capsules from a command are fetched and added', async () => {
  const routes = baseRoutes([capsule('c1', 0)]);
  routes['POST /v1/capsules/c1/commands/delegate'] = () => [
    200,
    { capsule: capsule('c1', 1), affected: [{ id: 'c2', version: 0 }] },
  ];
  routes['GET /v1/capsules/c2'] = () => [200, capsule('c2', 0, { parentId: 'c1' })];
  const { fetch } = fakeApi(routes);
  const repo = await createRemoteRepository({ fetch });
  await repo.command('c1', 'delegate', { title: '하위', messageIds: [], memberIds: [user] }, 0);
  assert.equal(repo.get().meetings.find((m) => m.id === 'c2').parentId, 'c1');
});

test('a stale version refreshes the capsule and reports the conflict without applying anything', async () => {
  let served = capsule('c1', 0);
  const routes = baseRoutes([served]);
  routes['GET /v1/capsules/c1'] = () => [200, served];
  routes['POST /v1/capsules/c1/commands/send-message'] = () => {
    served = capsule('c1', 5);
    return [409, { error: { code: 'version_conflict', message: '충돌', details: { version: 5 } } }];
  };
  const { fetch } = fakeApi(routes);
  const repo = await createRemoteRepository({ fetch });
  await assert.rejects(repo.command('c1', 'send-message', { text: '늦은 메시지' }, 0), /다른 참여자가 먼저/);
  assert.equal(repo.get().meetings[0].version, 5);
  assert.equal(repo.get().meetings[0].messages.length, 0);
});

test('a network failure is retried once with the same idempotency key', async () => {
  const routes = baseRoutes([capsule('c1', 0)]);
  routes['POST /v1/capsules/c1/commands/send-message'] = () => [200, { capsule: capsule('c1', 1), affected: [] }];
  const { fetch: inner, calls } = fakeApi(routes);
  let failNext = false;
  const fetch = async (url, init) => {
    if (failNext && init.method === 'POST') {
      failNext = false;
      calls.push({ url, method: init.method, headers: init.headers, failed: true });
      throw new TypeError('Failed to fetch');
    }
    return inner(url, init);
  };
  const repo = await createRemoteRepository({ fetch });
  failNext = true;
  await repo.command('c1', 'send-message', { text: '재시도' }, 0);
  const posts = calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].headers['idempotency-key'], posts[1].headers['idempotency-key']);
});

test('an expired session asks for login instead of showing data', async () => {
  const { fetch } = fakeApi({
    'GET /v1/me': () => [401, { error: { code: 'unauthenticated', message: '로그인이 필요해요.' } }],
  });
  const repo = await createRemoteRepository({ fetch });
  assert.equal(repo.status.kind, 'unauthenticated');
  assert.equal(repo.status.loginUrl, '/v1/auth/kakao/start');
  assert.equal(repo.get().meetings.length, 0);
});

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('a live change with a newer version refetches the capsule and notifies the screen; stale ones are ignored', async () => {
  FakeSocket.instances = [];
  let served = capsule('c1', 0);
  const routes = baseRoutes([served]);
  routes['GET /v1/capsules/c1'] = () => [200, served];
  const { fetch, calls } = fakeApi(routes);
  const repo = await createRemoteRepository({ fetch, WebSocket: FakeSocket, socketUrl: 'ws://test/v1/ws' });
  const socket = FakeSocket.instances[0];
  socket.open();
  assert.deepEqual(socket.sent[0], { type: 'subscribe', capsuleIds: ['c1'] });
  let changes = 0;
  repo.onChange(() => changes++);
  const before = calls.length;
  socket.receive({ type: 'capsule.changed', capsuleId: 'c1', version: 0 });
  await settle();
  assert.equal(calls.length, before);
  served = capsule('c1', 2, { title: '다른 참여자가 바꾼 제목' });
  socket.receive({ type: 'capsule.changed', capsuleId: 'c1', version: 2 });
  await settle();
  assert.equal(repo.get().meetings[0].title, '다른 참여자가 바꾼 제목');
  assert.equal(changes, 1);
  repo.close();
});

test('after a dropped connection the repository reconnects and reloads what it missed', async () => {
  FakeSocket.instances = [];
  const { fetch, calls } = fakeApi(baseRoutes([capsule('c1', 0)]));
  const repo = await createRemoteRepository({
    fetch,
    WebSocket: FakeSocket,
    socketUrl: 'ws://test/v1/ws',
    reconnectDelay: 1,
  });
  FakeSocket.instances[0].open();
  FakeSocket.instances[0].close();
  await settle();
  assert.equal(FakeSocket.instances.length, 2);
  const mesBefore = calls.filter((c) => c.url === '/v1/me').length;
  FakeSocket.instances[1].open();
  await settle();
  assert.equal(calls.filter((c) => c.url === '/v1/me').length, mesBefore + 1);
  repo.close();
});

test('the read pointer starts from the server unread count and is sent once per last message', async () => {
  const routes = baseRoutes([]);
  const messages = [1, 2, 3].map((n) => ({
    id: `m${n}`,
    authorId: user,
    text: `${n}`,
    createdAt: '2026-11-19T00:00:00.000Z',
  }));
  routes[`GET /v1/organizations/${org}/capsules?filter=all`] = () => [200, [{ id: 'c1', unreadCount: 2 }]];
  routes['GET /v1/capsules/c1'] = () => [200, capsule('c1', 0, { messages })];
  routes['POST /v1/capsules/c1/read'] = () => [200, { ok: true }];
  const { fetch, calls } = fakeApi(routes);
  const repo = await createRemoteRepository({ fetch });
  assert.equal(repo.get().reads[`${user}:c1`], 1);
  repo.markRead('c1', 'm3');
  repo.markRead('c1', 'm3');
  await settle();
  const reads = calls.filter((c) => c.url === '/v1/capsules/c1/read');
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].body, { lastMessageId: 'm3' });
});
