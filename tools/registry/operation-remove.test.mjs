import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeBuiltin} from '../operations/builtins.mjs';
test('removal blocks known and dynamic references and otherwise previews only',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-remove-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const flags=[{key:'old',enabled:false},{key:'keep',enabled:true}];
 await writeFile(path.join(root,'flags.json'),JSON.stringify(flags));
 const file=path.join(root,'app.ts');
 const run=()=>executeBuiltin(root,{schemaVersion:'1.0',operation:'feature-flags.remove',operationVersion:'1.0.0',input:{target:'flags.json',files:['app.ts'],receivers:['flags'],key:'old'}});
 for(const source of ['flags.enabled("old");','flags.enabled(dynamic);']){
  await writeFile(file,source);
  assert.equal((await run()).status,'blocked');
 }
 await writeFile(file,'flags.enabled("keep");');
 const result=await run();
 assert.equal(result.status,'success');
 assert.equal(result.data.applySupported,false);
 assert.deepEqual(JSON.parse(result.changes[0].content),[flags[1]]);
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'flags.json'),'utf8')),flags);
});
