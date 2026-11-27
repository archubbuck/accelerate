import assert from "node:assert/strict";

export const version = "0.1.0";
export const packageId = (name) => name.split("/")[1];

export function moduleExports(legacy, manifest) {
  if (
    legacy === "@accelerate/authorization-angular" ||
    legacy === "@accelerate/logging-angular"
  ) {
    return {
      ".": {
        types: "./index.d.ts",
        default: "./fesm2022/accelerate-" + packageId(legacy) + ".mjs",
      },
    };
  }
  return manifest.exports;
}

export function destinationExport(target, subpath) {
  return target.exports?.[subpath] ?? target.entry + (subpath === "." ? "" : subpath.slice(1));
}

export function modulePath(legacy, file) {
  return "dist/modules/" + packageId(legacy) + "/" + file.replace(/^\.\//, "");
}

export function familyManifest(name, description, catalog, readManifest) {
  const id = packageId(name);
  const manifest = {
    name,
    version: catalog.families[name].version ?? version,
    description: "Accelerate — " + description,
    keywords: [
      "accelerate",
      "typescript",
      id,
      ...({
        sdk: ["package-catalog", "migration"],
        http: ["middleware", "rate-limiting", "resilience", "openapi"],
        identity: ["authentication", "authorization", "audit"],
        data: ["postgresql", "migrations", "cache"],
        messaging: ["events", "jobs", "workflows"],
        observability: ["logging", "tracing", "metrics"],
        config: ["configuration", "feature-flags"],
        ui: ["forms", "state", "tables"],
        tooling: ["cli", "eslint", "ast"],
      }[id] ?? []),
    ],
    type: "module",
    sideEffects: false,
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    },
    files: ["dist"],
    scripts: {
      build: "node ../../tools/registry/consolidation.mjs build " + id,
      typecheck:
        "tsc --noEmit --skipLibCheck --module NodeNext --moduleResolution NodeNext dist/index.d.ts",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/archubbuck/accelerate.git",
      directory: "packages/" + id,
    },
    homepage:
      "https://github.com/archubbuck/accelerate/blob/main/packages/" +
      id +
      "/README.md",
    bugs: "https://github.com/archubbuck/accelerate/issues",
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
      tag: "latest",
    },
  };
  const dependencies = {},
    devDependencies = {},
    peerDependencies = {};
  function addRange(set, dependency, range) {
    // A lower Angular floor and a narrower compatible range occur in legacy adapters.
    if (dependency === "@angular/core") range = ">=19 <21";
    if (dependency === "tslib") range = "^2.6.2";
    assert.ok(
      !set[dependency] || set[dependency] === range,
      "Conflicting ranges for " + dependency,
    );
    set[dependency] = range;
  }
  for (const [legacy, target] of Object.entries(catalog.migrations)) {
    if (target.family !== name) continue;
    const source = readManifest(legacy);
    devDependencies[legacy] = source.version;
    for (const [subpath, memberExport] of Object.entries(
      moduleExports(legacy, source),
    )) {
      const destination = destinationExport(target, subpath);
      assert.ok(
        !Object.hasOwn(manifest.exports, destination),
        "Duplicate export " + name + destination.slice(1),
      );
      const path = (file) => "./" + modulePath(legacy, file);
      manifest.exports[destination] =
        typeof memberExport === "string"
          ? path(memberExport)
          : {
              types: path(memberExport.types),
              default: path(memberExport.default),
            };
    }
    for (const [dependency, range] of Object.entries({
      ...source.peerDependencies,
      ...source.dependencies,
    })) {
      const family = catalog.migrations[dependency]?.family;
      if (family) {
        if (family !== name) dependencies[family] = catalog.families[family].version ?? version;
      } else if (Object.hasOwn(source.peerDependencies ?? {}, dependency)) {
        addRange(peerDependencies, dependency, range);
      } else {
        addRange(dependencies, dependency, range);
      }
    }
    for (const [bin, path] of Object.entries(source.bin ?? {})) {
      (manifest.bin ??= {})[bin] = "./" + modulePath(legacy, path);
    }
    if (source.accelerate?.operations)
      manifest.accelerate = {
        operations: "./dist/operations/package-manifest.json",
      };
  }
  if (id === "sdk") manifest.exports["./catalog.json"] = "./dist/catalog.json";
  if (Object.keys(dependencies).length) manifest.dependencies = dependencies;
  if (Object.keys(devDependencies).length)
    manifest.devDependencies = devDependencies;
  if (Object.keys(peerDependencies).length) {
    manifest.peerDependencies = peerDependencies;
    manifest.peerDependenciesMeta = Object.fromEntries(
      Object.keys(peerDependencies).map((name) => [name, { optional: true }]),
    );
  }
  return manifest;
}
