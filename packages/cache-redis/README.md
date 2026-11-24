# @accelerate/cache-redis

Redis-backed JSON cache using an injected client bridge. Map set TTL to Redis PX and scan to Redis SCAN MATCH. Clear is namespace-scoped and best effort under concurrent writes. Use a dedicated namespace; values must be JSON serializable.

## Usage

```ts
import { RedisCache } from "@accelerate/cache-redis";
const cache = new RedisCache(client, 'my-app');
await cache.set('key', { value: 1 }, 1000);
```
