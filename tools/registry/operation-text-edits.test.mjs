import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTextEdits,parseSource,findNodes,transformSource} from '../../packages/tooling-ast/src/index.mjs';
test('preserves unrelated source and orders edits',()=>{
 assert.equal(applyTextEdits('abc def',[{start:4,end:7,expected:'def',text:'XYZ'},{start:0,end:3,expected:'abc',text:'123'}]),'123 XYZ');
});
test('rejects stale and overlapping edits',()=>{
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:1,expected:'z',text:'x'}]));
 assert.throws(()=>applyTextEdits('abc',[{start:0,end:2,expected:'ab',text:'x'},{start:1,end:3,expected:'bc',text:'y'}]));
});

test('parser and traversal expose syntax evidence',()=>{
 const {ast,diagnostics}=parseSource('example.ts','const x = 1;');
 assert.deepEqual(diagnostics,[]);
 assert.ok(findNodes(ast,n=>n.getText(ast)==='x').length);
 assert.ok(parseSource('example.ts','const = ;').diagnostics.length);
});
test('validated transformation rejects invalid output',()=>{
 assert.equal(transformSource('example.ts','const x = 1;',[{start:10,end:11,expected:'1',text:'2'}]),'const x = 2;');
 assert.throws(()=>transformSource('example.ts','const x = 1;',[{start:10,end:11,expected:'1',text:')'}]),/TRANSFORM_PARSE_ERROR/);
});
