import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
const require = createRequire(import.meta.url);
for (const name of ["@accelerate/logging-core", "@accelerate/logging-react"]) {
  const path = realpathSync(require.resolve(name));
  if (!path.includes("node_modules") || path.includes("/packages/")) throw Error("Not an npm installation: " + path);
  console.log(name, path);
}
