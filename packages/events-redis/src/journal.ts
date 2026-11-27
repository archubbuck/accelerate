import {
  createEventJournal,
  initialSubscription,
  type JournalEvent,
  type SubscriptionState,
} from "@accelerate/events-core";

/** Inject the node-redis EVAL signature or bridge an equivalent client. */
export interface RedisJournalClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}
const time =
  "local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000); ";
export function createRedisEventJournal(
  client: RedisJournalClient,
  namespace: string,
) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(namespace))
    throw new TypeError("Invalid journal namespace");
  const prefix = "accelerate:events:{" + namespace + "}:";
  const call = (script: string, keys: string[], args: string[]) =>
    client.eval(script, { keys: keys.map((k) => prefix + k), arguments: args });
  return createEventJournal({
    async append(event) {
      await call(
        `if redis.call('HEXISTS',KEYS[1],ARGV[1])==0 then
        redis.call('RPUSH',KEYS[2],ARGV[2]); redis.call('HSET',KEYS[1],ARGV[1],'1'); end; return 1`,
        ["ids", "log"],
        [event.id, JSON.stringify(event)],
      );
    },
    async read(after, limit) {
      const rows = (await call(
        "return redis.call('LRANGE',KEYS[1],ARGV[1],ARGV[2])",
        ["log"],
        [
          String(after),
          String(Math.min(Number.MAX_SAFE_INTEGER, after + limit - 1)),
        ],
      )) as string[];
      return rows.map((row, i) => ({
        cursor: after + i + 1,
        event: JSON.parse(row) as JournalEvent,
      }));
    },
    async load(name) {
      const [revision, data, now] = (await call(
        time +
          "return {redis.call('HGET',KEYS[1],'revision') or '0',redis.call('HGET',KEYS[1],'state') or '',now}",
        ["sub:" + name],
        [],
      )) as [string, string, number];
      return {
        now,
        revision: Number(revision),
        state: data
          ? (JSON.parse(data) as SubscriptionState)
          : initialSubscription(),
      };
    },
    async swap(name, revision, state, deadline) {
      return (
        Number(
          await call(
            time +
              `if (redis.call('HGET',KEYS[1],'revision') or '0')~=ARGV[1]
        or (ARGV[3]~='' and now>=tonumber(ARGV[3])) then return 0 end
        redis.call('HSET',KEYS[1],'state',ARGV[2]); redis.call('HINCRBY',KEYS[1],'revision',1); return 1`,
            ["sub:" + name],
            [
              String(revision),
              JSON.stringify(state),
              deadline === undefined ? "" : String(deadline),
            ],
          ),
        ) === 1
      );
    },
  });
}
