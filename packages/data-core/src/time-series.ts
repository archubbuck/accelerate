export interface Observation<Metadata = Readonly<Record<string, unknown>>> {
  at: number;
  value: number | null;
  metadata?: Metadata;
}

export interface ObservationRange {
  start: number;
  end: number;
  after?: number;
  limit?: number;
}

export interface SeriesPolicy {
  duplicates?: "reject" | "ignore" | "replace";
  outOfOrder?: "allow" | "reject";
}

export type MissingPolicy = "skip" | "zero" | "propagate";

export function assertTimestamp(time: number) {
  if (!Number.isSafeInteger(time)) throw new RangeError("Expected a safe integer epoch millisecond");
}

export function validateObservations<M>(input: readonly Observation<M>[]) {
  if (input.length > 10_000) throw new RangeError("Observation batch is too large");
  for (const observation of input) {
    assertTimestamp(observation.at);
    if (observation.value !== null && !Number.isFinite(observation.value)) throw new TypeError("Invalid observation value");
  }
}

export function validateObservationRange(range: ObservationRange) {
  const { start, end, after, limit = 100 } = range;
  assertTimestamp(start);
  assertTimestamp(end);
  if (after !== undefined) assertTimestamp(after);
  if (end <= start || !Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError("Invalid observation range");
  return limit;
}

export function prepareObservationBatch<M>(input: readonly Observation<M>[], policy: SeriesPolicy = {}) {
  validateObservations(input);
  const unique = new Map<number, Observation<M>>();
  const duplicates = policy.duplicates ?? "reject";
  if (!["reject", "ignore", "replace"].includes(duplicates) || !["allow", "reject"].includes(policy.outOfOrder ?? "allow")) {
    throw new TypeError("Invalid observation policy");
  }
  let last: number | undefined;
  for (const observation of input) {
    if (last !== undefined && observation.at < last && policy.outOfOrder === "reject") throw new Error("Out-of-order observation");
    last = observation.at;
    if (unique.has(observation.at)) {
      if (duplicates === "reject") throw new Error("Duplicate observation timestamp");
      if (duplicates === "ignore") continue;
    }
    unique.set(observation.at, structuredClone(observation));
  }
  return { observations: [...unique.values()].sort((a, b) => a.at - b.at), duplicates };
}

interface Aggregate {
  count: number;
  sum: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
}

export function aggregateObservations(input: readonly Observation<unknown>[], missing: MissingPolicy = "skip"): Aggregate {
  validateObservations(input);
  if (!["skip", "zero", "propagate"].includes(missing)) throw new TypeError("Invalid missing observation policy");
  let count = 0, sum = 0, min: number | null = null, max: number | null = null, gap = false;
  for (const observation of input) {
    if (observation.value === null) {
      gap = true;
      if (missing !== "zero") continue;
    }
    const value = observation.value ?? 0;
    count++;
    sum += value;
    min = min === null ? value : Math.min(min, value);
    max = max === null ? value : Math.max(max, value);
  }
  if (!Number.isFinite(sum)) throw new RangeError("Observation aggregate overflow");
  return gap && missing === "propagate"
    ? { count, sum: null, min: null, max: null, mean: null }
    : { count, sum, min, max, mean: count ? sum / count : null };
}

export function resampleObservations(input: readonly Observation<unknown>[], range: { start: number; end: number }, widthMs: number, missing: MissingPolicy = "skip") {
  validateObservationRange(range);
  validateObservations(input);
  assertTimestamp(widthMs);
  const size = Math.ceil((range.end - range.start) / widthMs);
  if (widthMs < 1 || !Number.isSafeInteger(range.end - range.start) || size > 10_000) throw new RangeError("Invalid resampling bucket count");
  const buckets: Observation<unknown>[][] = Array.from({ length: size }, () => []);
  for (const observation of input) {
    if (observation.at < range.start || observation.at >= range.end) continue;
    buckets[Math.floor((observation.at - range.start) / widthMs)].push(observation);
  }
  return buckets.map((bucket, index) => ({
    at: range.start + index * widthMs,
    ...aggregateObservations(bucket.length ? bucket : [{ at: 0, value: null }], missing),
  }));
}

export function rollingMean(input: readonly Observation<unknown>[], windowMs: number, missing: MissingPolicy = "skip") {
  validateObservations(input);
  assertTimestamp(windowMs);
  if (windowMs < 1) throw new RangeError("Invalid rolling window");
  if (!["skip", "zero", "propagate"].includes(missing)) throw new TypeError("Invalid missing observation policy");
  let start = 0, sum = 0, known = 0, gaps = 0;
  return input.map((current, end) => {
    if (end && current.at <= input[end - 1].at) throw new Error("Rolling observations must have distinct increasing timestamps");
    while (start < end && input[start].at <= current.at - windowMs) {
      const outgoing = input[start++].value;
      if (outgoing === null) gaps--;
      else { sum -= outgoing; known--; }
    }
    if (current.value === null) gaps++;
    else { sum += current.value; known++; }
    const count = known + (missing === "zero" ? gaps : 0);
    if (!Number.isFinite(sum)) throw new RangeError("Observation aggregate overflow");
    return { at: current.at, value: !count || (missing === "propagate" && gaps) ? null : sum / count };
  });
}
