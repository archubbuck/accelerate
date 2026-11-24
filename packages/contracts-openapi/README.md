# @accelerate/contracts-openapi

Build OpenAPI 3.1 documents from typed operations. Checks duplicate operation IDs and routes and basic response status codes. This is not a complete OpenAPI schema validator.

## Usage

```ts
import { OpenApiBuilder } from "@accelerate/contracts-openapi";
const document = new OpenApiBuilder('API', '1.0').add('/items', 'get', { operationId: 'listItems', responses: { '200': { description: 'OK' } } }).build();
```
