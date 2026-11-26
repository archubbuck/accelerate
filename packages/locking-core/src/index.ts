import { durationMs, type Clock } from "@accelerate/time-core";

export interface Lease {
  key: string;
  owner: string;
  fence: string;
}
export interface LockStore {
  acquire(
    key: string,
    owner: string,
    ttlMs: number,
  ): Promise<Lease | undefined>;
  renew(lease: Lease, ttlMs: number): Promise<boolean>;
  release(lease: Lease): Promise<boolean>;
}
export function validateLease(key: string, owner: string, ttlMs: number) {
  if (
    typeof key !== "string" ||
    !key ||
    typeof owner !== "string" ||
    !owner ||
    !durationMs(ttlMs) ||
    ttlMs > 2147483647
  )
    throw new RangeError("Invalid lease");
}

/** Timeout bounds contention waits. An in-flight store request must settle before returning. */
export async function waitForLease(
  store: LockStore,
  clock: Clock,
  key: string,
  owner: string,
  ttlMs: number,
  options: { timeoutMs: number; retryMs: number; signal?: AbortSignal },
): Promise<Lease | undefined> {
  validateLease(key, owner, ttlMs);
  const deadline = clock.monotonicMs() + durationMs(options.timeoutMs);
  if (!durationMs(options.retryMs))
    throw new RangeError("Expected a positive retry interval");
  do {
    options.signal?.throwIfAborted();
    const lease = await store.acquire(key, owner, ttlMs);
    if (options.signal?.aborted && lease) await store.release(lease);
    options.signal?.throwIfAborted();
    if (lease) return lease;
    const left = deadline - clock.monotonicMs();
    if (left <= 0) break;
    await clock.delay(
      Math.min(Math.ceil(left), options.retryMs),
      options.signal,
    );
  } while (clock.monotonicMs() < deadline);
  return undefined;
}
