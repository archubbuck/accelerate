import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "@accelerate/data/postgres";
import { JOBS_SCHEMA } from "@accelerate/messaging/jobs/postgres";
import { createPostgresNotificationStore, notificationSchema } from "./notifications-postgres.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("schedules one job and fences a late worker without exposing recipient data in status", async () => {
  const schema = "delivery_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    await pool.query(JOBS_SCHEMA);
    for (const statement of notificationSchema) await db.query(statement);
    const store = createPostgresNotificationStore(db);
    const delivery = { id: "delivery", recipientId: "private-recipient", channel: "email" as const, templateId: "status", content: { subject: "Notice", text: "Private" } };
    const created = await Promise.all([store.schedule(delivery), store.schedule(delivery)]);
    expect(created.filter(Boolean)).toHaveLength(1);
    const jobs = await db.query("SELECT payload FROM accelerate_jobs");
    expect(jobs.rows).toEqual([{ payload: { deliveryId: delivery.id } }]);
    expect(await store.claim(delivery.id, 1)).toBeDefined();
    expect(await store.claim(delivery.id, 1)).toBeUndefined();
    expect(await store.claim(delivery.id, 2)).toBeDefined();
    expect(await store.settle(delivery.id, 1, "sent", "late")).toBe(false);
    expect(await store.settle(delivery.id, 2, "sent", "delivered")).toBe(true);
    expect(await store.inspect(delivery.id)).toEqual({
      id: delivery.id, channel: "email", templateId: "status", attempts: 2, status: "sent", result: "delivered",
    });
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
