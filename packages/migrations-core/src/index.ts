/** IDs are immutable, globally namespaced package/version pairs, e.g. "orders/1". */
export interface Migration {
  readonly id: string;
  readonly requires?: readonly string[];
  readonly statements: readonly string[];
}
export interface PlannedMigration extends Migration {
  readonly checksum: string;
}
export interface AppliedMigration {
  readonly id: string;
  readonly checksum: string;
}

export async function planMigrations(
  manifest: readonly Migration[],
  history: readonly AppliedMigration[],
): Promise<PlannedMigration[]> {
  const known = new Map(history.map((row) => [row.id, row.checksum]));
  const byId = new Map<string, PlannedMigration>();
  for (const migration of manifest) {
    const { id, statements } = migration;
    if (
      !/^[a-z][a-z0-9._-]*\/[1-9]\d*$/.test(id) ||
      byId.has(id) ||
      !statements.length ||
      statements.some((s) => !s.trim())
    ) {
      throw new TypeError("Invalid or duplicate migration: " + id);
    }
    const requires = [...(migration.requires ?? [])].sort();
    const snapshot = [...statements];
    const bytes = new TextEncoder().encode(
      JSON.stringify([id, requires, snapshot]),
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    if (known.has(id) && checksum !== known.get(id))
      throw new Error("Changed migration: " + id);
    byId.set(id, { id, requires, statements: snapshot, checksum });
  }
  const ordered: PlannedMigration[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("Cyclic migration: " + id);
    const item = byId.get(id);
    if (!item) {
      if (known.has(id)) return;
      throw new Error("Missing migration: " + id);
    }
    visiting.add(id);
    for (const dependency of item.requires ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    if (!known.has(id)) ordered.push(item);
  }
  for (const id of [...byId.keys()].sort()) visit(id);
  return ordered;
}
