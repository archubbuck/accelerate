import {
  serializeOutcome,
  validateOperation,
  type Claim,
  type IdempotencyStore,
  type Outcome,
} from "@accelerate/idempotency-core";
import type { Clock } from "@accelerate/time-core";

export function memoryIdempotency(clock: Clock): IdempotencyStore {
  const records = new Map<
    string,
    { claim: Claim; expires: number; outcome?: Outcome }
  >();
  function settle(
    claim: Claim,
    outcome: Outcome,
    ms: number,
    abandoned: boolean,
  ) {
    validateOperation(claim, ms);
    const copy = JSON.parse(serializeOutcome(outcome));
    const row = records.get(claim.key);
    const now = clock.monotonicMs();
    if (
      !row ||
      row.claim.token !== claim.token ||
      row.claim.fingerprint !== claim.fingerprint ||
      row.outcome ||
      row.expires <= now !== abandoned
    )
      return false;
    row.outcome = { status: outcome.status, result: copy };
    row.expires = now + ms;
    return true;
  }
  return {
    async claim(op, ttlMs) {
      validateOperation(op, ttlMs);
      const row = records.get(op.key);
      const now = clock.monotonicMs();
      if (row && !(row.outcome && row.expires <= now)) {
        if (row.claim.fingerprint !== op.fingerprint)
          return { status: "conflict" };
        if (row.outcome) return structuredClone(row.outcome);
        return row.expires <= now
          ? { status: "abandoned", claim: { ...row.claim } }
          : { status: "pending" };
      }
      const claim = { ...op, token: crypto.randomUUID() };
      records.set(op.key, { claim: { ...claim }, expires: now + ttlMs });
      return { status: "claimed", claim };
    },
    async finish(c, o, ms) {
      return settle(c, o, ms, false);
    },
    async reconcile(c, o, ms) {
      return settle(c, o, ms, true);
    },
  };
}
