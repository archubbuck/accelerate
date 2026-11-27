import {
  assertAuditCheckpoint, auditGenesis, createIntegrityAuditRecord, verifyIntegrityAudit,
  type AuditCheckpoint, type IntegrityAuditEvent, type IntegrityAuditRecord,
} from "@accelerate/audit-core/integrity";
import type { Database, QueryExecutor, Transaction } from "@accelerate/data-core";

/** Apply through the application migration runner. */
export const auditIntegritySchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_audit_chain_heads (
    stream text PRIMARY KEY,
    sequence bigint NOT NULL CHECK (sequence >= 0),
    digest text NOT NULL,
    retained_sequence bigint NOT NULL CHECK (retained_sequence >= 0 AND retained_sequence <= sequence),
    retained_digest text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_audit_chain_events (
    stream text NOT NULL REFERENCES accelerate_audit_chain_heads(stream),
    sequence bigint NOT NULL CHECK (sequence > 0),
    event_id text NOT NULL,
    digest text NOT NULL,
    previous_digest text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (stream, sequence)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_audit_chain_event_ids (
    event_id text PRIMARY KEY
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_audit_chain_event_lookup
    ON accelerate_audit_chain_events (stream, (payload->>'action'), sequence)`,
] as const;

interface HeadRow {
  sequence: string;
  digest: string;
  retained_sequence: string;
  retained_digest: string;
}

async function readHead(executor: QueryExecutor, stream: string, lock = false) {
  const genesis = auditGenesis(stream);
  const result = await executor.query<HeadRow>(
    "SELECT sequence, digest, retained_sequence, retained_digest FROM accelerate_audit_chain_heads WHERE stream = $1"
      + (lock ? " FOR UPDATE" : ""), [stream],
  );
  const row = result.rows[0];
  if (!row) return { head: genesis, retained: genesis };
  return {
    head: { stream, sequence: Number(row.sequence), digest: row.digest },
    retained: { stream, sequence: Number(row.retained_sequence), digest: row.retained_digest },
  };
}

interface EventRow {
  stream: string;
  sequence: string;
  digest: string;
  previous_digest: string;
  payload: Omit<IntegrityAuditEvent, "occurredAt"> & { occurredAt: string };
}

interface ListOptions {
  after?: number;
  through?: number;
  limit?: number;
  action?: string;
  resource?: string;
}

async function readPage(executor: QueryExecutor, stream: string, options: ListOptions = {}): Promise<IntegrityAuditRecord[]> {
  auditGenesis(stream);
  const { after = 0, through = Number.MAX_SAFE_INTEGER, limit = 100, action, resource } = options;
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(through) || through < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Invalid audit page");
  const result = await executor.query<EventRow>(
    `SELECT stream, sequence, digest, previous_digest, payload FROM accelerate_audit_chain_events
     WHERE stream = $1 AND sequence > $2 AND sequence <= $3
       AND ($4::text IS NULL OR payload->>'action' = $4)
       AND ($5::text IS NULL OR payload->>'resource' = $5)
     ORDER BY sequence LIMIT $6`,
    [stream, after, through, action ?? null, resource ?? null, limit],
  );
  return result.rows.map(row => ({
    stream: row.stream, sequence: Number(row.sequence), digest: row.digest, previousDigest: row.previous_digest,
    event: { ...row.payload, occurredAt: new Date(row.payload.occurredAt) },
  }));
}

async function append(tx: Transaction, stream: string, event: IntegrityAuditEvent) {
  const genesis = auditGenesis(stream);
  await tx.query(
    `INSERT INTO accelerate_audit_chain_heads (stream, sequence, digest, retained_sequence, retained_digest)
     VALUES ($1, 0, $2, 0, $2) ON CONFLICT DO NOTHING`,
    [stream, genesis.digest],
  );
  const { head } = await readHead(tx, stream, true);
  const record = await createIntegrityAuditRecord(head, event);
  await tx.query("INSERT INTO accelerate_audit_chain_event_ids (event_id) VALUES ($1)", [record.event.id]);
  await tx.query(
    `INSERT INTO accelerate_audit_chain_events (stream, sequence, event_id, digest, previous_digest, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [stream, record.sequence, record.event.id, record.digest, record.previousDigest, JSON.stringify(record.event)],
  );
  await tx.query("UPDATE accelerate_audit_chain_heads SET sequence = $2, digest = $3 WHERE stream = $1",
    [stream, record.sequence, record.digest]);
  return record;
}

async function* records(executor: QueryExecutor, stream: string, after: number, through: number) {
  while (after < through) {
    const page = await readPage(executor, stream, { after, through, limit: 500 });
    if (!page.length) return;
    yield* page;
    after = page[page.length - 1].sequence;
  }
}

export function createPostgresIntegrityAuditStore(db: Database) {
  return {
    append: (stream: string, event: IntegrityAuditEvent) => db.transaction(tx => append(tx, stream, event)),
    bind: (tx: Transaction) => ({ append: (stream: string, event: IntegrityAuditEvent) => append(tx, stream, event) }),
    page: (stream: string, options?: ListOptions) => readPage(db, stream, options),
    async checkpoint(stream: string) { return (await readHead(db, stream)).head; },
    verify(stream: string, anchor?: AuditCheckpoint) {
      return db.transaction(async tx => {
        const { head, retained } = await readHead(tx, stream);
        return verifyIntegrityAudit(records(tx, stream, retained.sequence, head.sequence), retained, head, anchor);
      }, { isolationLevel: "repeatable read", readOnly: true });
    },
  };
}

export function createPostgresAuditRetention(db: Database) {
  return {
    /** Supply a previously verified checkpoint kept outside the database. */
    prune(checkpoint: AuditCheckpoint): Promise<number> {
      assertAuditCheckpoint(checkpoint);
      return db.transaction(async tx => {
        const { stream, sequence, digest } = checkpoint;
        const { retained, head } = await readHead(tx, stream, true);
        if (sequence < retained.sequence || sequence > head.sequence) throw new RangeError("Checkpoint outside retained audit history");
        if (sequence === retained.sequence) {
          if (digest !== retained.digest) throw new Error("Checkpoint digest does not match");
          return 0;
        }
        const verified = await verifyIntegrityAudit(
          records(tx, stream, retained.sequence, head.sequence), retained, head, checkpoint,
        );
        if (!verified.ok) throw new Error("Audit checkpoint could not be verified");
        const removed = await tx.query("DELETE FROM accelerate_audit_chain_events WHERE stream = $1 AND sequence <= $2", [stream, sequence]);
        await tx.query("UPDATE accelerate_audit_chain_heads SET retained_sequence = $2, retained_digest = $3 WHERE stream = $1",
          [stream, sequence, digest]);
        return removed.rowCount;
      });
    },
  };
}
