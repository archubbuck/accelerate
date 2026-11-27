import { beforeAll, describe, it, expect } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { createPostgresScheduler, schedulerMigration } from "./index.js";
describe.skipIf(!databaseUrl)("distributed scheduler", () => {
  const { database } = postgresFixture();
  beforeAll(async () =>
    database.transaction(async (tx) => {
      for (const sql of schedulerMigration.statements) await tx.query(sql);
      await tx.query("CREATE TABLE delivered(id text PRIMARY KEY)");
    }),
  );
  it("rolls back a failed handoff, reopens and excludes concurrent owners", async () => {
    const def = {
      id: "once",
      startAt: 123,
      timing: { kind: "once" },
      missed: { kind: "catch-up" },
      payload: null,
    } as const;
    const crashing = createPostgresScheduler(database, async (tx, run) => {
      await tx.query("INSERT INTO delivered VALUES ($1)", [run.id]);
      throw new Error("worker stopped");
    });
    await Promise.all([crashing.register(def), crashing.register(def)]);
    await expect(
      crashing.register({ ...def, payload: "changed" }),
    ).rejects.toThrow("Conflicting");
    expect(await crashing.control(def.id, "pause")).toBe(true);
    expect(await crashing.tick()).toBe(false);
    expect(await crashing.control(def.id, "resume")).toBe(true);
    expect(await crashing.upcoming(def.id)).toEqual([123]);
    await expect(crashing.tick()).rejects.toThrow("worker stopped");
    expect(await crashing.history(def.id)).toEqual([]);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const restarted = createPostgresScheduler(database, async (tx, run) => {
      await tx.query("INSERT INTO delivered VALUES ($1)", [run.id]);
      entered();
      await gate;
    });
    const pending = restarted.tick();
    await started;
    try {
      expect(await crashing.tick()).toBe(false);
    } finally {
      release();
      await pending;
    }
    expect(await restarted.tick()).toBe(false);
    expect(await restarted.inspect(def.id)).toMatchObject({
      status: "completed",
      nextAt: null,
    });
    expect(await restarted.history(def.id)).toMatchObject([
      { scheduledAt: 123, runId: "once:123" },
    ]);
    expect(await restarted.history(def.id, 123)).toEqual([]);
    expect((await database.query("SELECT id FROM delivered")).rows).toEqual([
      { id: "once:123" },
    ]);
  });
  it("records skipped ranges and keeps cancellation terminal", async () => {
    const s = createPostgresScheduler(database, async () => {
      throw new Error("unexpected dispatch");
    });
    const def = {
      id: "expired",
      startAt: 0,
      missed: { kind: "skip", graceMs: 0 },
      timing: { kind: "once" },
      payload: null,
    } as const;
    await s.register(def);
    await s.tick();
    expect(await s.history(def.id)).toMatchObject([
      { scheduledAt: 0, skippedBefore: expect.any(Number), runId: null },
    ]);
    await s.register({ ...def, id: "cancel" });
    await s.control("cancel", "cancel");
    expect(await s.control("cancel", "resume")).toBe(false);
    expect(await s.upcoming("cancel")).toEqual([]);
  });
});
