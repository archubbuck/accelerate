import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url);
const file = (name) => new URL(name, dist);
assert.ok(existsSync(file("package.json")), "Missing generated Angular package manifest");
const manifest = JSON.parse(readFileSync(file("package.json"), "utf8"));
assert.equal(manifest.name, "@accelerate/authorization-angular");
assert.ok(manifest.exports?.["."], "Missing APF entrypoint exports");
assert.ok(manifest.peerDependencies?.["@angular/core"], "Missing Angular peer dependency");
const fesm = file("fesm2022/");
assert.ok(existsSync(fesm), "Missing FESM2022 directory");
const bundles = readdirSync(fesm).filter((name) => name.endsWith(".mjs"));
assert.ok(bundles.length > 0, "Missing FESM2022 module");
const js = bundles.map((name) => readFileSync(join(fesm.pathname, name), "utf8")).join("\n");
for (const declaration of ["ɵɵngDeclareDirective", "ɵɵngDeclareInjectable", "ɵɵngDeclareFactory"]) {
  assert.ok(js.includes(declaration), `Missing Angular partial compilation marker: ${declaration}`);
}
assert.ok(js.includes("AuthCanDirective"), "Missing AuthCanDirective export");
assert.ok(js.includes("provideAuthorization"), "Missing provideAuthorization export");
console.log("Angular APF package and partial Ivy declarations verified");
