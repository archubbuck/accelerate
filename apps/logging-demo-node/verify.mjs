import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const name of ["@accelerate/logging-core", "@accelerate/logging-node"]) {
  const resolved = realpathSync(require.resolve(name));
  if (!resolved.includes("node_modules") || resolved.includes("/packages/")) throw Error("Not using installed npm package: " + resolved);
  console.log(name, resolved);
}
