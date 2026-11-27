import { Temporal } from "@js-temporal/polyfill";
import { CronosExpression } from "cronosjs";
import { serializeOutcome, type Json } from "@accelerate/idempotency-core";

export type Timing =
  | { kind: "once" }
  | { kind: "interval"; everyMs: number }
  | {
      kind: "cron";
      expression: string;
      gap?: "skip" | "offset";
      overlap?: "first" | "both";
    };
export interface ScheduleDefinition {
  id: string;
  startAt: number;
  timing: Timing;
  /** Zone for cron and calendar exclusions. Defaults to UTC. */
  zone?: string;
  excludeDates?: string[];
  missed: { kind: "catch-up" } | { kind: "skip"; graceMs: number };
  payload: Json;
}
export type ScheduleStatus = "active" | "paused" | "cancelled" | "completed";
export interface ScheduleState {
  definition: ScheduleDefinition;
  status: ScheduleStatus;
  nextAt: number | null;
}
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  scheduledAt: number;
  payload: Json;
}
export interface ScheduleDecision {
  nextAt: number | null;
  run?: ScheduleRun;
  /** All eligible slots from the old cursor up to this instant were skipped. */
  skippedBefore?: number;
}
export function scheduleTime(ms: number) {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 253402300799999)
    throw new RangeError("Expected epoch milliseconds in years 1970–9999");
  return ms;
}
function choice(value: string, allowed: string[]) {
  if (!allowed.includes(value))
    throw new TypeError("Invalid scheduling policy");
}
// Evaluate wall-clock cron fields only inside segments with a constant UTC offset.
function zonedCron(
  cron: CronosExpression,
  zone: string,
  timing: Extract<Timing, { kind: "cron" }>,
  minimum: number,
): number | null {
  const zoned = (ms: number) =>
    Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone);
  const candidate = (from: number, offset: number) => {
    const local = cron.nextDate(new Date(from + offset - 1));
    return local ? local.getTime() - offset : Infinity;
  };
  let from = minimum;
  while (from <= 253402300799999) {
    const here = zoned(from);
    const offset = here.offsetNanoseconds / 1e6;
    const boundary =
      here.getTimeZoneTransition("next")?.epochMilliseconds ?? Infinity;
    const previous = zoned(from + 1).getTimeZoneTransition(
      "previous",
    )?.epochMilliseconds;
    let next = candidate(from, offset);
    if (previous !== undefined) {
      const oldOffset = zoned(previous - 1).offsetNanoseconds / 1e6;
      const delta = offset - oldOffset;
      if (delta < 0 && timing.overlap !== "both" && from < previous - delta)
        next = candidate(previous - delta, offset);
      if (delta > 0 && timing.gap === "offset" && from < previous + delta) {
        const shifted = candidate(from, oldOffset);
        if (shifted < previous + delta) next = Math.min(next, shifted);
      }
    }
    if (next < boundary) return next;
    // No subsequent matching wall time exists for this expression.
    if (!Number.isFinite(next)) return null;
    from = boundary;
  }
  return null;
}
/** Compile once to inspect any number of occurrences without writing state. */
export function compileSchedule(def: ScheduleDefinition) {
  scheduleTime(def.startAt);
  if (
    typeof def.id !== "string" ||
    !def.id.trim() ||
    def.id.length > 200 ||
    def.id.includes("\u0000")
  )
    throw new TypeError("Invalid schedule ID");
  serializeOutcome({ status: "completed", result: def.payload });
  choice(def.missed.kind, ["catch-up", "skip"]);
  if (def.missed.kind === "skip") scheduleTime(def.missed.graceMs);
  const zone = def.zone ?? "UTC";
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const excluded = new Set(def.excludeDates ?? []);
  for (const date of excluded) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
    )
      throw new RangeError("Invalid calendar date");
  }
  const timing = def.timing;
  choice(timing.kind, ["once", "interval", "cron"]);
  let cron: CronosExpression | undefined;
  if (
    timing.kind === "interval" &&
    (!Number.isSafeInteger(timing.everyMs) || timing.everyMs < 1)
  )
    throw new RangeError("Invalid interval");
  if (timing.kind === "cron") {
    if (timing.expression.trim().split(/\s+/).length !== 5)
      throw new RangeError("Expected five cron fields");
    choice(timing.gap ?? "skip", ["skip", "offset"]);
    choice(timing.overlap ?? "first", ["first", "both"]);
    cron = CronosExpression.parse(timing.expression, {
      timezone: 0,
    });
  }
  function atOrAfter(minimum: number): number | null {
    let from = Math.max(minimum, def.startAt);
    while (from <= 253402300799999) {
      let slot: number;
      if (timing.kind === "once") slot = def.startAt;
      else if (timing.kind === "interval")
        slot =
          def.startAt +
          Math.ceil((from - def.startAt) / timing.everyMs) * timing.everyMs;
      else {
        const next = zonedCron(cron!, zone, timing, from);
        if (next === null) return null;
        slot = next;
      }
      if (slot < from || slot > 253402300799999) return null;
      if (!excluded.size || !excluded.has(format.format(slot))) return slot;
      // Find the first millisecond after this local date, including non-24-hour days.
      const day = format.format(slot);
      let low = slot,
        high = slot + 3600000;
      while (format.format(high) === day) high += 3600000;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (format.format(mid) === day) low = mid;
        else high = mid;
      }
      from = high;
    }
    return null;
  }
  return { atOrAfter };
}
export function upcoming(
  def: ScheduleDefinition,
  from: number,
  limit = 10,
): number[] {
  scheduleTime(from);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new RangeError("Expected limit 1–1000");
  const plan = compileSchedule(def),
    result: number[] = [];
  for (
    let at = plan.atOrAfter(from);
    at !== null && result.length < limit;
    at = plan.atOrAfter(at + 1)
  )
    result.push(at);
  return result;
}
export function decideSchedule(
  state: ScheduleState,
  now: number,
): ScheduleDecision | null {
  scheduleTime(now);
  const { definition: def, nextAt } = state;
  if (state.status !== "active" || nextAt === null || nextAt > now) return null;
  const plan = compileSchedule(def);
  if (def.missed.kind === "skip" && now - nextAt > def.missed.graceMs) {
    const cutoff = now - def.missed.graceMs;
    return { nextAt: plan.atOrAfter(cutoff), skippedBefore: cutoff };
  }
  return {
    nextAt: plan.atOrAfter(nextAt + 1),
    run: {
      id: def.id + ":" + nextAt,
      scheduleId: def.id,
      scheduledAt: nextAt,
      payload: def.payload,
    },
  };
}
