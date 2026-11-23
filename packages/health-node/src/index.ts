import type { IncomingMessage, ServerResponse } from "node:http";
import type { HealthRegistry, HealthReport } from "@accelerate/health-core";

export interface HealthHandlerOptions {
  path?: string;
  /** If omitted, readiness and liveness use the same registered checks. */
  statusCode?: (report: HealthReport) => number;
}
export function createHealthHandler(registry: HealthRegistry, options: HealthHandlerOptions = {}) {
  const path = options.path ?? "/health";
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== path) return false;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return true;
    }
    const report = await registry.run();
    const status = options.statusCode?.(report) ?? (report.status === "unhealthy" ? 503 : 200);
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(report));
    return true;
  };
}
