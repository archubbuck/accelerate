import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Session, SessionStore } from "@accelerate/authentication-core";
/** Issues an opaque bearer token; persist only its SHA-256 digest as the session ID. */
export function issueSessionToken(): { token: string; digest: string } { const token = randomBytes(32).toString("base64url"); return { token, digest: digestSessionToken(token) }; }
export function digestSessionToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function constantTimeDigestEqual(a: string, b: string): boolean { const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex"); return left.length === 32 && right.length === 32 && timingSafeEqual(left, right); }
export async function createSession(options: { store: SessionStore; identityId: string; ttlMs: number; now?: Date }): Promise<{ token: string; session: Session }> {
  if (!options.identityId || !Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) throw new TypeError("Invalid session options");
  const now = options.now ?? new Date(); const { token, digest } = issueSessionToken();
  const session: Session = { id: digest, identityId: options.identityId, createdAt: now, expiresAt: new Date(now.getTime() + options.ttlMs) };
  if (!Number.isFinite(session.expiresAt.getTime())) throw new RangeError("Session expiry out of range");
  await options.store.put(session); return { token, session };
}
export function extractBearerToken(header: string | undefined): string | undefined { const match = /^Bearer ([A-Za-z0-9_-]{40,})$/i.exec(header ?? ""); return match?.[1]; }
