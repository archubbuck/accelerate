import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { grants, people } from "./permissions.js";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function initialize() {
  // Resolve migrations from the installed npm distribution, never repository source.
  const entry = createRequire(import.meta.url).resolve("@accelerate/authorization-postgres");
  const packageRoot = resolve(dirname(entry), "..");
  for (const name of ["schema.sql", "admin.sql"]) {
    await pool.query(await readFile(resolve(packageRoot, name), "utf8"));
  }
  await pool.query(await readFile(new URL("../sql/demo.sql", import.meta.url), "utf8"));
  for (const [key, permissions] of Object.entries(grants)) {
    await pool.query("INSERT INTO authorization_roles (id,role_key,name,active) VALUES ($1,$1,$2,true) ON CONFLICT (id) DO NOTHING", [key, key[0].toUpperCase() + key.slice(1)]);
    for (const permission of permissions) {
      await pool.query("INSERT INTO authorization_role_permissions (role_id,permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING", [key, permission]);
    }
  }
  for (const user of people) {
    await pool.query("INSERT INTO authorization_user_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, user.role]);
  }
}
