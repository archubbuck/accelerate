# @accelerate/forms-react

Connect a forms-core controller to React via useSyncExternalStore. Create the controller outside render or memoize it; provide a consistent initial snapshot for SSR. Rendering and controller ownership remain with the consumer.

```ts
import { useFormSnapshot } from "@accelerate/forms-react";
const snapshot = useFormSnapshot(controller);
```
