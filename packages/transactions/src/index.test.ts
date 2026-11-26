import { expect,it,vi } from "vitest";
import { runTransaction } from "./index.js";
it("commits successful work",async()=>{const scope={commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{})};expect(await runTransaction(async()=>scope,async()=>42)).toBe(42);expect(scope.commit).toHaveBeenCalledOnce();expect(scope.rollback).not.toHaveBeenCalled();});
it("rolls back failed work",async()=>{const scope={commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{})};await expect(runTransaction(async()=>scope,async()=>{throw new Error("failed");})).rejects.toThrow("failed");expect(scope.rollback).toHaveBeenCalledOnce();});

import { composeTransaction, TransactionCallbackError, type TransactionContext } from "./index.js";

it("binds repositories to one executor and closes context before callbacks", async () => {
  const executor = { rows: [] as number[] };
  let captured: TransactionContext<typeof executor>;
  const runner = { transaction: vi.fn(async (operation: (tx: typeof executor) => Promise<number>) => operation(executor)) };
  const result = await composeTransaction(runner, async context => {
    captured = context;
    const first = context.bind(tx => ({ insert: () => tx.rows.push(1) }));
    const second = context.bind(tx => ({ insert: () => tx.rows.push(2) }));
    first.insert();
    second.insert();
    context.afterCommit(() => { expect(() => captured.executor).toThrow("closed"); });
    return 42;
  });
  expect(result).toBe(42);
  expect(executor.rows).toEqual([1, 2]);
  expect(runner.transaction).toHaveBeenCalledOnce();
});

it("runs every commit callback and reports a committed outcome without rollback callbacks", async () => {
  const rollback = vi.fn();
  const final = vi.fn();
  const runner = { transaction: async (operation: (tx: object) => Promise<void>) => operation({}) };
  await expect(composeTransaction(runner, async context => {
    context.afterRollback(rollback);
    context.afterCommit(() => { throw new Error("notification failed"); });
    context.afterCommit(final);
  })).rejects.toBeInstanceOf(TransactionCallbackError);
  expect(final).toHaveBeenCalledOnce();
  expect(rollback).not.toHaveBeenCalled();
});

it("preserves the transaction failure when rollback callbacks fail", async () => {
  const runner = { transaction: async (operation: (tx: object) => Promise<void>) => operation({}) };
  const original = new Error("database failure");
  try {
    await composeTransaction(runner, async context => {
      context.afterRollback(() => { throw new Error("callback failure"); });
      throw original;
    });
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors[0]).toBe(original);
  }
});
