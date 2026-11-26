import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { migrate } from "../../migrations-postgres/dist/index.js";
import { lockMigration, postgresLocks } from "./index.js";

describe.skipIf(!databaseUrl)("PostgreSQL fencing", () => {
  const { database } = postgresFixture();
  it("serializes contenders and rejects stale renewals and releases", async () => {
    await migrate(database, [lockMigration]);
    const store = postgresLocks(database);
    const leases = await Promise.all(
      Array.from({ length: 12 }, () => store.acquire("k", "w", 60000)),
    );
    const granted = leases.filter((l) => l !== undefined);
    expect(granted).toHaveLength(1);
    expect(await store.renew(granted[0], 60000)).toBe(true);
    await database.query(
      "UPDATE accelerate_locks SET expires='-infinity' WHERE key=$1",
      ["k"],
    );
    const second = (await store.acquire("k", "w", 60000))!;
    expect(BigInt(second.fence)).toBeGreaterThan(BigInt(granted[0].fence));
    expect(await store.renew(granted[0], 100)).toBe(false);
    expect(await store.release(granted[0])).toBe(false);
    expect(await store.release(second)).toBe(true);
  });
});
