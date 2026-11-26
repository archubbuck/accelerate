import {
  validateLease,
  type Lease,
  type LockStore,
} from "@accelerate/locking-core";
import type { Clock } from "@accelerate/time-core";

export function memoryLocks(clock: Clock): LockStore {
  const active = new Map<
    string,
    { owner: string; fence: string; until: number }
  >();
  let sequence = 0n;
  function owned(lease: Lease) {
    const row = active.get(lease.key);
    return row &&
      row.fence === lease.fence &&
      row.owner === lease.owner &&
      row.until > clock.monotonicMs()
      ? row
      : undefined;
  }
  return {
    async acquire(key, owner, ttlMs) {
      validateLease(key, owner, ttlMs);
      const now = clock.monotonicMs();
      if ((active.get(key)?.until ?? -Infinity) > now) return;
      const fence = String(++sequence);
      active.set(key, { owner, fence, until: now + ttlMs });
      return { key, owner, fence };
    },
    async renew(lease, ttlMs) {
      validateLease(lease.key, lease.owner, ttlMs);
      const row = owned(lease);
      if (!row) return false;
      row.until = clock.monotonicMs() + ttlMs;
      return true;
    },
    async release(lease) {
      return Boolean(owned(lease)) && active.delete(lease.key);
    },
  };
}
