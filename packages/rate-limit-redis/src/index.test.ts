import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { it } from "vitest";
import {
  verifyQuotaStore,
  verifyPermitExpiry,
} from "../../../tools/testing/rate-limit";
import { createRedisQuotaStore } from "./index.js";
const run = promisify(execFile),
  container = process.env.RATE_LIMIT_REDIS_CONTAINER;
it.skipIf(!container)(
  "serializes Redis contenders and fences stale releases",
  async () => {
    const namespace = crypto.randomUUID();
    const open = () =>
      createRedisQuotaStore(
        {
          async eval(script, { keys, arguments: args }) {
            const { stdout } = await run("docker", [
              "exec",
              container!,
              "redis-cli",
              "--json",
              "EVAL",
              script,
              String(keys.length),
              ...keys,
              ...args,
            ]);
            return JSON.parse(stdout);
          },
        },
        namespace,
      );
    await verifyQuotaStore(open);
    await verifyPermitExpiry(open);
  },
  30000,
);
