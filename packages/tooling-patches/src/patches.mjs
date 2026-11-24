import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const hashContent = content => createHash('sha256').update(content).digest('hex');
// Reject symlinks at every component, including the final file.
export async function resolveProjectFile(root,relative) {
  if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.includes(':')||relative.includes('\0')||path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..')) throw new Error('INVALID_PATH');
  const base=await realpath(root);
  let target=base;
  const parts=relative.split('/');
  for(let i=0;i<parts.length;i++){
    target=path.join(target,parts[i]);
    const stat=await lstat(target);
    if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isFile())) throw new Error('UNSAFE_PATH');
  }
  return target;
}
export async function snapshotFile(root,relative){
  const target=await resolveProjectFile(root,relative);
  const bytes=await readFile(target);
  const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  return {path:relative,hash:hashContent(bytes),content};
}
export async function planReplacement(root,relative,transform){
  const before=await snapshotFile(root,relative);
  const after=await transform(before.content);
  if(typeof after!=='string') throw new TypeError('Transformation must return text');
  if(after===before.content) return null;
  return {kind:'replace',path:relative,beforeHash:before.hash,afterHash:hashContent(after),content:after};
}
export async function verifyPlan(root,changes){
  if(!Array.isArray(changes)) return [{code:'INVALID_PATCH_LIST',severity:'error'}];
  const seen=new Set();
  const diagnostics=[];
  for(const change of changes){
    if(change?.kind!=='replace'||typeof change.path!=='string'||typeof change.content!=='string'||typeof change.beforeHash!=='string'||!(/^[a-f0-9]{64}$/).test(change.beforeHash)||hashContent(change.content)!==change.afterHash||seen.has(change.path)){
      diagnostics.push({code:'INVALID_PATCH',severity:'error',path:change?.path});continue;
    }
    seen.add(change.path);
    try{
      const target=await resolveProjectFile(root,change.path);
      if((await lstat(target)).nlink!==1){diagnostics.push({code:'UNSAFE_HARDLINK',severity:'error',path:change.path});continue;}
      const current=await snapshotFile(root,change.path);
      if(current.hash!==change.beforeHash) diagnostics.push({code:'STALE_PATCH',severity:'error',path:change.path});
    }catch{diagnostics.push({code:'UNSAFE_OR_MISSING_PATH',severity:'error',path:change.path});}
  }
  return diagnostics;
}
