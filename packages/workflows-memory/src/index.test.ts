import { it, expect, vi } from "vitest";
import {
  DurableWorkflowRunner,
  type WorkflowDefinition,
} from "@accelerate/workflows-core";
import { createMemoryWorkflowStore } from "./index.js";
import { verifyWorkflowRecovery } from "../../../tools/testing/durable-workflows";
it("resumes checkpoints with the same activity key after a lost result", async () => {
  let now = 1000;
  const store = createMemoryWorkflowStore(() => now);
  await verifyWorkflowRecovery(
    store,
    () => store,
    async (ms) => {
      now += ms;
    },
  );
});
it("pins definitions, persists wait and approval, joins parallel results and embeds a child", async () => {
  let now = 0;
  const store = createMemoryWorkflowStore(() => now);
  const child: WorkflowDefinition = {
    name: "child",
    version: 1,
    stages: [
      { kind: "wait", id: "wait", delayMs: 10 },
      { kind: "approval", id: "review" },
    ],
  };
  const root: WorkflowDefinition = {
    name: "root",
    version: 1,
    concurrency: 2,
    stages: [
      [
        { kind: "task", id: "a", handler: "a" },
        {
          kind: "task",
          id: "b",
          handler: "b",
          when: { field: "go", equals: true },
        },
      ],
      { kind: "child", id: "child", definition: "child", version: 1 },
    ],
  };
  const handlers = { a: async () => 1, b: vi.fn(async () => 2) };
  const runner = new DurableWorkflowRunner(store, [root, child], handlers);
  await runner.start("x", "root", 1, { go: false });
  await expect(runner.start("x", "root", 1, { go: true })).rejects.toThrow(
    "Conflicting",
  );
  const incompatible = new DurableWorkflowRunner(
    store,
    [{ ...root, concurrency: 1 }, child],
    handlers,
  );
  await expect(incompatible.tick("x")).rejects.toThrow("changed");
  await runner.tick("x");
  await runner.tick("x");
  expect(await runner.approve("x", "/child/review", true)).toBe(false);
  now = 10;
  await runner.tick("x");
  expect(await runner.approve("x", "/child/review", true)).toBe(true);
  await runner.tick("x");
  expect((await runner.inspect("x"))?.output).toEqual({
    a: 1,
    b: { go: false },
  });
  expect(handlers.b).not.toHaveBeenCalled();
});
it("drains in-flight work and compensates completed tasks in reverse completion order", async () => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((res) => {
    release = res;
  });
  const entered = new Promise<void>((res) => {
    started = res;
  });
  const undo: string[] = [];
  const store = createMemoryWorkflowStore();
  const runner = new DurableWorkflowRunner(
    store,
    [
      {
        name: "parallel",
        version: 1,
        concurrency: 2,
        stages: [
          [
            { id: "a", kind: "task", handler: "slow", compensate: "undo" },
            { id: "b", kind: "task", handler: "fast", compensate: "undo" },
          ],
        ],
      },
    ],
    {
      slow: async () => {
        started();
        await waiting;
        return 1;
      },
      fast: async () => 2,
      undo: async (_, c) => {
        undo.push(c.path);
        return null;
      },
    },
  );
  await runner.start("x", "parallel", 1, null);
  const first = runner.tick("x");
  await entered;
  await runner.tick("x");
  await runner.cancel("x");
  await runner.tick("x");
  expect(undo).toEqual([]);
  release();
  await first;
  await runner.tick("x");
  await runner.tick("x");
  await runner.tick("x");
  expect(undo).toEqual(["/a", "/b"]);
  expect((await runner.inspect("x"))?.status).toBe("cancelled");
});
it("honors retry delays and flags exhausted compensation", async () => {
  let now = 0;
  const store = createMemoryWorkflowStore(() => now);
  const fail = vi.fn(async () => {
    throw Error("private");
  });
  const runner = new DurableWorkflowRunner(
    store,
    [
      {
        name: "saga",
        version: 1,
        stages: [
          {
            kind: "task",
            id: "save",
            handler: "ok",
            compensate: "fail",
            attempts: 1,
          },
          {
            kind: "task",
            id: "send",
            handler: "fail",
            attempts: 2,
            retryMs: 5,
          },
        ],
      },
    ],
    { ok: async () => true, fail },
  );
  await runner.start("x", "saga", 1, null);
  await runner.tick("x");
  await runner.tick("x");
  await runner.tick("x");
  expect(fail).toHaveBeenCalledTimes(1);
  now = 5;
  await runner.tick("x");
  await runner.tick("x");
  expect((await runner.inspect("x"))?.status).toBe("compensation-failed");
  expect(JSON.stringify(await runner.history("x"))).not.toContain("private");
});

it("aborts a timed-out activity and fences its late result", async () => {
  vi.useFakeTimers();
  try {
    const store = createMemoryWorkflowStore();
    let signal: AbortSignal | undefined;
    let finish!: (value: string) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const runner = new DurableWorkflowRunner(
      store,
      [
        {
          name: "timed",
          version: 1,
          stages: [
            {
              kind: "task",
              id: "step",
              handler: "activity",
              attempts: 2,
              timeoutMs: 25,
            },
          ],
        },
      ],
      {
        activity: async (_, ctx) => {
          if (++calls > 1) return "retry";
          signal = ctx.signal;
          started();
          return new Promise<string>((resolve) => {
            finish = resolve;
          });
        },
      },
    );
    await runner.start("t", "timed", 1, null);
    const pending = runner.tick("t");
    await entered;
    await vi.advanceTimersByTimeAsync(26);
    await pending;
    expect(signal?.aborted).toBe(true);
    await runner.tick("t");
    finish("late");
    await runner.tick("t");
    expect((await runner.inspect("t"))?.output).toBe("retry");
  } finally {
    vi.useRealTimers();
  }
});
