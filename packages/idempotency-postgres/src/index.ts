import {
  serializeOutcome,
  validateOperation,
  type Claim,
  type IdempotencyStore,
  type Json,
  type Outcome,
} from "@accelerate/idempotency-core";
import type { Migration } from "@accelerate/migrations-core";
import type { Database } from "@accelerate/data-core";

export const idempotencyMigration: Migration = {
  id: "accelerate-idempotency/1",
  statements: [
    `CREATE TABLE accelerate_idempotency (key text PRIMARY KEY, fingerprint text NOT NULL, token uuid NOT NULL,
   status text NOT NULL CHECK (status IN ('pending','completed','failed')), result jsonb, expires timestamptz NOT NULL)`,
  ],
};

export function postgresIdempotency(db: Database): IdempotencyStore {
  async function settle(c: Claim, o: Outcome, ms: number, abandoned: boolean) {
    validateOperation(c, ms);
    const result = serializeOutcome(o);
    const updated = await db.query(
      `UPDATE accelerate_idempotency SET status=$4,result=$5::jsonb,
      expires=clock_timestamp()+$6 * interval '1 millisecond' WHERE key=$1 AND fingerprint=$2 AND token=$3
      AND status='pending' AND (expires<=clock_timestamp())=$7`,
      [c.key, c.fingerprint, c.token, o.status, result, ms, abandoned],
    );
    return updated.rowCount === 1;
  }
  return {
    async claim(op, ttlMs) {
      validateOperation(op, ttlMs);
      const token = crypto.randomUUID();
      return db.transaction(
        async (tx) => {
          const inserted = await tx.query(
            `INSERT INTO accelerate_idempotency AS i (key,fingerprint,token,status,expires)
          VALUES ($1,$2,$3,'pending',clock_timestamp()+$4 * interval '1 millisecond')
          ON CONFLICT (key) DO UPDATE SET fingerprint=$2,token=$3,status='pending',result=NULL,
          expires=clock_timestamp()+$4 * interval '1 millisecond' WHERE i.status<>'pending' AND i.expires<=clock_timestamp()`,
            [op.key, op.fingerprint, token, ttlMs],
          );
          if (inserted.rowCount)
            return { status: "claimed" as const, claim: { ...op, token } };
          const result = await tx.query<{
            fingerprint: string;
            token: string;
            expired: boolean;
            status: "pending" | "completed" | "failed";
            result: Json;
          }>(
            "SELECT fingerprint,token,status,result,expires<=clock_timestamp() AS expired FROM accelerate_idempotency WHERE key=$1",
            [op.key],
          );
          const row = result.rows[0];
          if (row.fingerprint !== op.fingerprint)
            return { status: "conflict" as const };
          if (row.status !== "pending")
            return { status: row.status, result: row.result };
          if (row.expired)
            return {
              status: "abandoned" as const,
              claim: { ...op, token: row.token },
            };
          return { status: "pending" as const };
        },
        { isolationLevel: "read committed" },
      );
    },
    finish: (claim, outcome, ms) => settle(claim, outcome, ms, false),
    reconcile: (claim, outcome, ms) => settle(claim, outcome, ms, true),
  };
}
