# @accelerate/testing-architecture

Framework-independent dependency graph checks for boundary violations and cycle witnesses. Consumers supply edges from their own source or workspace analyzer; this package does not parse imports.

## Usage

```ts
const cycles = findCycles(edges);
const violations = checkBoundaries(edges, rules);
```
