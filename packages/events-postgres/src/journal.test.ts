import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  postgresFixture,
  databaseUrl,
} from "../../../tools/testing/wave7-postgres";
import {
  exampleEvent,
  verifyJournal,
} from "../../../tools/testing/event-journal";
import {
  createPostgresEventJournal,
  eventJournalMigration,
  EVENTS_SCHEMA,
  createPostgresEventStore,
} from "./index.js";

describe.skipIf(!databaseUrl)("PostgreSQL durable event journal", () => {
  const { database } = postgresFixture();
  const open = () => createPostgresEventJournal(database);
  beforeAll(async () => {
    await database.query(EVENTS_SCHEMA);
    await createPostgresEventStore(database).append(exampleEvent);
    await database.transaction(async (tx) => {
      for (const sql of eventJournalMigration.statements) await tx.query(sql);
    });
    expect((await open().replay())[0].event).toEqual({
      id: exampleEvent.id,
      type: exampleEvent.type,
      payload: exampleEvent.payload,
      occurredAt: exampleEvent.occurredAt,
      schemaVersion: 1,
    });
  });
  beforeEach(async () => {
    await database.query(
      "TRUNCATE accelerate_events,accelerate_event_subscriptions",
    );
  });
  it("satisfies the subscription delivery contract", async () =>
    verifyJournal(
      open,
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ));
  it("does not skip an uncommitted writer or expose rolled-back events", async () => {
    const writer = async (abort: boolean) =>
      database.transaction(async (tx) => {
        await createPostgresEventStore(tx).append({
          ...exampleEvent,
          id: "legacy",
        });
        expect(await open().replay()).toEqual([]);
        if (abort) throw Error("abort");
      });
    await expect(writer(true)).rejects.toThrow("abort");
    let concurrent!: Promise<void>;
    await database.transaction(async (tx) => {
      await createPostgresEventStore(tx).append({
        ...exampleEvent,
        id: "legacy",
      });
      concurrent = open().append({ ...exampleEvent, id: "next" });
      expect(await open().claim("worker", 5000)).toBeUndefined();
    });
    await concurrent;
    expect((await open().replay()).map((x) => x.event.id)).toEqual([
      "legacy",
      "next",
    ]);
  });
});
