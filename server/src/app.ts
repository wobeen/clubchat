import { createHash, randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './types.js';
import { ApiError, notFound } from './errors.js';
import { cookies, currentUser, issueSession, requireUser, sessionHash, signState, verifyState } from './auth.js';
import { assertCanRead, capsuleRepresentation, domainState } from './capsules.js';
import { executeCommand } from './commands.js';
import { isUuid, requireIdempotencyKey, withIdempotency } from './idempotency.js';
import { RealtimeHub, registerRealtime } from './realtime.js';
// @ts-expect-error shared domain module is intentionally plain JavaScript
import * as domain from '../../public/domain.js';

export interface AppOptions {
  db: Database;
  config: Config;
  fetch?: typeof globalThis.fetch;
  logger?: boolean;
  realtime?: RealtimeHub;
  wakeOutbox?: () => void;
}
const body = (request: any) => (request.body && typeof request.body === 'object' ? (request.body as any) : {});
const pathId = (value: unknown): string => {
  if (!isUuid(value)) throw notFound();
  return value;
};
const codeHash = (code: string) => createHash('sha256').update(code).digest('hex');

export function buildApp({
  db,
  config,
  fetch: fetchImpl = globalThis.fetch,
  logger = false,
  realtime = new RealtimeHub(),
  wakeOutbox = () => {},
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
  registerRealtime(app, db, config, realtime);

  app.get('/health', async () => {
    await db.query('select 1');
    return { ok: true };
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

  const requireAdmin = async (database: Database, orgId: string, userId: string) => {
    const membership = await database.query<{ role: string }>(
      'select role from org_members where org_id=$1 and user_id=$2 and left_at is null',
      [orgId, userId],
    );
    if (!membership.rows[0]) throw notFound();
    if (membership.rows[0].role !== 'admin') throw new ApiError(403, 'forbidden', '조직 관리자만 실행할 수 있어요.');
  };

  app.patch('/v1/organizations/:orgId/members/:userId', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const targetId = pathId((request.params as any).userId);
    const b = body(request);
    if (
      (b.teams !== undefined &&
        (!Array.isArray(b.teams) || !b.teams.every((item: unknown) => typeof item === 'string'))) ||
      (b.grade !== undefined && b.grade !== null && typeof b.grade !== 'string') ||
      (b.role !== undefined && !['admin', 'member'].includes(b.role)) ||
      !['teams', 'grade', 'role'].some((key) => Object.hasOwn(b, key))
    )
      throw new ApiError(400, 'invalid_request', '멤버 정보를 확인해주세요.');
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: request.url, body: b },
      async (tx) => {
        await requireAdmin(tx, orgId, user.id);
        const admins = await tx.query<any>(
          `select user_id,role from org_members where org_id=$1 and left_at is null
           order by user_id for update`,
          [orgId],
        );
        const target = admins.rows.find((row: any) => row.user_id === targetId);
        if (!target) throw notFound();
        if (
          target.role === 'admin' &&
          b.role === 'member' &&
          admins.rows.filter((row: any) => row.role === 'admin').length === 1
        )
          throw new ApiError(422, 'domain_rule', '마지막 조직 관리자는 강등할 수 없어요.');
        const updated = await tx.query<any>(
          `update org_members set
             teams=case when $3 then $4::text[] else teams end,
             grade=case when $5 then $6::text else grade end,
             role=case when $7 then $8::text else role end
           where org_id=$1 and user_id=$2 and left_at is null
           returning user_id,teams,grade,role`,
          [
            orgId,
            targetId,
            Object.hasOwn(b, 'teams'),
            b.teams || [],
            Object.hasOwn(b, 'grade'),
            b.grade ?? null,
            Object.hasOwn(b, 'role'),
            b.role || 'member',
          ],
        );
        return updated.rows[0];
      },
    );
  });

  app.post('/v1/organizations/:orgId/invites', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const b = body(request);
    const hours = Number(b.expiresInHours);
    if (
      !Number.isInteger(hours) ||
      hours <= 0 ||
      hours > 168 ||
      (b.maxUses !== undefined && (!Number.isInteger(b.maxUses) || b.maxUses < 1))
    )
      throw new ApiError(400, 'invalid_request', '초대 만료와 사용 횟수를 확인해주세요.');
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: request.url, body: b },
      async (tx) => {
        await requireAdmin(tx, orgId, user.id);
        const code = randomBytes(24).toString('base64url');
        const invite = await tx.query<any>(
          `insert into invites (org_id,code_hash,created_by,expires_at,max_uses)
           values ($1,$2,$3,now() + make_interval(hours => $4),$5)
           returning id,expires_at`,
          [orgId, codeHash(code), user.id, hours, b.maxUses ?? null],
        );
        return {
          id: invite.rows[0].id,
          code,
          url: `${config.appOrigin.replace(/\/$/, '')}/?invite=${encodeURIComponent(code)}`,
          expiresAt: new Date(invite.rows[0].expires_at).toISOString(),
        };
      },
    );
  });

  app.delete('/v1/organizations/:orgId/invites/:inviteId', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const inviteId = pathId((request.params as any).inviteId);
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: request.url },
      async (tx) => {
        await requireAdmin(tx, orgId, user.id);
        const revoked = await tx.query(
          'update invites set revoked_at=coalesce(revoked_at,now()) where id=$1 and org_id=$2',
          [inviteId, orgId],
        );
        if (!revoked.rowCount) throw notFound();
        return { ok: true };
      },
    );
  });

  app.post('/v1/invites/:code/accept', async (request) => {
    const user = await requireUser(db, request);
    const code = String((request.params as any).code || '');
    if (!code) throw notFound();
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: request.url },
      async (tx) => {
        const invite = await tx.query<any>(
          `select id,org_id,max_uses,uses from invites
           where code_hash=$1 and revoked_at is null and expires_at > now()
           for update`,
          [codeHash(code)],
        );
        if (!invite.rows[0]) throw notFound();
        const active = await tx.query('select 1 from org_members where org_id=$1 and user_id=$2 and left_at is null', [
          invite.rows[0].org_id,
          user.id,
        ]);
        if (!active.rowCount && invite.rows[0].max_uses !== null && invite.rows[0].uses >= invite.rows[0].max_uses)
          throw notFound();
        if (!active.rowCount) {
          await tx.query('update invites set uses=uses+1 where id=$1', [invite.rows[0].id]);
          await tx.query(
            `insert into org_members (org_id,user_id,role) values ($1,$2,'member')
             on conflict (org_id,user_id) do update set role='member',left_at=null`,
            [invite.rows[0].org_id, user.id],
          );
        }
        return { organizationId: invite.rows[0].org_id };
      },
    );
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
      meeting = domain.createMeeting(state, {
        title: b.title,
        memberIds: b.memberIds,
        description: b.description || '',
      });
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
        if (meeting.status === 'scheduled')
          await tx.query(
            `insert into jobs (kind,payload,run_at) values ('activate-scheduled',$1,$2)
             on conflict (kind,payload) do nothing`,
            [JSON.stringify({ capsuleId: meeting.id }), meeting.startsAt],
          );
        return capsuleRepresentation(tx, meeting.id);
      },
    );
    return capsule;
  });

  app.get('/v1/organizations/:orgId/capsules', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const filter = (request.query as any).filter || 'all';
    if (!['all', 'needs_my_confirmation', 'waiting', 'children', 'scheduled'].includes(filter))
      throw new ApiError(400, 'invalid_request', '지원하지 않는 필터예요.');
    const rows = await db.query<any>(
      `select c.*, case when direct.user_id is not null then
        (select row_to_json(x) from (select m.id,m.author_id as "authorId",m.text,m.created_at as "createdAt"
          from messages m where m.capsule_id=c.id and not m.is_source order by m.created_at desc,m.id desc limit 1)x)
        else null end last_message
      from capsules c
      left join capsule_members direct on direct.capsule_id=c.id and direct.user_id=$2 and direct.departed_at is null
      where c.org_id=$1 and
        (direct.user_id is not null or exists (
          select 1 from capsule_members parent_member
          where parent_member.capsule_id=c.parent_id and parent_member.user_id=$2 and parent_member.departed_at is null
        )) order by c.created_at desc`,
      [orgId, user.id],
    );
    if (!rows.rowCount) return [];
    const ids = rows.rows.map((row) => row.id);
    const state = await domainState(db, ids[0], user.id, [], ids);
    const counts = await db.query<any>(
      `select c.id,
         case when direct.user_id is null then 0 else (
           select count(*)::int from messages m where m.capsule_id=c.id and not m.is_source
             and (boundary.id is null or (m.created_at,m.id)>(boundary.created_at,boundary.id))
         ) end as unread_count,
         case when direct.user_id is null or c.draft is null then 0 else (
           select count(*)::int from messages pending where pending.capsule_id=c.id and not pending.is_source
             and not (pending.id=any(coalesce(c.draft_message_ids,'{}'::uuid[])))
         ) end as pending_count
       from capsules c
       left join capsule_members direct on direct.capsule_id=c.id and direct.user_id=$2 and direct.departed_at is null
       left join reads r on r.capsule_id=c.id and r.user_id=$2
       left join messages boundary on boundary.id=r.last_message_id and boundary.capsule_id=c.id
       where c.id=any($1::uuid[])`,
      [ids, user.id],
    );
    const countById = new Map(counts.rows.map((row: any) => [row.id, row]));
    return rows.rows
      .map((c) => {
        const meeting = state.meetings.find((item: any) => item.id === c.id);
        meeting.messages = Array.from({ length: countById.get(c.id)?.pending_count || 0 }, (_, index) => ({
          id: `pending-${index}`,
        }));
        meeting.draftMessageIds = [];
        const needsConfirmation =
          meeting.status === 'review' &&
          meeting.confirmationMemberIds.includes(user.id) &&
          !meeting.confirmations.includes(user.id);
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          revision: c.revision,
          version: c.version,
          parentId: c.parent_id,
          previousId: c.previous_id,
          lastMessage: c.last_message,
          unreadCount: countById.get(c.id)?.unread_count || 0,
          blockers: domain.getMeetingBlockers(state, meeting),
          needsConfirmation,
        };
      })
      .filter(
        (capsule) =>
          filter === 'all' ||
          (filter === 'needs_my_confirmation' && capsule.needsConfirmation) ||
          (filter === 'waiting' && capsule.status === 'review' && !capsule.needsConfirmation) ||
          (filter === 'children' && capsule.parentId) ||
          (filter === 'scheduled' && capsule.status === 'scheduled'),
      )
      .map(({ needsConfirmation: _needsConfirmation, ...capsule }) => capsule);
  });

  app.get('/v1/capsules/:id', async (request) => {
    const user = await requireUser(db, request);
    const id = pathId((request.params as any).id);
    const direct = await db.query(
      'select 1 from capsule_members where capsule_id=$1 and user_id=$2 and departed_at is null',
      [id, user.id],
    );
    if (direct.rowCount) return capsuleRepresentation(db, id);
    const inherited = await db.query(
      `select 1 from capsules child join capsule_members pm on pm.capsule_id=child.parent_id
       where child.id=$1 and pm.user_id=$2 and pm.departed_at is null`,
      [id, user.id],
    );
    if (!inherited.rowCount) throw notFound();
    const capsule = await capsuleRepresentation(db, id, 0, false);
    return {
      id: capsule.id,
      title: capsule.title,
      description: capsule.description,
      status: capsule.status,
      revision: capsule.revision,
      version: capsule.version,
      parentId: capsule.parentId,
      previousId: capsule.previousId,
      startsAt: capsule.startsAt,
      confirmedAt: capsule.confirmedAt,
      createdAt: capsule.createdAt,
      conclusions: capsule.conclusions,
    };
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

  app.post('/v1/capsules/:id/read', async (request) => {
    const user = await requireUser(db, request);
    const id = pathId((request.params as any).id);
    const lastMessageId = body(request).lastMessageId;
    if (!isUuid(lastMessageId)) throw new ApiError(400, 'invalid_request', 'lastMessageId를 확인해주세요.');
    await assertCanRead(db, id, user.id);
    return withIdempotency(
      db,
      user.id,
      requireIdempotencyKey(request.headers['idempotency-key']),
      { path: request.url, lastMessageId },
      async (tx) => {
        const message = await tx.query('select 1 from messages where id=$1 and capsule_id=$2 and not is_source', [
          lastMessageId,
          id,
        ]);
        if (!message.rowCount) throw new ApiError(400, 'invalid_request', '메시지를 찾을 수 없어요.');
        await tx.query(
          `insert into reads (capsule_id,user_id,last_message_id) values ($1,$2,$3)
           on conflict (capsule_id,user_id) do update set last_message_id=excluded.last_message_id,updated_at=now()`,
          [id, user.id, lastMessageId],
        );
        return { ok: true };
      },
    );
  });

  app.get('/v1/organizations/:orgId/calendar', async (request) => {
    const user = await requireUser(db, request);
    const orgId = pathId((request.params as any).orgId);
    const q = request.query as any;
    if (
      typeof q.from !== 'string' ||
      typeof q.to !== 'string' ||
      Number.isNaN(Date.parse(q.from)) ||
      Number.isNaN(Date.parse(q.to)) ||
      Date.parse(q.from) >= Date.parse(q.to)
    )
      throw new ApiError(400, 'invalid_request', '조회 기간을 확인해주세요.');
    const membership = await db.query('select 1 from org_members where org_id=$1 and user_id=$2 and left_at is null', [
      orgId,
      user.id,
    ]);
    if (!membership.rowCount) throw notFound();
    const events = await db.query<any>(
      `select e.* from calendar_events e
       join capsules c on c.id=e.capsule_id and c.status='confirmed'
       where e.org_id=$1 and e.at >= $2 and e.at < $3 and $4=any(e.participant_ids)
         and exists (
           select 1 from capsule_members cm
           where cm.capsule_id=c.id and cm.user_id=$4 and cm.departed_at is null
         )
         and not exists (
           select 1 from capsules correction
           where correction.correction_of=c.id and correction.status='confirmed'
         )
       order by e.at,e.id`,
      [orgId, new Date(q.from).toISOString(), new Date(q.to).toISOString(), user.id],
    );
    return events.rows.map((event) => ({
      id: event.id,
      meetingId: event.capsule_id,
      sourceId: event.source_id,
      kind: event.kind,
      text: event.text,
      at: new Date(event.at).toISOString(),
      location: event.location,
      participantIds: event.participant_ids,
      correctsEventId: event.corrects_event_id,
    }));
  });

  app.get('/v1/events/:eventId.ics', async (request, reply) => {
    const user = await requireUser(db, request);
    const eventId = pathId((request.params as any).eventId);
    const event = await db.query<any>(
      `select e.* from calendar_events e
       join capsules c on c.id=e.capsule_id and c.status='confirmed'
       where e.id=$1 and $2=any(e.participant_ids)
         and exists (
           select 1 from capsule_members cm
           where cm.capsule_id=c.id and cm.user_id=$2 and cm.departed_at is null
         )
         and not exists (
           select 1 from capsules correction
           where correction.correction_of=c.id and correction.status='confirmed'
         )`,
      [eventId, user.id],
    );
    if (!event.rows[0]) throw notFound();
    reply.type('text/calendar; charset=utf-8');
    return domain.makeICS({
      id: event.rows[0].id,
      text: event.rows[0].text,
      at: event.rows[0].at,
      location: event.rows[0].location,
    });
  });

  app.post('/v1/capsules/:id/commands/:command', async (request, reply) => {
    const user = await requireUser(db, request);
    const key = requireIdempotencyKey(request.headers['idempotency-key']);
    const b = body(request);
    const result = await executeCommand(db, {
      userId: user.id,
      capsuleId: pathId((request.params as any).id),
      command: (request.params as any).command,
      key,
      expectedVersion: b.expectedVersion,
      payload: b.payload,
    });
    wakeOutbox();
    return reply.status(result.status).send(result.body);
  });
  return app;
}
