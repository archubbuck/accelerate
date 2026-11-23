import { assertTtl, type CacheEntry, type CacheStore } from "@accelerate/cache-core";
export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  constructor(private readonly now: () => number = Date.now) {}
  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && this.now() >= entry.expiresAt) { this.entries.delete(key); return undefined; }
    return entry.value as T;
  }
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    assertTtl(ttlMs);
    this.entries.set(key, { value, ...(ttlMs === undefined ? {} : { expiresAt: this.now() + ttlMs }) });
  }
  async delete(key: string): Promise<boolean> { return this.entries.delete(key); }
  async clear(): Promise<void> { this.entries.clear(); }
}
