# @accelerate/logging-react

React provider and hook for sharing an explicit `@accelerate/logging-core` logger across components.

## Install

```sh
npm install @accelerate/logging-react @accelerate/logging-core react
```

React 18 or later is supported.

## Quick start

```tsx
import { createLogger } from "@accelerate/logging-core";
import { LoggingProvider, useLogger } from "@accelerate/logging-react";

const logger = createLogger({ service: "web-app" });

function SaveButton() {
  const log = useLogger("SaveButton");
  return <button onClick={() => log.info("Save clicked")}>Save</button>;
}

export function App() {
  return (
    <LoggingProvider logger={logger}>
      <SaveButton />
    </LoggingProvider>
  );
}
```

## API

- `<LoggingProvider logger={logger}>` supplies the logger to descendants.
- `useLogger(component?, context?)` returns the provider logger or a child logger enriched with `component` and optional context fields.
- Calling `useLogger` outside a `LoggingProvider` throws an error.

Create the root logger outside render or otherwise keep its identity stable. For example, `useLogger("Checkout", { feature: "payments" })` adds fields to every log emitted through that hook. Use the hook only inside React components or custom hooks.

**Security:** avoid including secrets or sensitive user data in log messages or context; configure redaction through `@accelerate/logging-core`.

[Source and issues](https://github.com/archubbuck/accelerate)
