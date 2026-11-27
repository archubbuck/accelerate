import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "@accelerate/data-postgres";
import {
  createPostgresAuthorizationTransactionStore,
  createPostgresExternalIdentityLinks,
  externalIdentitySchema,
} from "./external.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;

it.skipIf(!connectionString)("consumes a login transaction once and protects identity links under contention", async () => {
  const schema = "oauth_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
    const db = createPostgresDatabase(pool);
    for (const statement of externalIdentitySchema) await db.query(statement);
    const store = createPostgresAuthorizationTransactionStore(db);
    const transaction = { verifier: "verifier", nonce: "nonce", expiresAt: 2000 };
    await store.put("key", transaction);
    const outcomes = await Promise.all([store.consume("key", 1000), store.consume("key", 1000)]);
    expect(outcomes.filter(Boolean)).toEqual([transaction]);
    await store.put("expired", transaction);
    expect(await store.consume("expired", 2000)).toBeUndefined();
    expect(await store.pruneExpired(2000)).toBe(1);

    await db.query("INSERT INTO accelerate_identities (id) VALUES ($1), ($2)", ["alice", "bob"]);
    const links = createPostgresExternalIdentityLinks(db);
    const claims = await Promise.all([
      links.link("https://provider.example", "subject", "alice"),
      links.link("https://provider.example", "subject", "bob"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await links.find("https://provider.example", "subject")).toBe(claims[0] ? "alice" : "bob");
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
