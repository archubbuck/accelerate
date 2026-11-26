import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { migrate } from "../../migrations-postgres/dist/index.js";
import { idempotencyMigration, postgresIdempotency } from "./index.js";

describe.skipIf(!databaseUrl)("PostgreSQL idempotency", () => {
  const { database } = postgresFixture();
  it("grants one claim, preserves uncertain outcomes and replays settled data", async () => {
    await migrate(database, [idempotencyMigration]);
    const store = postgresIdempotency(database);
    const op = { key: "abc", fingerprint: "sha256:123" };
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => store.claim(op, 60000)),
    );
    const winners = claims.filter((c) => c.status === "claimed");
    expect(winners).toHaveLength(1);
    expect(claims.filter((c) => c.status === "pending")).toHaveLength(11);
    expect(
      (await store.claim({ ...op, fingerprint: "other" }, 100)).status,
    ).toBe("conflict");
    const claim = winners[0].claim;
    const outcome = {
      status: "completed" as const,
      result: { externalId: "ok" },
    };
    await database.query(
      "UPDATE accelerate_idempotency SET expires='-infinity' WHERE key=$1",
      [op.key],
    );
    expect(await store.claim(op, 60000)).toEqual({
      status: "abandoned",
      claim,
    });
    expect(await store.finish(claim, outcome, 60000)).toBe(false);
    expect(await store.reconcile(claim, outcome, 60000)).toBe(true);
    expect(await store.claim(op, 60000)).toEqual(outcome);
    await database.query(
      "UPDATE accelerate_idempotency SET expires='-infinity' WHERE key=$1",
      [op.key],
    );
    const next = await store.claim(op, 60000);
    expect(next.status).toBe("claimed");
    expect(await store.finish(claim, outcome, 60000)).toBe(false);
    if (next.status === "claimed")
      expect(await store.finish(next.claim, outcome, 60000)).toBe(true);
  });
});
