import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDatabase } from './db.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = createPgDatabase(config.databaseUrl);
await migrate(db);
const app = buildApp({ db, config, logger: true });
await app.listen({ port: config.port, host: '0.0.0.0' });

const close = async () => {
  await app.close();
  await db.close?.();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
