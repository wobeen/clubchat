import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
  return port;
}

const databaseDir = await mkdtemp(join(tmpdir(), 'itda-pg16-'));
const port = await availablePort();
const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'postgres',
  password: 'password',
  persistent: false,
  autoRehydrateSymlinks: true,
  onLog: () => {},
});

let exitCode = 1;
try {
  await postgres.initialise();
  await postgres.start();
  const testsDir = resolve('../tests/server');
  const tests = (await readdir(testsDir))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => join(testsDir, name));
  exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, ['--test', '--import', 'tsx', ...tests], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgres://postgres:password@127.0.0.1:${port}/postgres`,
      },
    });
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
} finally {
  await postgres.stop().catch(() => {});
  await rm(databaseDir, { recursive: true, force: true }).catch(() => {});
}
process.exitCode = exitCode;
