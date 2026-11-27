import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadConsolidation } from "./consolidation.mjs";

const registry = "--registry=https://registry.npmjs.org";
const catalog = loadConsolidation();
const messages = Object.entries(catalog.migrations).map(([name, { family }]) => {
  const imports = Object.entries(catalog.imports)
    .filter(([specifier]) => specifier === name || specifier.startsWith(name + "/"))
    .map(([, target]) => target).join(", ");
  return [name, `Consolidated into ${family}. Install ${family} and use ${imports}. Migration guide: https://www.npmjs.com/package/@accelerate/sdk`];
});

if (process.argv[2] === "--apply") {
  const pending = new Map(Object.keys(catalog.families).map(family => {
    const manifest = JSON.parse(readFileSync(new URL(`../../packages/${family.split("/")[1]}/package.json`, import.meta.url)));
    if (manifest.version.includes("-")) throw Error("Expected a stable release for " + family);
    return [family, manifest.version];
  }));
  for (let attempt = 0; attempt < 12 && pending.size; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 20000));
    for (const [family, expected] of pending) {
      try {
        const latest = JSON.parse(execFileSync("npm", ["view", family, "dist-tags.latest", "--json", "--prefer-online", registry], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
        if (latest === expected) pending.delete(family);
      } catch (error) {
        if (!/\bE404\b/.test(String(error.stderr))) throw error;
      }
    }
  }
  if (pending.size) throw Error("Stable npm release unavailable for " + [...pending.keys()].join(", "));
  const failures = [];
  for (const [name, message] of messages) {
    try {
      execFileSync("npm", ["deprecate", name, message, registry], { stdio: "inherit" });
      console.log("Deprecated " + name);
    } catch (error) {
      if (error.code) throw error;
      failures.push(name);
    }
  }
  if (failures.length) {
    console.error(`npm deprecation succeeded for ${messages.length - failures.length} of ${messages.length} packages.`);
    console.error("npm deprecation failed for: " + failures.join(", "));
    process.exitCode = 1;
  }
} else {
  console.log(JSON.stringify(Object.fromEntries(messages), null, 2));
}
