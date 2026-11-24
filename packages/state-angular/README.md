# @accelerate/state-angular

Connect a state-core controller to Angular via a readonly signal. Pass the component or service DestroyRef to release the subscription automatically. Rendering and controller ownership remain with the consumer.

```ts
import { toStoreSignal } from "@accelerate/state-angular";
const snapshot = toStoreSignal(controller, destroyRef);
```
