/** Deterministic in-memory implementation of the SQL statements used by jobs-postgres.
 * This is a behavioral test double, NOT a PostgreSQL SQL parser.
 * Unsupported SQL fails loudly so production query changes cannot silently pass.
 */
import type { QueryExecutor, QueryParameters, QueryResult } from "@accelerate/data-core";

export interface SimulatedJob {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
  created_at: Date;
  available_at: number;
  status: "pending" | "running" | "completed" | "failed";
  locked_by: string | null;
  locked_until: number | null;
  last_error: string | null;
}
export interface MemoryJobsDatabase extends QueryExecutor {
  readonly jobs: Map<string, SimulatedJob>;
  advance(ms: number): void;
  readonly now: number;
}
export function createMemoryJobsDatabase(initialTime = 0): MemoryJobsDatabase {
  let now = initialTime;
  const jobs = new Map<string, SimulatedJob>();
  function result<Row>(rows: Row[], rowCount = rows.length): QueryResult<Row> { return { rows, rowCount }; }
  return {
    jobs,
    get now() { return now; },
    advance(ms) { if (!Number.isFinite(ms) || ms < 0) throw new RangeError("Invalid advance"); now += ms; },
    async query<Row = Record<string, unknown>>(sql: string, parameters: QueryParameters = []): Promise<QueryResult<Row>> {
      if (sql.startsWith("INSERT INTO accelerate_jobs")) {
        const [id, name, payload, delay] = parameters as [string, string, string, number];
        if (jobs.has(id)) throw new Error("duplicate job id");
        jobs.set(id, { id, name, payload: JSON.parse(payload), attempts: 0, created_at: new Date(now), available_at: now + delay, status: "pending", locked_by: null, locked_until: null, last_error: null });
        return result<Row>([], 1);
      }
      if (sql.includes("RETURNING id,name,payload,attempts,created_at")) {
        const [owner, leaseMs] = parameters as [string, number];
        const candidate = [...jobs.values()].filter(j => (j.status === "pending" && j.available_at <= now) || (j.status === "running" && j.locked_until !== null && j.locked_until < now)).sort((a,b) => a.available_at - b.available_at || a.created_at.getTime() - b.created_at.getTime())[0];
        if (!candidate) return result<Row>([]);
        candidate.status = "running"; candidate.attempts++; candidate.locked_by = owner; candidate.locked_until = now + leaseMs;
        return result([{ id: candidate.id, name: candidate.name, payload: candidate.payload, attempts: candidate.attempts, created_at: candidate.created_at }] as Row[]);
      }
      if (sql.includes("SET locked_until=")) {
        const [id, owner, leaseMs] = parameters as [string, string, number];
        const j = jobs.get(id);
        if (!j || j.status !== "running" || j.locked_by !== owner || j.locked_until === null || j.locked_until <= now) return result<Row>([]);
        j.locked_until = now + leaseMs;
        return result<Row>([], 1);
      }
      if (sql.includes("status='completed'")) {
        const [id, owner] = parameters as [string, string];
        const j = jobs.get(id);
        if (!j || j.status !== "running" || j.locked_by !== owner) return result<Row>([]);
        j.status = "completed"; j.locked_by = null; j.locked_until = null;
        return result<Row>([], 1);
      }
      if (sql.includes("last_error=$4")) {
        const [id, owner, status, error, delay] = parameters as [string, string, "pending" | "failed", string, number];
        const j = jobs.get(id);
        if (!j || j.status !== "running" || j.locked_by !== owner) return result<Row>([]);
        j.status = status; j.last_error = error; j.available_at = now + delay; j.locked_by = null; j.locked_until = null;
        return result<Row>([], 1);
      }
      throw new Error("Unsupported SQL in in-memory jobs simulator: " + sql);
    }
  };
}
