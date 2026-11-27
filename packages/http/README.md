# Accelerate HTTP

HTTP clients and middleware, Node handlers, resilience policies, rate limiting, and OpenAPI contracts in one package. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for other capability packages.

Install the HTTP package with:

```sh
npm install @accelerate/http
```

```ts
import { createHttpClient } from '@accelerate/http';

const client = createHttpClient({ baseUrl: 'https://api.example.com', timeoutMs: 2000 });
const response = await client.send({ method: 'GET', url: '/products' });
console.log(response.status);
```

| Previous import | Replacement import |
| --- | --- |
| `@accelerate/http-core` | `@accelerate/http/core` |
| `@accelerate/http-client` | `@accelerate/http/client` |
| `@accelerate/http-node` | `@accelerate/http/node` |
| `@accelerate/resilience-core` | `@accelerate/http/resilience` |
| `@accelerate/rate-limit-core` | `@accelerate/http/rate-limit` |
| `@accelerate/rate-limit-memory` | `@accelerate/http/rate-limit/memory` |
| `@accelerate/rate-limit-postgres` | `@accelerate/http/rate-limit/postgres` |
| `@accelerate/rate-limit-redis` | `@accelerate/http/rate-limit/redis` |
| `@accelerate/contracts-openapi` | `@accelerate/http/openapi` |

The root export includes the framework-neutral HTTP contracts and fetch client. Server and provider imports have separate entry points. PostgreSQL and Redis quota stores accept caller-supplied database and Redis client interfaces. The package installs without either driver.

When migrating, update imports together wherever code shares a class identity, such as `HttpStatusError`. Both package families can be installed during the transition. Existing method signatures and behavior carry over into the consolidated package. The quota preview operation is discoverable as `http.rate-limit.preview`.

## Request and response pipelines

Middleware runs in array order on the way to the transport and in reverse order on the way back. Put a deadline around the full pipeline and place correlation before middleware that records request metadata. Inject credentials only for trusted destinations, and call `redactHttpHeaders` before handing headers to a logger. Keep raw URLs, bodies and validation issue details out of logs that may contain sensitive input.

```ts
import {
  composeMiddleware, createHttpClient, withAuthorization, withCorrelationId, withHttpDeadline,
} from '@accelerate/http';

const client = composeMiddleware(createHttpClient({ baseUrl: 'https://api.example.com' }), [
  withHttpDeadline(2000),
  withCorrelationId(),
  withAuthorization(() => getAuthorizationForThisService()),
]);
```

Use `withHttpValidation({ request, response })` with schemas exposing `safeParse`. It validates the request before dispatch and the response afterward. Successful parses can transform bodies. `HttpValidationError` distinguishes the failing direction, and the Node adapter returns a generic 400 for request validation errors. If you validate JSON on the Node side, decode the buffered request text before applying a schema.

The client and Node handler buffer bodies by default. Choose `createHttpClient({ responseBody: 'stream', maxResponseBytes: 1048576 })` to receive a Web byte stream, and `createNodeHttpHandler(handler, { requestBody: 'stream', maxBodyBytes: 1048576 })` to accept one. A Node handler can also return a Web byte stream and write with backpressure. Callers should consume or cancel returned streams. Body limits count bytes as they are read. A request that exceeds the Node limit gets 413 before response headers are sent, or a closed connection if streaming output already began.

Deadlines combine with the caller's abort signal. Transports and asynchronous middleware must honor that signal. The Node handler signals disconnects, and Fetch honors cancellation while reading the response. Use the existing quota middleware from `@accelerate/http/rate-limit` and policies from `@accelerate/http/resilience` in the pipeline. Retry only replayable requests because a stream can be consumed once.

## Resumable subscriptions

Use `@accelerate/http/streaming` for typed subscriptions, `@accelerate/http/streaming/websocket` for WebSocket connections, and `@accelerate/http/streaming/memory` for tests.

```ts
import { createStreamingConnection } from '@accelerate/http/streaming';
import { createWebSocketStreamingTransport } from '@accelerate/http/streaming/websocket';

const connection = createStreamingConnection(createWebSocketStreamingTransport('wss://api.example.com/events'), {
  subscriptions: [{ id: 'orders', after: checkpoint }],
  parse: parseOrderEvent,
  heartbeat: { idleMs: 30000, timeoutMs: 5000 },
  reconnect: { initialMs: 100, maxMs: 5000 },
  signal: shutdown.signal,
});

try {
  for await (const message of connection.messages) {
    if (message.gap) await reconcileOrders(message.gap);
    await applyOrderEvent(message.data);
  }
} finally {
  connection.close();
}
```

The server receives a JSON text frame of type `subscribe` with `subscription` and an optional exclusive `after` cursor. It sends `message` frames containing the subscription ID, a nonnegative integer `sequence` and `data`. The heartbeat uses application-level `ping` and `pong` frames. The connection requests replay after the last yielded sequence and drops duplicates. A server that cannot replay must leave a gap for the application to reconcile. Persist the cursor after applying each event if the application needs to resume after restart.

Queues are bounded independently by message count and bytes. Overflow aborts the session and triggers reconnection. The WebSocket adapter also bounds queued outgoing bytes. Always call `close()` or abort the supplied signal when shutting down.
