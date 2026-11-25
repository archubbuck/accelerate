import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackageOperations} from '../../packages/tooling-registry/src/index.mjs';
test('package operation manifests enforce identity and safe handler declarations',()=>{
 const identity={name:'@accelerate/example',version:'1.0.0'};
 const entry={manifest:{id:'example.inspect',version:'1.0.0',package:identity.name,description:'Inspect',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}},handler:'./operations/inspect.mjs',exportName:'inspect'};
 const doc={schemaVersion:'1.0',package:identity.name,packageVersion:identity.version,operations:[entry]};
 assert.deepEqual(validatePackageOperations(doc,identity),[]);
 assert.ok(validatePackageOperations({...doc,operations:[entry,entry]},identity).length);
 assert.ok(validatePackageOperations({...doc,operations:[{...entry,handler:'./../outside.mjs'}]},identity).length);
 assert.ok(validatePackageOperations(doc,{...identity,version:'2.0.0'}).length);
});

import {discoverPackageOperations,indexOperations,searchOperations} from '../../packages/tooling-registry/src/index.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('discovery indexes metadata without importing handlers',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-registry-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const name='@accelerate/example',dir=path.join(root,'node_modules',name);
 await mkdir(dir,{recursive:true});
 const entry={manifest:{id:'example.inspect',version:'1.0.0',package:name,description:'Inspect configuration',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}},handler:'./missing.mjs',exportName:'inspect'};
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',accelerate:{operations:'./operations.json'}}));
 await writeFile(path.join(dir,'operations.json'),JSON.stringify({schemaVersion:'1.0',package:name,packageVersion:'1.0.0',operations:[entry]}));
 const result=await discoverPackageOperations(root,[name]);
 assert.equal(result.handlersLoaded,false);
 assert.deepEqual(result.diagnostics,[]);
 const index=indexOperations(result.packages);
 assert.equal(searchOperations(index,{query:'configuration',mode:'inspect'}).length,1);
 assert.equal(searchOperations(index,{mode:'apply'}).length,0);
 assert.deepEqual(indexOperations([...result.packages,...result.packages]).conflicts,['example.inspect@1.0.0']);
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',accelerate:{operations:'./../outside.json'}}));
 assert.equal((await discoverPackageOperations(root,[name])).diagnostics.length,1);
});

import {resolveOperation} from '../../packages/tooling-registry/src/index.mjs';
test('exact resolution rejects incompatible installed versions and conflicts',()=>{
 const request={id:'example.inspect',operationVersion:'1.0.0',packageName:'@accelerate/example',packageVersion:'1.0.0'};
 const entry={manifest:{id:request.id,version:request.operationVersion,package:request.packageName},packageVersion:'1.0.0'};
 const index={operations:[entry],conflicts:[]};
 assert.equal(resolveOperation(index,request).status,'resolved');
 assert.equal(resolveOperation(index,{...request,packageVersion:'2.0.0'}).status,'incompatible');
 assert.equal(resolveOperation(index,{...request,operationVersion:'2.0.0'}).status,'not-found');
 assert.equal(resolveOperation({...index,conflicts:['example.inspect@1.0.0']},request).status,'conflict');
});

