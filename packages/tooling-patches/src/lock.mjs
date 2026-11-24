import {open,readFile,lstat,unlink,realpath} from 'node:fs/promises';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const name='.accelerate-operation.lock';
export async function acquireProjectLock(root){
 const file=path.join(await realpath(root),name),handle=await open(file,'wx',0o600);
 const owner={schemaVersion:1,pid:process.pid,host:hostname(),token:randomUUID()};
 try{await handle.writeFile(JSON.stringify(owner));await handle.sync();}
 catch(error){await handle.close();await unlink(file);throw error;}
 return {async release(){const current=JSON.parse(await readFile(file,'utf8'));if(current.token!==owner.token){await handle.close();throw new Error('LOCK_OWNERSHIP_LOST');}await handle.close();await unlink(file);}};
}
export async function inspectProjectLock(root){
 try{
  const file=path.join(await realpath(root),name),stat=await lstat(file);
  if(!stat.isFile()||stat.nlink!==1||stat.size>4096)return {status:'unknown'};
  const owner=JSON.parse(await readFile(file,'utf8'));
  if(owner.schemaVersion!==1||owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.token!=='string')return {status:'unknown'};
  try{process.kill(owner.pid,0);return {status:'active',pid:owner.pid};}
  catch(e){return {status:e.code==='ESRCH'?'stale':'unknown',pid:owner.pid};}
 }catch(e){return {status:e.code==='ENOENT'?'absent':'unknown'};}
}

export async function removeStaleProjectLock(root,{apply=false,exclusiveMaintenance=false}={}){
 if(!apply||!exclusiveMaintenance)return {status:'blocked',code:'EXCLUSIVE_MAINTENANCE_REQUIRED'};
 const base=await realpath(root),file=path.join(base,name),guardPath=path.join(base,'.accelerate-lock-recovery');
 let guard;
 try{guard=await open(guardPath,'wx',0o600);}catch{return {status:'blocked',code:'RECOVERY_GUARD_UNAVAILABLE'};}
 try{
  const initial=await inspectProjectLock(base);
  if(initial.status==='absent')return {status:'no-op'};
  if(initial.status!=='stale')return {status:'blocked',code:'LOCK_NOT_CONFIRMED_STALE'};
  const before=await lstat(file),raw=await readFile(file,'utf8');
  const current=await inspectProjectLock(base),after=await lstat(file);
  if(current.status!=='stale'||current.pid!==initial.pid||before.dev!==after.dev||before.ino!==after.ino||raw!==await readFile(file,'utf8'))return {status:'conflict',code:'LOCK_CHANGED'};
  await unlink(file);
  return {status:'success'};
 }catch{return {status:'blocked',code:'LOCK_RECOVERY_FAILED'};}
 finally{await guard.close();await unlink(guardPath);}
}
