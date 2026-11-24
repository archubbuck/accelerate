import {open,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {resolveProjectFile,snapshotFile,verifyPlan,hashContent} from './patches.mjs';

// Cooperative lock for Accelerate writers. External editors must remain idle during apply.
export async function applyReplacements(root,changes,{apply=false,verify}={}){
  if(!apply) return {status:'blocked',diagnostics:[{code:'EXPLICIT_APPLY_REQUIRED'}]};
  const base=await realpath(root);
  const lockPath=path.join(base,'.accelerate-operation.lock');
  let lock;
  try{lock=await open(lockPath,'wx',0o600);}catch{return {status:'blocked',diagnostics:[{code:'PROJECT_LOCK_UNAVAILABLE'}]};}
  const completed=[];
  const diagnostics=[];
  async function replace(change,expected,content){
    const target=await resolveProjectFile(base,change.path);
    const stat=await lstat(target);
    if(stat.nlink!==1) throw new Error('UNSAFE_HARDLINK');
    const temp=path.join(path.dirname(target),'.accelerate-'+randomUUID()+'.tmp');
    let handle;
    try{
      handle=await open(temp,'wx',stat.mode&0o777);
      await handle.writeFile(content,'utf8');
      await handle.chmod(stat.mode&0o777);
      await handle.sync();
      await handle.close();handle=undefined;
      if((await snapshotFile(base,change.path)).hash!==expected) throw new Error('STALE_PATCH');
      await rename(temp,target);
    }finally{
      if(handle) await handle.close();
      await unlink(temp).catch(e=>{if(e.code!=='ENOENT') throw e;});
    }
  }
  try{
    const invalid=await verifyPlan(base,changes);
    if(invalid.length) return {status:'conflict',diagnostics:invalid};
    if(!changes.length) return {status:'no-op',diagnostics:[]};
    for(const change of changes){
      const before=await snapshotFile(base,change.path);
      if(before.hash!==change.beforeHash) throw new Error('STALE_PATCH');
      await replace(change,before.hash,change.content);
      completed.push({change,before});
    }
    for(const {change} of completed) if((await snapshotFile(base,change.path)).hash!==change.afterHash) throw new Error('POST_WRITE_MISMATCH');
    if(verify && !await verify()) throw new Error('VERIFICATION_FAILED');
    return {status:'success',diagnostics:[],verification:[{code:'CONTENT_HASH_VERIFIED',passed:true},...(verify?[{code:'CUSTOM_VERIFICATION',passed:true}]:[])]};
  }catch{
    diagnostics.push({code:'APPLY_FAILED'});
    for(const {change,before} of completed.reverse()){
      try{
        await replace(change,change.afterHash,before.content);
        if((await snapshotFile(base,change.path)).hash!==hashContent(before.content)) throw new Error('ROLLBACK_MISMATCH');
      }catch{diagnostics.push({code:'ROLLBACK_CONFLICT',path:change.path});}
    }
    return {status:diagnostics.length>1?'partial':'failed',diagnostics};
  }finally{
    await lock.close();
    await unlink(lockPath);
  }
}
