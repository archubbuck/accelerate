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
 const approval={...request,handler:entry.handler,exportName:entry.exportName,sha256:evidence.sha256,allowExecution:true};
 assert.equal(authorizeHandler(evidence,approval),true);
 assert.equal(authorizeHandler(evidence,{...approval,allowExecution:false}),false);
 assert.equal(authorizeHandler(evidence,{...approval,exportName:'other'}),false);
 await writeFile(path.join(dir,'handler.mjs'),'export function inspect() {}');
 assert.equal(authorizeHandler(await inspectHandlerIntegrity(root,request),approval),false);
});
