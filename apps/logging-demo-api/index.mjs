import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createNodeLogger, runWithLogContext } from "@accelerate/logging-node";
const logger = createNodeLogger({ service: "logging-demo-api" });
createServer((request, response) => {
  const correlationId = request.headers["x-correlation-id"] || randomUUID();
  runWithLogContext({ correlationId }, () => {
    logger.info("HTTP request", { method: request.method, path: request.url });
    response.setHeader("x-correlation-id", correlationId);
    response.setHeader("access-control-allow-origin", "http://localhost:4200");
    response.setHeader("access-control-allow-headers", "x-correlation-id,content-type");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, correlationId }));
  });
}).listen(4100, "127.0.0.1", () => console.log("Logging API: http://127.0.0.1:4100"));
