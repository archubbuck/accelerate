import type { Database, Transaction } from "@accelerate/data-core";
import {
  assertArtifact, assertProvenanceDate, assertProvenanceId, assertTransformation,
  type Artifact, type ArtifactRef, type ProvenanceRecord, type Transformation,
} from "@accelerate/data-core/provenance";

export const provenanceSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_provenance_transformations (
    scope text NOT NULL, id text NOT NULL, body jsonb NOT NULL, PRIMARY KEY (scope, id)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_provenance_artifacts (
    scope text NOT NULL, artifact_id text NOT NULL, version text NOT NULL,
    body jsonb NOT NULL, transformation_id text, review jsonb, redacted_at timestamptz,
    PRIMARY KEY (scope, artifact_id, version),
    FOREIGN KEY (scope, transformation_id) REFERENCES accelerate_provenance_transformations(scope, id)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_provenance_inputs (
    scope text NOT NULL, transformation_id text NOT NULL, artifact_id text NOT NULL, version text NOT NULL,
    PRIMARY KEY (scope, transformation_id, artifact_id, version),
    FOREIGN KEY (scope, transformation_id) REFERENCES accelerate_provenance_transformations(scope, id),
    FOREIGN KEY (scope, artifact_id, version) REFERENCES accelerate_provenance_artifacts(scope, artifact_id, version)
  )`,
] as const;

interface Row {
  body: Artifact;
  transformation?: Omit<Transformation, "outputs">;
  review?: ProvenanceRecord["review"];
  redacted_at?: Date;
}

function mapRow(row: Row): ProvenanceRecord {
  return {
    artifact: row.body,
    ...(row.transformation ? { transformation: row.transformation } : {}),
    ...(row.review ? { review: row.review } : {}),
    ...(row.redacted_at ? { redactedAt: row.redacted_at.toISOString() } : {}),
  };
}

function ref(value: ArtifactRef) {
  assertProvenanceId(value.id);
  assertProvenanceId(value.version);
  return [value.id, value.version] as const;
}

async function insertArtifact(tx: Transaction, scope: string, artifact: Artifact, transformationId?: string) {
  const { id, version, sha256, retrievedAt, source, metadata } = artifact;
  await tx.query(
    `INSERT INTO accelerate_provenance_artifacts (scope, artifact_id, version, body, transformation_id)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [scope, ...ref(artifact), JSON.stringify({ id, version, sha256, retrievedAt, source, metadata }), transformationId ?? null],
  );
}

async function recordTransformation(tx: Transaction, scope: string, transformation: Transformation) {
  const copy = structuredClone(transformation);
  assertTransformation(copy);
  const { outputs, id, kind, version, recordedAt, implementation } = copy;
  const body = {
    id, kind, version, recordedAt,
    implementation: implementation && { model: implementation.model, prompt: implementation.prompt, tools: implementation.tools },
    inputs: copy.inputs.map(evidence => evidence.kind === "missing"
      ? { kind: evidence.kind, reference: evidence.reference, reason: evidence.reason }
      : {
          kind: evidence.kind,
          artifact: { id: evidence.artifact.id, version: evidence.artifact.version },
          passage: evidence.passage && { start: evidence.passage.start, end: evidence.passage.end },
        }),
  };
  await tx.query("INSERT INTO accelerate_provenance_transformations (scope,id,body) VALUES ($1,$2,$3::jsonb)",
    [scope, body.id, JSON.stringify(body)]);
  for (const evidence of body.inputs) {
    if (evidence.kind === "artifact") await tx.query(
      "INSERT INTO accelerate_provenance_inputs VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [scope, body.id, ...ref(evidence.artifact)],
    );
  }
  for (const output of outputs) await insertArtifact(tx, scope, output, body.id);
}

export function createPostgresProvenanceStore(db: Database, scope: string) {
  assertProvenanceId(scope);
  const record = async (tx: Transaction, artifact: Artifact) => {
    const copy = structuredClone(artifact);
    assertArtifact(copy);
    await insertArtifact(tx, scope, copy);
  };

  return {
    recordArtifact: (artifact: Artifact) => db.transaction(tx => record(tx, artifact)),
    recordTransformation: (transform: Transformation) => db.transaction(tx => recordTransformation(tx, scope, transform)),
    bind: (tx: Transaction) => ({
      recordArtifact: (artifact: Artifact) => record(tx, artifact),
      recordTransformation: (transform: Transformation) => recordTransformation(tx, scope, transform),
    }),
    async get(artifact: ArtifactRef) {
      const row = (await db.query<Row>(
        `SELECT a.body, a.review, a.redacted_at, t.body AS transformation
         FROM accelerate_provenance_artifacts a
         LEFT JOIN accelerate_provenance_transformations t ON t.scope=a.scope AND t.id=a.transformation_id
         WHERE a.scope=$1 AND a.artifact_id=$2 AND a.version=$3`,
        [scope, ...ref(artifact)],
      )).rows[0];
      return row && mapRow(row);
    },
    async lineage(artifact: ArtifactRef, limit = 1000) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Invalid provenance lineage limit");
      const { rows } = await db.query<Row>(
        `WITH RECURSIVE nodes(artifact_id,version) AS (
           SELECT artifact_id,version FROM accelerate_provenance_artifacts WHERE scope=$1 AND artifact_id=$2 AND version=$3
           UNION
           SELECT i.artifact_id,i.version FROM nodes n
             JOIN accelerate_provenance_artifacts a ON a.scope=$1 AND a.artifact_id=n.artifact_id AND a.version=n.version
             JOIN accelerate_provenance_inputs i ON i.scope=a.scope AND i.transformation_id=a.transformation_id
         )
         SELECT a.body, a.review, a.redacted_at, t.body AS transformation
         FROM nodes n JOIN accelerate_provenance_artifacts a ON a.scope=$1 AND a.artifact_id=n.artifact_id AND a.version=n.version
         LEFT JOIN accelerate_provenance_transformations t ON t.scope=a.scope AND t.id=a.transformation_id
         ORDER BY n.artifact_id,n.version LIMIT $4`,
        [scope, ...ref(artifact), limit + 1],
      );
      return { records: rows.slice(0, limit).map(mapRow), truncated: rows.length > limit };
    },
    async review(artifact: ArtifactRef, review: NonNullable<ProvenanceRecord["review"]>) {
      assertProvenanceId(review.reviewerId);
      assertProvenanceDate(review.reviewedAt);
      if (!["accepted", "rejected"].includes(review.status)) throw new TypeError("Invalid provenance review status");
      return (await db.query(
        "UPDATE accelerate_provenance_artifacts SET review=$4::jsonb WHERE scope=$1 AND artifact_id=$2 AND version=$3 AND redacted_at IS NULL",
        [scope, ...ref(artifact), JSON.stringify(review)],
      )).rowCount === 1;
    },
    async redact(artifact: ArtifactRef, at: string) {
      assertProvenanceDate(at);
      return (await db.query(
        `UPDATE accelerate_provenance_artifacts SET body=body-'source'-'metadata', redacted_at=$4, review=NULL
         WHERE scope=$1 AND artifact_id=$2 AND version=$3 AND redacted_at IS NULL`,
        [scope, ...ref(artifact), at],
      )).rowCount === 1;
    },
  };
}
