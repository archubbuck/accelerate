export interface TransactionScope { commit(): Promise<void>; rollback(): Promise<void>; }
export async function runTransaction<S extends TransactionScope,T>(begin:()=>Promise<S>, operation:(scope:S)=>Promise<T>):Promise<T>{
 const scope=await begin();
 try { const result=await operation(scope); await scope.commit(); return result; }
 catch(error){ try { await scope.rollback(); } catch(rollbackError){ throw new AggregateError([error,rollbackError],"Transaction and rollback failed"); } throw error; }
}

/** A shared unit of work whose owner controls its transaction boundary. */
export interface TransactionContext<Executor> {
  readonly executor: Executor;
  bind<Repository>(factory: (executor: Executor) => Repository): Repository;
  afterCommit(callback: () => void | Promise<void>): void;
  afterRollback(callback: () => void | Promise<void>): void;
}

export interface TransactionRunner<Executor, Options> {
  transaction<T>(operation: (executor: Executor) => Promise<T>, options?: Options): Promise<T>;
}

/** Callback failures after commit are reported separately from database failures. */
export class TransactionCallbackError extends AggregateError {
  constructor(errors: unknown[], readonly outcome: "committed" | "rolled-back") {
    super(errors, "Transaction " + outcome + " callback failed");
    this.name = "TransactionCallbackError";
  }
}

/**
 * Explicit propagation uses the same context across repository boundaries.
 * Only the outer owner invokes the runner and lifecycle callbacks.
 */
export async function composeTransaction<Executor, Options, Result>(
  runner: TransactionRunner<Executor, Options>,
  operation: (context: TransactionContext<Executor>) => Promise<Result>,
  options?: Options,
): Promise<Result> {
  let active = true;
  const committed: Array<() => void | Promise<void>> = [];
  const rolledBack: Array<() => void | Promise<void>> = [];
  function assertActive() {
    if (!active) throw new Error("Transaction context is closed");
  }
  async function notify(callbacks: Array<() => void | Promise<void>>, outcome: "committed" | "rolled-back") {
    const errors: unknown[] = [];
    for (const callback of callbacks) {
      try { await callback(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new TransactionCallbackError(errors, outcome);
  }
  let result: Result;
  try {
    result = await runner.transaction(async executor => {
      const context: TransactionContext<Executor> = {
        get executor() { assertActive(); return executor; },
        bind(factory) { assertActive(); return factory(executor); },
        afterCommit(callback) { assertActive(); committed.push(callback); },
        afterRollback(callback) { assertActive(); rolledBack.push(callback); },
      };
      try { return await operation(context); }
      finally { active = false; }
    }, options);
  } catch (error) {
    active = false;
    try { await notify(rolledBack, "rolled-back"); }
    catch (callbackError) { throw new AggregateError([error, callbackError], "Transaction and rollback callback failed"); }
    throw error;
  }
  active = false;
  await notify(committed, "committed");
  return result;
}
