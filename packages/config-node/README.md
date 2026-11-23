# @accelerate/config-node

Node.js environment configuration adapter for [config-core](../config-core/README.md). Reads environment variables without mutating `process.env`.

```ts
import { configField } from "@accelerate/config-core";
import { loadEnvironment } from "@accelerate/config-node";
const config = loadEnvironment({ PORT: configField.number(3000), HOST: configField.string() });
```

Install both packages after publication. Missing or invalid values fail fast.
