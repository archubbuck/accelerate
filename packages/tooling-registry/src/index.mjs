import {createHash} from 'node:crypto';
import {lstat,realpath,readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateManifest,OperationRegistry,executeOperation,validateSchema,normalizeRequest} from '@accelerate/tooling-core';
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

async function readLocalJson(base,relative){
 if(typeof relative!=='string'||!relative.split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))throw Error('UNSAFE_MANIFEST_PATH');
 const file=path.join(base,relative),stat=await lstat(file);
 if(!stat.isFile()||stat.size>1048576||await realpath(file)!==file)throw Error('UNSAFE_MANIFEST_FILE');
 return JSON.parse(await readFile(file,'utf8'));
}
/** Read package-owned metadata only; the package directory may be a package-manager symlink. */
export async function discoverPackageOperations(root,names){
 if(!Array.isArray(names)||names.length>1000||names.some(n=>typeof n!=='string'||!owner.test(n)))throw Error('INVALID_PACKAGE_SCOPE');
 const base=await realpath(root),packages=[],diagnostics=[];
 for(const name of [...new Set(names)].sort()){
  try{
   const packageRoot=await realpath(path.join(base,'node_modules',name));
   const metadata=await readLocalJson(packageRoot,'package.json');
   if(metadata.name!==name||typeof metadata.version!=='string'||!version.test(metadata.version))throw Error('PACKAGE_IDENTITY_MISMATCH');
   const declaration=metadata.accelerate?.operations;
   if(declaration===undefined){packages.push({name,version:metadata.version,status:'not-declared',operations:[]});continue;}
   if(typeof declaration!=='string'||!declaration.startsWith('./'))throw Error('INVALID_DECLARATION');
   const document=await readLocalJson(packageRoot,declaration.slice(2));
   const errors=validatePackageOperations(document,metadata);
   if(errors.length){diagnostics.push({package:name,code:'INVALID_OPERATION_MANIFEST',errors});continue;}
   packages.push({name,version:metadata.version,status:'declared',operations:document.operations});
  }catch{diagnostics.push({package:name,code:'PACKAGE_METADATA_UNREADABLE_OR_INVALID'});}
 }
 return {packages,diagnostics,handlersLoaded:false,trustVerified:false};
}
/** Search validated metadata; reject ambiguous operation identities across packages. */
export function indexOperations(packages){
 const entries=new Map(),conflicts=new Set();
 for(const pkg of packages){
  if(pkg.status!=='declared')continue;
  const errors=validatePackageOperations({schemaVersion:'1.0',package:pkg.name,packageVersion:pkg.version,operations:pkg.operations},pkg);
  if(errors.length)throw Error('INVALID_INDEX_INPUT');
  for(const entry of pkg.operations){
   const key=entry.manifest.id+'@'+entry.manifest.version;
   if(entries.has(key))conflicts.add(key);
   else entries.set(key,{...structuredClone(entry),packageVersion:pkg.version});
  }
 }
 for(const key of conflicts)entries.delete(key);
 return {operations:[...entries.values()].sort((a,b)=>(a.manifest.id+'@'+a.manifest.version).localeCompare(b.manifest.id+'@'+b.manifest.version,'en')),conflicts:[...conflicts].sort()};
}
export function searchOperations(index,{query='',packageName,mode}={}){
 const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return index.operations.filter(({manifest:m})=>(!packageName||m.package===packageName)&&(!mode||m.modes.includes(mode))&&terms.every(term=>(m.id+' '+m.description+' '+m.package).toLowerCase().includes(term))).map(e=>structuredClone(e));
}

/** Resolve exact operation and installed package versions; never silently select another version. */
export function resolveOperation(index,{id,operationVersion,packageName,packageVersion}){
 if(typeof id!=='string'||typeof operationVersion!=='string'||!version.test(operationVersion)||typeof packageName!=='string'||!owner.test(packageName)||typeof packageVersion!=='string'||!version.test(packageVersion))throw Error('INVALID_RESOLUTION_REQUEST');
 const key=id+'@'+operationVersion;
 if(index.conflicts.includes(key))return {status:'conflict'};
 const entry=index.operations.find(e=>e.manifest.id===id&&e.manifest.version===operationVersion);
 if(!entry)return {status:'not-found'};
 if(entry.manifest.package!==packageName||entry.packageVersion!==packageVersion)return {status:'incompatible'};
 return {status:'resolved',entry:structuredClone(entry)};
}

