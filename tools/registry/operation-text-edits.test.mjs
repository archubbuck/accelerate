import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTextEdits,parseSource,findNodes,transformSource,ensureNamedImport,findSymbolReferences} from '../../packages/tooling-ast/src/index.mjs';
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

test('named imports preserve directives and are idempotent',()=>{
 const options={moduleSpecifier:'@accelerate/feature-flags-core',imported:'FeatureFlags'};
 const original='"use client";\nconst x = 1;\n';
 const result=ensureNamedImport('example.ts',original,options);
 assert.ok(result.startsWith('"use client";'));
 assert.ok(result.includes('import { FeatureFlags } from "@accelerate/feature-flags-core";'));
 assert.equal(ensureNamedImport('example.ts',result,options),result);
 assert.throws(()=>ensureNamedImport('example.ts','const FeatureFlags = 1;',options),/IMPORT_BINDING_CONFLICT/);
});

test('symbol references exclude shadowed identifiers',()=>{
 const source='const flag = 1; function f(){ const flag = 2; return flag; } console.log(flag);';
 const result=findSymbolReferences({'/example.ts':source},'/example.ts',source.indexOf('flag'));
 assert.equal(result.resolved,true);
 assert.deepEqual(result.references.map(r=>r.start),[source.indexOf('flag'),source.lastIndexOf('flag')]);
 assert.equal(result.complete,false);
});

test('virtual relative imports resolve to exported symbol identity',()=>{
 const files={'/src/a.ts':'export const flag = true;','/src/b.ts':"import { flag as localFlag } from './a'; console.log(localFlag);"};
 const result=findSymbolReferences(files,'/src/a.ts',files['/src/a.ts'].indexOf('flag'));
 assert.equal(result.resolved,true);
 assert.ok(result.references.some(r=>r.fileName==='/src/b.ts'&&r.text==='localFlag'));
});
