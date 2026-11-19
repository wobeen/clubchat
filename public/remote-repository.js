import { uid, syncConfirmedCalendar } from './domain.js';

// Server-backed repository. The API is the source of truth: commands go to the server and the
// returned capsules replace local copies in place, so screen code keeps its object references.
// Read markers and tutorial progress stay in this tab only.
const LOGIN_URL = '/v1/auth/kakao/start';

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `서버 요청에 실패했어요. (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export async function createRemoteRepository({ baseUrl = '', fetch = globalThis.fetch.bind(globalThis) } = {}) {
  const state = {
    version: 3,
    organization: '',
    organizationId: null,
    profileId: null,
    members: [],
    meetings: [],
    calendar: [],
    notifications: [],
    reads: {},
  };
  let status = { kind: 'ready', message: '' };
  let queue = Promise.resolve();
  const serialize = (job) => {
    const pending = queue.then(job, job);
    queue = pending.catch(() => {});
    return pending;
  };

  async function request(method, path, { body, key } = {}) {
    const init = {
      method,
      credentials: 'same-origin',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    };
    let response;
    try {
      response = await fetch(baseUrl + path, init);
    } catch {
      // One network retry. The same Idempotency-Key makes a duplicate delivery replay the first result.
      response = await fetch(baseUrl + path, init).catch(() => {
        throw new Error('서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.');
      });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new ApiError(response.status, data);
      if (response.status === 401)
        status = { kind: 'unauthenticated', message: '로그인이 필요해요.', loginUrl: LOGIN_URL };
      throw error;
    }
    return data;
  }
  const mutate = (path, body) => request('POST', path, { body, key: uid() });

  function upsert(capsule) {
    const current = state.meetings.find((m) => m.id === capsule.id);
    if (!current) {
      state.meetings.unshift(capsule);
      return capsule;
    }
    for (const key of Object.keys(current)) delete current[key];
    return Object.assign(current, capsule);
  }
  async function refresh(id) {
    try {
      return upsert(await request('GET', `/v1/capsules/${id}`));
    } catch (error) {
      if (error.status !== 404) throw error;
      // No longer readable (removed from the capsule): drop the local copy.
      state.meetings = state.meetings.filter((m) => m.id !== id);
      return null;
    }
  }

  async function load() {
    try {
      const me = await request('GET', '/v1/me');
      state.profileId = me.user.id;
      const org = me.organizations[0];
      if (!org) {
        Object.assign(state, { organization: '', organizationId: null, members: [], meetings: [], calendar: [] });
        status = { kind: 'unavailable', message: '참여한 조직이 없어요. 초대 링크로 가입해주세요.' };
        return { ok: false, code: 'no-organization', message: status.message };
      }
      const [members, list] = await Promise.all([
        request('GET', `/v1/organizations/${org.id}/members`),
        request('GET', `/v1/organizations/${org.id}/capsules?filter=all`),
      ]);
      const meetings = await Promise.all(list.map((c) => request('GET', `/v1/capsules/${c.id}`)));
      Object.assign(state, {
        organization: org.name,
        organizationId: org.id,
        members: members.map((m) => ({ id: m.userId, name: m.name, teams: m.teams, grade: m.grade, role: m.role })),
        meetings,
      });
      syncConfirmedCalendar(state);
      status = { kind: 'ready', message: '' };
      return { ok: true, code: 'loaded', message: '' };
    } catch (error) {
      if (error.status !== 401) status = { kind: 'unavailable', message: error.message };
      return { ok: false, code: error.code || 'unavailable', message: status.message };
    }
  }

  const unsupported = () => ({
    ok: false,
    code: 'unsupported',
    message: '서버에 저장된 자료는 이 화면에서 되돌릴 수 없어요.',
  });

  await load();
  return {
    remote: true,
    get: () => state,
    get status() {
      return { ...status };
    },
    get warning() {
      return status.message;
    },
    // Every data change is already stored by command(); there is nothing local to write.
    save: async () => ({ ok: status.kind === 'ready', code: status.kind, message: status.message }),
    retry: () => serialize(load),
    reload: () => serialize(load),
    reset: async () => unsupported(),
    recover: async () => unsupported(),
    export: ({ source = 'current' } = {}) => (source === 'current' ? JSON.stringify(state, null, 2) : ''),
    close() {},
    /**
     * Runs one capsule command against the capsule `version` the screen last saw.
     * Returns the API response; on 409 the capsule is refreshed and the error rethrown.
     */
    command(capsuleId, command, payload, expectedVersion) {
      return serialize(async () => {
        try {
          const response = await mutate(`/v1/capsules/${capsuleId}/commands/${command}`, { expectedVersion, payload });
          upsert(response.capsule);
          for (const affected of response.affected || []) await refresh(affected.id);
          syncConfirmedCalendar(state);
          return response;
        } catch (error) {
          if (error.status === 409) {
            await refresh(capsuleId);
            throw new Error('다른 참여자가 먼저 바꿨어요. 최신 내용을 불러왔으니 다시 확인해주세요.');
          }
          throw error;
        }
      });
    },
    createCapsule({ title, memberIds, description = '', startsAt }) {
      return serialize(async () =>
        upsert(
          await mutate(`/v1/organizations/${state.organizationId}/capsules`, {
            title,
            memberIds,
            description,
            ...(startsAt ? { startsAt } : {}),
          }),
        ),
      );
    },
  };
}
