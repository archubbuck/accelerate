import { build } from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const directory = mkdtempSync(join(tmpdir(), "accelerate-consolidation-"));
const npmJson = (args, cwd) =>
  JSON.parse(execFileSync("npm", args, { cwd, encoding: "utf8" }));
const run = (command, args) =>
  execFileSync(command, args, { cwd: directory, stdio: "inherit" });

try {
  const archives = ["sdk", "http"].map((id) => {
    const [archive] = npmJson(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      join(root, "packages", id),
    );
    assert.ok(archive.files.some(({ path }) => path === "README.md"));
    console.log(
      `${archive.name}: ${archive.size} bytes packed, ${archive.unpackedSize} unpacked`,
    );
    return join(directory, archive.filename);
  });
  writeFileSync(
    join(directory, "package.json"),
    '{"private":true,"type":"module"}\n',
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--registry=https://registry.npmjs.org",
    ...archives,
  ]);
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
      names.add(name);
      collect(item.dependencies);
    }
  }
  collect(installed);
  for (const name of [
    "pg",
    "redis",
    "ioredis",
    "@accelerate/http-core",
    "@accelerate/http-client",
    "@accelerate/resilience-core",
    "@accelerate/rate-limit-core",
  ]) {
    assert.ok(!names.has(name), "Unexpected installed dependency: " + name);
  }
  writeFileSync(
    join(directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { catalog } from "@accelerate/sdk";
import { createHttpClient, HttpStatusError, composeMiddleware } from "@accelerate/http";
import * as client from "@accelerate/http/client";
import { createNodeHttpHandler } from "@accelerate/http/node";
import { executeResilient } from "@accelerate/http/resilience";
import { createRateLimiter } from "@accelerate/http/rate-limit";
import { createMemoryQuotaStore } from "@accelerate/http/rate-limit/memory";
import { createPostgresQuotaStore } from "@accelerate/http/rate-limit/postgres";
import { createRedisQuotaStore } from "@accelerate/http/rate-limit/redis";
import { OpenApiBuilder } from "@accelerate/http/openapi";
import { preview } from "./node_modules/@accelerate/http/dist/operations/preview.mjs";

assert.equal(HttpStatusError, client.HttpStatusError);
for (const { family, entry } of Object.values(catalog.migrations)) {
  if (entry) await import(family + entry.slice(1));
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
void [catalog, client, preview, limiter];
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
