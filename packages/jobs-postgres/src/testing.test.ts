import { describe, it, expect } from "vitest";
import { createMemoryJobsDatabase } from "./testing.js";
import { createPostgresJobQueue, createPostgresJobWorker } from "./index.js";

describe("database-free jobs behavior", () => {
  it("handles scheduling, claims, lease expiry and duplicate prevention", async () => {
    const db = createMemoryJobsDatabase(1000);
    const queue = createPostgresJobQueue(db, () => "job-1");
    await queue.enqueue("email", { recipient: "a" }, { delayMs: 100 });
    expect((await db.query("UPDATE accelerate_jobs SET status='running', attempts=attempts+1, locked_by=$1, locked_until=now()+($2 * interval '1 millisecond') WHERE id=(SELECT id FROM accelerate_jobs WHERE status='pending' FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,name,payload,attempts,created_at", ["worker-a", 200])).rowCount).toBe(0);
    db.advance(100);
    const claim = "UPDATE accelerate_jobs SET status='running', attempts=attempts+1, locked_by=$1, locked_until=now()+($2 * interval '1 millisecond') WHERE id=(SELECT id FROM accelerate_jobs WHERE status='pending' FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,name,payload,attempts,created_at";
    expect((await db.query(claim, ["worker-a", 200])).rowCount).toBe(1);
    expect((await db.query(claim, ["worker-b", 200])).rowCount).toBe(0);
    db.advance(201);
    expect((await db.query(claim, ["worker-b", 200])).rowCount).toBe(1);
    expect(db.jobs.get("job-1")?.attempts).toBe(2);
    expect(db.jobs.get("job-1")?.locked_by).toBe("worker-b");
    await expect(queue.enqueue("email", {}, { id: "job-1" })).rejects.toThrow("duplicate");
  });

  it("executes and acknowledges work without a PostgreSQL server", async () => {
    const db = createMemoryJobsDatabase(Date.now());
    await createPostgresJobQueue(db).enqueue("email", { recipient: "a" }, { id: "one" });
    const worker = createPostgresJobWorker(db, { workerId: "worker-1", pollIntervalMs: 5, leaseMs: 1000, heartbeatMs: 200 });
    let received = 0;
    worker.register<{recipient:string}>("email", async job => { expect(job.payload.recipient).toBe("a"); received++; });
    await worker.start();
    for (let i = 0; i < 40 && db.jobs.get("one")?.status !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 5));
    await worker.stop();
    expect(received).toBe(1);
    expect(db.jobs.get("one")?.status).toBe("completed");
  });

  it("fails closed for unknown SQL", async () => {
    const db = createMemoryJobsDatabase();
    await expect(db.query("DROP TABLE accelerate_jobs")).rejects.toThrow("Unsupported SQL");
  });
});
