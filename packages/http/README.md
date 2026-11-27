# Accelerate HTTP

HTTP clients and middleware, Node handlers, resilience policies, rate limiting, and OpenAPI contracts in one package. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for other capability packages.

After the preview is published, install it with:

```sh
npm install @accelerate/http@next
```

```ts
import { createHttpClient } from '@accelerate/http';

const client = createHttpClient({ baseUrl: 'https://api.example.com', timeoutMs: 2000 });
const response = await client.send({ method: 'GET', url: '/products' });
console.log(response.status);
```

| Previous import | Preview import |
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

The root export includes the framework-neutral HTTP contracts and fetch client. Server and provider imports have separate entry points. PostgreSQL and Redis quota stores accept caller-supplied database and Redis client interfaces. The preview installs without either driver.

When migrating, update imports together wherever code shares a class identity, such as `HttpStatusError`. Both package families can be installed during the transition. Existing method signatures and behavior carry over into the preview. The quota preview operation is discoverable as `http.rate-limit.preview`.
