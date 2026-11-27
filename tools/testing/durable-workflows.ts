import { expect } from "vitest";
import {
  DurableWorkflowRunner,
  type WorkflowDefinition,
  type WorkflowStore,
} from "../../packages/workflows-core/dist/index.js";
export async function verifyWorkflowRecovery(
  store: WorkflowStore,
  open: () => WorkflowStore,
  advance: (ms: number) => Promise<void>,
) {
  const id = "run-" + crypto.randomUUID();
  const calls: string[] = [];
  const def: WorkflowDefinition = {
    name: "orders",
    version: 1,
    stages: [
      { id: "first", kind: "task", handler: "first" },
      {
        id: "second",
        kind: "task",
        handler: "second",
        timeoutMs: 500,
        attempts: 3,
      },
    ],
  };
  const handlers = {
    first: async () => {
      calls.push("first");
      return 1;
    },
    second: async (_: unknown, ctx: { idempotencyKey: string }) => {
      calls.push(ctx.idempotencyKey);
      return 2;
    },
  };
  const runner = new DurableWorkflowRunner(store, [def], handlers);
  await runner.start(id, "orders", 1, 0);
  await runner.tick(id);
  // Simulate process death after the second effect and before the checkpoint transaction.
  let updates = 0;
  const crash: WorkflowStore = {
    ...open(),
    update: (key, fn) =>
      ++updates === 2
        ? Promise.reject(Error("worker stopped"))
        : store.update(key, fn),
  };
  await expect(
    new DurableWorkflowRunner(crash, [def], handlers).tick(id),
  ).rejects.toThrow("worker stopped");
  await advance(550);
  const reopened = new DurableWorkflowRunner(open(), [def], handlers);
  await Promise.all([reopened.tick(id), runner.tick(id)]);
  await reopened.tick(id);
  expect((await reopened.inspect(id))?.status).toBe("completed");
  expect(calls).toHaveLength(3);
  expect(calls[0]).toBe("first");
  expect(calls[1]).toBe(calls[2]);
  expect((await reopened.inspect(id))?.output).toBe(2);
  const history = await reopened.history(id);
  expect(
    history.filter((e) => e.type === "step-completed").map((e) => e.path),
  ).toEqual(["/first", "/second"]);
  expect(history.some((e) => e.type === "lease-expired")).toBe(true);
  expect(await reopened.history(id, history[0].cursor, 1)).toEqual([
    history[1],
  ]);
}
