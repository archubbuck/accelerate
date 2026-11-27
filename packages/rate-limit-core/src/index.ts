import { systemClock, type Clock } from "@accelerate/time-core";
import type { HttpMiddleware, HttpRequest } from "@accelerate/http-core";

export type Algorithm =
  "token-bucket" | "sliding-window" | "fixed-window" | "concurrency";
export interface Rule {
  scope: string;
  algorithm: Algorithm;
  limit: number;
  periodMs: number;
  cost?: number;
}
export interface Demand {
  partition: string;
  rules: readonly Rule[];
}
export interface Permit {
  partition: string;
  token: string;
}
export interface QuotaInfo {
  scope: string;
  limit: number;
  remaining: number;
  resetAt: number;
}
export interface Decision {
  allowed: boolean;
  retryAfterMs: number;
  quotas: QuotaInfo[];
  permit?: Permit;
}
interface Charge {
  expires: number;
  cost: number;
  token?: string;
}
interface Bucket {
  scope: string;
  signature: string;
  until: number;
  at: number;
  used: number;
  charges: Charge[];
}
export type QuotaState = Bucket[];
export interface Mutation<T> {
  value: T;
  state?: QuotaState;
}
/** Invoke the synchronous callback with isolated state and authoritative epoch milliseconds.
 * Commit all returned state before returning value. Callbacks may be replayed on contention. */
