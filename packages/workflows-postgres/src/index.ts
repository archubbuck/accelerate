import type { Database, Transaction } from "@accelerate/data-core";
import type { Migration } from "@accelerate/migrations-core";
import type {
  Instance,
  WorkflowEvent,
  WorkflowStore,
} from "@accelerate/workflows-core";
export const workflowMigration: Migration = {
  id: "accelerate-workflows/1",
  statements: [
    "CREATE TABLE accelerate_workflows (id text PRIMARY KEY, state jsonb NOT NULL)",
    "CREATE TABLE accelerate_workflow_history (instance_id text NOT NULL REFERENCES accelerate_workflows(id), cursor bigint GENERATED ALWAYS AS IDENTITY, event jsonb NOT NULL, PRIMARY KEY(instance_id,cursor))",
  ],
};
async function time(tx: Transaction) {
  const { rows } = await tx.query<{ ms: string }>(
    "SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS ms",
  );
  return Number(rows[0].ms);
}
async function append(tx: Transaction, id: string, events: WorkflowEvent[]) {
  if (events.length)
    await tx.query(
      "INSERT INTO accelerate_workflow_history(instance_id,event) SELECT $1,entry FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS e(entry,pos) ORDER BY pos",
      [id, JSON.stringify(events)],
    );
}
export function createPostgresWorkflowStore(db: Database): WorkflowStore {
  return {
    create(instance) {
      return db.transaction(async (tx) => {
        const r = await tx.query(
          "INSERT INTO accelerate_workflows VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING",
          [instance.id, JSON.stringify(instance)],
        );
        if (!r.rowCount) return false;
        await append(tx, instance.id, [
          { at: await time(tx), type: "started" },
        ]);
        return true;
      });
    },
    async get(id) {
      return (
        await db.query<{ state: Instance }>(
          "SELECT state FROM accelerate_workflows WHERE id=$1",
          [id],
        )
      ).rows[0]?.state;
    },
    update(id, fn) {
      return db.transaction(
        async (tx) => {
          const { rows } = await tx.query<{ state: Instance }>(
            "SELECT state FROM accelerate_workflows WHERE id=$1 FOR UPDATE",
            [id],
          );
          if (!rows.length) throw Error("Unknown workflow instance");
          const state = rows[0].state,
            events: WorkflowEvent[] = [];
          const result = fn(state, await time(tx), (e) => events.push(e));
          await tx.query(
            "UPDATE accelerate_workflows SET state=$2::jsonb WHERE id=$1 AND state IS DISTINCT FROM $2::jsonb",
            [id, JSON.stringify(state)],
          );
          await append(tx, id, events);
          return result;
        },
        { isolationLevel: "read committed" },
      );
    },
    async history(id, after = 0, limit = 100) {
      const { rows } = await db.query<{ cursor: string; event: WorkflowEvent }>(
        "SELECT cursor,event FROM accelerate_workflow_history WHERE instance_id=$1 AND cursor>$2 ORDER BY cursor LIMIT $3",
        [id, after, limit],
      );
      return rows.map((r) => ({ ...r.event, cursor: Number(r.cursor) }));
    },
  };
}
