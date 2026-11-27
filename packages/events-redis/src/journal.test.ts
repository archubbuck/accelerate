import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "vitest";
import { verifyJournal } from "../../../tools/testing/event-journal";
import { createRedisEventJournal, type RedisJournalClient } from "./journal.js";
const run = promisify(execFile);
const container = process.env.EVENT_JOURNAL_REDIS_CONTAINER;
it.skipIf(!container)(
  "satisfies the subscription contract on Redis 7",
  async () => {
    const namespace = "test-" + crypto.randomUUID();
    const client: RedisJournalClient = {
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
    };
    await verifyJournal(
      () => createRedisEventJournal(client, namespace),
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    );
  },
  30000,
);
