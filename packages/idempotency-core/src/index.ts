export interface Operation {
  key: string;
  fingerprint: string;
}
export interface Claim extends Operation {
  token: string;
}
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Outcome = { status: "completed" | "failed"; result: Json };
export type Decision =
  | { status: "claimed" | "abandoned"; claim: Claim }
  | { status: "pending" | "conflict" }
  | Outcome;
export interface IdempotencyStore {
  claim(operation: Operation, ttlMs: number): Promise<Decision>;
  finish(claim: Claim, outcome: Outcome, retentionMs: number): Promise<boolean>;
  reconcile(
    claim: Claim,
    outcome: Outcome,
    retentionMs: number,
  ): Promise<boolean>;
}
export function validateOperation(operation: Operation, ms: number) {
  if (
    typeof operation.key !== "string" ||
    !operation.key ||
    typeof operation.fingerprint !== "string" ||
    !operation.fingerprint ||
    !Number.isSafeInteger(ms) ||
    ms < 1 ||
    ms > 2147483647
  )
    throw new RangeError("Invalid operation or duration");
}
export function serializeOutcome(outcome: Outcome): string {
  if (outcome.status !== "completed" && outcome.status !== "failed")
    throw new TypeError("Invalid outcome");
  return JSON.stringify(outcome.result, (_key, value) => {
    if (
      (typeof value === "number" && !Number.isFinite(value)) ||
      ["undefined", "function", "symbol", "bigint"].includes(typeof value)
    )
      throw new TypeError("Expected JSON data");
    return value;
  });
}
