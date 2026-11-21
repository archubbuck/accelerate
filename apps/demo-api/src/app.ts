import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { createAuthorization } from "@accelerate/authorization-core";
import { PostgresAuthorizationStore } from "@accelerate/authorization-postgres";
import { PostgresAuthorizationAdmin, type AdminAction } from "@accelerate/authorization-postgres/admin";
import { pool } from "./db.js";
import { people, registry } from "./permissions.js";

const auth = createAuthorization({ permissions: registry, store: new PostgresAuthorizationStore(pool) });
const allowedActions: Record<AdminAction, string> = {
  "role.create": "administration.manage", "role.activate": "administration.manage",
  "role.deactivate": "administration.manage", "permission.grant": "administration.manage",
  "permission.revoke": "administration.manage", "role.assign": "administration.manage",
  "role.unassign": "administration.manage", "audit.read": "administration.audit"
};
const admin = new PostgresAuthorizationAdmin(pool, registry, {
  authorize: async (context, action) => auth.can(context.actorId, allowedActions[action])
});
const knownUser = (id: unknown): id is string => typeof id === "string" && people.some(p => p.id === id);
export async function buildApp() {
  const app = Fastify({ logger: true });
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("DEMO_SESSION_SECRET must be at least 32 characters");
  await app.register(cookie, { secret });
  await app.register(cors, { origin: (process.env.WEB_ORIGINS ?? "http://localhost:5173,http://localhost:4200").split(","), credentials: true });
  const identity = (request: { cookies: Record<string, string | undefined>; unsignCookie: (value: string) => { valid: boolean; value: string | null } }) => {
    const token = request.cookies.accesslab;
    if (!token) return null;
    const signed = request.unsignCookie(token);
    return signed.valid && knownUser(signed.value) ? signed.value : null;
  };
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/demo/users", async () => people);
  app.post<{ Body: { userId?: string } }>("/api/demo/session", async (req, reply) => {
    if (!knownUser(req.body?.userId)) return reply.code(400).send({ error: "Unknown demo identity" });
    reply.setCookie("accesslab", req.body.userId, { signed: true, httpOnly: true, sameSite: "lax", path: "/" });
    return { userId: req.body.userId };
  });
  app.post("/api/demo/logout", async (_req, reply) => { reply.clearCookie("accesslab", { path: "/" }); return { ok: true }; });
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/demo/") || req.url === "/api/health") return;
    if (!identity(req)) return reply.code(401).send({ error: "Choose a demo identity first" });
  });
  const user = (req: Parameters<typeof identity>[0]) => identity(req)!;
  async function requirePermission(req: Parameters<typeof identity>[0], reply: { code: (status: number) => { send: (body: object) => unknown } }, permission: string) {
    if (!await auth.can(user(req), permission)) { reply.code(403).send({ error: "Forbidden", permission }); return false; }
    return true;
  }
  app.get("/api/authorization/me", async req => {
    const userId = user(req);
    const roles = await new PostgresAuthorizationStore(pool).getRolesForUser(userId);
    const permissions = (await Promise.all(registry.keys.map(async key => (await auth.can(userId, key)) ? key : null))).filter((key): key is string => key !== null);
    return { userId, roles: roles.filter(role => role.active).map(role => role.key), permissions };
  });
  app.get("/api/authorization/permissions", async () => registry.descriptions);
  app.post<{ Body: { permission?: string } }>("/api/authorization/evaluate", async (req, reply) => {
    if (typeof req.body?.permission !== "string") return reply.code(400).send({ error: "permission required" });
    return auth.evaluate(user(req), req.body.permission);
  });
  app.get("/api/documents", async (req, reply) => {
    if (!await requirePermission(req, reply, "documents.read")) return;
    return (await pool.query("SELECT * FROM demo_documents ORDER BY id")).rows;
  });
  app.post<{ Body: { title?: string; body?: string } }>("/api/documents", async (req, reply) => {
    if (!await requirePermission(req, reply, "documents.create")) return;
    if (typeof req.body?.title !== "string" || !req.body.title.trim()) return reply.code(400).send({ error: "title required" });
    const result = await pool.query("INSERT INTO demo_documents(id,title,body) VALUES ($1,$2,$3) RETURNING *", [randomUUID(), req.body.title.trim(), typeof req.body.body === "string" ? req.body.body : ""]);
    return reply.code(201).send(result.rows[0]);
  });
  app.patch<{ Params: { id: string }; Body: { title?: string; body?: string } }>("/api/documents/:id", async (req, reply) => {
    if (!await requirePermission(req, reply, "documents.edit")) return;
    if (typeof req.body?.title !== "string" || !req.body.title.trim()) return reply.code(400).send({ error: "title required" });
    const result = await pool.query("UPDATE demo_documents SET title=$2,body=$3 WHERE id=$1 RETURNING *", [req.params.id, req.body.title.trim(), typeof req.body.body === "string" ? req.body.body : ""]);
    return result.rows[0] ?? reply.code(404).send({ error: "Not found" });
  });
  app.delete<{ Params: { id: string } }>("/api/documents/:id", async (req, reply) => {
    if (!await requirePermission(req, reply, "documents.delete")) return;
    const result = await pool.query("DELETE FROM demo_documents WHERE id=$1", [req.params.id]);
    return result.rowCount ? { ok: true } : reply.code(404).send({ error: "Not found" });
  });
  app.post<{ Params: { id: string } }>("/api/documents/:id/approve", async (req, reply) => {
    if (!await requirePermission(req, reply, "documents.approve")) return;
    const result = await pool.query("UPDATE demo_documents SET status='approved' WHERE id=$1 RETURNING *", [req.params.id]);
    return result.rows[0] ?? reply.code(404).send({ error: "Not found" });
  });
  app.get("/api/reports", async (req, reply) => {
    if (!await requirePermission(req, reply, "reports.read")) return;
    const result = await pool.query("SELECT status,COUNT(*)::int AS count FROM demo_documents GROUP BY status");
    return result.rows;
  });
  app.get("/api/admin/roles", async (req, reply) => {
    if (!await requirePermission(req, reply, "administration.manage")) return;
    const roles = await pool.query("SELECT id,role_key AS key,name,active FROM authorization_roles ORDER BY role_key");
    const grants = await pool.query("SELECT role_id,permission_key FROM authorization_role_permissions ORDER BY permission_key");
    const assignments = await pool.query("SELECT user_id,role_id FROM authorization_user_roles ORDER BY user_id");
    return { roles: roles.rows, grants: grants.rows, assignments: assignments.rows };
  });
  app.post<{ Body: { id?: string; key?: string; name?: string } }>("/api/admin/roles", async (req, reply) => {
    const { id, key, name } = req.body ?? {};
    if (![id,key,name].every(value => typeof value === "string" && value.trim())) return reply.code(400).send({ error: "id, key, name required" });
    await admin.createRole({ actorId: user(req) }, { id: id!, key: key!, name: name!, active: true });
    return reply.code(201).send({ ok: true });
  });
  app.patch<{ Params: { id: string }; Body: { active?: boolean } }>("/api/admin/roles/:id/status", async (req, reply) => {
    if (typeof req.body?.active !== "boolean") return reply.code(400).send({ error: "active boolean required" });
    await admin.setRoleActive({ actorId: user(req) }, req.params.id, req.body.active);
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { permission?: string } }>("/api/admin/roles/:id/permissions", async (req, reply) => {
    if (typeof req.body?.permission !== "string") return reply.code(400).send({ error: "permission required" });
    await admin.grant({ actorId: user(req) }, req.params.id, req.body.permission);
    return { ok: true };
  });
  app.delete<{ Params: { id: string; permission: string } }>("/api/admin/roles/:id/permissions/:permission", async req => {
    await admin.revoke({ actorId: user(req) }, req.params.id, req.params.permission);
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { roleId?: string } }>("/api/admin/users/:id/roles", async (req, reply) => {
    if (!knownUser(req.params.id) || typeof req.body?.roleId !== "string") return reply.code(400).send({ error: "Invalid user or role" });
    await admin.assign({ actorId: user(req) }, req.params.id, req.body.roleId);
    return { ok: true };
  });
  app.delete<{ Params: { id: string; roleId: string } }>("/api/admin/users/:id/roles/:roleId", async req => {
    await admin.unassign({ actorId: user(req) }, req.params.id, req.params.roleId);
    return { ok: true };
  });
  app.get("/api/admin/audit", async req => admin.listAuditEvents({ actorId: user(req) }));
  app.setErrorHandler((error, _req, reply) => {
    if (error.message === "Forbidden") return reply.code(403).send({ error: "Forbidden" });
    if (error.message === "Unregistered permission") return reply.code(400).send({ error: error.message });
    app.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });
  return app;
}
