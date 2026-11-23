/** Deterministic, isolated fixture factories without a test-runner dependency. */
export interface FixtureContext { readonly sequence: number; readonly seed: number; }
export interface FixtureFactory<T> {
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
  reset(): void;
}
export function createFixtureFactory<T extends object>(
  create: (context: FixtureContext) => T,
  options: { seed?: number } = {}
): FixtureFactory<T> {
  const seed = options.seed ?? 1;
  if (!Number.isSafeInteger(seed)) throw new RangeError("seed must be a safe integer");
  let sequence = 0;
  const build = (overrides: Partial<T> = {}): T => {
    const base = create({ seed, sequence: sequence++ });
    return { ...base, ...overrides };
  };
  return {
    build,
    buildMany(count, overrides) {
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000) throw new RangeError("count must be between 0 and 10000");
      return Array.from({ length: count }, () => build(overrides));
    },
    reset() { sequence = 0; }
  };
}
/** Small deterministic pseudo-random number generator; not for security-sensitive use. */
export function seededRandom(seed: number): () => number {
  if (!Number.isSafeInteger(seed)) throw new RangeError("seed must be a safe integer");
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
