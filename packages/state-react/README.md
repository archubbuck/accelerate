# @accelerate/state-react

Connect a state-core controller to React via useSyncExternalStore. Create the controller outside render or memoize it; provide a consistent initial snapshot for SSR. Rendering and controller ownership remain with the consumer.

```ts
import { useStoreSnapshot } from "@accelerate/state-react";
const snapshot = useStoreSnapshot(controller);
```
