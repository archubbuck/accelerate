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
