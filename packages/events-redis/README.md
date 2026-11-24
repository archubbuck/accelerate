# @accelerate/events-redis

Redis Pub/Sub event adapter with an injected bridge. The bridge owns subscription readiness, reconnects and client lifecycle. Delivery is ephemeral, not durable or guaranteed; use a durable event adapter for replay. Handler and decoding errors are forwarded to onError.

## Usage

```ts
import { RedisEventBus } from "@accelerate/events-redis";
const bus = new RedisEventBus(bridge, 'app', console.error);
```
