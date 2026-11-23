import type { Job, JobHandler, JobQueue, JobWorker } from "@accelerate/jobs-core";
import type { Database } from "@accelerate/data-core";

export const JOBS_SCHEMA = `CREATE TABLE IF NOT EXISTS accelerate_jobs (
  id text PRIMARY KEY,
  name text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  locked_by text,
  locked_until timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS accelerate_jobs_ready_idx ON accelerate_jobs (available_at, created_at) WHERE status = 'pending';`;

type Queryable = Pick<Database, "query">;
export interface PostgresJobWorkerOptions {
  workerId: string;
  pollIntervalMs?: number;
  leaseMs?: number;
  heartbeatMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  onError?: (error: unknown, job: Job) => void;
}
export function createPostgresJobQueue(db: Queryable, idFactory: () => string = () => crypto.randomUUID()): JobQueue {
  return {
    async enqueue<T>(name: string, payload: T, options: { id?: string; delayMs?: number } = {}) {
      if (!name) throw new Error("Job name required");
      const delay = options.delayMs ?? 0;
      if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Invalid delay");
      const id = options.id ?? idFactory();
      await db.query("INSERT INTO accelerate_jobs (id,name,payload,available_at) VALUES ($1,$2,$3::jsonb,now()+($4 * interval '1 millisecond'))", [id, name, JSON.stringify(payload), delay]);
      return id;
    }
  };
}

/** Polling worker with atomic claims, leases and bounded retries.
 * Run migrations before starting. Handlers must be idempotent: a crashed worker
 * can be retried after its lease expires, yielding at-least-once delivery.
 */
export function createPostgresJobWorker(db: Queryable, options: PostgresJobWorkerOptions): JobWorker {
  if (!options.workerId) throw new Error("workerId is required");
  const pollMs = options.pollIntervalMs ?? 1000;
  const leaseMs = options.leaseMs ?? 30000;
  const heartbeatMs = options.heartbeatMs ?? Math.floor(leaseMs / 3);
  const maxAttempts = options.maxAttempts ?? 5;
  const retryMs = options.retryDelayMs ?? 1000;
  if (![pollMs, leaseMs, retryMs, heartbeatMs].every(n => Number.isFinite(n) && n > 0) || heartbeatMs >= leaseMs || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("Invalid worker options");
  const handlers = new Map<string, JobHandler<unknown>>();
  let running = false;
  let controller: AbortController | undefined;
  let loop: Promise<void> | undefined;
  async function claim(): Promise<Job | undefined> {
    const result = await db.query<{ id: string; name: string; payload: unknown; attempts: number; created_at: Date | string }>(
      `UPDATE accelerate_jobs SET status='running', attempts=attempts+1, locked_by=$1,
      locked_until=now()+($2 * interval '1 millisecond')
      WHERE id=(SELECT id FROM accelerate_jobs
        WHERE (status='pending' AND available_at<=now()) OR (status='running' AND locked_until<now())
        ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,name,payload,attempts,created_at`, [options.workerId, leaseMs]);
    const row = result.rows[0];
    return row && { id: row.id, name: row.name, payload: row.payload, attempts: row.attempts, createdAt: new Date(row.created_at).toISOString() };
  }
  async function process(job: Job, signal: AbortSignal) {
    let leaseLost = false;
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing || leaseLost) return;
      renewing = true;
      void db.query("UPDATE accelerate_jobs SET locked_until=now()+($3 * interval '1 millisecond') WHERE id=$1 AND locked_by=$2 AND status='running' AND locked_until>now()", [job.id, options.workerId, leaseMs])
        .then(result => { if (result.rowCount !== 1) leaseLost = true; })
        .catch(error => { leaseLost = true; options.onError?.(error, job); })
        .finally(() => { renewing = false; });
    }, heartbeatMs);
    try {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler registered for ${job.name}`);
      await handler(job, signal);
      if (leaseLost) throw new Error("Job lease lost during execution");
      await db.query("UPDATE accelerate_jobs SET status='completed', locked_by=NULL, locked_until=NULL WHERE id=$1 AND locked_by=$2 AND status='running'", [job.id, options.workerId]);
    } catch (error) {
      const terminal = job.attempts >= maxAttempts;
      await db.query(`UPDATE accelerate_jobs SET status=$3, locked_by=NULL, locked_until=NULL,
        last_error=$4, available_at=now()+($5 * interval '1 millisecond')
        WHERE id=$1 AND locked_by=$2 AND status='running'`,
        [job.id, options.workerId, terminal ? "failed" : "pending", String(error), retryMs * Math.min(job.attempts, 60)]);
      options.onError?.(error, job);
    } finally { clearInterval(heartbeat); }
  }
  async function run(signal: AbortSignal) {
    while (!signal.aborted) {
      try { const job = await claim(); if (job) { await process(job, signal); continue; } }
      catch (error) { options.onError?.(error, { id: "", name: "poll", payload: null, attempts: 0, createdAt: new Date().toISOString() }); }
      await new Promise<void>(resolve => {
        const timer = setTimeout(done, pollMs);
        function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  }
  return {
    register<T>(name: string, handler: JobHandler<T>) {
      if (!name || handlers.has(name)) throw new Error("Handler already registered or name missing");
      handlers.set(name, handler as JobHandler<unknown>);
      return () => { if (handlers.get(name) === handler) handlers.delete(name); };
    },
    async start() { if (running) return; running = true; controller = new AbortController(); loop = run(controller.signal); },
    async stop() { if (!running) return; running = false; controller?.abort(); await loop; }
  };
}
