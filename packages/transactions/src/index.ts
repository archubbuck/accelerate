export interface TransactionScope { commit(): Promise<void>; rollback(): Promise<void>; }
export async function runTransaction<S extends TransactionScope,T>(begin:()=>Promise<S>, operation:(scope:S)=>Promise<T>):Promise<T>{
 const scope=await begin();
 try { const result=await operation(scope); await scope.commit(); return result; }
 catch(error){ try { await scope.rollback(); } catch(rollbackError){ throw new AggregateError([error,rollbackError],"Transaction and rollback failed"); } throw error; }
}
