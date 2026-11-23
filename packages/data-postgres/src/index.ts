import { assertSql, DatabaseError, type Database, type QueryExecutor, type QueryParameters, type QueryResult, type TransactionOptions } from "@accelerate/data-core";
import type { Pool, PoolClient, QueryResult as PgQueryResult, QueryResultRow } from "pg";
function result<Row extends QueryResultRow>(value: PgQueryResult<Row>): QueryResult<Row> { return { rows: value.rows, rowCount: value.rowCount ?? value.rows.length }; }
function executor(client: Pick<PoolClient, "query">): QueryExecutor { return { async query<Row = Record<string, unknown>>(sql: string, parameters?: QueryParameters) { assertSql(sql); try { return result(await client.query(sql, parameters ? [...parameters] : []) as PgQueryResult<QueryResultRow> as PgQueryResult<Row & QueryResultRow>); } catch (cause) { throw new DatabaseError("PostgreSQL query failed", { cause }); } } }; }
export function createPostgresDatabase(pool: Pool): Database {
  const root = executor(pool);
  return {
    query: root.query,
    async transaction<T>(operation: (tx: QueryExecutor) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
      const client = await pool.connect();
      let begun = false;
      try {
        await client.query("BEGIN"); begun = true;
        if (options.isolationLevel) { const levels = { "read committed": "READ COMMITTED", "repeatable read": "REPEATABLE READ", serializable: "SERIALIZABLE" }; await client.query("SET TRANSACTION ISOLATION LEVEL " + levels[options.isolationLevel]); }
        if (options.readOnly) await client.query("SET TRANSACTION READ ONLY");
        const value = await operation(executor(client));
        await client.query("COMMIT"); begun = false;
        return value;
      } catch (cause) {
        if (begun) { try { await client.query("ROLLBACK"); } catch (rollbackError) { throw new AggregateError([cause, rollbackError], "Transaction and rollback failed"); } }
        throw cause;
      } finally { client.release(); }
    },
    async close() { await pool.end(); }
  };
}
