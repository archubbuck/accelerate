import {acquireProjectLock} from './lock.mjs';
import {readFile,lstat,realpath,open,unlink,rename,link} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {journalName,inspectJournal} from './journal.mjs';
import {snapshotFile,hashContent,resolveProjectFile} from './patches.mjs';
import {resolveAbsentFile} from './file-plans.mjs';
async function state(root,file){
 try{const target=await resolveProjectFile(root,file);if((await lstat(target)).nlink!==1)return 'unsafe';const s=await snapshotFile(root,file);return s.hash;}catch{try{await resolveAbsentFile(root,file);return null;}catch{return 'unsafe';}}
}
export async function planRecovery(root){
 const base=await realpath(root),inspection=await inspectJournal(base);
 if(inspection.status!=='recovery-required')return inspection;
 try{
  const file=path.join(base,journalName),stat=await lstat(file);
  if(stat.size>32*1024*1024||stat.nlink!==1||!stat.isFile())throw new Error('INVALID_JOURNAL');
  const journal=JSON.parse(await readFile(file,'utf8')),entries=[],seen=new Set();
  for(const entry of journal.entries){
   const {change:c,before}=entry;
   if(!c||!['create','replace','delete','rename'].includes(c.kind)||typeof c.path!=='string')throw new Error('INVALID_ENTRY');
   const targets=c.kind==='rename'?[c.path,c.destination]:[c.path];
   for(const target of targets){if(typeof target!=='string'||seen.has(target)||[journalName,'.accelerate-operation.lock','.accelerate-lock-recovery'].includes(target))throw new Error('INVALID_TARGET');seen.add(target);}
   if(c.kind!=='create'&&(!Number.isInteger(entry.mode)||entry.mode<0||entry.mode>511||!before||before.path!==c.path||typeof before.content!=='string'||hashContent(before.content)!==c.beforeHash||before.hash!==c.beforeHash))throw new Error('INVALID_SNAPSHOT');
   if(['create','replace'].includes(c.kind)&&(typeof c.content!=='string'||hashContent(c.content)!==c.afterHash))throw new Error('INVALID_CONTENT');
   if(c.kind==='rename'&&c.beforeHash!==c.afterHash)throw new Error('INVALID_RENAME');
   const current=await state(base,c.path),dest=c.kind==='rename'?await state(base,c.destination):null;
   const original=c.kind==='create'?current===null:current===c.beforeHash&&dest===null;
   const applied=c.kind==='delete'?current===null:c.kind==='rename'?current===null&&dest===c.afterHash:current===c.afterHash;
   entries.push({kind:c.kind,path:c.path,...(c.kind==='rename'?{destination:c.destination}:{}),state:original?'original':applied?'applied':'conflict'});
  }
  return {status:entries.some(e=>e.state==='conflict')?'conflict':'recovery-required',entries};
 }catch{return {status:'blocked',code:'INVALID_JOURNAL'};}
}

export async function recoverJournal(root,{apply=false}={}){
 if(!apply)return {status:'blocked',code:'EXPLICIT_APPLY_REQUIRED'};
 const base=await realpath(root),lockPath=path.join(base,'.accelerate-operation.lock');
 let lock;
 try{lock=await acquireProjectLock(base);}catch{return {status:'blocked',code:'PROJECT_LOCK_UNAVAILABLE'};}
 try{
  const plan=await planRecovery(base);
  if(plan.status!=='recovery-required')return plan;
  const journal=JSON.parse(await readFile(path.join(base,journalName),'utf8'));
  async function restore(entry,expected){
   const {change:c,before,mode}=entry;
   const target=expected===null?await resolveAbsentFile(base,c.path):await resolveProjectFile(base,c.path);
   const temp=path.join(path.dirname(target),'.accelerate-'+randomUUID()+'.tmp');
   const handle=await open(temp,'wx',mode);
   try{
    try{await handle.writeFile(before.content,'utf8');await handle.chmod(mode);await handle.sync();}finally{await handle.close();}
    if(await state(base,c.path)!==expected)throw new Error('RECOVERY_CONFLICT');
    if(expected===null)await link(temp,target);else await rename(temp,target);
   }finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  for(let i=journal.entries.length-1;i>=0;i--){
   const entry=journal.entries[i],c=entry.change;
   if(plan.entries[i].state==='original')continue;
   if(c.kind==='create'){
    if(await state(base,c.path)!==c.afterHash)throw new Error('RECOVERY_CONFLICT');
    await unlink(await resolveProjectFile(base,c.path));
   }else if(c.kind==='replace')await restore(entry,c.afterHash);
   else if(c.kind==='delete')await restore(entry,null);
   else{
    if(await state(base,c.destination)!==c.afterHash||await state(base,c.path)!==null)throw new Error('RECOVERY_CONFLICT');
    await restore(entry,null);
    if(await state(base,c.destination)!==c.afterHash)throw new Error('RECOVERY_CONFLICT');
    await unlink(await resolveProjectFile(base,c.destination));
   }
  }
  const final=await planRecovery(base);
  if(final.status!=='recovery-required'||final.entries.some(e=>e.state!=='original'))throw new Error('RECOVERY_VERIFICATION_FAILED');
  await unlink(path.join(base,journalName));
  return {status:'success'};
 }catch{return {status:'partial',code:'RECOVERY_FAILED_JOURNAL_RETAINED'};}
 finally{await lock.release();}
}
