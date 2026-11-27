import {
  expiresAt,
  type QuotaStore,
  type QuotaState,
} from "@accelerate/rate-limit-core";
import type { Database } from "@accelerate/data-core";
import type { Migration } from "@accelerate/migrations-core";
export const quotaMigration: Migration = {
  id: "accelerate-rate-limit/1",
  statements: [
    "CREATE TABLE accelerate_quotas (partition_key text PRIMARY KEY,state jsonb NOT NULL,expires_at bigint NOT NULL)",
    "CREATE INDEX accelerate_quota_expiry ON accelerate_quotas(expires_at)",
  ],
};
export function createPostgresQuotaStore(db: Database) {
  const store: QuotaStore = {
    update(key, fn) {
      return db.transaction(async (tx) => {
        // Serialize first use as well as updates. A conflicting insertion can roll back.
        const row = await tx.query<{ state: QuotaState }>(
          "INSERT INTO accelerate_quotas VALUES ($1,'[]',0) ON CONFLICT (partition_key) DO UPDATE SET partition_key=excluded.partition_key RETURNING state",
          [key],
        );
        const clock = await tx.query<{ now: string }>(
          "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now",
        );
        const now = Number(clock.rows[0].now);
        const change = fn(row.rows[0].state, now);
        if (change.state?.length)
          await tx.query(
            "UPDATE accelerate_quotas SET state=$2::jsonb,expires_at=$3 WHERE partition_key=$1",
            [key, JSON.stringify(change.state), expiresAt(change.state)],
          );
        else if (change.state || !row.rows[0].state.length)
          await tx.query(
            "DELETE FROM accelerate_quotas WHERE partition_key=$1",
            [key],
          );
        return change.value;
      });
    },
  };
  return {
    ...store,
    async prune(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
        throw new RangeError("Invalid prune limit");
      return (
        await db.query(
          "WITH expired AS (SELECT partition_key FROM accelerate_quotas WHERE expires_at<=floor(extract(epoch FROM statement_timestamp())*1000) ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM accelerate_quotas q USING expired e WHERE q.partition_key=e.partition_key",
          [limit],
        )
      ).rowCount;
    },
  };
}
