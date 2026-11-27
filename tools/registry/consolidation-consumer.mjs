import { build } from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const catalogSource = JSON.parse(
  readFileSync(join(root, "registry/consolidation.json"), "utf8"),
);
const families = Object.keys(catalogSource.families);
function closure(name, result = new Set()) {
  if (result.has(name)) return result;
  result.add(name);
  const dir = name.split("/")[1];
  const manifest = JSON.parse(
    readFileSync(join(root, "packages", dir, "package.json"), "utf8"),
  );
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (families.includes(dependency)) closure(dependency, result);
  }
  return result;
}
const directory = mkdtempSync(join(tmpdir(), "accelerate-consolidation-"));
const npmJson = (args, cwd) =>
  JSON.parse(execFileSync("npm", args, { cwd, encoding: "utf8" }));
const run = (command, args) =>
  execFileSync(command, args, { cwd: directory, stdio: "inherit" });

try {
  const archives = new Map(
    families.map((name) => {
      const id = name.split("/")[1];
      const [archive] = npmJson(
        ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
        join(root, "packages", id),
      );
      assert.ok(archive.files.some(({ path }) => path === "README.md"));
      console.log(
        `${archive.name}: ${archive.size} bytes packed, ${archive.unpackedSize} unpacked`,
      );
      return [name, join(directory, archive.filename)];
    }),
  );
  writeFileSync(
    join(directory, "package.json"),
    '{"private":true,"type":"module"}\n',
  );
  const install = (...packages) =>
    run("npm", [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org",
      ...packages,
    ]);
  install(
    archives.get("@accelerate/sdk"),
    ...Array.from(closure("@accelerate/http"), (name) => archives.get(name)),
  );
  await build({
    absWorkingDir: directory,
    stdin: {
      contents: 'export { createHttpClient } from "@accelerate/http/client";',
      resolveDir: directory,
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
  });
  const installed = npmJson(["ls", "--all", "--json"], directory).dependencies;
  const names = new Set();
  function collect(dependencies) {
    for (const [name, item] of Object.entries(dependencies ?? {})) {
      if (item.version) names.add(name);
      collect(item.dependencies);
    }
  }
  collect(installed);
  for (const name of [
    "pg",
    "redis",
    "ioredis",
    "react",
    "@angular/core",
    ...Object.keys(catalogSource.migrations),
  ]) {
    assert.ok(
      !names.has(name),
      "Unexpected dependency in the HTTP consumer: " + name,
    );
  }
  install(
    ...archives.values(),
    "react@19",
    "@types/react@19",
    "@angular/core@19",
    "@angular/common@19",
    "@angular/compiler@19",
    "rxjs@7",
    "@opentelemetry/api@1",
    "@opentelemetry/api-logs@0.200",
    "pg@8",
    "@types/pg@8",
  );
  writeFileSync(
    join(directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { catalog } from "@accelerate/sdk";
import "@angular/compiler";
import { createHttpClient, HttpStatusError, composeMiddleware } from "@accelerate/http";
import * as client from "@accelerate/http/client";
import { createNodeHttpHandler } from "@accelerate/http/node";
import { executeResilient } from "@accelerate/http/resilience";
import { createRateLimiter } from "@accelerate/http/rate-limit";
import { createMemoryQuotaStore } from "@accelerate/http/rate-limit/memory";
import { createPostgresQuotaStore } from "@accelerate/http/rate-limit/postgres";
import { createRedisQuotaStore } from "@accelerate/http/rate-limit/redis";
import { OpenApiBuilder } from "@accelerate/http/openapi";
import { createStreamingConnection } from "@accelerate/http/streaming";
import { createMemoryStreamingPair } from "@accelerate/http/streaming/memory";
import { createWebSocketStreamingTransport } from "@accelerate/http/streaming/websocket";
import { createStateMachine, createMemoryStateMachineStore } from "@accelerate/core/state-machine";
import { preview } from "./node_modules/@accelerate/http/dist/operations/rate-limit-core/preview.mjs";
import { discoverPackageOperations, validatePackageOperations } from "@accelerate/tooling/registry";
import { readFileSync } from "node:fs";

assert.equal(HttpStatusError, client.HttpStatusError);
const [streamClient, streamServer] = createMemoryStreamingPair();
const feed = createStreamingConnection(async () => streamClient, {
  subscriptions: [{ id: "demo", after: 0 }],
  parse: value => value,
});
const pending = feed.messages.next();
assert.equal(JSON.parse(await streamServer.receive(new AbortController().signal)).after, 0);
streamServer.send(JSON.stringify({ type: "message", subscription: "demo", sequence: 1, data: "ready" }));
assert.equal((await pending).value.data, "ready");
feed.close();
await feed.messages.return();
assert.equal(typeof createWebSocketStreamingTransport, "function");
const machine = createStateMachine({
  initial: "open",
  states: { open: { transitions: [{ on: "close", to: "closed" }] }, closed: { terminal: true } },
}, createMemoryStateMachineStore());
await machine.start("ticket", {});
assert.equal((await machine.send("ticket", { type: "close" })).snapshot.state, "closed");
assert.equal(Object.keys(catalog.families).length, 14);
for (const [name, entry] of Object.entries(catalog.entrypoints)) {
  const manifest = JSON.parse(readFileSync(new URL("./node_modules/" + name + "/package.json", import.meta.url), "utf8"));
  assert.equal(entry.version, manifest.version);
  assert.deepEqual(entry.imports, Object.keys(manifest.exports).map(path => name + path.slice(1)).sort());
}
const discovery = await discoverPackageOperations(process.cwd(), Object.keys(catalog.families));
assert.deepEqual(discovery.diagnostics, []);
assert.equal(discovery.packages.filter(item => item.status === "declared").length, 3);
for (const name of Object.keys(catalog.families)) {
  await import(name);
  const manifestUrl = new URL("./node_modules/" + name + "/package.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  if (!manifest.accelerate?.operations) continue;
  const operations = JSON.parse(readFileSync(new URL(manifest.accelerate.operations, manifestUrl), "utf8"));
  assert.deepEqual(validatePackageOperations(operations, manifest), []);
  for (const operation of operations.operations) {
    assert.equal(typeof (await import(new URL(operation.handler, manifestUrl).href))[operation.exportName], "function");
  }
}
for (const target of Object.values(catalog.imports)) {
  if (target.endsWith(".json")) await import(target, { with: { type: "json" } });
  else await import(target);
}
assert.equal(typeof createPostgresQuotaStore, "function");
assert.equal(typeof createRedisQuotaStore, "function");
assert.equal(new OpenApiBuilder("Smoke", "1").build().openapi, "3.1.0");
assert.equal(await executeResilient(async () => "ok"), "ok");
const rule = { scope: "test", algorithm: "fixed-window", limit: 1, periodMs: 60000 };
const limiter = createRateLimiter(createMemoryQuotaStore());
assert.equal((await limiter.consume({ partition: "test", rules: [rule] })).allowed, true);
assert.equal((await limiter.consume({ partition: "test", rules: [rule] })).allowed, false);
const quota = await preview({ input: { rules: [rule], times: [0, 0] } });
assert.deepEqual(quota.data.decisions.map(({ allowed }) => allowed), [true, false]);
const server = createServer(createNodeHttpHandler(async (request) => ({
  status: 200, headers: {}, body: { url: request.url },
})));
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const transport = composeMiddleware(createHttpClient({
    baseUrl: "http://127.0.0.1:" + server.address().port,
  }), [async (request, next) => next({ ...request, url: "/rewritten" })]);
  assert.deepEqual((await transport.send({ method: "GET", url: "/original" })).body, { url: "/rewritten" });
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
`,
  );
  run(process.execPath, ["smoke.mjs"]);
  run(process.execPath, ["node_modules/.bin/create-accelerate", "--help"]);
  writeFileSync(
    join(directory, "types.mts"),
    `
import { catalog } from "@accelerate/sdk";
import { createHttpClient, type HttpTransport } from "@accelerate/http";
import { executeResilient } from "@accelerate/http/resilience";
import { createRateLimiter } from "@accelerate/http/rate-limit";
import { createMemoryQuotaStore } from "@accelerate/http/rate-limit/memory";
const client: HttpTransport = createHttpClient();
const preview: Promise<number> = executeResilient(async () => 1);
const limiter = createRateLimiter(createMemoryQuotaStore());
import { createPostgresDatabase } from "@accelerate/data/postgres";
import { createMemoryEventBus } from "@accelerate/messaging/events/memory";
import { createLogger } from "@accelerate/observability/logging";
import { definePermissions } from "@accelerate/identity/authorization";
import { durationMs } from "@accelerate/core/time";
import { defineConfig } from "@accelerate/config/config";
import { createStore } from "@accelerate/ui/state";
import * as react from "@accelerate/react/authorization";
import * as angular from "@accelerate/angular/authorization";
import { renderPrompt } from "@accelerate/ai/prompts";
import { assertDefined } from "@accelerate/testing/core";
import { parseSource } from "@accelerate/tooling/ast";
void [catalog, client, preview, limiter, createPostgresDatabase, createMemoryEventBus,
  createLogger, definePermissions, durationMs, defineConfig, createStore,
  react, angular, renderPrompt, assertDefined, parseSource];
`,
  );
  run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "types.mts",
  ]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
