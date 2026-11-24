import {open,unlink,link,rename,realpath,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {snapshotFile,resolveProjectFile,hashContent} from './patches.mjs';
import {resolveAbsentFile} from './file-plans.mjs';
import {verifyMixedPlan} from './preflight.mjs';
import {prepareJournal,inspectJournal,clearJournal} from './journal.mjs';
async function write(root,file,content,mode,expected){
 const target=expected===undefined?await resolveAbsentFile(root,file):await resolveProjectFile(root,file);
 const temp=path.join(path.dirname(target),'.accelerate-'+randomUUID()+'.tmp');
 const handle=await open(temp,'wx',mode);
 try{
  try{await handle.writeFile(content,'utf8');await handle.chmod(mode);await handle.sync();}finally{await handle.close();}
  if(expected===undefined){await resolveAbsentFile(root,file);await link(temp,target);}
  else{await check(root,file,expected);await rename(temp,target);}
 }finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function check(root,file,expected){
 const target=await resolveProjectFile(root,file);
 if((await lstat(target)).nlink!==1||(await snapshotFile(root,file)).hash!==expected)throw new Error('STALE_OR_UNSAFE_FILE');
 return target;
}
export async function applyMixedPlan(root,changes,{apply=false,verify}={}){
 if(!apply)return {status:'blocked',diagnostics:[{code:'EXPLICIT_APPLY_REQUIRED'}]};
 const base=await realpath(root),lockPath=path.join(base,'.accelerate-operation.lock');
 let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch{return {status:'blocked',diagnostics:[{code:'PROJECT_LOCK_UNAVAILABLE'}]};}
 const undo=[],diagnostics=[];
 let journalPrepared=false;
 try{
  if((await inspectJournal(base)).status!=='absent')return {status:'blocked',diagnostics:[{code:'RECOVERY_REQUIRED'}]};
  const invalid=await verifyMixedPlan(base,changes);
  if(invalid.length)return {status:'conflict',diagnostics:invalid};
  if(!changes.length)return {status:'no-op',diagnostics:[]};
  await prepareJournal(base,changes);journalPrepared=true;
  for(const c of changes){
   if(c.kind==='create'){
    await write(base,c.path,c.content,0o644);
    undo.push(async()=>unlink(await check(base,c.path,c.afterHash)));
   }else{
    const target=await check(base,c.path,c.beforeHash);
    const before=await snapshotFile(base,c.path),mode=(await lstat(target)).mode&0o777;
    if(before.hash!==c.beforeHash)throw new Error('STALE_PATCH');
    if(c.kind==='replace'){
     await write(base,c.path,c.content,mode,c.beforeHash);
     undo.push(()=>write(base,c.path,before.content,mode,c.afterHash));
    }else if(c.kind==='delete'){
     await unlink(await check(base,c.path,c.beforeHash));
     undo.push(()=>write(base,c.path,before.content,mode));
    }else{
     const destination=await resolveAbsentFile(base,c.destination);
     await link(await check(base,c.path,c.beforeHash),destination);
     undo.push(async()=>{const dest=await resolveProjectFile(base,c.destination);const a=await lstat(target),b=await lstat(dest);if(a.dev!==b.dev||a.ino!==b.ino||(await snapshotFile(base,c.destination)).hash!==c.afterHash)throw new Error('ROLLBACK_CONFLICT');await unlink(dest);});
     await unlink(target);
     undo.pop();
     undo.push(async()=>{await write(base,c.path,before.content,mode);await unlink(await check(base,c.destination,c.afterHash));});
    }
   }
  }
  for(const c of changes){
   if(c.kind==='delete'||c.kind==='rename')await resolveAbsentFile(base,c.path);
   if(c.kind!=='delete')await check(base,c.kind==='rename'?c.destination:c.path,c.afterHash);
  }
  if(verify&&!await verify())throw new Error('VERIFICATION_FAILED');
  await clearJournal(base);journalPrepared=false;
  return {status:'success',diagnostics:[],verification:[{code:'CONTENT_HASH_VERIFIED',passed:true}]};
 }catch{
  diagnostics.push({code:'APPLY_FAILED'});
  for(const revert of undo.reverse())try{await revert();}catch{diagnostics.push({code:'ROLLBACK_CONFLICT'});}
  if(journalPrepared&&diagnostics.length===1){try{await clearJournal(base);}catch{diagnostics.push({code:'JOURNAL_CLEANUP_FAILED'});}}
  return {status:diagnostics.length>1?'partial':'failed',diagnostics};
 }finally{await lock.close();await unlink(lockPath);}
}
