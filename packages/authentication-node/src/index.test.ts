import { expect, it } from "vitest";
import { createSession, digestSessionToken, extractBearerToken } from "./index.js";
import { MemorySessionStore } from "@accelerate/authentication-core";
it("issues opaque tokens and stores only digests", async () => { const store = new MemorySessionStore(); const { token, session } = await createSession({ store, identityId: "user", ttlMs: 60000 }); expect(session.id).toBe(digestSessionToken(token)); expect(session.id).not.toBe(token); expect((await store.get(session.id))?.identityId).toBe("user"); expect(extractBearerToken("Bearer " + token)).toBe(token); });
