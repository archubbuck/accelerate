import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { migrate } from "./index.js";

describe.skipIf(!databaseUrl)("PostgreSQL migration execution", () => {
  const { database, pool } = postgresFixture();
  it("coordinates concurrent runners, detects drift and rolls back a partial batch", async () => {
    const one = { id: "app/1", statements: ["CREATE TABLE things (id int)"] };
    const two = {
      id: "plugin/1",
      requires: [one.id],
      statements: ["INSERT INTO things VALUES (1)"],
    };
    const manifests = [two, one];
    expect(await migrate(database, manifests, { dryRun: true })).toEqual([
      one.id,
      two.id,
    ]);
    expect(
      (
        await database.query(
          "SELECT to_regclass('accelerate_migrations') AS rel",
        )
      ).rows[0].rel,
    ).toBeNull();
    const runs = await Promise.all([
      migrate(database, manifests),
      migrate(database, manifests),
    ]);
    expect(runs.map((x) => x.length).sort()).toEqual([0, 2]);
    expect(await migrate(database, manifests, { dryRun: true })).toEqual([]);
    await expect(
      migrate(database, [{ ...one, statements: ["SELECT 1"] }]),
    ).rejects.toThrow("Changed");
    const broken = {
      id: "app/2",
      requires: [one.id],
      statements: ["INSERT INTO things VALUES (2)", "SELECT 1/0"],
    };
    await expect(migrate(database, [broken])).rejects.toThrow();
    expect((await database.query("SELECT * FROM things")).rows).toEqual([
      { id: 1 },
    ]);
    expect(
      await migrate(database, [
        { ...broken, statements: broken.statements.slice(0, 1) },
      ]),
    ).toEqual([broken.id]);
  });
  it("recovers the migration lock and uncommitted schema after a runner disconnects", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(1824652001, 7)");
      await client.query("CREATE TABLE recovering (id int)");
    } finally {
      client.release(true);
    }
    const recovery = {
      id: "recovery/1",
      statements: ["CREATE TABLE recovering (id int)"],
    };
    expect(await migrate(database, [recovery])).toEqual([recovery.id]);
  });
});
