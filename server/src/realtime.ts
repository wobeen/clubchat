import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { currentUser } from './auth.js';
import { canReadCapsule } from './capsules.js';
import type { Config } from './config.js';
import { ApiError } from './errors.js';
import type { Database } from './types.js';

interface Client {
  socket: WebSocket;
  userId: string;
  orgIds: Set<string>;
  capsuleIds: Set<string>;
}

export class RealtimeHub {
  private readonly clients = new Set<Client>();

  add(socket: WebSocket, userId: string, orgIds: string[]): Client {
    const client = { socket, userId, orgIds: new Set(orgIds), capsuleIds: new Set<string>() };
    this.clients.add(client);
    socket.once('close', () => this.clients.delete(client));
    return client;
  }

  async subscribe(db: Database, client: Client, capsuleIds: unknown): Promise<void> {
    if (!Array.isArray(capsuleIds)) return;
    const allowed = new Set<string>();
    for (const id of capsuleIds)
      if (typeof id === 'string' && (await canReadCapsule(db, id, client.userId))) allowed.add(id);
    client.capsuleIds = allowed;
  }

  publish(topic: string, payload: any): void {
    for (const client of this.clients) {
      let message: any;
      if (topic === 'capsule.changed' && client.capsuleIds.has(payload.capsuleId))
        message = { type: topic, capsuleId: payload.capsuleId, version: payload.version };
      else if (topic === 'calendar.changed' && client.orgIds.has(payload.orgId))
        message = { type: topic, orgId: payload.orgId };
      else if (topic === 'notification' && client.userId === payload.userId)
        message = { type: topic, id: payload.id, text: payload.text };
      if (!message || client.socket.readyState !== client.socket.OPEN) continue;
      try {
        client.socket.send(JSON.stringify(message));
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
      async (socket, request) => {
        const user = await currentUser(db, request);
        if (!user) return socket.close();
        const organizations = await db.query<{ org_id: string }>(
          'select org_id from org_members where user_id=$1 and left_at is null',
          [user.id],
        );
        const client = hub.add(
          socket,
          user.id,
          organizations.rows.map((row) => row.org_id),
        );
        socket.on('message', (raw) => {
          void (async () => {
            try {
              const message = JSON.parse(raw.toString());
              if (message?.type === 'subscribe') await hub.subscribe(db, client, message.capsuleIds);
            } catch {
              // Malformed and unauthorized subscriptions are deliberately ignored.
            }
          })();
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
    private readonly publish: (topic: string, payload: any) => void,
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
        for (const row of rows.rows) this.publish(row.topic, row.payload);
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
