import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";
import { initialize } from "../src/db.js";

// Reuse initialized Fastify and PostgreSQL pool across warm invocations.
const ready = (async () => {
  await initialize();
  const app = await buildApp();
  await app.ready();
  return app;
})();
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await ready;
  app.routing(request, response);
}
