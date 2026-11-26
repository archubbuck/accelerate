# @accelerate/decimal-core

Exact scaled decimal arithmetic, currency validation and deterministic allocation.

Use a decimal string and an explicit rounding policy. Values carry a three-letter uppercase currency identifier and scale. Addition and subtraction require both to match. Scale is limited to 1000 fractional digits. Allocation accepts integer weights and distributes remaining minor units by descending remainder, breaking ties in input order.

```ts
import { amount, allocate } from "@accelerate/decimal-core";
const total = amount("100.01", "USD", 2, "halfEven");
const shares = allocate(total, [1n, 1n]); // 50.01 and 50.00
```

Serialize the whole object as JSON. Bind value directly as a string to a PostgreSQL numeric parameter and store currency and scale alongside it. Read numeric as text and reconstruct with amount. Configure the PostgreSQL column with enough precision and scale to avoid database rounding.
