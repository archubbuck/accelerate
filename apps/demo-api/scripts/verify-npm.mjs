import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
const expected = ["@accelerate/authorization-core", "@accelerate/authorization-postgres"];
for (const name of expected) {
  const manifest = JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.1.3", `${name} must be installed from npm at version 0.1.3`);
  const path = realpathSync(resolve("node_modules", name));
  assert.ok(!path.includes("/packages/authorization-"), `Local workspace package resolved: ${path}`);
  console.log(`${name}@${manifest.version}: ${path}`);
}