/** Inspect a handler's bytes without executing it. A digest is evidence, not a sandbox. */
export async function inspectHandlerIntegrity(root,request){
 const discovery=await discoverPackageOperations(root,[request.packageName]);
 const resolved=resolveOperation(indexOperations(discovery.packages),request);
 if(resolved.status!=='resolved')return {status:resolved.status,diagnostics:discovery.diagnostics};
 try{
  const base=await realpath(path.join(await realpath(root),'node_modules',request.packageName));
  const file=path.join(base,resolved.entry.handler.slice(2));
  const stat=await lstat(file);
  if(!stat.isFile()||stat.size>4194304||await realpath(file)!==file)throw Error('UNSAFE_HANDLER');
  const bytes=await readFile(file);
  if(bytes.length>4194304)throw Error('HANDLER_LIMIT');
  return {status:'inspected',entry:resolved.entry,manifestSha256:createHash('sha256').update(JSON.stringify(resolved.entry.manifest)).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),handlersLoaded:false,trustVerified:false};
 }catch{return {status:'blocked',diagnostics:[{package:request.packageName,code:'HANDLER_UNREADABLE_OR_UNSAFE'}]};}
}
/** Require an explicit, exact identity and digest allowlist before considering execution. */
export function authorizeHandler(evidence,approval){
 if(evidence?.status!=='inspected'||!approval||approval.allowExecution!==true)return false;
 const m=evidence.entry.manifest;
 return approval.packageName===m.package&&approval.packageVersion===evidence.entry.packageVersion&&approval.id===m.id&&approval.operationVersion===m.version&&approval.handler===evidence.entry.handler&&approval.exportName===evidence.entry.exportName&&typeof approval.sha256==='string'&&/^[a-f0-9]{64}$/.test(approval.sha256)&&approval.sha256===evidence.sha256&&typeof approval.manifestSha256==='string'&&approval.manifestSha256===evidence.manifestSha256;
}

/** Load explicitly approved standalone modules from the exact inspected bytes.
 * Only trusted code is eligible: this is not a sandbox.
 */
export async function loadApprovedHandler(root,request,approval){
 const evidence=await inspectHandlerIntegrity(root,request);
 if(!authorizeHandler(evidence,approval))return {status:'blocked',code:'HANDLER_NOT_AUTHORIZED'};
 try{
  const base=await realpath(path.join(await realpath(root),'node_modules',request.packageName));
  const file=path.join(base,evidence.entry.handler.slice(2)),stat=await lstat(file);
  if(!stat.isFile()||stat.size>4194304||await realpath(file)!==file)throw Error('UNSAFE_HANDLER');
  const bytes=await readFile(file);
  if(bytes.length>4194304||createHash('sha256').update(bytes).digest('hex')!==approval.sha256)return {status:'blocked',code:'HANDLER_CHANGED'};
  // A data URL binds the imported entry module to the verified bytes, rather than reopening its path.
  const module=await import('data:text/javascript;base64,'+bytes.toString('base64'));
  const handler=module[evidence.entry.exportName];
  if(typeof handler!=='function')return {status:'blocked',code:'HANDLER_EXPORT_INVALID'};
  return {status:'loaded',manifest:evidence.entry.manifest,handler,isolated:false};
 }catch{return {status:'blocked',code:'HANDLER_LOAD_FAILED'};}
}

/** Execute an explicitly approved installed operation through the shared engine.
 * Apply remains disabled until installed handlers have a separately authorized patch policy.
 */
export async function executeApprovedOperation(root,request,approval){
 if(!request||request.options?.mode==='apply')return {status:'blocked',code:'INSTALLED_APPLY_DISABLED'};
 const normalized=normalizeRequest(request);
 if(!normalized.ok)return {status:'blocked',code:'INVALID_OPERATION_REQUEST'};
 request=normalized.request;
 const identity={id:request.operation,operationVersion:request.operationVersion,packageName:approval?.packageName,packageVersion:approval?.packageVersion};
 if(!approval||approval.allowExecution!==true||approval.id!==identity.id||approval.operationVersion!==identity.operationVersion)return {status:'blocked',code:'HANDLER_NOT_AUTHORIZED'};
 try{
  // Validate the request against discovered metadata before importing any executable code.
  const evidence=await inspectHandlerIntegrity(root,identity);
  if(!authorizeHandler(evidence,approval))return {status:'blocked',code:'HANDLER_NOT_AUTHORIZED'};
  const manifest=evidence.entry.manifest,mode=request.options?.mode??'preview';
  if(request.schemaVersion!=='1.0'||!manifest.modes.includes(mode)||!validateSchema(manifest.inputSchema,request.input))return {status:'blocked',code:'INVALID_OPERATION_REQUEST'};
  const loaded=await loadApprovedHandler(root,identity,approval);
  if(loaded.status!=='loaded')return loaded;
  if(JSON.stringify(loaded.manifest)!==JSON.stringify(manifest))return {status:'blocked',code:'MANIFEST_CHANGED'};
  const registry=new OperationRegistry();
  registry.register(loaded.manifest,loaded.handler);
  return {status:'executed',result:await executeOperation(registry,request,{validateSchema})};
 }catch{return {status:'blocked',code:'INSTALLED_EXECUTION_FAILED'};}
}
