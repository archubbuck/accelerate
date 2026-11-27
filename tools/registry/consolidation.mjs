import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  destinationExport,
  familyManifest,
  moduleExports,
  modulePath,
  packageId,
} from "./consolidation-manifests.mjs";

const root = join(import.meta.dirname, "../..");
const json = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const readManifest = (name) =>
  json("packages/" + packageId(name) + "/package.json");
const prettyJson = (value) => JSON.stringify(value, null, 2) + "\n";
const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

export function loadConsolidation() {
  const catalog = json("registry/consolidation.json");
  const registered = json("registry/packages.json").packages;
  const legacy = registered.filter(
    ({ name }) => !Object.hasOwn(catalog.families, name),
  );
  assert.deepEqual(
    Object.keys(catalog.migrations).sort(),
    legacy.map(({ name }) => name).sort(),
  );
  const imports = {};
  for (const [name, target] of Object.entries(catalog.migrations)) {
    assert.ok(
      Object.hasOwn(catalog.families, target.family),
      "Unknown package family: " + target.family,
    );
    assert.ok(
      target.entry?.startsWith("./"),
      "Expected a migration export subpath",
    );
    for (const subpath of Object.keys(
      moduleExports(name, readManifest(name)),
    )) {
      if (Object.hasOwn(target.exports ?? {}, subpath)) continue;
      imports[name + subpath.slice(1)] =
        target.family + destinationExport(target, subpath).slice(1);
    }
  }
  return { ...catalog, imports };
}

const guidance = {
  angular:
    "Use Angular 19 or 20 with matching core and common versions, plus RxJS 7.4 or newer within version 7. Authorization and logging retain their compiled Angular entry points.",
  react:
    "Use React 18 or newer and matching React declarations for TypeScript projects.",
  data: "The database adapters accept caller-supplied drivers. Install pg and its types if you use the PostgreSQL adapter.",
  identity:
    "Enforce authorization in your server. Install pg and its types for the pool-based PostgreSQL adapter. See the [OAuth and OpenID Connect guide](https://github.com/archubbuck/accelerate/blob/main/docs/oidc.md) for provider sign-in and session integration. See [tenant and resource authorization](https://github.com/archubbuck/accelerate/blob/main/docs/scoped-authorization.md) for scoped grants and UI snapshots.",
  observability:
    "Install the OpenTelemetry API and API Logs peers for the corresponding adapters.",
  tooling:
    "Run `npx --package @accelerate/tooling create-accelerate --help` to use the existing scaffolding CLI. The CLI still accepts existing catalog IDs.",
};

function renderReadme(catalog, name, description) {
  const sdk = name === "@accelerate/sdk";
  const id = packageId(name);
  return [
    "# Accelerate " +
      (sdk ? "SDK" : id === "ui" ? "UI" : id[0].toUpperCase() + id.slice(1)),
    "",
    description,
    "",
    sdk
      ? "Choose the package you need. For the HTTP family, run `npm install @accelerate/http`."
      : `Install with \`npm install ${name}\`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.`,
    "",
    ...(guidance[id] ? [guidance[id], ""] : []),
    ...(sdk
      ? [
          "| Package | Capability |",
          "| --- | --- |",
          ...Object.entries(catalog.families).map(
            ([family, details]) =>
              `| [${family}](https://www.npmjs.com/package/${family}) | ${details.description} |`,
          ),
          "",
        ]
      : []),
    "## Import migration",
    "",
    "Use the subpaths below. Update related imports together wherever your app shares class or provider identity.",
    "",
    "| Existing import | Replacement import |",
    "| --- | --- |",
    ...Object.entries(catalog.imports)
      .filter(([, to]) => sdk || to.startsWith(name + "/"))
      .map(([from, to]) => `| \`${from}\` | \`${to}\` |`),
    "",
  ].join("\n");
}

function rewriteImports(code, file, catalog, manifest) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      specifier = node.arguments[0];

    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      const parts = name.split("/");
      const dependency = name.startsWith("@")
        ? parts.slice(0, 2).join("/")
        : parts[0];
      const target = catalog.migrations[dependency];
      if (target) {
        const extra = target.exports?.["." + name.slice(dependency.length)];
        const canonical = extra ? target.family + extra.slice(1) : catalog.imports[name];
        assert.ok(canonical, "Missing legacy export: " + name);
        let destination = canonical;
        if (target.family === manifest.name) {
          const exportPath = "." + canonical.slice(target.family.length);
          const entry = manifest.exports[exportPath];
          const path = relative(
            dirname(file),
            entry.default ?? entry,
          ).replaceAll("\\", "/");
          destination = path.startsWith(".") ? path : "./" + path;
        }
        edits.push([
          specifier.getStart(source),
          specifier.end,
          JSON.stringify(destination),
        ]);
      } else {
        assert.ok(
          name.startsWith(".") ||
            name.startsWith("node:") ||
            Object.hasOwn(manifest.dependencies ?? {}, dependency) ||
            Object.hasOwn(manifest.peerDependencies ?? {}, dependency),
          "Undeclared dependency in " + manifest.name + ": " + name,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [start, end, value] of edits.reverse())
    code = code.slice(0, start) + value + code.slice(end);
  return code;
}

