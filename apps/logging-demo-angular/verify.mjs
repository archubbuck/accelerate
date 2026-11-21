import { realpathSync } from "node:fs";
for (const name of ["@accelerate/logging-core", "@accelerate/logging-angular"]) {
  const path = realpathSync(import.meta.resolve(name).replace("file://", ""));
  if (!path.includes("node_modules") || path.includes("/packages/")) throw Error("Not an npm installation: " + path);
  console.log(name, path);
}
