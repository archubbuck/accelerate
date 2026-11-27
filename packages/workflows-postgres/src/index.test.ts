import { beforeAll, describe, it, expect } from "vitest";
import { DurableWorkflowRunner } from "@accelerate/workflows-core";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { verifyWorkflowRecovery } from "../../../tools/testing/durable-workflows";
import { createPostgresWorkflowStore, workflowMigration } from "./index.js";
describe.skipIf(!databaseUrl)("durable workflows on PostgreSQL", () => {
  const { database } = postgresFixture();
  const open = () => createPostgresWorkflowStore(database);
  beforeAll(async () => {
    await database.transaction(async (tx) => {
      for (const sql of workflowMigration.statements) await tx.query(sql);
    });
  });
  it("recovers a lost checkpoint across worker instances", async () =>
    verifyWorkflowRecovery(
      open(),
      open,
      (ms) => new Promise((r) => setTimeout(r, ms)),
    ));
  it("enforces the per-instance concurrency limit while an activity runs", async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      finish = new Promise<void>((r) => {
        release = r;
      });
    const def = {
      name: "order",
      version: 1,
      concurrency: 1,
      stages: [
        [
          { kind: "task", id: "a", handler: "slow" },
          { kind: "task", id: "b", handler: "slow" },
        ],
      ],
    } as const;
    let calls = 0;
    const handlers = {
      slow: async () => {
        calls++;
        entered();
        await finish;
        return null;
      },
    };
    const one = new DurableWorkflowRunner(open(), [def], handlers),
      two = new DurableWorkflowRunner(open(), [def], handlers);
    await Promise.all([
      one.start("parallel", "order", 1, null),
      two.start("parallel", "order", 1, null),
    ]);
    const pending = one.tick("parallel");
    await started;
    expect(await two.tick("parallel")).toBe(false);
    expect(calls).toBe(1);
    release();
    await pending;
    await two.tick("parallel");
    await one.tick("parallel");
    expect((await two.inspect("parallel"))?.status).toBe("completed");
  });
});
