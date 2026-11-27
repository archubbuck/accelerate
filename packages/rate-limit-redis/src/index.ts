import {
  expiresAt,
  type QuotaState,
  type QuotaStore,
} from "@accelerate/rate-limit-core";
export interface RedisQuotaClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}
const snapshot = `local t=redis.call('TIME')
return {redis.call('GET',KEYS[1]) or '',t[1],t[2]}`;
const commit = `if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end
if ARGV[2]=='' then redis.call('DEL',KEYS[1])
else redis.call('SET',KEYS[1],ARGV[2],'PXAT',ARGV[3]) end
return 1`;
export function createRedisQuotaStore(
  client: RedisQuotaClient,
  namespace: string,
): QuotaStore {
  if (typeof namespace !== "string" || !namespace.trim())
    throw new TypeError("Redis namespace required");
  return {
    async update(partition, fn) {
      const keys = [JSON.stringify([namespace, partition])];
      for (let attempt = 0; attempt < 64; attempt++) {
        const result = await client.eval(snapshot, { keys, arguments: [] });
        if (
          !Array.isArray(result) ||
          result.length !== 3 ||
          typeof result[0] !== "string"
        )
          throw new Error("Unexpected Redis quota snapshot");
        const [raw, seconds, micros] = result,
          now = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
        if (!Number.isSafeInteger(now)) throw new Error("Invalid Redis time");
        const state: QuotaState = raw ? JSON.parse(raw).state : [];
        const change = fn(state, now);
        if (!change.state) return change.value;
        const encoded = change.state.length
          ? JSON.stringify({
              version: crypto.randomUUID(),
              state: change.state,
            })
          : "";
        const reply = await client.eval(commit, {
          keys,
          arguments: [raw, encoded, String(expiresAt(change.state))],
        });
        if (reply === 1) return change.value;
        if (reply !== 0) throw new Error("Unexpected Redis commit result");
      }
      throw new Error("Redis quota contention retry limit reached");
    },
  };
}
