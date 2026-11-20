import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const manifestPath = join(dist, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const bundles = readdirSync(join(dist, "fesm2022")).filter(name => name.endsWith(".mjs"));
assert.equal(bundles.length, 1, "Expected exactly one Angular entrypoint bundle");
const bundle = "./fesm2022/" + bundles[0];
const entry = manifest.exports?.["."];
assert.ok(entry && typeof entry === "object", "Missing Angular entrypoint exports");
assert.ok(typeof entry.types === "string", "Missing Angular declaration export");
manifest.exports["."] = { ...entry, default: bundle };
manifest.module = bundle;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Angular package entrypoint aligned with emitted bundle:", bundle);
