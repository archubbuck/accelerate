import { it, expect } from "vitest";
import {
  createMemoryEventJournal,
  createMemoryJournalStorage,
} from "./journal.js";
import {
  exampleEvent,
  verifyJournal,
} from "../../../tools/testing/event-journal.js";
it("satisfies the subscription delivery contract", async () => {
  let now = 1000;
  const storage = createMemoryJournalStorage(() => now);
  await verifyJournal(
    () => createMemoryEventJournal(storage),
    async (ms) => {
      now += ms;
    },
  );
});
it("rejects invalid input and snapshots payloads at append", async () => {
  const journal = createMemoryEventJournal();
  expect(() => journal.append({ ...exampleEvent, payload: NaN })).toThrow();
  expect(() => journal.replay(-1)).toThrow();
  await expect(journal.claim(" ", 5000)).rejects.toThrow();
  const payload = { value: 1 };
  await journal.append({ ...exampleEvent, payload });
  payload.value = 99;
  expect((await journal.replay())[0].event.payload).toEqual({ value: 1 });
});
