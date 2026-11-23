import { expect, it } from "vitest";
import { createAuthenticator, MemorySessionStore } from "./index.js";
it("authenticates active sessions and rejects revoked or expired sessions", async () => {
  const sessions = new MemorySessionStore(); const identities = { getById: async (id: string) => id === "u" ? { id } : undefined, getByEmail: async () => undefined };
  const auth = createAuthenticator({ sessions, identities, clock: { now: () => new Date("2026-01-02") } });
  await sessions.put({ id: "s", identityId: "u", createdAt: new Date("2026-01-01"), expiresAt: new Date("2026-01-03") });
  expect((await auth.authenticate("s"))?.identity.id).toBe("u"); await auth.revoke("s"); expect(await auth.authenticate("s")).toBeUndefined();
  await sessions.put({ id: "expired", identityId: "u", createdAt: new Date("2025-01-01"), expiresAt: new Date("2025-01-02") });
  expect(await auth.authenticate("expired")).toBeUndefined();
});
