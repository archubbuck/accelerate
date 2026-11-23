export interface CacheEntry<T> { value: T; expiresAt?: number; }
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
export function assertTtl(ttlMs?: number): void {
  if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs < 0)) throw new RangeError("ttlMs must be nonnegative and finite");
}
