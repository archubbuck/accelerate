import { expect } from "vitest";
import type { EventJournal } from "../../packages/events-core/src/journal.js";

export const exampleEvent = {
  id: "first",
  type: "sample",
  occurredAt: "2026-01-01T00:00:00.000Z",
  payload: { a: 1 },
  schemaVersion: 2,
  correlationId: "trace",
  causationId: "parent",
};

/** Run against fresh isolated storage; reopening creates a new client-side journal. */
export async function verifyJournal(
  open: () => EventJournal,
  advance: (ms: number) => Promise<void>,
) {
  const journal = open();
  await journal.append(exampleEvent);
  await journal.append({ ...exampleEvent, payload: "duplicate" });
  await journal.append({ ...exampleEvent, id: "second" });
  const history = await journal.replay();
  expect(history.map((row) => row.event.id)).toEqual(["first", "second"]);
  expect(history[0].event).toEqual(exampleEvent);
  expect(await journal.replay(history[0].cursor, 1)).toEqual([history[1]]);
  const claims = (
    await Promise.all([
      journal.claim("billing", 5000),
      open().claim("billing", 5000),
    ])
  ).filter((x) => x !== undefined);
  expect(claims).toHaveLength(1);
  const first = claims[0]!;
  expect(
    await journal.nack(first.receipt, { maxAttempts: 2, delayMs: 1000 }),
  ).toBe(true);
  expect(await journal.claim("billing", 5000)).toBeUndefined();
  await advance(1100);
  const retry = (await open().claim("billing", 5000))!;
  expect(retry.attempt).toBe(2);
  expect(await journal.ack(first.receipt)).toBe(false);
  expect(
    await journal.nack(retry.receipt, { maxAttempts: 2, delayMs: 0 }),
  ).toBe(true);
  expect((await open().inspect("billing")).deadCursor).toBe(first.cursor);
  expect(await open().claim("billing", 5000)).toBeUndefined();
  expect(await open().redrive("billing", history[1].cursor)).toBe(false);
  expect(await open().redrive("billing", first.cursor)).toBe(true);
  const reclaimed = (await journal.claim("billing", 500))!;
  expect(reclaimed.attempt).toBe(1);
  await advance(550);
  expect(await open().ack(reclaimed.receipt)).toBe(false);
  const owner = (await open().claim("billing", 5000))!;
  expect(await journal.ack(reclaimed.receipt)).toBe(false);
  expect(await open().ack(owner.receipt)).toBe(true);
  expect((await open().inspect("billing")).checkpoint).toBe(first.cursor);
  const second = (await open().claim("billing", 5000))!;
  expect(second.cursor).toBe(history[1].cursor);
  expect(await journal.ack(second.receipt)).toBe(true);
  expect(await open().claim("billing", 5000)).toBeUndefined();
  expect((await open().claim("analytics", 5000))?.cursor).toBe(first.cursor);
  expect(await open().replay()).toEqual(history);
}
