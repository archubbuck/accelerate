import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeBuiltin} from '../operations/builtins.mjs';
test('AST usage discovery distinguishes literal, dynamic and unrelated calls',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-usages-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'app.ts'),[
 'flags.enabled("dashboard");',
 'flags.enabled(dynamicKey);',
 'other.enabled("unrelated");',
 '// flags.enabled("comment");',
 'flags.enabled(`notifications`);'
 ].join('\n'));
 const request={schemaVersion:'1.0',operation:'feature-flags.find-usages',operationVersion:'1.0.0',input:{files:['app.ts'],receivers:['flags']}};
 const result=await executeBuiltin(root,request);
 assert.equal(result.status,'success');
 assert.deepEqual(result.data.usages.map(x=>x.key),['dashboard','notifications']);
 assert.equal(result.data.unresolved.length,1);
 assert.equal(result.data.complete,false);
 assert.equal(result.data.usages[0].line,1);
 const filtered=await executeBuiltin(root,{...request,input:{...request.input,key:'dashboard'}});
 assert.equal(filtered.data.usages.length,1);
});
