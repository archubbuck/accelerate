import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {journalName,inspectJournal} from './journal.mjs';
import {snapshotFile,hashContent} from './patches.mjs';
import {resolveAbsentFile} from './file-plans.mjs';
async function state(root,file){
 try{const s=await snapshotFile(root,file);return s.hash;}catch{try{await resolveAbsentFile(root,file);return null;}catch{return 'unsafe';}}
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
   for(const target of targets){if(typeof target!=='string'||seen.has(target)||[journalName,'.accelerate-operation.lock'].includes(target))throw new Error('INVALID_TARGET');seen.add(target);}
   if(c.kind!=='create'&&(!before||before.path!==c.path||typeof before.content!=='string'||hashContent(before.content)!==c.beforeHash||before.hash!==c.beforeHash))throw new Error('INVALID_SNAPSHOT');
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
