import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { artifactSha256 } from "@accelerate/data-core/provenance";
import type { ExperimentSpec } from "@accelerate/data-core/experiments";
import { createPostgresDatabase } from "./index.js";
import { createPostgresProvenanceStore, provenanceSchema } from "./provenance.js";
import { createPostgresExperimentStore, experimentSchema } from "./experiments.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("pins dataset versions, preserves observations and prevents terminal runs from changing", async () => {
  const schema = "experiments_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of [...provenanceSchema, ...experimentSchema]) await db.query(statement);
    const provenance = createPostgresProvenanceStore(db, "tenant");
    const store = createPostgresExperimentStore(db, "tenant");
    const spec: ExperimentSpec = {
      id: "test", version: "1", seed: "seed", codeVersion: "sha", configVersion: "c1", metrics: ["score"],
      arms: [{ id: "control", control: true, weight: 1, parameters: {} }, { id: "treatment", weight: 1, parameters: {} }],
      datasets: [{ id: "dataset", version: "1" }],
    };
    await expect(store.define(spec)).rejects.toThrow("Unknown experiment dataset");
    await provenance.recordArtifact({ ...spec.datasets[0], sha256: await artifactSha256("dataset"), retrievedAt: "2026-01-01T00:00:00.000Z" });
    expect(await store.define(spec)).toBe(true);
    expect(await store.define(spec)).toBe(false);
    await store.start("run", spec.id, spec.version);
    const arm = await store.assign("run", "subject");
    expect((await store.assign("run", "subject")).id).toBe(arm.id);
    const input = { subjectId: "subject", metric: "score", observationId: "obs", value: 4 };
    expect(await store.observe("run", input)).toBe(true);
    expect(await store.observe("run", input)).toBe(false);
    expect(await store.finish("run", "completed")).toBe(true);
    await expect(store.observe("run", { ...input, observationId: "other" })).rejects.toThrow("not active");
    expect((await store.compare("run", "score")).find(item => item.arm === arm.id)).toMatchObject({ mean: 4, samples: 1 });
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
