# @accelerate/tables-react

Connect a tables-core controller to React via useSyncExternalStore. Create the controller outside render or memoize it; provide a consistent initial snapshot for SSR. Rendering and controller ownership remain with the consumer.

```ts
import { useTableSnapshot } from "@accelerate/tables-react";
const snapshot = useTableSnapshot(controller);
```
