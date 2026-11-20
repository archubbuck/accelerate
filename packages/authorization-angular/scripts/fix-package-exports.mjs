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
// The source package uses files: ["dist"], but the generated APF manifest lives
// inside dist. Carrying that allowlist into the tarball excludes all APF files.
// Replace it with paths relative to the generated package root.
manifest.files = ["fesm2022", "index.d.ts", "**/*.d.ts", "**/*.d.ts.map"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Angular package entrypoint aligned with emitted bundle:", bundle);
