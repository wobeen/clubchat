import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './types.js';
import { ApiError } from './errors.js';

export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function cookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map((part) => {
    const at = part.indexOf('=');
    return at < 0 ? [part.trim(), ''] : [part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1))];
  }));
}

export async function issueSession(db: Database, reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await db.query("insert into sessions (id, user_id, expires_at) values ($1, $2, now() + interval '30 days')", [sessionHash(token), userId]);
  reply.header('set-cookie', `itda_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}

export async function currentUser(db: Database, request: FastifyRequest): Promise<{ id: string; name: string } | null> {
  const token = cookies(request.headers.cookie).itda_session;
  if (!token) return null;
  const result = await db.query<{ id: string; name: string }>(`select u.id, u.name from sessions s
    join users u on u.id = s.user_id where s.id = $1 and s.expires_at > now()`, [sessionHash(token)]);
  return result.rows[0] ?? null;
}

export async function requireUser(db: Database, request: FastifyRequest) {
  const user = await currentUser(db, request);
  if (!user) throw new ApiError(401, 'unauthenticated', '로그인이 필요해요.');
  return user;
}

export function signState(config: Config): string {
  const payload = Buffer.from(JSON.stringify({ nonce: randomBytes(16).toString('hex'), exp: Date.now() + 10 * 60_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')}`;
}

export function verifyState(config: Config, value: string): boolean {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', config.sessionSecret).update(payload).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
