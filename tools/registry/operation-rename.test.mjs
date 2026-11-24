import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {executeBuiltin} from '../operations/builtins.mjs';
import {applyTextEdits} from '../operations/text-edits.mjs';
test('guarded edits reject stale and overlapping ranges',()=>{
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:1,expected:'z',text:'x'}]));
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:2,expected:'ab',text:'x'},{start:1,end:3,expected:'bc',text:'y'}]));
});
test('rename preview preserves unrelated source and reports dynamic keys',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-rename-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const source='// old\nflags.enabled("old");\nother.enabled("old");\nflags.enabled(dynamic);\n';
 await writeFile(path.join(root,'app.ts'),source);
 const result=await executeBuiltin(root,{schemaVersion:'1.0',operation:'feature-flags.preview-usage-rename',operationVersion:'1.0.0',input:{files:['app.ts'],receivers:['flags'],key:'old',newKey:'new'}});
 assert.equal(result.status,'success');
 assert.equal(result.changes[0].content,source.replace('flags.enabled("old")','flags.enabled("new")'));
 assert.equal(result.data.complete,false);
 assert.ok(result.diagnostics.some(d=>d.code==='DYNAMIC_FLAG_KEY'));
 assert.equal(await readFile(path.join(root,'app.ts'),'utf8'),source);
});

test('coordinated rename previews registry and source changes and rejects collisions',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-coordinated-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const flags=[{key:'old',enabled:false,rules:[{attribute:'role',equals:'admin',enabled:true}]},{key:'taken',enabled:true}];
 await writeFile(path.join(root,'flags.json'),JSON.stringify(flags));
 await writeFile(path.join(root,'app.ts'),'flags.enabled("old");');
 const request={schemaVersion:'1.0',operation:'feature-flags.rename',operationVersion:'1.0.0',input:{target:'flags.json',files:['app.ts'],receivers:['flags'],key:'old',newKey:'new'}};
 const result=await executeBuiltin(root,request);
 assert.equal(result.status,'success');
 assert.equal(result.changes.length,2);
 assert.deepEqual(JSON.parse(result.changes[0].content),[{...flags[0],key:'new'},flags[1]]);
 assert.equal(result.changes[1].content,'flags.enabled("new");');
 assert.equal(result.data.applySupported,false);
 assert.equal((await executeBuiltin(root,{...request,input:{...request.input,newKey:'taken'}})).status,'conflict');
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'flags.json'),'utf8')),flags);
});
