# @accelerate/forms-angular

Connect a forms-core controller to Angular via a readonly signal. Pass the component or service DestroyRef to release the subscription automatically. Rendering and controller ownership remain with the consumer.

```ts
import { toFormSignal } from "@accelerate/forms-angular";
const snapshot = toFormSignal(controller, destroyRef);
```
