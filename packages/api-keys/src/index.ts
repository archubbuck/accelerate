import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assertNonEmpty } from "@accelerate/security-core";
/** API keys are opaque credentials. Store only hashes; return plaintext once at issuance. */
export interface ApiKeyRecord { readonly id: string; readonly prefix: string; readonly hash: string; readonly subjectId: string; readonly createdAt: Date; readonly expiresAt?: Date; readonly revokedAt?: Date; }
export interface ApiKeyStore { put(key: ApiKeyRecord): Promise<void>; getByPrefix(prefix: string): Promise<readonly ApiKeyRecord[]>; revoke(id: string, at: Date): Promise<void>; }
export function hashApiKey(key: string): string { return createHash("sha256").update(key).digest("hex"); }
export function issueApiKey(subjectId: string, now = new Date(), expiresAt?: Date): { token: string; record: ApiKeyRecord } {
  assertNonEmpty(subjectId, "subjectId"); if (!Number.isFinite(now.getTime()) || (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now))) throw new TypeError("Invalid dates");
  const id = randomBytes(16).toString("hex"); const prefix = "ak_" + randomBytes(8).toString("hex"); const token = prefix + "_" + randomBytes(32).toString("base64url");
  return { token, record: { id, prefix, hash: hashApiKey(token), subjectId, createdAt: now, ...(expiresAt ? { expiresAt } : {}) } };
}
export async function verifyApiKey<T extends ApiKeyRecord>(token: string, store: { getByPrefix(prefix: string): Promise<readonly T[]> }, now = new Date()): Promise<T | undefined> {
  const match = /^(ak_[0-9a-f]{16})_[A-Za-z0-9_-]{43}$/.exec(token); if (!match) return undefined;
  const digest = Buffer.from(hashApiKey(token), "hex");
  const records = await store.getByPrefix(match[1]);
  for (const record of records) { const expected = /^[a-f0-9]{64}$/.test(record.hash) ? Buffer.from(record.hash, "hex") : Buffer.alloc(0); if (expected.length === digest.length && timingSafeEqual(expected, digest) && !record.revokedAt && record.createdAt <= now && (!record.expiresAt || record.expiresAt > now)) return record; }
  return undefined;
}
export class MemoryApiKeyStore implements ApiKeyStore { private readonly records = new Map<string, ApiKeyRecord>(); async put(record: ApiKeyRecord) { if (this.records.has(record.id)) throw new Error("Duplicate key ID"); this.records.set(record.id, { ...record }); } async getByPrefix(prefix: string) { return [...this.records.values()].filter(x => x.prefix === prefix).map(x => ({ ...x })); } async revoke(id: string, at: Date) { const record = this.records.get(id); if (record) this.records.set(id, { ...record, revokedAt: at }); } }
