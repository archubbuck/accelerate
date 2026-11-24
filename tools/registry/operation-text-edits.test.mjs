import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTextEdits} from '../../packages/tooling-ast/src/index.mjs';
test('preserves unrelated source and orders edits',()=>{
 assert.equal(applyTextEdits('abc def',[{start:4,end:7,expected:'def',text:'XYZ'},{start:0,end:3,expected:'abc',text:'123'}]),'123 XYZ');
});
test('rejects stale and overlapping edits',()=>{
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:1,expected:'z',text:'x'}]));
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:2,expected:'ab',text:'x'},{start:1,end:3,expected:'bc',text:'y'}]));
});
