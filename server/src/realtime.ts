import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { cookies, currentUser, sessionHash } from './auth.js';
import { isUuid } from './idempotency.js';
import type { Config } from './config.js';
import { ApiError } from './errors.js';
import type { Database } from './types.js';

export const MAX_SUBSCRIPTIONS = 500;

interface Client {
  socket: WebSocket;
  userId: string;
  sessionId: string;
  capsuleIds: Set<string>;
  expiryTimer?: NodeJS.Timeout;
}

export class RealtimeHub {
  private readonly clients = new Set<Client>();

  add(socket: WebSocket, userId: string, sessionId: string, expiresAt?: Date): Client | null {
    // A socket that closed while the session lookup was pending would never fire 'close' again.
    if (socket.readyState !== socket.OPEN) return null;
    const client: Client = { socket, userId, sessionId, capsuleIds: new Set<string>() };
    this.clients.add(client);
    if (expiresAt) {
      // setTimeout overflows past ~24.8 days; re-arm in slices.
      const arm = () => {
        const remaining = expiresAt.getTime() - Date.now();
        if (remaining <= 0) return socket.close();
        client.expiryTimer = setTimeout(arm, Math.min(remaining, 2 ** 30));
        client.expiryTimer.unref?.();
      };
      arm();
    }
    socket.once('close', () => {
      if (client.expiryTimer) clearTimeout(client.expiryTimer);
      this.clients.delete(client);
    });
    return client;
  }

  /** Accumulates readable capsule ids; non-UUIDs and unreadable ids are ignored. */
  async subscribe(db: Database, client: Client, capsuleIds: unknown): Promise<void> {
    if (!Array.isArray(capsuleIds)) return;
    const wanted = [...new Set(capsuleIds.filter(isUuid).map((id) => id.toLowerCase()))].filter(
      (id) => !client.capsuleIds.has(id),
    );
    if (!wanted.length) return;
    // Terminal capsules (confirmed/cancelled/deferred) are evicted first to make room for new subscriptions.
    let evictable: string[] = [];
    if (client.capsuleIds.size + wanted.length > MAX_SUBSCRIPTIONS && client.capsuleIds.size) {
      const finished = await db.query<{ id: string }>(
        `select id from capsules where id=any($1::uuid[]) and status in ('confirmed','cancelled','deferred')`,
        [[...client.capsuleIds]],
      );
      evictable = finished.rows.map((row) => row.id);
    }
    const capacity = MAX_SUBSCRIPTIONS - client.capsuleIds.size + evictable.length;
    if (capacity <= 0) return;
    const limited = wanted.slice(0, capacity);
    const readable = await db.query<{ capsule_id: string }>(
      `select capsule_id from capsule_members
       where capsule_id = any($1::uuid[]) and user_id=$2 and departed_at is null`,
      [limited, client.userId],
    );
    for (const row of readable.rows) {
      if (client.capsuleIds.size >= MAX_SUBSCRIPTIONS) {
        const victim = evictable.pop();
        if (!victim) break;
        client.capsuleIds.delete(victim);
      }
      client.capsuleIds.add(row.capsule_id);
    }
  }

  closeSession(sessionId: string): void {
    for (const client of this.clients) if (client.sessionId === sessionId) client.socket.close();
  }

