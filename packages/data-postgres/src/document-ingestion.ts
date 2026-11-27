import type { Database, QueryExecutor } from "@accelerate/data-core";
import { DocumentIngestionError, type DocumentStore, type IngestedDocument } from "@accelerate/data-core/document-ingestion";
import { artifactSha256, assertProvenanceId, type Artifact } from "@accelerate/data-core/provenance";
import { createPostgresProvenanceStore } from "./provenance.js";

export const documentIngestionSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_ingestion_sources (
    scope text NOT NULL, source_id text NOT NULL, version text NOT NULL, sha256 text NOT NULL,
    PRIMARY KEY (scope, source_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_ingestion_documents (
    scope text NOT NULL, id text NOT NULL, body jsonb NOT NULL,
    PRIMARY KEY (scope,id)
  )`,
] as const;

export function createPostgresDocumentStore(db: Database, scope: string): DocumentStore {
  assertProvenanceId(scope);
  const provenance = createPostgresProvenanceStore(db, scope);
  async function get(executor: QueryExecutor, id: string) {
    assertProvenanceId(id);
    return (await executor.query<{ body: IngestedDocument }>(
      "SELECT body FROM accelerate_ingestion_documents WHERE scope=$1 AND id=$2", [scope, id],
    )).rows[0]?.body;
  }
  return {
    get: id => get(db, id),
    save(document) {
      const snapshot = structuredClone(document);
      return db.transaction(async tx => {
        const record = await tx.query(
          "INSERT INTO accelerate_ingestion_sources VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [scope, snapshot.sourceId, snapshot.sourceVersion, snapshot.rawSha256],
        );
        const source = (await tx.query<{ sha256: string }>(
          "SELECT sha256 FROM accelerate_ingestion_sources WHERE scope=$1 AND source_id=$2 AND version=$3 FOR UPDATE",
          [scope, snapshot.sourceId, snapshot.sourceVersion],
        )).rows[0];
        if (!source || source.sha256 !== snapshot.rawSha256) throw new DocumentIngestionError("SOURCE_CHANGED");
        const existing = await get(tx, snapshot.id);
        if (existing) {
          if (existing.textSha256 !== snapshot.textSha256) throw new DocumentIngestionError("SOURCE_CHANGED");
          return existing;
        }
        const scoped = provenance.bind(tx);
        const raw: Artifact = {
          id: "source:" + await artifactSha256(snapshot.sourceId), version: snapshot.sourceVersion, sha256: snapshot.rawSha256,
          retrievedAt: snapshot.retrievedAt, source: snapshot.rawKey, metadata: snapshot.metadata,
        };
        if (record.rowCount) await scoped.recordArtifact(raw);
        await scoped.recordTransformation({
          id: "extract:" + snapshot.id, kind: snapshot.extractorId, version: snapshot.extractorVersion,
          recordedAt: snapshot.retrievedAt, inputs: [{ kind: "artifact", artifact: { id: raw.id, version: raw.version } }],
          outputs: [{ id: "document:" + snapshot.id, version: "1", sha256: snapshot.textSha256, retrievedAt: snapshot.retrievedAt }],
        });
        await tx.query("INSERT INTO accelerate_ingestion_documents VALUES ($1,$2,$3::jsonb)",
          [scope, snapshot.id, JSON.stringify(snapshot)]);
        return snapshot;
      });
    },
  };
}
