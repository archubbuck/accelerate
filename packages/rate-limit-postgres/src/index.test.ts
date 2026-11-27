import { describe, it, beforeAll, expect } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import {
  verifyQuotaStore,
  verifyPermitExpiry,
} from "../../../tools/testing/rate-limit";
import { createPostgresQuotaStore, quotaMigration } from "./index.js";
describe.skipIf(!databaseUrl)("PostgreSQL quota transactions", () => {
  const { database } = postgresFixture();
  beforeAll(async () => {
    for (const sql of quotaMigration.statements) await database.query(sql);
  });
  it("serializes contenders and fences stale releases across workers", async () =>
    verifyQuotaStore(() => createPostgresQuotaStore(database)));
  it("recovers an abandoned permit on a fresh store", async () =>
    verifyPermitExpiry(() => createPostgresQuotaStore(database)));
  it("rolls back failed updates", async () => {
    const s = createPostgresQuotaStore(database);
    await expect(
      s.update("rollback", () => {
        throw Error("interrupt");
      }),
    ).rejects.toThrow("interrupt");
    expect(
      (
        await database.query(
          "SELECT state FROM accelerate_quotas WHERE partition_key='rollback'",
        )
      ).rows,
    ).toEqual([]);
  });
});
