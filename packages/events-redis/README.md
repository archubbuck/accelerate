# @accelerate/events-redis

Redis Pub/Sub event adapter with an injected bridge. The bridge owns subscription readiness, reconnects and client lifecycle. Delivery is ephemeral, not durable or guaranteed; use a durable event adapter for replay. Handler and decoding errors are forwarded to onError.

## Usage

```ts
import { RedisEventBus } from "@accelerate/events-redis";
const bus = new RedisEventBus(bridge, 'app', console.error);
```

`createRedisEventJournal(client, namespace)` stores ordered history and subscription state separately from the existing pub/sub bus. Inject a client with the node-redis `eval(script, { keys, arguments })` interface. Use a dedicated namespace of 1–128 ASCII letters, digits, underscores or hyphens. All journal keys share a Redis cluster hash slot. Append and subscription updates each execute atomically on the primary. Lease deadlines use Redis server time.

The journal retains its list of events, ID index and named subscription checkpoints without expiration. Size the deployment for retained history and disable eviction for journal keys. Recovery across a server restart or failover depends on Redis persistence and replication settings. Restrict access to the journal key prefix and the script commands (EVAL, TIME, HEXISTS, HGET, HSET, HINCRBY, RPUSH and LRANGE). Pub/sub messages sent by the original bus have no stored history. See events-core for replay, delivery and redrive examples.
