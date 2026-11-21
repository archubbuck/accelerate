import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

// Schema migrations and demo seed data are applied separately during provisioning.
// Never run database migrations in a request-serving serverless function.
const ready = (async () => {
  const app = await buildApp();
  await app.ready();
  return app;
})();
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await ready;
  app.routing(request, response);
}
