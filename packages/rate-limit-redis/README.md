# @accelerate/rate-limit-redis

Atomic quota storage for Redis 7 using a single key per partition. Inject a node-redis compatible eval client with string replies and a private namespace.

```ts
const store = createRedisQuotaStore(redis, 'api-quotas-v1');
const limiter = createRateLimiter(store);
```

A Lua script reads state and server time together. Admissions compare and replace the snapshot with a versioned value. Competing writers retry up to 64 times and report an error if contention persists. Denied reads leave the snapshot unchanged. Redis expires the partition at its last reset time. Production recovery depends on Redis persistence, failover and eviction settings. Use dedicated keys, restrict ACLs to the namespace and required commands (EVAL, TIME, GET, SET, DEL), and keep each partition small enough to read and replace as one value.