import {inspectHandlerIntegrity,authorizeHandler} from '../../packages/tooling-registry/src/index.mjs';
test('handler inspection requires exact digest approval without executing code',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-integrity-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const name='@accelerate/example',dir=path.join(root,'node_modules',name);
 await mkdir(dir,{recursive:true});
 const request={id:'example.inspect',operationVersion:'1.0.0',packageName:name,packageVersion:'1.0.0'};
 const entry={manifest:{id:request.id,version:request.operationVersion,package:name,description:'Inspect',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}},handler:'./handler.mjs',exportName:'inspect'};
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',accelerate:{operations:'./operations.json'}}));
 await writeFile(path.join(dir,'operations.json'),JSON.stringify({schemaVersion:'1.0',package:name,packageVersion:'1.0.0',operations:[entry]}));
 assert.equal((await inspectHandlerIntegrity(root,request)).status,'blocked');
 await writeFile(path.join(dir,'handler.mjs'),"throw Error('must not execute');");
 const evidence=await inspectHandlerIntegrity(root,request);
 assert.equal(evidence.status,'inspected');
 const approval={...request,handler:entry.handler,exportName:entry.exportName,sha256:evidence.sha256,manifestSha256:evidence.manifestSha256,allowExecution:true};
 assert.equal(authorizeHandler(evidence,approval),true);
 assert.equal(authorizeHandler(evidence,{...approval,manifestSha256:'0'.repeat(64)}),false);
 assert.equal(authorizeHandler(evidence,{...approval,allowExecution:false}),false);
 assert.equal(authorizeHandler(evidence,{...approval,exportName:'other'}),false);
 await writeFile(path.join(dir,'handler.mjs'),'export function inspect() {}');
 assert.equal(authorizeHandler(await inspectHandlerIntegrity(root,request),approval),false);
});

import {loadApprovedHandler} from '../../packages/tooling-registry/src/index.mjs';
test('lazy loader requires approval and loads verified standalone bytes',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-loader-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const name='@accelerate/example',dir=path.join(root,'node_modules',name);
 await mkdir(dir,{recursive:true});
 const request={id:'example.inspect',operationVersion:'1.0.0',packageName:name,packageVersion:'1.0.0'};
 const entry={manifest:{id:request.id,version:request.operationVersion,package:name,description:'Inspect',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}},handler:'./handler.mjs',exportName:'inspect'};
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',accelerate:{operations:'./operations.json'}}));
 await writeFile(path.join(dir,'operations.json'),JSON.stringify({schemaVersion:'1.0',package:name,packageVersion:'1.0.0',operations:[entry]}));
 await writeFile(path.join(dir,'handler.mjs'),'export function inspect(){return {status:"success",data:{ok:true}}}');
 const evidence=await inspectHandlerIntegrity(root,request);
 const approval={...request,handler:entry.handler,exportName:entry.exportName,sha256:evidence.sha256,manifestSha256:evidence.manifestSha256,allowExecution:true};
 assert.equal((await loadApprovedHandler(root,request,{...approval,allowExecution:false})).status,'blocked');
 const loaded=await loadApprovedHandler(root,request,approval);
 assert.equal(loaded.status,'loaded');
 assert.deepEqual(loaded.handler(),{status:'success',data:{ok:true}});
 await writeFile(path.join(dir,'handler.mjs'),"throw Error('unapproved');");
 assert.equal((await loadApprovedHandler(root,request,approval)).status,'blocked');
});

