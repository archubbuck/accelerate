import { describe, expect, it, vi } from "vitest";
import type { Database } from "@accelerate/data-core";
import { createPostgresAuditStore } from "./index.js";

describe("Postgres audit adapter without a database server", () => {
  it("validates and appends events with parameterized SQL", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const db = { query } as unknown as Database;
    const store = createPostgresAuditStore(db);
    const event = { id: "evt-1", occurredAt: new Date("2026-01-01T00:00:00Z"), actorId: "actor-1", action: "login", resource: "session", outcome: "success" as const, metadata: { source: "test" } };
    await store.append(event);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("INSERT INTO accelerate_audit_events");
    expect(query.mock.calls[0][1]).toEqual(["evt-1", event.occurredAt, "actor-1", "login", "session", null, "success", '{"source":"test"}']);
    await expect(store.append({ ...event, id: "" })).rejects.toThrow("Invalid audit event");
    expect(query).toHaveBeenCalledOnce();
  });

  it("maps query results and validates limits", async () => {
    const occurredAt = new Date("2026-01-01T00:00:00Z");
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "evt-2", occurred_at: occurredAt, actor_id: null, action: "read", resource: "document", resource_id: "doc-1", outcome: "success", metadata: { allowed: true } }], rowCount: 1 });
    const store = createPostgresAuditStore({ query } as unknown as Database);
    await expect(store.find({ limit: 0 })).rejects.toThrow("Invalid limit");
    expect(query).not.toHaveBeenCalled();
    await expect(store.find({ resource: "document", limit: 10 })).resolves.toEqual([{ id: "evt-2", occurredAt, action: "read", resource: "document", resourceId: "doc-1", outcome: "success", metadata: { allowed: true } }]);
    expect(query.mock.calls[0][1]).toEqual([null, "document", null, 10]);
  });
});
