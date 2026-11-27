import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(import.meta.dirname, "../..");
const json = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
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
  for (const { family, entry } of Object.values(catalog.migrations)) {
    assert.ok(
      Object.hasOwn(catalog.families, family),
      "Unknown package family: " + family,
    );
    if (entry) {
      assert.ok(entry.startsWith("./"), "Expected an export subpath");
      assert.ok(
        Object.hasOwn(
          json("packages/" + family.split("/")[1] + "/package.json").exports,
          entry,
        ),
        "Missing export: " + family + entry.slice(1),
      );
    }
  }
  return catalog;
}

function renderCatalog({ families, migrations }) {
  return [
    "# Accelerate SDK",
    "",
    "Choose a package by capability. The SDK catalog has no runtime dependencies.",
    "",
    "| Package | Capability | Availability |",
    "| --- | --- | --- |",
    ...Object.entries(families).map(
      ([name, { description, status }]) =>
        `| ${status === "preview" ? `[${name}](https://www.npmjs.com/package/${name})` : `\`${name}\``} | ${description} | ${status === "preview" ? "Preview candidate" : "Planned"} |`,
    ),
    "",
    "Once published, install the HTTP preview with `npm install @accelerate/http@next`.",
    "",
    "## Import migration",
    "",
    "Change the package specifier for mapped imports. For other packages, the table gives the planned family. Existing package versions remain available.",
    "",
    "| Existing package | Planned family | Preview import |",
    "| --- | --- | --- |",
    ...Object.entries(migrations).map(
      ([name, { family, entry }]) =>
        `| \`${name}\` | \`${family}\` | ${entry ? `\`${family}${entry.slice(1)}\`` : "Pending"} |`,
    ),
    "",
  ].join("\n");
}

function rewriteImports(code, file, modules, dependencies) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : ts.isCallExpression(node) &&
              node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      const target = modules.get(name);
      if (target) {
        const path = relative(
          dirname(file),
          `modules/${target}/index.js`,
        ).replaceAll("\\", "/");
        edits.push([
          specifier.getStart(source),
          specifier.end,
          JSON.stringify(path.startsWith(".") ? path : "./" + path),
        ]);
      } else {
        assert.ok(
          name.startsWith(".") ||
            name.startsWith("node:") ||
            Object.hasOwn(dependencies, name),
          "Undeclared HTTP dependency: " + name,
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

function buildHttp(catalog, dist) {
  const manifest = json("packages/http/package.json");
  const modules = new Map(
    Object.entries(catalog.migrations)
      .filter(([, target]) => target.family === manifest.name && target.entry)
      .map(([name]) => [name, name.split("/")[1]]),
  );
  for (const id of modules.values()) {
    const compiled = join(root, "packages", id, "dist");
    for (const file of readdirSync(compiled, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (
        !file.isFile() ||
        !/\.(?:js|d\.ts)$/.test(file.name) ||
        file.parentPath === join(compiled, "operations")
      )
        continue;
      const input = join(file.parentPath, file.name);
      const output = join("modules", id, relative(compiled, input));
      write(
        join(dist, output),
        rewriteImports(
          readFileSync(input, "utf8"),
          output,
          modules,
          manifest.dependencies,
        ),
      );
    }
  }
  const quota = json(
    "packages/rate-limit-core/operations/package-manifest.json",
  );
  quota.package = manifest.name;
  quota.packageVersion = manifest.version;
  for (const operation of quota.operations) {
    operation.manifest.package = manifest.name;
    operation.manifest.id = "http." + operation.manifest.id;
    const file = readFileSync(
      join(root, "packages/rate-limit-core", operation.handler),
      "utf8",
    );
    write(join(root, "packages/http", operation.handler), file);
  }
  write(
    join(dist, "operations/package-manifest.json"),
    JSON.stringify(quota, null, 2) + "\n",
  );
  const entry =
    'export * from "./modules/http-core/index.js";\nexport * from "./modules/http-client/index.js";\n';
  write(join(dist, "index.js"), entry);
  write(join(dist, "index.d.ts"), entry);
  for (const { types, default: runtime } of Object.values(manifest.exports)) {
    readFileSync(join(root, "packages/http", types));
    readFileSync(join(root, "packages/http", runtime));
  }
}

function main(mode, id) {
  const catalog = loadConsolidation();
  if (mode === "docs" || mode === "check") {
    const file = join(root, "packages/sdk/README.md");
    const markdown = renderCatalog(catalog);
    if (mode === "docs") write(file, markdown);
    else
      assert.equal(
        readFileSync(file, "utf8"),
        markdown,
        "Run node tools/registry/consolidation.mjs docs",
      );
    return;
  }
  assert.ok(
    mode === "build" && ["http", "sdk"].includes(id),
    "Expected docs, check, or build <http|sdk>",
  );
  const dist = join(root, "packages", id, "dist");
  rmSync(dist, { force: true, recursive: true });
  if (id === "http") return buildHttp(catalog, dist);
  write(join(dist, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  write(
    join(dist, "index.js"),
    'import catalog from "./catalog.json" with { type: "json" };\nexport { catalog };\n',
  );
  write(
    join(dist, "index.d.ts"),
    'export declare const catalog: { families: Record<string, { description: string; status: "preview" | "planned" }>; migrations: Record<string, { family: string; entry?: string }> };\n',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv[2], process.argv[3]);
}
