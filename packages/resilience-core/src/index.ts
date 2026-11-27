export interface RetryOptions { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; signal?: AbortSignal; shouldRetry?: (error: unknown, attempt: number) => boolean; }
export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("attempts must be a positive integer");
  const base = options.baseDelayMs ?? 100;
  const max = options.maxDelayMs ?? 5000;
  if (![base,max].every(v => Number.isFinite(v) && v >= 0)) throw new RangeError("delays must be nonnegative");
  for (let attempt = 1; ; attempt++) {
    options.signal?.throwIfAborted();
    try { return await operation(attempt); }
    catch (error) {
      if (attempt >= attempts || options.shouldRetry?.(error,attempt) === false) throw error;
      const delay = Math.min(max, base * 2 ** (attempt - 1));
      await new Promise<void>((resolve,reject) => {
        const timer = setTimeout(() => { cleanup(); resolve(); }, delay);
        const abort = () => { clearTimeout(timer); cleanup(); reject(options.signal?.reason ?? new Error("Aborted")); };
        const cleanup = () => options.signal?.removeEventListener("abort",abort);
        options.signal?.addEventListener("abort",abort,{once:true});
        if (options.signal?.aborted) abort();
      });
    }
  }
}
export * from "./policies.js";
