import {lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {snapshotFile,hashContent,resolveProjectFile} from './patches.mjs';
export async function resolveAbsentFile(root,relative){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.includes(':')||relative.includes('\0')||path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('INVALID_PATH');
 const base=await realpath(root);
 const parts=relative.split('/');
 let target=base;
 for(const part of parts.slice(0,-1)){
  target=path.join(target,part);
  const stat=await lstat(target);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('UNSAFE_PATH');
 }
 target=path.join(target,parts.at(-1));
 try{await lstat(target);}catch(error){if(error.code==='ENOENT')return target;throw error;}
 throw new Error('DESTINATION_EXISTS');
}
export async function planCreation(root,relative,content){
 if(typeof content!=='string')throw new TypeError('Expected text');
 await resolveAbsentFile(root,relative);
 return {kind:'create',path:relative,afterHash:hashContent(content),content};
}
export async function planDeletion(root,relative){
 const target=await resolveProjectFile(root,relative);
 if((await lstat(target)).nlink!==1)throw new Error('UNSAFE_HARDLINK');
 const before=await snapshotFile(root,relative);
 return {kind:'delete',path:relative,beforeHash:before.hash};
}
export async function planRename(root,relative,destination){
 const deletion=await planDeletion(root,relative);
 await resolveAbsentFile(root,destination);
 return {...deletion,kind:'rename',destination,afterHash:deletion.beforeHash};
}
