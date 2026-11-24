import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import path from 'node:path';
import {acquireProjectLock,inspectProjectLock} from '../../packages/tooling-patches/src/lock.mjs';
test('lock ownership and contention',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-lock-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal((await inspectProjectLock(root)).status,'absent');
 const lock=await acquireProjectLock(root);
 try{
  assert.deepEqual(await inspectProjectLock(root),{status:'active',pid:process.pid});
  await assert.rejects(acquireProjectLock(root),{code:'EEXIST'});
 }finally{await lock.release();}
 assert.equal((await inspectProjectLock(root)).status,'absent');
 const file=path.join(root,'.accelerate-operation.lock');
 await writeFile(file,'');
 assert.equal((await inspectProjectLock(root)).status,'unknown');
 await writeFile(file,JSON.stringify({schemaVersion:1,pid:process.pid,host:hostname()+'-other',token:'test'}));
 assert.equal((await inspectProjectLock(root)).status,'unknown');
});
