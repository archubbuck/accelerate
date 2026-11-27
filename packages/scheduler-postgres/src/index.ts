import type { Database, Transaction } from "@accelerate/data-core";
import type { Migration } from "@accelerate/migrations-core";
import {
  compileSchedule,
  decideSchedule,
  upcoming,
  type ScheduleDefinition,
  type ScheduleRun,
  type ScheduleState,
  type ScheduleStatus,
} from "@accelerate/scheduler-core";

export const schedulerMigration: Migration = {
  id: "accelerate-scheduler/1",
  statements: [
    "CREATE TABLE accelerate_schedules (id text PRIMARY KEY, definition jsonb NOT NULL, status text NOT NULL CHECK (status IN ('active','paused','cancelled','completed')), next_at bigint)",
    "CREATE INDEX accelerate_schedules_due ON accelerate_schedules(next_at,id) WHERE status='active'",
    "CREATE TABLE accelerate_schedule_history (schedule_id text NOT NULL REFERENCES accelerate_schedules(id), slot bigint NOT NULL, recorded_at bigint NOT NULL, run_id text UNIQUE, skipped_before bigint, PRIMARY KEY(schedule_id,slot), CHECK ((run_id IS NULL) <> (skipped_before IS NULL)))",
  ],
};
interface Row {
  definition: ScheduleDefinition;
  status: ScheduleStatus;
  next_at: string | null;
}
function state(row: Row): ScheduleState {
  return {
    definition: row.definition,
    status: row.status,
    nextAt: row.next_at === null ? null : Number(row.next_at),
  };
}
export interface ScheduleHistoryEntry {
  scheduledAt: number;
  recordedAt: number;
  runId: string | null;
  skippedBefore: number | null;
}
/** Each tick owns at most one due schedule until the transaction commits. */
export function createPostgresScheduler(
  db: Database,
  writeRun: (tx: Transaction, run: ScheduleRun) => Promise<void>,
) {
  async function inspect(id: string): Promise<ScheduleState | null> {
    const r = await db.query<Row>(
      "SELECT definition,status,next_at FROM accelerate_schedules WHERE id=$1",
      [id],
    );
    return r.rows.length ? state(r.rows[0]) : null;
  }
  return {
    inspect,
    async register(definition: ScheduleDefinition) {
      const next = compileSchedule(definition).atOrAfter(definition.startAt);
      const json = JSON.stringify(definition);
      await db.transaction(async (tx) => {
        const inserted = await tx.query(
          "INSERT INTO accelerate_schedules(id,definition,status,next_at) VALUES ($1,$2::jsonb,$3,$4) ON CONFLICT (id) DO NOTHING",
          [definition.id, json, next === null ? "completed" : "active", next],
        );
        if (!inserted.rowCount) {
          const same = await tx.query(
            "SELECT id FROM accelerate_schedules WHERE id=$1 AND definition=$2::jsonb",
            [definition.id, json],
          );
          if (!same.rowCount)
            throw new Error("Conflicting schedule definition");
        }
      });
    },
    async control(id: string, action: "pause" | "resume" | "cancel") {
      const transitions = {
        pause: ["paused", ["active"]],
        resume: ["active", ["paused"]],
        cancel: ["cancelled", ["active", "paused"]],
      } as const;
      if (!Object.hasOwn(transitions, action))
        throw new TypeError("Invalid schedule action");
      const [to, from] = transitions[action];
      const r = await db.query(
        "UPDATE accelerate_schedules SET status=$2 WHERE id=$1 AND status=ANY($3::text[])",
        [id, to, from],
      );
      return r.rowCount === 1;
    },
    async upcoming(id: string, limit = 10) {
      const row = await inspect(id);
      return row?.status === "active" && row.nextAt !== null
        ? upcoming(row.definition, row.nextAt, limit)
        : [];
    },
    async history(
      id: string,
      after = -1,
      limit = 100,
    ): Promise<ScheduleHistoryEntry[]> {
      if (
        !Number.isSafeInteger(after) ||
        after < -1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
      )
        throw new RangeError("Invalid history page");
      const r = await db.query<{
        slot: string;
        recorded_at: string;
        run_id: string | null;
        skipped_before: string | null;
      }>(
        "SELECT slot,recorded_at,run_id,skipped_before FROM accelerate_schedule_history WHERE schedule_id=$1 AND slot>$2 ORDER BY slot LIMIT $3",
        [id, after, limit],
      );
      return r.rows.map((row) => ({
        scheduledAt: Number(row.slot),
        recordedAt: Number(row.recorded_at),
        runId: row.run_id,
        skippedBefore:
          row.skipped_before === null ? null : Number(row.skipped_before),
      }));
    },
    async tick(): Promise<boolean> {
      return db.transaction(async (tx) => {
        const result = await tx.query<
          Row & { now_ms: string }
        >(`WITH clock AS (SELECT floor(extract(epoch FROM statement_timestamp())*1000)::bigint AS now_ms)
      SELECT definition,status,next_at,now_ms FROM accelerate_schedules,clock
      WHERE status='active' AND next_at<=now_ms ORDER BY next_at,id LIMIT 1 FOR UPDATE OF accelerate_schedules SKIP LOCKED`);
        if (!result.rows.length) return false;
        const row = result.rows[0],
          current = state(row);
        const decision = decideSchedule(current, Number(row.now_ms))!;
        if (decision.run) await writeRun(tx, decision.run);
        await tx.query(
          "INSERT INTO accelerate_schedule_history(schedule_id,slot,recorded_at,run_id,skipped_before) VALUES ($1,$2,$3,$4,$5)",
          [
            current.definition.id,
            current.nextAt,
            row.now_ms,
            decision.run?.id ?? null,
            decision.skippedBefore ?? null,
          ],
        );
        await tx.query(
          "UPDATE accelerate_schedules SET next_at=$2,status=$3 WHERE id=$1",
          [
            current.definition.id,
            decision.nextAt,
            decision.nextAt === null ? "completed" : "active",
          ],
        );
        return true;
      });
    },
  };
}
