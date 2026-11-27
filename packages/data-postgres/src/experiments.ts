import type { Database } from "@accelerate/data-core";
import { assignExperimentArm, compareExperimentMeans, validateExperiment, type ExperimentSpec } from "@accelerate/data-core/experiments";
import { assertProvenanceId } from "@accelerate/data-core/provenance";

export const experimentSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_experiment_specs (
    scope text NOT NULL, experiment_id text NOT NULL, version text NOT NULL, spec jsonb NOT NULL,
    PRIMARY KEY (scope,experiment_id,version)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_experiment_runs (
    scope text NOT NULL, id text NOT NULL, experiment_id text NOT NULL, version text NOT NULL,
    status text NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
    started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
    PRIMARY KEY (scope,id),
    FOREIGN KEY (scope,experiment_id,version) REFERENCES accelerate_experiment_specs(scope,experiment_id,version)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_experiment_assignments (
    scope text NOT NULL, run_id text NOT NULL, subject_id text NOT NULL, arm_id text NOT NULL,
    PRIMARY KEY (scope,run_id,subject_id),
    FOREIGN KEY (scope,run_id) REFERENCES accelerate_experiment_runs(scope,id)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_experiment_metrics (
    scope text NOT NULL, run_id text NOT NULL, subject_id text NOT NULL, metric text NOT NULL, observation_id text NOT NULL,
    value double precision NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope,run_id,subject_id,metric,observation_id),
    FOREIGN KEY (scope,run_id,subject_id) REFERENCES accelerate_experiment_assignments(scope,run_id,subject_id)
  )`,
] as const;

interface Run {
  status: "running" | "completed" | "failed" | "cancelled";
  spec: ExperimentSpec;
  started_at: Date;
  ended_at: Date | null;
}

export function createPostgresExperimentStore(db: Database, scope: string) {
  assertProvenanceId(scope);
  const readRun = async (executor: Pick<Database, "query">, id: string, lock = false) => {
    assertProvenanceId(id);
    return (await executor.query<Run>(
      `SELECT r.status,r.started_at,r.ended_at,s.spec FROM accelerate_experiment_runs r
       JOIN accelerate_experiment_specs s ON s.scope=r.scope AND s.experiment_id=r.experiment_id AND s.version=r.version
       WHERE r.scope=$1 AND r.id=$2` + (lock ? " FOR UPDATE OF r" : ""), [scope, id],
    )).rows[0];
  };

  return {
    async define(specification: ExperimentSpec) {
      const spec = structuredClone(specification);
      validateExperiment(spec);
      return db.transaction(async tx => {
        for (const dataset of spec.datasets) {
          const found = await tx.query("SELECT artifact_id FROM accelerate_provenance_artifacts WHERE scope=$1 AND artifact_id=$2 AND version=$3",
            [scope, dataset.id, dataset.version]);
          if (!found.rowCount) throw new Error("Unknown experiment dataset version");
        }
        const inserted = await tx.query(
          "INSERT INTO accelerate_experiment_specs (scope,experiment_id,version,spec) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",
          [scope, spec.id, spec.version, JSON.stringify(spec)],
        );
        if (inserted.rowCount) return true;
        const existing = await tx.query("SELECT experiment_id FROM accelerate_experiment_specs WHERE scope=$1 AND experiment_id=$2 AND version=$3 AND spec=$4::jsonb",
          [scope, spec.id, spec.version, JSON.stringify(spec)]);
        if (!existing.rowCount) throw new Error("Conflicting experiment version");
        return false;
      });
    },
    async start(id: string, experiment: string, version: string) {
      for (const key of [id, experiment, version]) assertProvenanceId(key);
      const inserted = await db.query(
        "INSERT INTO accelerate_experiment_runs (scope,id,experiment_id,version,status) VALUES ($1,$2,$3,$4,'running') ON CONFLICT DO NOTHING",
        [scope, id, experiment, version],
      );
      if (inserted.rowCount) return true;
      const existing = await readRun(db, id);
      if (!existing || existing.spec.id !== experiment || existing.spec.version !== version) throw new Error("Conflicting experiment run");
      return false;
    },
    inspect: (id: string) => readRun(db, id),
    async assign(id: string, subjectId: string) {
      assertProvenanceId(subjectId);
      return db.transaction(async tx => {
        const run = await readRun(tx, id, true);
        if (!run || run.status !== "running") throw new Error("Experiment run is not active");
        const arm = await assignExperimentArm(run.spec, subjectId);
        await tx.query("INSERT INTO accelerate_experiment_assignments VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [scope, id, subjectId, arm.id]);
        return arm;
      });
    },
    async observe(id: string, input: { subjectId: string; metric: string; observationId: string; value: number }) {
      const { subjectId, metric, observationId, value } = input;
      for (const key of [subjectId, metric, observationId]) assertProvenanceId(key);
      if (!Number.isFinite(value)) throw new RangeError("Invalid experiment observation");
      return db.transaction(async tx => {
        const run = await readRun(tx, id, true);
        if (!run || run.status !== "running" || !run.spec.metrics.includes(metric)) throw new Error("Experiment metric is not active");
        const inserted = await tx.query(
          `INSERT INTO accelerate_experiment_metrics (scope,run_id,subject_id,metric,observation_id,value)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [scope, id, subjectId, metric, observationId, value],
        );
        if (inserted.rowCount) return true;
        const match = await tx.query(
          `SELECT observation_id FROM accelerate_experiment_metrics
           WHERE scope=$1 AND run_id=$2 AND subject_id=$3 AND metric=$4 AND observation_id=$5 AND value=$6`,
          [scope, id, subjectId, metric, observationId, value],
        );
        if (!match.rowCount) throw new Error("Conflicting experiment observation");
        return false;
      });
    },
    async finish(id: string, status: "completed" | "failed" | "cancelled") {
      assertProvenanceId(id);
      if (!["completed", "failed", "cancelled"].includes(status)) throw new TypeError("Invalid terminal experiment status");
      return (await db.query(
        "UPDATE accelerate_experiment_runs SET status=$3,ended_at=now() WHERE scope=$1 AND id=$2 AND status='running'",
        [scope, id, status],
      )).rowCount === 1;
    },
    async compare(id: string, metric: string) {
      const run = await readRun(db, id);
      if (!run || !run.spec.metrics.includes(metric)) throw new Error("Unknown experiment metric");
      const { rows } = await db.query<{ arm_id: string; samples: string; mean: number }>(
        `SELECT a.arm_id, count(*) AS samples, avg(m.value) AS mean
         FROM accelerate_experiment_metrics m JOIN accelerate_experiment_assignments a
         ON a.scope=m.scope AND a.run_id=m.run_id AND a.subject_id=m.subject_id
         WHERE m.scope=$1 AND m.run_id=$2 AND m.metric=$3 GROUP BY a.arm_id`, [scope, id, metric],
      );
      const byArm = new Map(rows.map(row => [row.arm_id, row]));
      const control = run.spec.arms.find(arm => arm.control)!;
      const controlMean = byArm.get(control.id)?.mean ?? null;
      return run.spec.arms.map(arm => {
        const row = byArm.get(arm.id);
        return { arm: arm.id, samples: Number(row?.samples ?? 0), mean: row?.mean ?? null,
          difference: compareExperimentMeans(controlMean, row?.mean ?? null) };
      });
    },
  };
}
