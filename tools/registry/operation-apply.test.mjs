import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {planReplacement} from '../operations/patches.mjs';
import {applyReplacements} from '../operations/apply.mjs';
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-apply-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'a.json'),'[]');
 await writeFile(path.join(root,'b.json'),'[]');
 return root;
}
test('explicit apply required; successful replacement verifies content',async t=>{
 const root=await fixture(t);
 const changes=[await planReplacement(root,'a.json',()=> '[1]')];
 assert.equal((await applyReplacements(root,changes)).status,'blocked');
 assert.equal(await readFile(path.join(root,'a.json'),'utf8'),'[]');
 assert.equal((await applyReplacements(root,changes,{apply:true})).status,'success');
 assert.equal(await readFile(path.join(root,'a.json'),'utf8'),'[1]');
 assert.equal((await applyReplacements(root,changes,{apply:true})).status,'conflict');
});
test('failed verification restores both files',async t=>{
 const root=await fixture(t);
 const changes=await Promise.all(['a.json','b.json'].map(p=>planReplacement(root,p,()=> '[1]')));
 assert.equal((await applyReplacements(root,changes,{apply:true,verify:()=>false})).status,'failed');
 for(const p of ['a.json','b.json']) assert.equal(await readFile(path.join(root,p),'utf8'),'[]');
});
test('rollback preserves external modifications and reports conflict',async t=>{
 const root=await fixture(t);
 const changes=[await planReplacement(root,'a.json',()=> '[1]')];
 const result=await applyReplacements(root,changes,{apply:true,verify:async()=>{await writeFile(path.join(root,'a.json'),'[2]');return false;}});
 assert.equal(result.status,'partial');
 assert.equal(result.diagnostics[1].code,'ROLLBACK_CONFLICT');
 assert.equal(await readFile(path.join(root,'a.json'),'utf8'),'[2]');
});
test('existing lock blocks writes',async t=>{
 const root=await fixture(t);
 await writeFile(path.join(root,'.accelerate-operation.lock'),'');
 assert.equal((await applyReplacements(root,[],{apply:true})).status,'blocked');
});
