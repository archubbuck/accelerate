/** Security primitives shared by credentials and key-management packages. */
export function assertNonEmpty(value: string, field = "value"): void { if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " must be nonempty"); }
export function assertPositiveDuration(ms: number): void { if (!Number.isSafeInteger(ms) || ms <= 0) throw new RangeError("Duration must be a positive safe integer"); }
export function redactSecret(secret: string): string { return secret ? "[REDACTED]" : ""; }
