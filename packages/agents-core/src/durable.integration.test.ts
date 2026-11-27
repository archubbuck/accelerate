import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { createPostgresDatabase } from "@accelerate/data-postgres";
import { createPostgresWorkflowStore, workflowMigration } from "@accelerate/workflows-postgres";
import { ToolRegistry } from "@accelerate/ai-tools";
import { createDurableAgent } from "./durable.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("resumes agent work on a different PostgreSQL worker without repeating tools", async () => {
  const schema = "agent_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of workflowMigration.statements) await db.query(statement);
    const tools = new ToolRegistry();
    const execute = vi.fn(async () => null);
    tools.register({ definition: { name: "lookup", description: "Lookup", inputSchema: {} }, validate: value => value, execute });
    const generate = vi.fn(async (request) => request.messages.some((m: { role: string }) => m.role === "tool")
      ? { content: "done" }
      : { content: "checking", toolCalls: [{ id: "call-1", name: "lookup", arguments: {} }] });
    const options = {
      name: "agent", version: 1, model: "model", versions: { model: "v1", prompt: "v1", tools: "v1" },
      tools, provider: () => ({ generate }), authorizeTool: () => true,
    };
    const a = createDurableAgent(createPostgresWorkflowStore(db), options);
    await a.start("run", [{ role: "user", content: "Check." }]);
    await Promise.all([a.tick("run"), a.tick("run")]);
    const b = createDurableAgent(createPostgresWorkflowStore(db), options);
    for (let i = 0; i < 6; i++) await Promise.all([b.tick("run"), b.tick("run")]);
    expect((await b.inspect("run"))?.status).toBe("completed");
    expect(execute).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledTimes(2);
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
