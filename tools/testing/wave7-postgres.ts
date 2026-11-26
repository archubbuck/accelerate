import { Pool } from "pg";
import { afterAll, beforeAll } from "vitest";
import { createPostgresDatabase } from "../../packages/data-postgres/dist/index.js";

export const databaseUrl = process.env.WAVE7_TEST_DATABASE_URL;

/** An isolated schema per suite on the explicitly configured disposable test server. */
export function postgresFixture() {
  const schema = "wave7_" + crypto.randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: databaseUrl });
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=" + schema,
  });
  const database = createPostgresDatabase(pool);
  beforeAll(async () => {
    await admin.query("CREATE SCHEMA " + schema);
  });
  afterAll(async () => {
    await database.close();
    try {
      await admin.query("DROP SCHEMA " + schema + " CASCADE");
    } finally {
      await admin.end();
    }
  });
  return { database, pool };
}
