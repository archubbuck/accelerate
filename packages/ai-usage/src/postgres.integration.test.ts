import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "@accelerate/data-postgres";
import { createPostgresUsageBudgetStore, usageBudgetSchema } from "./postgres.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("makes scoped reservations atomic, retains uncertain charges and settles once", async () => {
  const schema = "usage_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of usageBudgetSchema) await db.query(statement);
    const store = createPostgresUsageBudgetStore(db);
    const now = new Date("2026-01-01T00:00:00Z");
    const endsAt = new Date(now.getTime() + 20_000);
    const expiresAt = new Date(now.getTime() + 1000);
    await store.defineBudget({ id: "org", scope: "organization", startsAt: now, endsAt, limitMicros: 10n });
    await store.defineBudget({ id: "user", scope: "user", startsAt: now, endsAt, limitMicros: 12n });
    const price = { version: "v1", provider: "provider", model: "model", inputMicrosPerMillion: 1_000_000n, outputMicrosPerMillion: 2_000_000n };
    const create = (id: string, budgetIds = ["org", "user"]) => store.reserve({ id, budgetIds, estimateMicros: 8n, price, now, expiresAt });
    const result = await Promise.all([create("first"), create("second", ["user", "org"])]);
    expect([...result].sort()).toEqual(["exhausted", "reserved"]);
    const winner = result[0] === "reserved" ? "first" : "second";
    expect(await create(winner)).toBe("duplicate");
    await store.markUncertain(winner, now);
    expect(await store.report("org")).toMatchObject({ heldMicros: 8n, availableMicros: 2n });
    expect(await store.listExpired(expiresAt)).toEqual([expect.objectContaining({ id: winner, price_version: "v1" })]);
    const usage = { inputTokens: 3, outputTokens: 1 };
    await Promise.all([store.settle(winner, 5n, usage, now), store.settle(winner, 5n, usage, now)]);
    expect(await store.report("org")).toMatchObject({ spentMicros: 5n, heldMicros: 0n, availableMicros: 5n });
    expect(await store.report("user")).toMatchObject({ spentMicros: 5n, heldMicros: 0n });
    await expect(store.settle(winner, 6n, usage, now)).rejects.toThrow("different settlement");
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
