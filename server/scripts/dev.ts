// Local server mode: a persistent embedded PostgreSQL 16 (server/.dev-pg) plus the API with development login.
// AI follows the usual env (AI_PROVIDER, GEMINI_API_KEY / ANTHROPIC_API_KEY, AI_MODEL, AI_TIMEOUT_MS). Gemini is
// for synthetic data only (eval/scenarios via scripts/seed-scenarios.mjs), never real conversations; its free
// tier can take ~50 s under load, so use AI_TIMEOUT_MS=90000 with it.
// Usage (from server/): AI_PROVIDER=gemini AI_TIMEOUT_MS=90000 npm run dev
//   then in the repo root: ITDA_API_URL=http://127.0.0.1:8080 npm start, node scripts/seed-scenarios.mjs, open /?api
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = resolve('.dev-pg');
const pgPort = Number(process.env.DEV_PG_PORT || 54329);
const postgres = new EmbeddedPostgres({
  databaseDir,
  port: pgPort,
  user: 'postgres',
  password: 'password',
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: () => {},
});
if (!existsSync(databaseDir)) await postgres.initialise();
await postgres.start();

const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: `postgres://postgres:password@127.0.0.1:${pgPort}/postgres`,
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://127.0.0.1:4173',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  AUTH_DEV_LOGIN: '1',
  PORT: process.env.PORT || '8080',
  // Development login lets anyone act as any user: keep it off the LAN.
  HOST: '127.0.0.1',
};
const ai = env.AI_PROVIDER || 'anthropic';
const key = ai === 'gemini' ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
console.log(`DB 127.0.0.1:${pgPort} (${databaseDir}) · API :${env.PORT} · AI ${key ? ai : '꺼짐(키 없음)'}`);

const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { stdio: 'inherit', env });
const stop = () => child.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const [code] = (await once(child, 'exit')) as [number | null];
await postgres.stop().catch(() => {});
process.exitCode = code ?? 1;
