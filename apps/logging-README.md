# Logging demos (published npm packages)

Five independently installable consumers demonstrate the published `@accelerate/logging-*` packages:

| Demo | Command | Purpose |
| --- | --- | --- |
| logging-demo-angular | `npm start` | Angular DI, structured logging and redaction |
| logging-demo-react | `npm run dev` | React provider, hooks and structured logging |
| logging-demo-node | `npm start` | Node async context propagation |
| logging-demo-api | `npm start` | HTTP correlation headers on localhost:4100 |
| logging-demo-otel | `npm start` | OTel API integration (requires configured exporter for delivery) |

These demos are intentionally excluded from `pnpm-workspace.yaml`. They pin npm package versions, and must be installed from npmjs.org rather than the local workspace. Once version 0.1.0 is published, run `npm install --registry=https://registry.npmjs.org` inside each directory, then `npm run verify:npm`, followed by the listed start/build command. The CI workflow `logging-demo-ci.yml` validates published consumers independently. Do not run it before publishing the five packages.
