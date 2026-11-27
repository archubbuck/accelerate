import {
  expiresAt,
  type QuotaStore,
  type QuotaState,
} from "@accelerate/rate-limit-core";
import { systemClock, type Clock } from "@accelerate/time-core";
export function createMemoryQuotaStore(clock: Clock = systemClock) {
  const entries = new Map<string, { state: QuotaState; expires: number }>();
  function prune() {
    const now = clock.now().getTime();
    for (const [key, row] of entries)
      if (row.expires <= now) entries.delete(key);
  }
  const store: QuotaStore = {
    async update(key, fn) {
      const now = clock.now().getTime(),
        row = entries.get(key);
      if (row && row.expires <= now) entries.delete(key);
      const change = fn(structuredClone(entries.get(key)?.state ?? []), now);
      if (change.state?.length)
        entries.set(key, {
          state: change.state,
          expires: expiresAt(change.state),
        });
      else if (change.state) entries.delete(key);
      return change.value;
    },
  };
  return { ...store, prune };
}
