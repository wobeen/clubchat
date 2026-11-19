import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDatabase } from './db.js';
import { migrate } from './migrate.js';
import { JobWorker } from './jobs.js';
import { OutboxDispatcher, RealtimeHub } from './realtime.js';

const config = loadConfig();
const db = createPgDatabase(config.databaseUrl);
await migrate(db);
const realtime = new RealtimeHub();
const outbox = new OutboxDispatcher(db, (topic, payload) => realtime.publish(db, topic, payload));
const jobs = new JobWorker(db, () => outbox.wake());
const app = buildApp({ db, config, logger: true, realtime, wakeOutbox: () => outbox.wake() });
await app.listen({ port: config.port, host: '0.0.0.0' });
outbox.start();
await jobs.start();

const close = async () => {
  await jobs.stop();
  await outbox.stop();
  realtime.close();
  await app.close();
  await db.close?.();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
