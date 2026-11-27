import {
  createEventJournal,
  initialSubscription,
  type JournalRecord,
  type SubscriptionState,
} from "@accelerate/events-core";

export function createMemoryJournalStorage(now: () => number = Date.now) {
  const records: JournalRecord[] = [];
  const ids = new Set<string>();
  const subscriptions = new Map<
    string,
    { revision: number; state: SubscriptionState }
  >();
  return {
    async append(event: JournalRecord["event"]) {
      if (ids.has(event.id)) return;
      records.push({
        cursor: records.length + 1,
        event: structuredClone(event),
      });
      ids.add(event.id);
    },
    async read(after: number, limit: number) {
      return structuredClone(records.slice(after, after + limit));
    },
    async load(name: string) {
      return {
        ...structuredClone(
          subscriptions.get(name) ?? {
            revision: 0,
            state: initialSubscription(),
          },
        ),
        now: now(),
      };
    },
    async swap(
      name: string,
      revision: number,
      state: SubscriptionState,
      deadline?: number,
    ) {
      if (
        (subscriptions.get(name)?.revision ?? 0) !== revision ||
        (deadline !== undefined && now() >= deadline)
      )
        return false;
      subscriptions.set(name, {
        revision: revision + 1,
        state: structuredClone(state),
      });
      return true;
    },
  };
}
export function createMemoryEventJournal(
  storage = createMemoryJournalStorage(),
) {
  return createEventJournal(storage);
}
