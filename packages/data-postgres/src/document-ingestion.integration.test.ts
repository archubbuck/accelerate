import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createDocumentIngestion, plainTextExtractor } from "@accelerate/data-core/document-ingestion";
import { createMemoryObjectStore } from "@accelerate/data-core/storage-memory";
import { createPostgresDatabase } from "./index.js";
import { createPostgresProvenanceStore, provenanceSchema } from "./provenance.js";
import { createPostgresDocumentStore, documentIngestionSchema } from "./document-ingestion.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("deduplicates concurrent retries and records document lineage", async () => {
  const schema = "ingestion_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of [...provenanceSchema, ...documentIngestionSchema]) await db.query(statement);
    const objects = createMemoryObjectStore();
    const documents = createPostgresDocumentStore(db, "tenant");
    const ingest = createDocumentIngestion({ objects, documents });
    const source = { id: "example", version: "v1", async open() {
      return { body: new Response("abc").body!, size: 3, contentType: "text/plain", retrievedAt: "2026-01-01T00:00:00.000Z" };
    } };
    const [left, right] = await Promise.all([ingest(source, plainTextExtractor), ingest(source, plainTextExtractor)]);
    expect(left.id).toBe(right.id);
    expect((await objects.list()).objects).toHaveLength(1);
    const ancestry = await createPostgresProvenanceStore(db, "tenant").lineage({ id: "document:" + left.id, version: "1" });
    expect(ancestry.records).toHaveLength(2);
    expect(await documents.get(left.id)).toMatchObject({ chunks: [{ text: "abc", start: 0, end: 3 }] });
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
