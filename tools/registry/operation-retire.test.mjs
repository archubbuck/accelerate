import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeBuiltin} from '../operations/builtins.mjs';
test('retirement retains selected block and rejects unsupported usages',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-retire-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'flags.json'),'[{"key":"old","enabled":false}]');
 const file=path.join(root,'app.ts');
 const source='async function run(){ if(await flags.enabled("old")) { modern(); } else { legacy(); } }';
 await writeFile(file,source);
 const run=retainBehavior=>executeBuiltin(root,{schemaVersion:'1.0',operation:'feature-flags.retire',operationVersion:'1.0.0',input:{target:'flags.json',key:'old',files:['app.ts'],receivers:['flags'],retainBehavior}});
 for(const [behavior,expected] of [['enabled','modern'],['disabled','legacy']]){
  const result=await run(behavior);
  assert.equal(result.status,'success');
  assert.deepEqual(JSON.parse(result.changes[0].content),[]);
  assert.equal(result.changes[1].content,'async function run(){ { '+expected+'(); } }');
  assert.equal(result.data.applySupported,false);
 }
 assert.equal(await readFile(file,'utf8'),source);
 await writeFile(file,'const result = flags.enabled("old");');
 assert.equal((await run('enabled')).status,'blocked');
});
