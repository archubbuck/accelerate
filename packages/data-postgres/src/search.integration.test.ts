import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import type { IndexedPassage } from "@accelerate/data-core/search";
import { createPostgresDatabase } from "./index.js";
import { createPostgresSearchIndex, searchSchema } from "./search.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("applies tenant and audience checks to ranked queries and removes deleted passages", async () => {
  const schema = "search_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of searchSchema) await db.query(statement);
    const index = createPostgresSearchIndex(db);
    const entry: IndexedPassage = {
      id: "open", tenantId: "tenant", visibility: "tenant", title: "Water", text: "Water conditions",
      passage: { start: 0, end: 16 }, source: { id: "document", version: "v1" }, embedding: [1, 0],
    };
    await index.upsert(entry);
    await index.upsert({ ...entry, id: "restricted", visibility: "restricted", audience: ["reviewer"] });
    await index.upsert({ ...entry, id: "other", tenantId: "other" });
    expect((await index.search({ tenantId: "tenant", principals: [] }, { text: "water" })).hits.map(hit => hit.passage.id)).toEqual(["open"]);
    const reviewer = { tenantId: "tenant", principals: ["reviewer"] };
    const query = { text: "water", embedding: [1, 0], limit: 1 };
    const first = await index.search(reviewer, query);
    expect(first.hits[0].passage.id).toBe("open");
    expect((await index.search(reviewer, { ...query, cursor: first.cursor })).hits[0].passage.id).toBe("restricted");
    expect(await index.delete("tenant", "open")).toBe(true);
    expect(await index.get(reviewer, "open")).toBeUndefined();
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
