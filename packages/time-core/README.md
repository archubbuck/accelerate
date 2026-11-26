# @accelerate/time-core

Injectable wall and monotonic clocks, UTC timestamps, durations and abortable delays.

Pass a Clock to code that polls or schedules work. Use monotonicMs() for elapsed time. fixedClock freezes only wall time. manualClock advances both clocks and resolves due delays when advance() runs.

```ts
import { systemClock, manualClock, durationMs } from "@accelerate/time-core";
await systemClock.delay(durationMs(0.25, "s"));
const clock = manualClock("2026-01-01T00:00:00Z");
const wake = clock.delay(250);
clock.advance(250);
await wake;
```

utc accepts a Date or a UTC ISO timestamp with whole seconds or exactly three fractional digits. Durations resolve to nonnegative safe integer milliseconds.
