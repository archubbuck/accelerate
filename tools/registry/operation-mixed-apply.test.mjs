import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {planCreation,planDeletion,planRename,planReplacement,applyMixedPlan} from '../../packages/tooling-patches/src/index.mjs';
for(const rollback of [false,true])test('mixed apply rollback='+rollback,async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-apply-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const f of ['a','b','c'])await writeFile(path.join(root,f),f);
 const changes=[await planCreation(root,'new','new'),await planReplacement(root,'a',()=> 'updated'),await planDeletion(root,'b'),await planRename(root,'c','renamed')];
 assert.equal((await applyMixedPlan(root,changes)).status,'blocked');
 const result=await applyMixedPlan(root,changes,{apply:true,verify:()=>!rollback});
 assert.equal(result.status,rollback?'failed':'success');
 const read=f=>readFile(path.join(root,f),'utf8');
 assert.equal(await read('a'),rollback?'a':'updated');
 if(rollback){assert.equal(await read('b'),'b');assert.equal(await read('c'),'c');await assert.rejects(read('new'),{code:'ENOENT'});await assert.rejects(read('renamed'),{code:'ENOENT'});}
 else{assert.equal(await read('new'),'new');assert.equal(await read('renamed'),'c');await assert.rejects(read('b'),{code:'ENOENT'});await assert.rejects(read('c'),{code:'ENOENT'});}
 await assert.rejects(read('.accelerate-operation.lock'),{code:'ENOENT'});
});
