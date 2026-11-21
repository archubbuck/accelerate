import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
const name = "@accelerate/authorization-react";
const manifest = JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8"));
assert.equal(manifest.version, "0.1.3");
assert.ok(!realpathSync(resolve("node_modules", name)).includes("/packages/authorization-"));
console.log(`${name}@${manifest.version} installed`);
