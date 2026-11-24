import {validateManifest} from '@accelerate/tooling-core';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const version=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const owner=/^@accelerate\/[a-z0-9-]+$/;
export function validatePackageOperations(document,identity){
 const errors=[];
 if(!record(document)||!record(identity))return ['Invalid document or identity'];
 if(document.schemaVersion!=='1.0')errors.push('Unsupported manifest schema');
 if(!owner.test(identity.name??'')||!version.test(identity.version??'')||document.package!==identity.name||document.packageVersion!==identity.version)errors.push('Package identity mismatch');
 if(!Array.isArray(document.operations)||!document.operations.length||document.operations.length>1000)return [...errors,'Invalid operations array'];
 const seen=new Set();
 for(const entry of document.operations){
  if(!record(entry)){errors.push('Invalid operation entry');continue;}
  const manifest=entry.manifest;
  errors.push(...validateManifest(manifest));
  if(manifest?.package!==identity.name)errors.push('Operation ownership mismatch');
  const key=manifest?.id+'@'+manifest?.version;
  if(seen.has(key))errors.push('Duplicate operation '+key);
  seen.add(key);
  if(typeof entry.handler!=='string'||!entry.handler.startsWith('./')||!entry.handler.slice(2).split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s))||!entry.handler.endsWith('.mjs'))errors.push('Invalid handler path');
  if(typeof entry.exportName!=='string'||!/^[$A-Z_a-z][$\w]*$/.test(entry.exportName))errors.push('Invalid handler export');
 }
 return errors;
}
