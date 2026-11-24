import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBuiltinRegistry,executeBuiltin} from '../operations/builtins.mjs';
import {validateSchema} from '../operations/schema.mjs';
test('schema subset rejects unknown keywords and invalid inputs',()=>{
 const schema={type:'object',required:['enabled'],additionalProperties:false,properties:{enabled:{type:'boolean'}}};
 assert.equal(validateSchema(schema,{enabled:false}),true);
 for(const input of [{},{enabled:'false'},{enabled:true,extra:1}]) assert.equal(validateSchema(schema,input),false);
 assert.equal(validateSchema({type:'string',pattern:'x'},'x'),false);
});
test('registered feature flag operation previews without writing',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-builtin-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'flags.json'),'[]');
 const registry=await createBuiltinRegistry(root);
 assert.ok(registry.list().some(x=>x.id==='feature-flags.register'));
 const request={schemaVersion:'1.0',operation:'feature-flags.register',operationVersion:'1.0.0',input:{target:'flags.json',key:'dashboard.redesign',enabled:false}};
 const result=await executeBuiltin(root,request);
 assert.equal(result.status,'success');
 assert.deepEqual(JSON.parse(result.changes[0].content),[{key:'dashboard.redesign',enabled:false}]);
 assert.equal(result.data.registrationVerified,false);
 assert.equal(await readFile(path.join(root,'flags.json'),'utf8'),'[]');
 assert.equal((await executeBuiltin(root,{...request,input:{...request.input,enabled:'false'}})).diagnostics[0].code,'INVALID_INPUT');
 await writeFile(path.join(root,'flags.json'),result.changes[0].content);
 assert.equal((await executeBuiltin(root,request)).status,'no-op');
 assert.equal((await executeBuiltin(root,{...request,options:{mode:'apply'}})).status,'no-op');
});

test('registration and update apply through journaled executor',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-apply-builtin-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,'flags.json');
 await writeFile(file,'[]');
 const request={schemaVersion:'1.0',operation:'feature-flags.register',operationVersion:'1.0.0',input:{target:'flags.json',key:'dashboard',enabled:false},options:{mode:'apply'}};
 assert.equal((await executeBuiltin(root,request)).status,'success');
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')),[{key:'dashboard',enabled:false}]);
 assert.equal((await executeBuiltin(root,request)).status,'no-op');
 assert.equal((await executeBuiltin(root,{...request,operation:'feature-flags.update',input:{...request.input,enabled:true}})).status,'success');
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')),[{key:'dashboard',enabled:true}]);
 await assert.rejects(readFile(path.join(root,'.accelerate-operation-journal.json')),{code:'ENOENT'});
});

test('project operations expose read-only inspection through the engine',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-project-operations-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'package.json'),'{"name":"example"}');
 await writeFile(path.join(root,'tsconfig.json'),'{"compilerOptions":{"strict":true}}');
 const registry=await createBuiltinRegistry(root);
 for(const id of ['workspace','classify','source-layout','capabilities','config-inheritance','source-files']){
  const manifest=registry.list().find(x=>x.id==='project.'+id);
  assert.ok(manifest);
  assert.equal(manifest.mutatesProject,false);
  assert.ok(!manifest.modes.includes('apply'));
 }
 const request={schemaVersion:'1.0',operation:'project.config-inheritance',operationVersion:'1.0.0',input:{}};
 const result=await executeBuiltin(root,request);
 assert.equal(result.status,'success');
 assert.equal(result.data.declaredCompilerOptions.strict,true);
 assert.equal((await executeBuiltin(root,{...request,input:{configPath:'../outside.json'}})).status,'partial');
});
