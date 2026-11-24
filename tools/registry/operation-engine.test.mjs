import test from 'node:test';
import assert from 'node:assert/strict';
import {OperationRegistry,executeOperation,validateManifest} from '../operations/engine.mjs';
const manifest={id:'feature-flags.list',version:'1.0.0',package:'@accelerate/feature-flags-core',description:'List flags',mutatesProject:false,modes:['preview','inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}};
const request={schemaVersion:'1.0',operation:manifest.id,operationVersion:manifest.version,input:{}};
const validator=(schema,value)=>schema.type==='object'&&value!==null&&typeof value==='object'&&!Array.isArray(value);
test('registry validates ownership, rejects duplicates and isolates metadata',()=>{
 const registry=new OperationRegistry();
 registry.register(manifest,()=>({status:'success'}));
 assert.throws(()=>registry.register(manifest,()=>({})),/Duplicate/);
 const list=registry.list();list[0].description='changed';
 assert.equal(registry.list()[0].description,'List flags');
 assert.ok(validateManifest({...manifest,modes:['apply']}).length);
});
test('engine resolves and validates operation',async()=>{
 const registry=new OperationRegistry();
 registry.register(manifest,()=>({status:'success',data:{flags:[]}}));
 assert.deepEqual((await executeOperation(registry,request,{validateSchema:validator})).data,{flags:[]});
 assert.equal((await executeOperation(registry,request)).status,'blocked');
 assert.equal((await executeOperation(registry,{...request,operationVersion:'2.0.0'},{validateSchema:validator})).status,'unsupported');
});
test('mutation is blocked before handler execution',async()=>{
 const registry=new OperationRegistry();let called=false;
 registry.register({...manifest,mutatesProject:true,modes:['preview','apply']},()=>{called=true;return {status:'success'}});
 const result=await executeOperation(registry,{...request,options:{mode:'apply'}},{validateSchema:validator});
 assert.equal(result.diagnostics[0].code,'PATCH_ENGINE_REQUIRED');assert.equal(called,false);
});
test('invalid schema and handler failures are structured',async()=>{
 const registry=new OperationRegistry();
 registry.register(manifest,()=>{throw new Error('secret detail')});
 assert.equal((await executeOperation(registry,request,{validateSchema:()=>false})).diagnostics[0].code,'INVALID_INPUT');
 const result=await executeOperation(registry,request,{validateSchema:validator});
 assert.equal(result.diagnostics[0].code,'EXECUTION_FAILED');
 assert.ok(!JSON.stringify(result).includes('secret detail'));
});

test('registration rejects invalid nested schemas and duplicate modes',()=>{
 const registry=new OperationRegistry();
 assert.throws(()=>registry.register({...manifest,inputSchema:{properties:{optional:{pattern:'x'}}}},()=>({})),/inputSchema/);
 assert.throws(()=>registry.register({...manifest,modes:['preview','preview']},()=>({})),/modes/);
});
test('failure diagnostics survive strict success payload schema',async()=>{
 const registry=new OperationRegistry();
 registry.register({...manifest,outputSchema:{type:'object',required:['flags']}},()=>({status:'blocked',diagnostics:[{code:'REVIEW_REQUIRED',severity:'error'}]}));
 const result=await executeOperation(registry,request,{validateSchema:(schema,value)=>!schema.required||schema.required.every(k=>Object.hasOwn(value,k))});
 assert.equal(result.status,'blocked');
 assert.equal(result.diagnostics[0].code,'REVIEW_REQUIRED');
});
