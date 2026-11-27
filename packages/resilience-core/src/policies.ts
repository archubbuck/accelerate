import { durationMs, systemClock, type Clock } from "@accelerate/time-core";

export class CircuitOpenError extends Error {}
export class BulkheadFullError extends Error {}
export class DeadlineError extends Error {}

export interface Guard {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export function bulkhead(limit: number): Guard {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("Invalid concurrency limit");
  let active = 0;
  return {
    async run(work) {
      if (active >= limit)
        throw new BulkheadFullError("Concurrency limit reached");
      active++;
      try {
        return await work();
      } finally {
        active--;
      }
    },
  };
}

export function circuitBreaker(options: {
  failures: number;
  cooldownMs: number;
  counts?: (error: unknown) => boolean;
  clock?: Clock;
}): Guard {
  const {
    failures,
    cooldownMs,
    counts = () => true,
    clock = systemClock,
  } = options;
  if (
    !Number.isSafeInteger(failures) ||
    failures < 1 ||
    !durationMs(cooldownMs)
  )
    throw new RangeError("Invalid breaker settings");
  type State =
    | { kind: "closed"; failures: number }
    | { kind: "open"; until: number }
    | { kind: "probe" };
  let state: State = { kind: "closed", failures: 0 };
  const trip = (): State => ({
    kind: "open",
    until: clock.monotonicMs() + cooldownMs,
  });
  return {
    async run(work) {
      if (
        state.kind === "probe" ||
        (state.kind === "open" && clock.monotonicMs() < state.until)
      )
        throw new CircuitOpenError("Circuit unavailable");
      if (state.kind === "open") state = { kind: "probe" };
      const admitted = state;
      try {
        const result = await work();
        if (state === admitted) {
          if (admitted.kind === "probe")
            state = { kind: "closed", failures: 0 };
          else admitted.failures = 0;
        }
        return result;
      } catch (error) {
        if (state === admitted) {
          // A failed or inconclusive probe must release its exclusive slot.
          if (
            admitted.kind === "probe" ||
            (counts(error) && ++admitted.failures >= failures)
          )
            state = trip();
        }
        throw error;
      }
    },
  };
}

export function retryAfterMs(value: string, now: Date): number | undefined {
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  if (
    !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      text,
    )
  )
    return undefined;
  const date = new Date(text);
  return date.toUTCString() === text
    ? Math.max(0, date.getTime() - now.getTime())
    : undefined;
}

export interface ExecutionOptions<T> {
  retrySafety?: "idempotent" | "unsafe";
  attempts?: number;
  classify?: (error: unknown) => "transient" | "permanent";
  retryAfter?: (error: unknown) => string | undefined;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  deadlineMs?: number;
  signal?: AbortSignal;
  breaker?: Guard;
  bulkhead?: Guard;
  fallback?: (error: unknown, signal: AbortSignal) => Promise<T>;
  onEvent?: (event: {
    kind: "attempt" | "retry" | "fallback";
    attempt: number;
    delayMs?: number;
  }) => void;
  clock?: Clock;
}

export async function executeResilient<T>(
  operation: (context: { attempt: number; signal: AbortSignal }) => Promise<T>,
  options: ExecutionOptions<T> = {},
): Promise<T> {
  const {
    clock = systemClock,
    random = Math.random,
    classify,
    breaker,
    bulkhead: capacity,
    fallback,
    onEvent,
  } = options;
  const {
    attempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    deadlineMs,
  } = options;
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new RangeError("Invalid attempt count");
  durationMs(baseDelayMs);
  durationMs(maxDelayMs);
  if (deadlineMs !== undefined) durationMs(deadlineMs);
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = new AbortController();
  const deadlineError = new DeadlineError("Execution deadline elapsed");
  const started = clock.monotonicMs();
  const left = () =>
    deadlineMs === undefined
      ? Infinity
      : deadlineMs - (clock.monotonicMs() - started);
  const forward = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", forward, { once: true });
  let rejectAbort!: (reason: unknown) => void;
  const abort = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const reject = () => rejectAbort(signal.reason);
  signal.addEventListener("abort", reject, { once: true });
  if (deadlineMs !== undefined) {
    if (deadlineMs === 0) controller.abort(deadlineError);
    else
      void clock.delay(deadlineMs, timer.signal).then(
        () => controller.abort(deadlineError),
        (error) => {
          if (!timer.signal.aborted) controller.abort(error);
        },
      );
  }
  function check() {
    if (left() <= 0) controller.abort(deadlineError);
    signal.throwIfAborted();
  }
  const emit = (event: Parameters<NonNullable<typeof onEvent>>[0]) => {
    try {
      onEvent?.(event);
    } catch {
      /* Telemetry cannot change the outcome. */
    }
  };
  async function run() {
    for (let attempt = 1; ; attempt++) {
      check();
      try {
        const work = async () => {
          check();
          emit({ kind: "attempt", attempt });
          return operation({ attempt, signal });
        };
        const guarded = () => (breaker ? breaker.run(work) : work());
        const value = await (capacity ? capacity.run(guarded) : guarded());
        check();
        return value;
      } catch (error) {
        check();
        if (
          options.retrySafety === "idempotent" &&
          attempt < attempts &&
          !(
            error instanceof CircuitOpenError ||
            error instanceof BulkheadFullError
          ) &&
          classify?.(error) === "transient"
        ) {
          const sample = random();
          if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
            throw new RangeError("Expected randomness in [0,1)");
          const ceiling =
            baseDelayMs === 0
              ? 0
              : Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
          const header = options.retryAfter?.(error);
          const delay = Math.max(
            Math.floor(sample * ceiling),
            header === undefined ? 0 : (retryAfterMs(header, clock.now()) ?? 0),
          );
          if (delay < left()) {
            emit({ kind: "retry", attempt, delayMs: delay });
            await clock.delay(delay, signal);
            continue;
          }
        }
        if (!fallback) throw error;
        emit({ kind: "fallback", attempt });
        const result = await fallback(error, signal);
        check();
        return result;
      }
    }
  }
  try {
    return await Promise.race([abort, run()]);
  } finally {
    timer.abort();
    signal.removeEventListener("abort", reject);
    options.signal?.removeEventListener("abort", forward);
  }
}
