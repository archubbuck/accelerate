import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeBuiltin} from '../operations/builtins.mjs';
test('usage audit reports candidates without asserting safe removal',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-audit-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'flags.json'),JSON.stringify([{key:'used',enabled:true},{key:'unused',enabled:false}]));
 await writeFile(path.join(root,'app.ts'),'flags.enabled("used"); flags.enabled("missing"); flags.enabled(dynamicKey);');
 const run=operation=>executeBuiltin(root,{schemaVersion:'1.0',operation,operationVersion:'1.0.0',input:{target:'flags.json',files:['app.ts'],receivers:['flags']}});
 const unused=await run('feature-flags.find-unused');
 assert.deepEqual(unused.data.candidates,['unused']);
 assert.equal(unused.data.safeToRemove,false);
 assert.equal(unused.data.complete,false);
 assert.equal(unused.data.unresolved.length,1);
 assert.deepEqual((await run('feature-flags.find-unregistered')).data.candidates,['missing']);
});
