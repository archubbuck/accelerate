import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { artifactSha256 } from "@accelerate/data-core/provenance";
import { createPostgresDatabase } from "./index.js";
import { createPostgresProvenanceStore, provenanceSchema } from "./provenance.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("traces versioned artifacts, records missing evidence and redacts identifying attributes", async () => {
  const schema = "provenance_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of provenanceSchema) await db.query(statement);
    const provenance = createPostgresProvenanceStore(db, "tenant");
    const at = "2026-01-01T00:00:00.000Z";
    const source = { id: "source", version: "1", sha256: await artifactSha256("source"), source: "https://source.example", retrievedAt: at };
    const output = { id: "output", version: "1", sha256: await artifactSha256("parsed"), retrievedAt: at };
    await provenance.recordArtifact(source);
    await provenance.recordTransformation({
      id: "parse", kind: "extract", version: "v1", recordedAt: at, outputs: [output],
      inputs: [
        { kind: "artifact", artifact: source, passage: { start: 0, end: 3 } },
        { kind: "missing", reference: "missing", reason: "No available copy" },
      ],
      implementation: { model: "model-v1", prompt: "prompt-v2" },
    });
    expect((await provenance.lineage(output)).records.map(record => record.artifact.id)).toEqual(["output", "source"]);
    expect((await provenance.get(output))?.transformation?.inputs[1]).toMatchObject({ kind: "missing" });
    expect(await createPostgresProvenanceStore(db, "other").get(output)).toBeUndefined();
    expect(await provenance.review(source, { reviewerId: "auditor", status: "accepted", reviewedAt: at })).toBe(true);
    await expect(provenance.recordArtifact({ ...source, sha256: await artifactSha256("other") })).rejects.toThrow();
    expect(await provenance.redact(source, at)).toBe(true);
    expect((await provenance.get(source))?.artifact.source).toBeUndefined();
    expect((await provenance.get(source))?.artifact.sha256).toBe(source.sha256);
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
