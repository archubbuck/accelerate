import { assertSql, DatabaseError, type Database, type QueryExecutor, type QueryParameters, type QueryResult, type TransactionOptions, type Transaction } from "@accelerate/data-core";
import type { Pool, PoolClient, QueryResult as PgQueryResult, QueryResultRow } from "pg";
function result<Row extends QueryResultRow>(value: PgQueryResult<Row>): QueryResult<Row> { return { rows: value.rows, rowCount: value.rowCount ?? value.rows.length }; }
function executor(client: Pick<PoolClient, "query">): QueryExecutor { return { async query<Row = Record<string, unknown>>(sql: string, parameters?: QueryParameters) { assertSql(sql); try { return result(await client.query(sql, parameters ? [...parameters] : []) as PgQueryResult<QueryResultRow> as PgQueryResult<Row & QueryResultRow>); } catch (cause) { throw new DatabaseError("PostgreSQL query failed", { cause }); } } }; }
export function createPostgresDatabase(pool: Pool): Database {
  const root = executor(pool);
  return {
    query: root.query,
    async transaction<T>(operation: (tx: Transaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
      const levels = { "read committed": "READ COMMITTED", "repeatable read": "REPEATABLE READ", serializable: "SERIALIZABLE" };
      if (options.isolationLevel && !Object.hasOwn(levels, options.isolationLevel)) throw new RangeError("Invalid isolation level");
      const client = await pool.connect();
      let active = true;
      let current: symbol;
      let sequence = 0;
      const raw = executor(client);
      function scope(): Transaction {
        const identity = Symbol();
        current = identity;

        function check() {
          if (!active || current !== identity) throw new Error("Transaction scope is closed or suspended");
        }
        return {
          isolationLevel: options.isolationLevel,
          readOnly: options.readOnly,
          async query(sql, parameters) { check(); return raw.query(sql, parameters); },
          async savepoint(operation) {
            check();
            const name = "accelerate_sp_" + (++sequence);
            const child = scope();
            try {
              await client.query("SAVEPOINT " + name);
              const value = await operation(child);
              await client.query("RELEASE SAVEPOINT " + name);
              return value;
            } catch (error) {
              try {
                await client.query("ROLLBACK TO SAVEPOINT " + name);
                await client.query("RELEASE SAVEPOINT " + name);
              } catch (rollback) { throw new AggregateError([error, rollback], "Savepoint rollback failed"); }
              throw error;
            } finally {
              current = identity;
            }
          }
        };
      }
      let begun = false;
      try {
        await client.query("BEGIN"); begun = true;
        if (options.isolationLevel) { const levels = { "read committed": "READ COMMITTED", "repeatable read": "REPEATABLE READ", serializable: "SERIALIZABLE" }; await client.query("SET TRANSACTION ISOLATION LEVEL " + levels[options.isolationLevel]); }
        if (options.readOnly) await client.query("SET TRANSACTION READ ONLY");
        const value = await operation(scope());
        active = false;
        const completion = await client.query("COMMIT");
        begun = false;
        if (completion.command === "ROLLBACK") throw new DatabaseError("PostgreSQL rolled back the aborted transaction");
        return value;
      } catch (cause) {
        active = false;
        if (begun) { try { await client.query("ROLLBACK"); } catch (rollbackError) { throw new AggregateError([cause, rollbackError], "Transaction and rollback failed"); } }
        throw cause;
      } finally { client.release(); }
    },
    async close() { await pool.end(); }
  };
}
