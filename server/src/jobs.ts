// @ts-expect-error shared domain module is intentionally plain JavaScript
import * as domain from '../../public/domain.js';
import { domainState } from './capsules.js';
import type { Database } from './types.js';

const json = (value: unknown) => JSON.stringify(value);

async function activateScheduled(tx: Database, capsuleId: string, now: Date): Promise<boolean> {
  const locked = await tx.query<any>('select id,version,created_by from capsules where id=$1 for update', [capsuleId]);
  if (!locked.rows[0]) return false;
  const state = await domainState(tx, capsuleId, locked.rows[0].created_by, [capsuleId], [capsuleId]);
  if (!domain.activateScheduled(state, now.getTime())) return false;
  const updated = await tx.query<any>(
    `update capsules set status='open',version=version+1
     where id=$1 and version=$2 and status='scheduled' returning version`,
    [capsuleId, locked.rows[0].version],
  );
  if (!updated.rowCount) return false;
  await tx.query(`insert into outbox (topic,payload) values ('capsule.changed',$1)`, [
    json({ capsuleId, version: updated.rows[0].version }),
  ]);
  return true;
}

async function cleanup(tx: Database, now: Date): Promise<void> {
  await tx.query('delete from sessions where expires_at <= $1', [now.toISOString()]);
  await tx.query(`delete from idempotency_keys where created_at <= $1::timestamptz - interval '24 hours'`, [
    now.toISOString(),
  ]);
  await tx.query('delete from invites where expires_at <= $1 or revoked_at is not null', [now.toISOString()]);
}

async function processJob(tx: Database, job: any, now: Date): Promise<void> {
  if (job.kind === 'activate-scheduled') await activateScheduled(tx, job.payload.capsuleId, now);
  else if (job.kind === 'cleanup') await cleanup(tx, now);
  else throw new Error(`Unknown job kind: ${job.kind}`);
  if (job.kind === 'cleanup')
    await tx.query(
      `update jobs set status='pending',run_at=$2::timestamptz + interval '1 hour',attempts=0,last_error=null
       where id=$1`,
      [job.id, now.toISOString()],
    );
  else await tx.query("update jobs set status='done',last_error=null where id=$1", [job.id]);
}

export async function runDueJobs(db: Database, now = new Date()): Promise<number> {
  let processed = 0;
  while (true) {
    let jobId: string | undefined;
    try {
      const found = await db.transaction(async (tx) => {
        const due = await tx.query<any>(
          `select id,kind,payload,attempts from jobs
           where status='pending' and run_at <= $1 order by run_at,id for update skip locked limit 1`,
          [now.toISOString()],
        );
        const job = due.rows[0];
        if (!job) return false;
        jobId = String(job.id);
        await processJob(tx, job, now);
        return true;
      });
      if (!found) return processed;
      processed++;
    } catch (error) {
      if (!jobId) throw error;
      await db.query(
        `update jobs set attempts=attempts+1,
         status=case when attempts+1 >= 5 then 'failed' else 'pending' end,
         run_at=$2::timestamptz + make_interval(mins => power(2,least(attempts+1,10))::int),
         last_error=$3 where id=$1`,
        [jobId, now.toISOString(), error instanceof Error ? error.message : String(error)],
      );
      processed++;
    }
  }
}

export class JobWorker {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = true;

  constructor(
    private readonly db: Database,
    private readonly wakeOutbox: () => void = () => {},
    private readonly intervalMs = 500,
  ) {}

  async start(): Promise<void> {
    await this.db.query(
      `insert into jobs (kind,payload,run_at) values ('cleanup',$1,now())
       on conflict (kind,payload) do update set status=case when jobs.status='failed' then jobs.status else 'pending' end`,
      [json({})],
    );
    this.stopped = false;
    this.schedule(0);
  }

  private schedule(delay: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.running = runDueJobs(this.db)
        .then((count) => {
          if (count) this.wakeOutbox();
        })
        .catch(() => {})
        .then(() => {
          this.running = undefined;
          this.schedule(this.intervalMs);
        });
    }, delay);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
