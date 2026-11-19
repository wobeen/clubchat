// Seeds the scenario conversations (eval/scenarios/conversations.json) into a development server
// through the public API, so the AI draft flow can be tried without real user data.
// Needs a server with AUTH_DEV_LOGIN=1. Usage:
//   node scripts/seed-scenarios.mjs [--base http://127.0.0.1:4173]
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = (baseIndex >= 0 ? args[baseIndex + 1] : 'http://127.0.0.1:4173').replace(/\/$/, '');
const data = JSON.parse(await readFile(new URL('../eval/scenarios/conversations.json', import.meta.url), 'utf8'));
const byKey = Object.fromEntries(data.members.map((m) => [m.key, m]));
const cookies = {};

async function call(who, method, path, body) {
  const headers = { origin: base };
  if (cookies[who]) headers.cookie = cookies[who];
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['idempotency-key'] = randomUUID();
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookies[who] = setCookie.split(';')[0];
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} as ${who}: ${response.status} ${json?.error?.message ?? ''}`);
  return json;
}

for (const member of data.members)
  await call(member.key, 'POST', '/v1/auth/dev-login', { userId: member.id, name: member.name });

const me = await call('minsu', 'GET', '/v1/me');
if (me.organizations.some((o) => o.name === data.organization)) {
  console.log(`이미 "${data.organization}" 조직이 있어 건너뜁니다. 새로 넣으려면 서버 DB를 비우세요.`);
  process.exit(0);
}
const org = await call('minsu', 'POST', '/v1/organizations', { name: data.organization });
const invite = await call('minsu', 'POST', `/v1/organizations/${org.id}/invites`, {
  expiresInHours: 1,
  maxUses: data.members.length,
});
for (const member of data.members.filter((m) => m.key !== 'minsu'))
  await call(member.key, 'POST', `/v1/invites/${invite.code}/accept`, {});

const created = {};
async function send(capsule, message) {
  const response = await call(message.by, 'POST', `/v1/capsules/${capsule.id}/commands/send-message`, {
    expectedVersion: capsule.version,
    payload: { text: message.text },
  });
  return response.capsule;
}
for (const scenario of data.scenarios) {
  let capsule;
  if (scenario.delegateFrom) {
    const parent = await call(
      scenario.delegateFrom.by,
      'GET',
      `/v1/capsules/${created[scenario.delegateFrom.scenario].id}`,
    );
    const messageIds = scenario.delegateFrom.messageIndexes.map((i) => parent.messages[i].id);
    const response = await call(scenario.delegateFrom.by, 'POST', `/v1/capsules/${parent.id}/commands/delegate`, {
      expectedVersion: parent.version,
      payload: { title: scenario.title, messageIds, memberIds: scenario.memberKeys.map((k) => byKey[k].id) },
    });
    created[scenario.delegateFrom.scenario] = response.capsule;
    capsule = await call(scenario.memberKeys[0], 'GET', `/v1/capsules/${response.affected[0].id}`);
  } else {
    capsule = await call('minsu', 'POST', `/v1/organizations/${org.id}/capsules`, {
      title: scenario.title,
      description: scenario.purpose,
      memberIds: scenario.memberKeys.filter((k) => k !== 'minsu').map((k) => byKey[k].id),
    });
  }
  for (const message of scenario.messages) capsule = await send(capsule, message);
  created[scenario.key] = capsule;
  console.log(`✓ ${scenario.title}: 메시지 ${scenario.messages.length}개`);
}

console.log(`\n조직 "${data.organization}"에 시나리오 ${data.scenarios.length}개를 넣었어요.`);
console.log('브라우저에서 이 사람으로 보려면 개발자 도구 콘솔에 붙여넣은 뒤 새로고침하세요(서버 모드: ?api):');
for (const member of data.members)
  console.log(
    `  ${member.name}: fetch('/v1/auth/dev-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'${member.id}'})})`,
  );
