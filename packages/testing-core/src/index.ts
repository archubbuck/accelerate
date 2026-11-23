/** Test-framework-independent assertions and async test helpers. */
export class AssertionFailure extends Error {
  constructor(message: string) { super(message); this.name = "AssertionFailure"; }
}
export function assertDefined<T>(value: T | null | undefined, message = "Expected a defined value"): asserts value is T {
  if (value === null || value === undefined) throw new AssertionFailure(message);
}
export function assertNever(value: never, message = "Unexpected value"): never {
  throw new AssertionFailure(message + ": " + String(value));
}
export async function waitFor<T>(
  probe: () => T | Promise<T>,
  predicate: (value: T) => boolean = Boolean,
  options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const intervalMs = options.intervalMs ?? 10;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError("timeoutMs must be nonnegative and intervalMs positive");
  }
  const deadline = Date.now() + timeoutMs;
  while (true) {
    options.signal?.throwIfAborted();
    const value = await probe();
    if (predicate(value)) return value;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AssertionFailure("Timed out waiting for condition");
    await new Promise<void>((resolve, reject) => {
      const delay = setTimeout(() => { options.signal?.removeEventListener("abort", onAbort); resolve(); }, Math.min(intervalMs, remaining));
      const onAbort = () => { clearTimeout(delay); reject(options.signal?.reason ?? new Error("Aborted")); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
