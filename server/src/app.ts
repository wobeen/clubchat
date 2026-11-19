import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './types.js';
import { ApiError, notFound } from './errors.js';
import { cookies, currentUser, issueSession, requireUser, sessionHash, signState, verifyState } from './auth.js';
import { assertCanRead, capsuleRepresentation } from './capsules.js';
import { executeCommand } from './commands.js';
import { isUuid, requireIdempotencyKey, withIdempotency } from './idempotency.js';
// @ts-expect-error shared domain module is intentionally plain JavaScript
import { createMeeting } from '../../public/domain.js';

export interface AppOptions {
  db: Database;
  config: Config;
  fetch?: typeof globalThis.fetch;
  logger?: boolean;
}
const body = (request: any) => (request.body && typeof request.body === 'object' ? (request.body as any) : {});
const pathId = (value: unknown): string => {
  if (!isUuid(value)) throw notFound();
  return value;
};

export function buildApp({
  db,
  config,
  fetch: fetchImpl = globalThis.fetch,
  logger = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  app.addHook('onRequest', async (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== config.appOrigin)
      throw new ApiError(403, 'bad_origin', '허용되지 않은 출처예요.');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError)
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    if ((error as any).validation)
      return reply
        .status(400)
        .send({ error: { code: 'invalid_request', message: '요청 형식이 올바르지 않아요.', details: {} } });
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'internal_error', message: '서버 오류가 발생했어요.', details: {} } });
  });

  if (config.authDevLogin)
    app.post('/v1/auth/dev-login', async (request, reply) => {
      const userId = body(request).userId;
      if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId))
        throw new ApiError(400, 'invalid_request', 'userId가 필요해요.');
      await db.query(`insert into users (id,name) values ($1,$2) on conflict (id) do nothing`, [
        userId,
        body(request).name || `개발 사용자 ${userId.slice(0, 8)}`,
      ]);
      await issueSession(db, reply, userId, new URL(config.appOrigin).protocol === 'https:');
      return { user: (await db.query<any>('select id,name from users where id=$1', [userId])).rows[0] };
    });

  app.post('/v1/auth/logout', async (request, reply) => {
    const token = cookies(request.headers.cookie).itda_session;
    if (token) await db.query('delete from sessions where id=$1', [sessionHash(token)]);
    reply.header('set-cookie', 'itda_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  });

  app.get('/v1/auth/kakao/start', async (_request, reply) => {
    if (!config.kakaoClientId || !config.kakaoRedirectUri) throw notFound();
    const state = signState(config);
    reply.header(
      'set-cookie',
      `itda_oauth_state=${state}; Path=/v1/auth/kakao; HttpOnly; SameSite=Lax; Max-Age=600${new URL(config.appOrigin).protocol === 'https:' ? '; Secure' : ''}`,
    );
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.set('client_id', config.kakaoClientId);
    url.searchParams.set('redirect_uri', config.kakaoRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return reply.redirect(url.toString());
  });

  app.get('/v1/auth/kakao/callback', async (request, reply) => {
    const query = request.query as any;
    const saved = cookies(request.headers.cookie).itda_oauth_state;
    if (!query.code || !query.state || saved !== query.state || !verifyState(config, query.state))
      throw new ApiError(400, 'invalid_request', '로그인 상태를 확인할 수 없어요.');
    if (!config.kakaoClientId || !config.kakaoRedirectUri) throw notFound();
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.kakaoClientId,
      redirect_uri: config.kakaoRedirectUri,
      code: query.code,
    });
    if (config.kakaoClientSecret) params.set('client_secret', config.kakaoClientSecret);
    const tokenResponse = await fetchImpl('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!tokenResponse.ok) throw new ApiError(400, 'invalid_request', '카카오 로그인을 완료하지 못했어요.');
    const token = (await tokenResponse.json()) as any;
    const profileResponse = await fetchImpl('https://kapi.kakao.com/v2/user/me', {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) throw new ApiError(400, 'invalid_request', '카카오 사용자 정보를 가져오지 못했어요.');
    const profile = (await profileResponse.json()) as any;
    const name = profile.kakao_account?.profile?.nickname || `카카오 사용자 ${profile.id}`;
    const user = await db.query<any>(
      `insert into users (kakao_id,name) values ($1,$2)
      on conflict (kakao_id) do update set name=excluded.name returning id,name`,
      [String(profile.id), name],
    );
    await issueSession(db, reply, user.rows[0].id, new URL(config.appOrigin).protocol === 'https:');
    reply.header('set-cookie', [
      reply.getHeader('set-cookie') as string,
      `itda_oauth_state=; Path=/v1/auth/kakao; HttpOnly; SameSite=Lax; Max-Age=0`,
    ]);
    return reply.redirect(config.appOrigin);
  });

  app.get('/v1/me', async (request) => {
    const user = await requireUser(db, request);
    const organizations = await db.query<any>(
      `select o.id,o.name,om.role from org_members om join organizations o on o.id=om.org_id where om.user_id=$1 and om.left_at is null order by o.created_at`,
      [user.id],
    );
    return { user, organizations: organizations.rows };
  });

  app.post('/v1/organizations', async (request) => {
    const user = await requireUser(db, request);
    const b = body(request);
    if (typeof b.name !== 'string' || !b.name.trim())
      throw new ApiError(400, 'invalid_request', '조직 이름이 필요해요.');
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: '/v1/organizations', body: b },
      async (tx) => {
        const org = await tx.query<any>(
          'insert into organizations (name,time_zone) values ($1,$2) returning id,name,time_zone',
          [b.name.trim(), b.timeZone || 'Asia/Seoul'],
        );
        await tx.query("insert into org_members (org_id,user_id,role) values ($1,$2,'admin')", [
          org.rows[0].id,
          user.id,
        ]);
        return org.rows[0];
      },
    );
  });

  app.get('/v1/organizations/:orgId/members', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const membership = await db.query('select 1 from org_members where org_id=$1 and user_id=$2 and left_at is null', [
      orgId,
      user.id,
    ]);
    if (!membership.rowCount) throw notFound();
    const members = await db.query<any>(
      `select u.id as user_id,u.name,om.teams,om.grade,om.role from org_members om join users u on u.id=om.user_id where om.org_id=$1 and om.left_at is null order by u.name`,
      [orgId],
    );
    return members.rows.map((m) => ({ userId: m.user_id, name: m.name, teams: m.teams, grade: m.grade, role: m.role }));
  });

  app.post('/v1/organizations/:orgId/capsules', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const b = body(request);
    const orgMember = await db.query('select 1 from org_members where org_id=$1 and user_id=$2 and left_at is null', [
      orgId,
      user.id,
    ]);
    if (!orgMember.rowCount) throw notFound();
    if (typeof b.title !== 'string' || !b.title.trim() || !Array.isArray(b.memberIds))
      throw new ApiError(400, 'invalid_request', '캡슐 정보를 확인해주세요.');
    const orgMembers = await db.query<any>(
      `select u.id,u.name,om.teams,om.grade,om.role from org_members om join users u on u.id=om.user_id where om.org_id=$1 and om.left_at is null`,
      [orgId],
    );
    const state = { profileId: user.id, members: orgMembers.rows, meetings: [] };
    let meeting: any;
    try {
      meeting = createMeeting(state, { title: b.title, memberIds: b.memberIds, description: b.description || '' });
    } catch (error) {
      throw new ApiError(422, 'domain_rule', error instanceof Error ? error.message : String(error));
    }
    if (b.startsAt) {
      if (Number.isNaN(Date.parse(b.startsAt)))
        throw new ApiError(400, 'invalid_request', 'startsAt이 올바르지 않아요.');
      meeting.status = 'scheduled';
      meeting.startsAt = new Date(b.startsAt).toISOString();
    }
    const capsule = await withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: `/v1/organizations/${orgId}/capsules`, body: b },
      async (tx) => {
        await tx.query(
          `insert into capsules (id,org_id,title,description,status,revision,member_set_version,conclusion_version,facilitator_id,starts_at,created_by,created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            meeting.id,
            orgId,
            meeting.title,
            meeting.description,
            meeting.status,
            meeting.revision,
            meeting.memberSetVersion,
            meeting.conclusionVersion,
            meeting.facilitatorId,
            meeting.startsAt || null,
            user.id,
            meeting.createdAt,
          ],
        );
        for (const id of meeting.memberIds)
          await tx.query('insert into capsule_members (capsule_id,user_id) values ($1,$2)', [meeting.id, id]);
        return capsuleRepresentation(tx, meeting.id);
      },
    );
    return capsule;
  });

  app.get('/v1/organizations/:orgId/capsules', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const filter = (request.query as any).filter || 'all';
    if (!['all', 'scheduled'].includes(filter)) throw new ApiError(400, 'invalid_request', '지원하지 않는 필터예요.');
    const rows = await db.query<any>(
      `select c.*, (select row_to_json(x) from (select m.id,m.author_id as "authorId",m.text,m.created_at as "createdAt" from messages m where m.capsule_id=c.id and not m.is_source order by m.created_at desc,m.id desc limit 1)x) last_message
      from capsules c join capsule_members cm on cm.capsule_id=c.id and cm.user_id=$2 and cm.departed_at is null
      where c.org_id=$1 and ($3='all' or c.status='scheduled') order by c.created_at desc`,
      [orgId, user.id, filter],
    );
    return rows.rows.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      revision: c.revision,
      parentId: c.parent_id,
      previousId: c.previous_id,
      lastMessage: c.last_message,
      unreadCount: 0,
      blockers: [],
    }));
  });

  app.get('/v1/capsules/:id', async (request) => {
    const user = await requireUser(db, request);
    const id = pathId((request.params as any).id);
    await assertCanRead(db, id, user.id);
    return capsuleRepresentation(db, id);
  });
  app.get('/v1/capsules/:id/messages', async (request) => {
    const user = await requireUser(db, request);
    const id = pathId((request.params as any).id);
    const q = request.query as any;
    await assertCanRead(db, id, user.id);
    const limit = q.limit === undefined ? 100 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApiError(400, 'invalid_request', 'limit은 1~100이어야 해요.');
    let boundary: any = null;
    if (q.before) {
      if (!isUuid(q.before)) throw new ApiError(400, 'invalid_request', 'before가 올바른 UUID가 아니에요.');
      const r = await db.query<any>(
        'select created_at,id from messages where capsule_id=$1 and id=$2 and not is_source',
        [id, q.before],
      );
      if (!r.rows[0]) throw new ApiError(400, 'invalid_request', 'before 메시지를 찾을 수 없어요.');
      boundary = r.rows[0];
    }
    const rows = await db.query<any>(
      `select * from (select id,author_id,text,created_at from messages where capsule_id=$1 and not is_source
      and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit $4)x order by created_at,id`,
      [id, boundary?.created_at || null, boundary?.id || null, limit],
    );
    return rows.rows.map((m) => ({
      id: m.id,
      authorId: m.author_id,
      text: m.text,
      createdAt: new Date(m.created_at).toISOString(),
    }));
  });

  app.post('/v1/capsules/:id/commands/send-message', async (request, reply) => {
    const user = await requireUser(db, request);
    const key = requireIdempotencyKey(request.headers['idempotency-key']);
    const b = body(request);
    const result = await executeCommand(db, {
      userId: user.id,
      capsuleId: pathId((request.params as any).id),
      command: 'send-message',
      key,
      expectedRevision: b.expectedRevision,
      payload: b.payload,
    });
    return reply.status(result.status).send(result.body);
  });
  return app;
}
