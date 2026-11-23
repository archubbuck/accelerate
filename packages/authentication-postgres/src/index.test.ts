import { describe, expect, it, vi } from "vitest";
import type { Database } from "@accelerate/data-core";
import { createPostgresIdentityStore, createPostgresSessionStore } from "./index.js";

describe("Postgres authentication adapters without a database server", () => {
  it("maps identity rows and missing identities", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "user-1", email: "user@example.com", display_name: null }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const store = createPostgresIdentityStore({ query } as unknown as Database);
    await expect(store.getById("user-1")).resolves.toEqual({ id: "user-1", email: "user@example.com" });
    await expect(store.getByEmail("missing@example.com")).resolves.toBeUndefined();
    expect(query.mock.calls[1][1]).toEqual(["missing@example.com"]);
  });

  it("writes, retrieves and revokes sessions with bound parameters", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const expiresAt = new Date("2026-01-02T00:00:00Z");
    const session = { id: "digest", identityId: "user-1", createdAt, expiresAt };
    const query = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: "digest", identity_id: "user-1", created_at: createdAt, expires_at: expiresAt }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const store = createPostgresSessionStore({ query } as unknown as Database);
    await store.put(session);
    expect(query.mock.calls[0][1]).toEqual(["digest", "user-1", createdAt, expiresAt]);
    await expect(store.get("digest")).resolves.toEqual(session);
    await store.revoke("digest");
    expect(query.mock.calls[2][1]).toEqual(["digest"]);
  });
});