import {executeApprovedOperation} from '../../packages/tooling-registry/src/index.mjs';
test('approved installed operations execute through core and reject apply',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-execute-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const name='@accelerate/example',dir=path.join(root,'node_modules',name);
 await mkdir(dir,{recursive:true});
 const identity={id:'example.inspect',operationVersion:'1.0.0',packageName:name,packageVersion:'1.0.0'};
 const entry={manifest:{id:identity.id,version:identity.operationVersion,package:name,description:'Inspect',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object',additionalProperties:false},outputSchema:{type:'object'}},handler:'./handler.mjs',exportName:'inspect'};
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',accelerate:{operations:'./operations.json'}}));
 await writeFile(path.join(dir,'operations.json'),JSON.stringify({schemaVersion:'1.0',package:name,packageVersion:'1.0.0',operations:[entry]}));
 await writeFile(path.join(dir,'handler.mjs'),'export function inspect(){return {status:"success",data:{ok:true}}}');
 const evidence=await inspectHandlerIntegrity(root,identity);
 const approval={...identity,handler:entry.handler,exportName:entry.exportName,sha256:evidence.sha256,manifestSha256:evidence.manifestSha256,allowExecution:true};
 const request={schemaVersion:'1.0',operation:identity.id,operationVersion:identity.operationVersion,input:{},options:{mode:'inspect'}};
 const result=await executeApprovedOperation(root,request,approval);
 assert.equal(result.status,'executed');
 assert.equal(result.result.status,'success');
 assert.deepEqual(result.result.data,{ok:true});
 assert.equal((await executeApprovedOperation(root,{...request,input:{extra:true}},approval)).code,'INVALID_OPERATION_REQUEST');
 assert.equal((await executeApprovedOperation(root,{...request,options:{mode:'apply'}},approval)).code,'INSTALLED_APPLY_DISABLED');
});

import {cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
test('real feature flag package exposes an executable installed capability',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-flags-installed-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const name='@accelerate/feature-flags-core',dir=path.join(root,'node_modules',name);
 const source=fileURLToPath(new URL('../../packages/feature-flags-core/',import.meta.url));
 await mkdir(path.join(dir,'operations'),{recursive:true});
 for(const file of ['package.json','operations/package-manifest.json','operations/evaluate.mjs'])await cp(path.join(source,file),path.join(dir,file));
 const identity={id:'feature-flags.evaluate',operationVersion:'1.0.0',packageName:name,packageVersion:'0.1.0'};
 const evidence=await inspectHandlerIntegrity(root,identity);
 assert.equal(evidence.status,'inspected');
 const approval={...identity,handler:evidence.entry.handler,exportName:evidence.entry.exportName,sha256:evidence.sha256,manifestSha256:evidence.manifestSha256,allowExecution:true};
 const result=await executeApprovedOperation(root,{schemaVersion:'1.0',operation:identity.id,operationVersion:identity.operationVersion,input:{flag:{key:'dashboard',enabled:false,rules:[{attribute:'role',equals:'admin',enabled:true}]},context:{attributes:{role:'admin'}}},options:{mode:'inspect'}},approval);
 assert.equal(result.status,'executed');
 assert.equal(result.result.status,'success');
 assert.deepEqual(result.result.data,{enabled:true,runtimeWiringVerified:false});
});

import {execFileSync} from 'node:child_process';
test('feature flag npm archive includes discoverable operation artifacts',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-pack-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const source=fileURLToPath(new URL('../../packages/feature-flags-core/',import.meta.url));
 const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',root],{cwd:source,encoding:'utf8'}))[0];
 const files=new Set(packed.files.map(f=>f.path));
 assert.ok(files.has('operations/package-manifest.json'));
 assert.ok(files.has('operations/evaluate.mjs'));
 const dir=path.join(root,'node_modules','@accelerate','feature-flags-core');
 await mkdir(dir,{recursive:true});
 execFileSync('tar',['-xzf',path.join(root,packed.filename),'--strip-components=1','-C',dir]);
 const discovery=await discoverPackageOperations(root,['@accelerate/feature-flags-core']);
 assert.deepEqual(discovery.diagnostics,[]);
 const index=indexOperations(discovery.packages);
 assert.equal(searchOperations(index,{query:'feature-flags.evaluate'}).length,1);
 const identity={id:'feature-flags.evaluate',operationVersion:'1.0.0',packageName:'@accelerate/feature-flags-core',packageVersion:discovery.packages[0].version};
 const evidence=await inspectHandlerIntegrity(root,identity);
 assert.equal(evidence.status,'inspected');
 const approval={...identity,handler:evidence.entry.handler,exportName:evidence.entry.exportName,sha256:evidence.sha256,manifestSha256:evidence.manifestSha256,allowExecution:true};
 const result=await executeApprovedOperation(root,{schemaVersion:'1.0',operation:identity.id,operationVersion:identity.operationVersion,input:{flag:{key:'example',enabled:true}},options:{mode:'inspect'}},approval);
 assert.equal(result.status,'executed');
 assert.equal(result.result.status,'success');
 assert.equal(result.result.data.enabled,true);
});
