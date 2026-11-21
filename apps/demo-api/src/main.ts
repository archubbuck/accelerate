import "dotenv/config";
import { buildApp } from "./app.js";
import { initialize, pool } from "./db.js";
await initialize();
const app = await buildApp();
const shutdown = async () => { await app.close(); await pool.end(); };
process.on("SIGINT", () => { void shutdown().then(() => process.exit(0)); });
process.on("SIGTERM", () => { void shutdown().then(() => process.exit(0)); });
await app.listen({ port: Number(process.env.PORT ?? 4000), host: "127.0.0.1" });
