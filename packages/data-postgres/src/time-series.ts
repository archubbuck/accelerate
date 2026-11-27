import type { Database } from "@accelerate/data-core";
import {
  assertTimestamp, prepareObservationBatch, validateObservationRange,
  type Observation, type ObservationRange, type SeriesPolicy,
} from "@accelerate/data-core/time-series";

export const timeSeriesSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_time_series (
    scope text NOT NULL, series_id text NOT NULL, latest_at bigint, PRIMARY KEY(scope, series_id)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_observations (
    scope text NOT NULL, series_id text NOT NULL, observed_at bigint NOT NULL,
    value double precision, metadata jsonb,
    PRIMARY KEY(scope, series_id, observed_at),
    FOREIGN KEY (scope, series_id) REFERENCES accelerate_time_series(scope, series_id)
  ) PARTITION BY RANGE (observed_at)`,
  `CREATE TABLE IF NOT EXISTS accelerate_observations_default
    PARTITION OF accelerate_observations DEFAULT`,
] as const;

function validateId(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new TypeError("Invalid time-series identifier");
}

export function createPostgresTimeSeriesStore(db: Database, scope: string) {
  validateId(scope);
  return {
    async ingest<M>(series: string, input: readonly Observation<M>[], policies: SeriesPolicy = {}) {
      validateId(series);
      const { observations, duplicates } = prepareObservationBatch(input, policies);
      if (!observations.length) return 0;
      return db.transaction(async tx => {
        await tx.query("INSERT INTO accelerate_time_series (scope,series_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [scope, series]);
        const state = (await tx.query<{ latest_at: string | null }>(
          "SELECT latest_at FROM accelerate_time_series WHERE scope=$1 AND series_id=$2 FOR UPDATE", [scope, series],
        )).rows[0];
        const latest = state.latest_at === null ? undefined : Number(state.latest_at);
        if (policies.outOfOrder === "reject" && latest !== undefined && observations[0].at < latest) {
          throw new Error("Out-of-order observation");
        }
        const conflict = duplicates === "reject" ? ""
          : duplicates === "ignore" ? "ON CONFLICT DO NOTHING"
            : "ON CONFLICT (scope,series_id,observed_at) DO UPDATE SET value=EXCLUDED.value, metadata=EXCLUDED.metadata";
        const result = await tx.query(
          `INSERT INTO accelerate_observations (scope,series_id,observed_at,value,metadata)
           SELECT $1,$2,elem.at,elem.value,elem.metadata
           FROM jsonb_to_recordset($3::jsonb) AS elem(at bigint,value double precision,metadata jsonb)
           ${conflict}`, [scope, series, JSON.stringify(observations)],
        );
        await tx.query("UPDATE accelerate_time_series SET latest_at=GREATEST(latest_at,$3) WHERE scope=$1 AND series_id=$2",
          [scope, series, observations[observations.length - 1].at]);
        return result.rowCount;
      });
    },
    async range<M = Readonly<Record<string, unknown>>>(series: string, range: ObservationRange): Promise<Observation<M>[]> {
      validateId(series);
      const limit = validateObservationRange(range);
      const { rows } = await db.query<{ observed_at: string; value: number | null; metadata: M | null }>(
        `SELECT observed_at,value,metadata FROM accelerate_observations
         WHERE scope=$1 AND series_id=$2 AND observed_at >= $3 AND observed_at < $4
           AND ($5::bigint IS NULL OR observed_at > $5) ORDER BY observed_at LIMIT $6`,
        [scope, series, range.start, range.end, range.after ?? null, limit],
      );
      return rows.map(row => ({
        at: Number(row.observed_at), value: row.value, ...(row.metadata !== null ? { metadata: row.metadata } : {}),
      }));
    },
    async prune(series: string, before: number, limit = 1000) {
      validateId(series);
      assertTimestamp(before);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError("Invalid time-series retention limit");
      const result = await db.query(
        `WITH expired AS (
           SELECT observed_at FROM accelerate_observations WHERE scope=$1 AND series_id=$2 AND observed_at < $3
           ORDER BY observed_at LIMIT $4
         )
         DELETE FROM accelerate_observations WHERE scope=$1 AND series_id=$2 AND observed_at IN (SELECT observed_at FROM expired)`,
        [scope, series, before, limit],
      );
      return result.rowCount;
    },
  };
}
