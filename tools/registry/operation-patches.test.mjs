import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {planReplacement,verifyPlan,snapshotFile} from '../operations/patches.mjs';
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-patch-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'flags.json'),'[]\n');
 return root;
}
test('preview is read-only and deterministic',async t=>{
 const root=await fixture(t);
 const transform=()=> '[{"key":"dashboard","enabled":false}]\n';
 const plan=await planReplacement(root,'flags.json',transform);
 assert.deepEqual(plan,await planReplacement(root,'flags.json',transform));
 assert.equal(await readFile(path.join(root,'flags.json'),'utf8'),'[]\n');
 assert.deepEqual(await verifyPlan(root,[plan]),[]);
 assert.equal(await planReplacement(root,'flags.json',x=>x),null);
});
test('stale, duplicate and tampered patches fail verification',async t=>{
 const root=await fixture(t);
 const plan=await planReplacement(root,'flags.json',()=> '[1]');
 assert.equal((await verifyPlan(root,[plan,plan]))[0].code,'INVALID_PATCH');
 assert.equal((await verifyPlan(root,[{...plan,content:'tampered'}]))[0].code,'INVALID_PATCH');
 await writeFile(path.join(root,'flags.json'),'[2]');
 assert.equal((await verifyPlan(root,[plan]))[0].code,'STALE_PATCH');
});
test('unsafe paths and symlinks are rejected',async t=>{
 const root=await fixture(t);
 for(const target of ['../flags.json','/etc/passwd','a/../flags.json','a\\flags.json','.','C:flags.json']) await assert.rejects(snapshotFile(root,target),/INVALID_PATH/);
 await symlink(path.join(root,'flags.json'),path.join(root,'link.json'));
 await assert.rejects(snapshotFile(root,'link.json'),/UNSAFE_PATH/);
});