export interface QuotaStore {
  update<T>(
    partition: string,
    fn: (state: QuotaState, now: number) => Mutation<T>,
  ): Promise<T>;
}
export function expiresAt(state: QuotaState) {
  return state.reduce((max, b) => Math.max(max, b.until), 0);
}
function name(s: string) {
  if (typeof s !== "string" || !s.trim() || s.length > 256 || s.includes("\0"))
    throw new TypeError("Invalid partition or scope");
}
function positive(n: number, max: number) {
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new RangeError("Invalid quota bound");
}
function check(d: Demand) {
  name(d.partition);
  positive(d.rules.length, 64);
  const scopes = new Set<string>();
  for (const r of d.rules) {
    name(r.scope);
    if (scopes.has(r.scope)) throw new Error("Duplicate scope");
    scopes.add(r.scope);
    if (
      ![
        "token-bucket",
        "sliding-window",
        "fixed-window",
        "concurrency",
      ].includes(r.algorithm)
    )
      throw new TypeError("Unknown quota algorithm");
    positive(r.limit, 10000);
    positive(r.periodMs, 2147483647);
    positive(r.cost === undefined ? 1 : r.cost, r.limit);
  }
}
function evaluate(
  r: Rule,
  prior: Bucket | undefined,
  now: number,
  token: string,
) {
  const signature = JSON.stringify([r.algorithm, r.limit, r.periodMs]);
  if (prior && prior.signature !== signature)
    throw new Error("Conflicting active quota policy");
  const b: Bucket = {
    scope: r.scope,
    signature,
    at: now,
    used: 0,
    charges: [],
    until: now,
  };
  const cost = r.cost ?? 1;
  let remaining: number,
    retry = 0;
  if (r.algorithm === "token-bucket") {
    // Debt in units of one token times the refill period; integer math preserves fractions.
    const elapsed = Math.min(r.periodMs, Math.max(0, now - (prior?.at ?? now)));
    b.used = Math.max(0, (prior?.used ?? 0) - elapsed * r.limit);
    remaining = r.limit - Math.ceil(b.used / r.periodMs);
    retry = Math.max(
      0,
      Math.ceil((b.used + (cost - r.limit) * r.periodMs) / r.limit),
    );
    if (!retry) b.used += cost * r.periodMs;
    b.until = now + Math.ceil(b.used / r.limit);
  } else if (r.algorithm === "fixed-window") {
    b.until = (Math.floor(now / r.periodMs) + 1) * r.periodMs;
    b.used = prior?.used ?? 0;
    remaining = r.limit - b.used;
    if (cost > remaining) retry = b.until - now;
    else b.used += cost;
  } else {
    b.charges = (prior?.charges ?? []).filter((c) => c.expires > now);
    b.used = b.charges.reduce((n, c) => n + c.cost, 0);
    remaining = r.limit - b.used;
    if (cost > remaining) {
      let available = remaining;
      for (const c of b.charges) {
        available += c.cost;
        if (available >= cost) {
          retry = c.expires - now;
          break;
        }
      }
    } else {
      b.charges.push({
        cost,
        expires: now + r.periodMs,
        ...(r.algorithm === "concurrency" ? { token } : {}),
      });
    }
    b.until = b.charges.at(-1)!.expires;
  }
  return { bucket: b, retry, remaining, cost };
}
export function createRateLimiter(
  store: QuotaStore,
  clock: Clock = systemClock,
) {
  async function consume(input: Demand): Promise<Decision> {
    const d = structuredClone(input);
    check(d);
    const token = crypto.randomUUID();
    return store.update<Decision>(d.partition, (all, sourceTime) => {
      const now = all.reduce((t, b) => Math.max(t, b.at), sourceTime);
      const active = new Map(
        all.filter((b) => b.until > now).map((b) => [b.scope, b]),
      );
      const results = d.rules.map((r) =>
        evaluate(r, active.get(r.scope), now, token),
      );
      const retryAfterMs = Math.max(...results.map((x) => x.retry));
      const allowed = retryAfterMs === 0;
      const quotas = results.map(({ bucket, remaining, cost }, i) => ({
        scope: bucket.scope,
        limit: d.rules[i].limit,
        remaining: remaining - (allowed ? cost : 0),
        resetAt: allowed
          ? bucket.until
          : (active.get(bucket.scope)?.until ?? now),
      }));
      const value: Decision = { allowed, quotas, retryAfterMs };
      if (!allowed) return { value };
      for (const { bucket } of results) active.set(bucket.scope, bucket);
      if (d.rules.some((r) => r.algorithm === "concurrency"))
        value.permit = { partition: d.partition, token };
      return { value, state: [...active.values()] };
    });
  }
  async function release(permit: Permit) {
    name(permit.partition);
    name(permit.token);
    return store.update(permit.partition, (all, now) => {
      let removed = false;
      const state: QuotaState = [];
      for (const b of all) {
        if (b.until <= now) continue;
        const charges = b.charges.filter(
          (c) => c.token !== permit.token || c.expires <= now,
        );
        if (charges.length === b.charges.length) state.push(b);
        else {
          removed = true;
          if (charges.length)
            state.push({ ...b, charges, until: charges.at(-1)!.expires });
        }
      }
      return removed ? { value: true, state } : { value: false };
    });
  }
  async function acquire(
    d: Demand,
    options: { waitMs?: number; signal?: AbortSignal } = {},
  ) {
    const timeout = options.waitMs ?? 0;
    if (!Number.isSafeInteger(timeout) || timeout < 0)
      throw new RangeError("Invalid wait timeout");
    const deadline = clock.monotonicMs() + timeout;
    let last: Decision;
    do {
      options.signal?.throwIfAborted();
      last = await consume(d);
      if (options.signal?.aborted && last.permit) await release(last.permit);
      options.signal?.throwIfAborted();
      const left = deadline - clock.monotonicMs();
      if (last.allowed || left <= 0) return last;
      const poll = d.rules.some((r) => r.algorithm === "concurrency")
        ? 50
        : Infinity;
      await clock.delay(
        Math.min(left, poll, last.retryAfterMs),
        options.signal,
      );
    } while (clock.monotonicMs() <= deadline);
    options.signal?.throwIfAborted();
    return last;
  }
  return { consume, acquire, release };
}
export function rateLimitMiddleware(
  limiter: ReturnType<typeof createRateLimiter>,
  demand: (request: HttpRequest) => Demand,
  waitMs = 0,
): HttpMiddleware {
  return async (request, next) => {
    const result = await limiter.acquire(demand(request), {
      waitMs,
      signal: request.signal,
    });
    if (!result.allowed)
      return {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
        body: { error: "rate_limited" },
      };
    try {
      return await next(request);
    } finally {
      if (result.permit) await limiter.release(result.permit);
    }
  };
}
