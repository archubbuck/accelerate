import {lstat} from 'node:fs/promises';
import {hashContent,snapshotFile,resolveProjectFile} from './patches.mjs';
import {resolveAbsentFile} from './file-plans.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function verifyMixedPlan(root,changes){
 if(!Array.isArray(changes))return [{code:'INVALID_PATCH_LIST',severity:'error'}];
 const diagnostics=[],seen=new Set();
 const issue=(code,path)=>diagnostics.push({code,severity:'error',path});
 for(const change of changes){
  if(!change||!['create','replace','delete','rename'].includes(change.kind)||typeof change.path!=='string'){issue('INVALID_PATCH',change?.path);continue;}
  const {kind,path,destination,beforeHash,afterHash,content}=change;
  if((kind!=='create'&&!hash(beforeHash))||(['create','replace'].includes(kind)&&(typeof content!=='string'||hashContent(content)!==afterHash))||(kind==='rename'&&(typeof destination!=='string'||afterHash!==beforeHash))){issue('INVALID_PATCH',path);continue;}
  const targets=kind==='rename'?[path,destination]:[path];
  if(new Set(targets).size!==targets.length||targets.some(p=>seen.has(p))){issue('OVERLAPPING_PATCH',path);continue;}
  for(const target of targets)seen.add(target);
  try{
   if(kind==='create')await resolveAbsentFile(root,path);
   else{
    const target=await resolveProjectFile(root,path);
    if((await lstat(target)).nlink!==1){issue('UNSAFE_HARDLINK',path);continue;}
    if((await snapshotFile(root,path)).hash!==beforeHash){issue('STALE_PATCH',path);continue;}
    if(kind==='rename')await resolveAbsentFile(root,destination);
   }
  }catch{issue('UNSAFE_OR_CONFLICTING_PATH',path);}
 }
 return diagnostics;
}
