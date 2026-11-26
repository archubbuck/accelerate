import type { Database } from "@accelerate/data-core";
import {
  planMigrations,
  type Migration,
  type AppliedMigration,
} from "@accelerate/migrations-core";

/** Each batch, including its history, commits or rolls back as a unit. Supply only trusted SQL. */
export function migrate(
  db: Database,
  manifest: readonly Migration[],
  options: { dryRun?: boolean } = {},
) {
  return db.transaction(
    async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(1824652001, 7)");
      if (options.dryRun) {
        const exists = await tx.query<{ present: boolean }>(
          "SELECT to_regclass('accelerate_migrations') IS NOT NULL AS present",
        );
        if (!exists.rows[0].present) {
          return (await planMigrations(manifest, [])).map(m => m.id);
        }
      } else {
        await tx.query(
          "CREATE TABLE IF NOT EXISTS accelerate_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
        );
      }
      const history = await tx.query<AppliedMigration>("SELECT id, checksum FROM accelerate_migrations");
      const plan = await planMigrations(manifest, history.rows);
      if (options.dryRun) return plan.map(m => m.id);
      for (const migration of plan) {
        for (const sql of migration.statements) await tx.query(sql);
        await tx.query(
          "INSERT INTO accelerate_migrations(id, checksum) VALUES ($1, $2)",
          [migration.id, migration.checksum],
        );
      }
      return plan.map((m) => m.id);
    },
    { isolationLevel: "read committed" },
  );
}
