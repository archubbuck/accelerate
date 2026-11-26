import { validateLease, type LockStore } from "@accelerate/locking-core";
import type { Migration } from "@accelerate/migrations-core";
import type { QueryExecutor } from "@accelerate/data-core";

export const lockMigration: Migration = {
  id: "accelerate-locks/1",
  statements: [
    "CREATE TABLE accelerate_locks (key text PRIMARY KEY, owner text NOT NULL, fence bigint NOT NULL, expires timestamptz NOT NULL)",
  ],
};

export function postgresLocks(db: QueryExecutor): LockStore {
  return {
    async acquire(key, owner, ttlMs) {
      validateLease(key, owner, ttlMs);
      const result = await db.query<{ fence: string }>(
        `INSERT INTO accelerate_locks AS l (key,owner,fence,expires)
        VALUES ($1,$2,1,clock_timestamp()+$3 * interval '1 millisecond')
        ON CONFLICT (key) DO UPDATE SET owner=EXCLUDED.owner, fence=l.fence+1,
        expires=clock_timestamp()+$3 * interval '1 millisecond' WHERE l.expires<=clock_timestamp()
        RETURNING fence::text`,
        [key, owner, ttlMs],
      );
      if (result.rowCount) return { key, owner, fence: result.rows[0].fence };
    },
    async renew(lease, ttlMs) {
      validateLease(lease.key, lease.owner, ttlMs);
      const result = await db.query(
        `UPDATE accelerate_locks SET expires=clock_timestamp()+$4 * interval '1 millisecond'
        WHERE key=$1 AND owner=$2 AND fence=$3 AND expires>clock_timestamp()`,
        [lease.key, lease.owner, lease.fence, ttlMs],
      );
      return result.rowCount === 1;
    },
    async release(lease) {
      const result = await db.query(
        `UPDATE accelerate_locks SET expires='-infinity'
        WHERE key=$1 AND owner=$2 AND fence=$3 AND expires>clock_timestamp()`,
        [lease.key, lease.owner, lease.fence],
      );
      return result.rowCount === 1;
    },
  };
}
