export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly message?: string;
}
export type HealthCheck = () => HealthCheckResult | Promise<HealthCheckResult>;
export interface HealthReport {
  readonly status: HealthStatus;
  readonly checks: Readonly<Record<string, HealthCheckResult>>;
}
export interface HealthRegistry {
  register(name: string, check: HealthCheck): void;
  unregister(name: string): boolean;
  run(): Promise<HealthReport>;
}
const rank: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };
export function createHealthRegistry(options: { timeoutMs?: number } = {}): HealthRegistry {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
  const checks = new Map<string, HealthCheck>();
  return {
    register(name, check) {
      if (!name.trim() || checks.has(name)) throw new Error("Health check name must be unique and nonempty");
      checks.set(name, check);
    },
    unregister(name) { return checks.delete(name); },
    async run() {
      const results = await Promise.all([...checks].map(async ([name, check]) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            Promise.resolve().then(check),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs); })
          ]);
          if (!result || !(result.status in rank)) throw new Error("Invalid health check status");
          return [name, result] as const;
        } catch (error) {
          return [name, { status: "unhealthy" as const, message: error instanceof Error ? error.message : "Health check failed" }] as const;
        } finally { if (timer) clearTimeout(timer); }
      }));
      const record: Record<string, HealthCheckResult> = Object.fromEntries(results);
      const status = results.reduce<HealthStatus>((worst, [, result]) =>
        rank[result.status] > rank[worst] ? result.status : worst, "healthy");
      return { status, checks: record };
    }
  };
}
