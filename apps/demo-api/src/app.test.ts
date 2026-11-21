import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { initialize, pool } from "./db.js";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance;
beforeAll(async () => { await initialize(); app = await buildApp(); });
afterAll(async () => { await app?.close(); await pool.end(); });
async function session(userId: string) {
  const response = await app.inject({ method: "POST", url: "/api/demo/session", payload: { userId } });
  expect(response.statusCode).toBe(200);
  return response.cookies.find(cookie => cookie.name === "accesslab")!.value;
}
const call = (cookie: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, cookies: { accesslab: cookie }, payload: payload as object | undefined });
describe("published package API authorization", () => {
  it("denies anonymous requests", async () => {
    expect((await app.inject("/api/documents")).statusCode).toBe(401);
  });
  it("allows viewer reads but denies writes at the API", async () => {
    const cookie = await session("alice");
    expect((await call(cookie,"GET","/api/documents")).statusCode).toBe(200);
    expect((await call(cookie,"POST","/api/documents", { title: "Unauthorized" })).statusCode).toBe(403);
    expect((await call(cookie,"GET","/api/admin/audit")).statusCode).toBe(403);
  });
  it("allows editor writes but denies approvals", async () => {
    const cookie = await session("bob");
    expect((await call(cookie,"POST","/api/documents", { title: "Demo test" })).statusCode).toBe(201);
    expect((await call(cookie,"POST","/api/documents/doc-1/approve")).statusCode).toBe(403);
  });
  it("returns a valid authorization snapshot", async () => {
    const cookie = await session("carol");
    const response = await call(cookie,"GET","/api/authorization/me");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userId: "carol" });
    expect(response.json().permissions).toContain("documents.approve");
  });
  it("audits administrator changes and permits auditor reads", async () => {
    const david = await session("david");
    const result = await call(david,"POST","/api/admin/roles/editor/permissions",{permission:"reports.read"});
    expect(result.statusCode).toBe(200);
    const erin = await session("erin");
    const audit = await call(erin,"GET","/api/admin/audit");
    expect(audit.statusCode).toBe(200);
    expect(audit.json().some((event: { action: string }) => event.action === "permission.grant")).toBe(true);
  });
});