  /** Re-authorizes every recipient at publish time. */
  async publish(db: Database, topic: string, payload: any): Promise<void> {
    let candidates = [...this.clients].filter((client) => client.socket.readyState === client.socket.OPEN);
    let build: (client: Client) => unknown;
    let allowedUsers: Set<string>;
    if (topic === 'capsule.changed') {
      candidates = candidates.filter((client) => client.capsuleIds.has(payload.capsuleId));
      if (!candidates.length) return;
      const rows = await db.query<{ user_id: string }>(
        `select cm.user_id from capsule_members cm
         join capsules c on c.id=cm.capsule_id
         join org_members om on om.org_id=c.org_id and om.user_id=cm.user_id and om.left_at is null
         where cm.capsule_id=$1 and cm.departed_at is null`,
        [payload.capsuleId],
      );
      allowedUsers = new Set(rows.rows.map((row) => row.user_id));
      build = () => ({ type: topic, capsuleId: payload.capsuleId, version: payload.version });
    } else if (topic === 'calendar.changed') {
      if (!candidates.length) return;
      const rows = await db.query<{ user_id: string }>(
        'select user_id from org_members where org_id=$1 and left_at is null',
        [payload.orgId],
      );
      allowedUsers = new Set(rows.rows.map((row) => row.user_id));
      build = () => ({ type: topic, orgId: payload.orgId });
    } else if (topic === 'notification') {
      candidates = candidates.filter((client) => client.userId === payload.userId);
      allowedUsers = new Set([payload.userId]);
      build = () => ({ type: topic, id: payload.id, text: payload.text });
    } else return;
    candidates = candidates.filter((client) => allowedUsers.has(client.userId));
    if (!candidates.length) return;
    const sessions = await db.query<{ id: string }>(
      'select id from sessions where id=any($1::text[]) and expires_at > now()',
      [[...new Set(candidates.map((client) => client.sessionId))]],
    );
    const live = new Set(sessions.rows.map((row) => row.id));
    for (const client of candidates) {
      if (!live.has(client.sessionId)) {
        client.socket.close();
        continue;
      }
      try {
        client.socket.send(JSON.stringify(build(client)));
      } catch {
        client.socket.close();
      }
    }
  }

  close(): void {
    for (const client of this.clients) client.socket.close();
    this.clients.clear();
  }
}

export function registerRealtime(app: FastifyInstance, db: Database, config: Config, hub: RealtimeHub): void {
  app.register(async (scope) => {
    await scope.register(websocket);
    scope.get(
      '/v1/ws',
      {
        websocket: true,
        preValidation: async (request) => {
          if (request.headers.origin !== config.appOrigin)
            throw new ApiError(403, 'bad_origin', '허용되지 않은 출처예요.');
          const user = await currentUser(db, request);
          if (!user) throw new ApiError(401, 'unauthenticated', '로그인이 필요해요.');
        },
      },
      (socket, request) => {
        // Attach the listener synchronously: @fastify/websocket drops messages that arrive before it exists.
        const ready = (async () => {
          const user = await currentUser(db, request);
          const token = cookies(request.headers.cookie).itda_session;
          if (!user || !token) throw new Error('unauthenticated');
          const session = await db.query<{ expires_at: Date | string }>('select expires_at from sessions where id=$1', [
            sessionHash(token),
          ]);
          const added = hub.add(
            socket,
            user.id,
            sessionHash(token),
            new Date(session.rows[0]?.expires_at ?? Date.now()),
          );
          if (!added) throw new Error('socket closed');
          return added;
        })();
        ready.catch(() => socket.close());
        let queue: Promise<unknown> = ready.catch(() => {});
        socket.on('message', (raw) => {
          queue = queue.then(async () => {
            try {
              const client = await ready;
              const message = JSON.parse(raw.toString());
              if (message?.type === 'subscribe') await hub.subscribe(db, client, message.capsuleIds);
            } catch {
              // Malformed and unauthorized subscriptions are deliberately ignored.
            }
          });
        });
      },
    );
  });
}

export class OutboxDispatcher {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = true;

  constructor(
    private readonly db: Database,
    private readonly publish: (topic: string, payload: any) => void | Promise<void>,
    private readonly intervalMs = 500,
  ) {}

  async drain(): Promise<number> {
    let sent = 0;
    while (true) {
      const count = await this.db.transaction(async (tx) => {
        const rows = await tx.query<any>(
          `select id,topic,payload from outbox where sent_at is null
           order by id for update skip locked limit 100`,
        );
        // A failing re-authorization query throws: the transaction rolls back, nothing is marked sent,
        // and the next drain retries (socket send errors are already contained inside publish).
        for (const row of rows.rows) await this.publish(row.topic, row.payload);
        if (rows.rowCount)
          await tx.query('update outbox set sent_at=now() where id=any($1::bigint[])', [
            rows.rows.map((row) => row.id),
          ]);
        return rows.rowCount;
      });
      sent += count;
      if (count < 100) return sent;
    }
  }

  private schedule(delay: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.running = this.drain()
        .catch(() => {})
        .then(() => {
          this.running = undefined;
          this.schedule(this.intervalMs);
        });
    }, delay);
    this.timer.unref?.();
  }

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  wake(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
