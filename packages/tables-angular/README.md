# @accelerate/tables-angular

Connect a tables-core controller to Angular via a readonly signal. Pass the component or service DestroyRef to release the subscription automatically. Rendering and controller ownership remain with the consumer.

```ts
import { toTableSignal } from "@accelerate/tables-angular";
const snapshot = toTableSignal(controller, destroyRef);
```
