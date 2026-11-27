import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  databaseUrl,
  postgresFixture,
} from "../../../tools/testing/wave7-postgres";
import { publishNext } from "@accelerate/outbox-core";
import {
  consumeOnce,
  enqueueOutbox,
  outboxMigration,
  postgresOutbox,
} from "./index.js";

const event = {
  id: "e1",
  type: "order.created",
  occurredAt: "2026-01-01T00:00:00Z",
  payload: { order: 1 },
  metadata: { source: "orders" },
};
it("rejects invalid events before inserting", async () => {
  const tx = { query: vi.fn() };
  await expect(enqueueOutbox(tx, { ...event, id: " " })).rejects.toThrow();
  await expect(enqueueOutbox(tx, { ...event, payload: NaN })).rejects.toThrow();
  expect(tx.query).not.toHaveBeenCalled();
});

describe.skipIf(!databaseUrl)("PostgreSQL transactional outbox", () => {
  const { database } = postgresFixture();
  const store = postgresOutbox(database);
  const enqueue = () => database.transaction((tx) => enqueueOutbox(tx, event));
  const expire = () =>
    database.query(
      "UPDATE accelerate_outbox SET available_at=clock_timestamp()-interval '1 second' WHERE status='leased'",
    );
  beforeAll(async () => {
    for (const sql of outboxMigration.statements) await database.query(sql);
    await database.query("CREATE TABLE orders (id integer PRIMARY KEY)");
  });
  beforeEach(async () => {
    await database.query(
      "TRUNCATE orders,accelerate_outbox,accelerate_outbox_receipts",
    );
  });
  it("makes the business row and event visible together only after commit", async () => {
    async function write(abort: boolean) {
      await database.transaction(async (tx) => {
        await tx.query("INSERT INTO orders VALUES (1)");
        await enqueueOutbox(tx, event);
        expect(await store.claim(10000)).toBeUndefined();
        if (abort) throw Error("abort");
      });
    }
    await expect(write(true)).rejects.toThrow("abort");
    expect((await database.query("SELECT id FROM orders")).rowCount).toBe(0);
    expect(await store.claim(10000)).toBeUndefined();
    await write(false);
    expect((await database.query("SELECT id FROM orders")).rowCount).toBe(1);
    expect((await store.claim(10000))?.event).toEqual(event);
  });
  it("recovers a crash before publish and fences the old publisher", async () => {
    await enqueue();
    const claims = (
      await Promise.all(Array.from({ length: 4 }, () => store.claim(10000)))
    ).filter((x) => x !== undefined);
    expect(claims).toHaveLength(1);
    await expire();
    const next = (await store.claim(10000))!;
    expect(next.attempt).toBe(2);
    expect(next.token).not.toBe(claims[0].token);
    expect(await store.acknowledge(claims[0])).toBe(false);
    expect(await store.retry(claims[0], 0)).toBe(false);
    expect(await store.deadLetter(claims[0])).toBe(false);
    expect(await store.acknowledge(next)).toBe(true);
  });
  it("redelivers after broker acceptance and commits each consumer effect only once", async () => {
    await enqueue();
    const sent = [(await store.claim(10000))!.event];
    await expire(); // Broker accepted the first copy. No acknowledgment reached PostgreSQL.
    const result = await publishNext(
      store,
      async (copy) => {
        sent.push(copy);
      },
      { leaseMs: 10000, maxAttempts: 3, retryDelayMs: 0 },
    );
    expect(result.status).toBe("published");
    expect(sent).toEqual([event, event]);
    await expect(
      consumeOnce(database, "billing", event, async (tx) => {
        await tx.query("INSERT INTO orders VALUES (1)");
        throw Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    const effects = await Promise.all(
      sent.map((copy) =>
        consumeOnce(database, "billing", copy, async (tx) => {
          await tx.query("INSERT INTO orders VALUES (1)");
        }),
      ),
    );
    expect(effects.sort()).toEqual([false, true]);
    expect((await database.query("SELECT id FROM orders")).rowCount).toBe(1);
  });
  it("backoffs, dead-letters, redrives and purges only acknowledged records", async () => {
    await enqueue();
    const first = (await store.claim(10000))!;
    expect(await store.retry(first, 60000)).toBe(true);
    expect(await store.claim(10000)).toBeUndefined();
    await database.query(
      "UPDATE accelerate_outbox SET available_at=clock_timestamp()",
    );
    expect(await store.deadLetter((await store.claim(10000))!)).toBe(true);
    expect(await store.purgePublished(new Date("2100-01-01"), 10)).toBe(0);
    expect(await store.redrive(event.id)).toBe(true);
    expect(await store.redrive(event.id)).toBe(false);
    const next = (await store.claim(10000))!;
    expect(next.attempt).toBe(1);
    expect(await store.acknowledge(next)).toBe(true);
    expect(await store.purgePublished(new Date("2000-01-01"), 10)).toBe(0);
    expect(await store.purgePublished(new Date("2100-01-01"), 10)).toBe(1);
  });
});
