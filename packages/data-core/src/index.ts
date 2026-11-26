/** Database-neutral query and transaction contracts. */
export type QueryParameters = readonly unknown[];
export interface QueryResult<Row> { readonly rows: readonly Row[]; readonly rowCount: number; }
export interface QueryExecutor { query<Row = Record<string, unknown>>(sql: string, parameters?: QueryParameters): Promise<QueryResult<Row>>; }
export interface Transaction extends QueryExecutor { readonly isolationLevel?: IsolationLevel; readonly readOnly?: boolean; savepoint?<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T>; }
export type IsolationLevel = "read committed" | "repeatable read" | "serializable";
export interface Database extends QueryExecutor { transaction<T>(operation: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>; close(): Promise<void>; }
export interface TransactionOptions { readonly isolationLevel?: IsolationLevel; readonly readOnly?: boolean; }
export class DatabaseError extends Error { constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "DatabaseError"; } }
export function assertSql(sql: string): void { if (!sql.trim()) throw new TypeError("SQL must not be empty"); }
