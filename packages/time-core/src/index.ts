export interface Clock {
  now(): Date;
  monotonicMs(): number;
  delay(ms: number, signal?: AbortSignal): Promise<void>;
}

export function durationMs(
  value: number,
  unit: "ms" | "s" | "min" = "ms",
): number {
  const ms = value * { ms: 1, s: 1000, min: 60000 }[unit];
  if (!Number.isSafeInteger(ms) || ms < 0)
    throw new RangeError("Invalid duration");
  return ms;
}

/** Accept Date instances or canonical UTC ISO timestamps, including whole seconds. */
export function utc(value: Date | string): string {
  if (typeof value !== "string" && !(value instanceof Date))
    throw new TypeError("Expected a Date or UTC timestamp");
  const canonical = new Date(value).toISOString();
  if (
    typeof value === "string" &&
    canonical !== value &&
    canonical !== value.replace(/(\d\d:\d\d:\d\d)Z$/, "$1.000Z")
  ) {
    throw new RangeError("Expected an ISO UTC timestamp");
  }
  return canonical;
}

function wait(
  schedule: (done: () => void) => () => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cancel = schedule(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    });
    function abort() {
      cancel();
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export const systemClock: Clock = {
  now: () => new Date(),
  monotonicMs: () => performance.now(),
  async delay(ms, signal) {
    durationMs(ms);
    signal?.throwIfAborted();
    while (ms > 0) {
      const chunk = Math.min(ms, 2147483647);
      await wait((done) => {
        const timer = setTimeout(done, chunk);
        return () => clearTimeout(timer);
      }, signal);
      ms -= chunk;
    }
  },
};

export function fixedClock(
  at: string | Date,
  elapsed: Pick<Clock, "delay" | "monotonicMs"> = systemClock,
): Clock {
  const timestamp = utc(at);
  return {
    now: () => new Date(timestamp),
    delay: (ms, signal) => elapsed.delay(ms, signal),
    monotonicMs: () => elapsed.monotonicMs(),
  };
}

export function manualClock(
  at: string | Date,
): Clock & { advance(ms: number): void } {
  const epoch = Date.parse(utc(at));
  let elapsed = 0;
  const pending = new Map<() => void, number>();
  return {
    now: () => new Date(epoch + elapsed),
    monotonicMs: () => elapsed,
    async delay(ms, signal) {
      signal?.throwIfAborted();
      if (!durationMs(ms)) return;
      const deadline = durationMs(elapsed + ms);
      await wait((done) => {
        pending.set(done, deadline);
        return () => pending.delete(done);
      }, signal);
    },
    advance(ms) {
      const next = durationMs(elapsed + durationMs(ms));
      new Date(epoch + next).toISOString();
      elapsed = next;
      for (const [done, deadline] of pending) {
        if (deadline <= elapsed) {
          pending.delete(done);
          done();
        }
      }
    },
  };
}
