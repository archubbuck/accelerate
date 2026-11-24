import {open,lstat,readFile,unlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {snapshotFile} from './patches.mjs';
export const journalName='.accelerate-operation-journal.json';
export async function prepareJournal(root,changes){
 const base=await realpath(root);
 const entries=[];
 for(const change of changes){
  if([change.path,change.destination].some(p=>[journalName,'.accelerate-operation.lock','.accelerate-lock-recovery'].includes(p)))throw new Error('RESERVED_PATH');
  const before=change.kind==='create'?null:await snapshotFile(base,change.path);
  if(before&&before.hash!==change.beforeHash)throw new Error('STALE_PATCH');
  const mode=before?(await lstat(path.join(base,change.path))).mode&0o777:null;
  entries.push({change,before,mode});
 }
 const journal={schemaVersion:1,entries};
 const handle=await open(path.join(base,journalName),'wx',0o600);
 try{await handle.writeFile(JSON.stringify(journal),'utf8');await handle.sync();}finally{await handle.close();}
 return journal;
}
export async function inspectJournal(root){
 const file=path.join(await realpath(root),journalName);
 try{
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)return {status:'blocked',code:'UNSAFE_JOURNAL'};
  const journal=JSON.parse(await readFile(file,'utf8'));
  if(journal.schemaVersion!==1||!Array.isArray(journal.entries))return {status:'blocked',code:'INVALID_JOURNAL'};
  return {status:'recovery-required',entries:journal.entries.map(e=>({kind:e.change?.kind,path:e.change?.path,destination:e.change?.destination}))};
 }catch(e){return e.code==='ENOENT'?{status:'absent'}:{status:'blocked',code:'INVALID_JOURNAL'};}
}
export async function clearJournal(root){await unlink(path.join(await realpath(root),journalName));}