function copyModule(catalog, manifest, legacy, operations) {
  const source = readManifest(legacy);
  const dir = join(root, "packages", packageId(legacy));
  const familyDir = join(root, "packages", packageId(manifest.name));
  const generated = !source.exports;
  function copyAsset(file) {
    const output = modulePath(
      legacy,
      generated ? file.replace(/^dist\//, "") : file,
    );
    const binary = readFileSync(join(dir, file));
    const content = /\.(?:js|mjs|ts|mts)$/.test(file)
      ? rewriteImports(
          binary.toString("utf8").replace(/^\/\/# sourceMappingURL=.*$/gm, ""),
          output,
          catalog,
          manifest,
        )
      : binary;
    write(join(familyDir, output), content);
  }

  if (generated || source.files.includes("dist")) {
    for (const file of readdirSync(join(dir, "dist"), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (
        !file.isFile() ||
        file.name === "package.json" ||
        file.name.endsWith(".map")
      )
        continue;
      const path = relative(dir, join(file.parentPath, file.name));
      if (!path.startsWith("dist/operations/")) copyAsset(path);
    }
  } else {
    for (const entry of Object.values(source.exports)) copyAsset(entry);
  }

  if (source.accelerate?.operations) {
    const original = JSON.parse(
      readFileSync(join(dir, source.accelerate.operations), "utf8"),
    );
    for (const operation of original.operations) {
      const handler =
        "./dist/operations/" +
        packageId(legacy) +
        "/" +
        operation.handler.split("/").at(-1);
      write(
        join(familyDir, handler),
        readFileSync(join(dir, operation.handler)),
      );
      operations.push({
        ...operation,
        handler,
        manifest: {
          ...operation.manifest,
          id: packageId(manifest.name) + "." + operation.manifest.id,
          package: manifest.name,
        },
      });
    }
  }
}

function buildFamily(catalog, name, dist) {
  const manifest = readManifest(name);
  const operations = [];
  for (const [legacy, target] of Object.entries(catalog.migrations)) {
    if (target.family === name)
      copyModule(catalog, manifest, legacy, operations);
  }
  if (operations.length) {
    write(
      join(dist, "operations/package-manifest.json"),
      prettyJson({
        schemaVersion: "1.0",
        package: name,
        packageVersion: manifest.version,
        operations,
      }),
    );
  }
  const entry =
    name === "@accelerate/http"
      ? 'export * from "./modules/http-core/dist/index.js";\nexport * from "./modules/http-client/dist/index.js";\n'
      : "export {};\n";
  write(join(dist, "index.js"), entry);
  write(join(dist, "index.d.ts"), entry);
  const familyDir = dirname(dist);
  for (const entry of Object.values(manifest.exports)) {
    const files =
      typeof entry === "string" ? [entry] : [entry.types, entry.default];
    for (const file of files) readFileSync(join(familyDir, file));
  }
  for (const bin of Object.values(manifest.bin ?? {}))
    chmodSync(join(familyDir, bin), 0o755);
}

function main(mode, id) {
  const catalog = loadConsolidation();
  if (["docs", "check", "manifests"].includes(mode)) {
    function apply(path, content, generate) {
      const file = join(root, path);
      if (mode === generate) write(file, content);
      else if (mode === "check")
        assert.equal(readFileSync(file, "utf8"), content, "Regenerate " + path);
    }
    for (const [name, { description }] of Object.entries(catalog.families)) {
      const dir = "packages/" + packageId(name);
      apply(
        dir + "/package.json",
        prettyJson(familyManifest(name, description, catalog, readManifest)),
        "manifests",
      );
      if (name !== "@accelerate/http")
        apply(
          dir + "/README.md",
          renderReadme(catalog, name, description),
          "docs",
        );
    }
    return;
  }
  const name = "@accelerate/" + id;
  assert.ok(
    mode === "build" && Object.hasOwn(catalog.families, name),
    "Expected docs, check, manifests or build <family>",
  );
  const dist = join(root, "packages", id, "dist");
  rmSync(dist, { force: true, recursive: true });
  if (id !== "sdk") return buildFamily(catalog, name, dist);
  write(join(dist, "catalog.json"), prettyJson(catalog));
  write(
    join(dist, "index.js"),
    'import catalog from "./catalog.json" with { type: "json" };\nexport { catalog };\n',
  );
  write(
    join(dist, "index.d.ts"),
    'export declare const catalog: { families: Record<string, { description: string; status: "stable" }>; migrations: Record<string, { family: string; entry: string }>; imports: Record<string, string> };\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv[2], process.argv[3]);
