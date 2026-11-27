import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "./index.js";
import { createPostgresTimeSeriesStore, timeSeriesSchema } from "./time-series.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("rejects a duplicate batch atomically and supports range cursors, replacement and pruning", async () => {
  const schema = "series_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of timeSeriesSchema) await db.query(statement);
    const store = createPostgresTimeSeriesStore(db, "site");
    await store.ingest("series", [{ at: 1, value: 3 }, { at: 2, value: null }]);
    await expect(store.ingest("series", [{ at: 3, value: 4 }, { at: 1, value: 10 }])).rejects.toThrow();
    expect(await store.range("series", { start: 1, end: 10, after: 2 })).toEqual([]);
    await expect(store.ingest("series", [{ at: 0, value: 2 }], { outOfOrder: "reject" })).rejects.toThrow("Out-of-order");
    expect(await store.ingest("series", [{ at: 2, value: 8, metadata: { quality: "reviewed" } }], { duplicates: "replace" })).toBe(1);
    expect(await store.range("series", { start: 1, end: 10, after: 1 })).toEqual([{ at: 2, value: 8, metadata: { quality: "reviewed" } }]);
    expect(await store.prune("series", 2)).toBe(1);
    expect(await store.range("series", { start: 1, end: 2 })).toEqual([]);
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
