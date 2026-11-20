import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const dist = new URL("../dist/", import.meta.url);
const file = (name) => new URL(name, dist);
assert.ok(existsSync(file("package.json")), "Missing generated Angular package manifest");
const manifest = JSON.parse(readFileSync(file("package.json"), "utf8"));
assert.equal(manifest.name, "@accelerate/authorization-angular");
assert.ok(manifest.exports?.["."], "Missing APF entrypoint exports");
const entry = manifest.exports["."];
assert.ok(typeof entry.default === "string" && entry.default.startsWith("./fesm2022/"), "Invalid Angular JS entrypoint");
assert.ok(existsSync(file(entry.default)), `Angular JS export points to missing file: ${entry.default}`);
assert.equal(manifest.module, entry.default, "Angular module and exports entrypoints disagree");
assert.ok(typeof entry.types === "string" && existsSync(file(entry.types)), "Angular declaration export points to missing file");
assert.ok(manifest.peerDependencies?.["@angular/core"], "Missing Angular peer dependency");
const fesm = file("fesm2022/");
assert.ok(existsSync(fesm), "Missing FESM2022 directory");
const bundles = readdirSync(fesm).filter((name) => name.endsWith(".mjs"));
assert.ok(bundles.length > 0, "Missing FESM2022 module");
const js = bundles.map((name) => readFileSync(join(fileURLToPath(fesm), name), "utf8")).join("\n");
for (const declaration of ["ɵɵngDeclareDirective", "ɵɵngDeclareInjectable", "ɵɵngDeclareFactory"]) {
  assert.ok(js.includes(declaration), `Missing Angular partial compilation marker: ${declaration}`);
}
assert.ok(js.includes("AuthCanDirective"), "Missing AuthCanDirective export");
assert.ok(js.includes("provideAuthorization"), "Missing provideAuthorization export");
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: fileURLToPath(dist),
  encoding: "utf8"
}))[0];
const packedPaths = new Set((packed.files ?? []).map(item => item.path));
assert.ok(packedPaths.has("README.md"), "Angular npm archive excludes README.md");
for (const entry of [manifest.exports["."].default, manifest.exports["."].types]) {
  assert.ok(packedPaths.has(entry.startsWith("./") ? entry.slice(2) : entry), `Angular npm archive excludes entrypoint: ${entry}`);
}
console.log("Angular APF package, npm archive contents, and partial Ivy declarations verified");
