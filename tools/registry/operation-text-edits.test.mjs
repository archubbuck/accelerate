import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTextEdits,parseSource,findNodes,transformSource,ensureNamedImport,findSymbolReferences,planLocalRename,rewriteImportModule,planUnusedImportRemoval,planSourceTransforms,compareSemanticDiagnostics} from '../../packages/tooling-ast/src/index.mjs';
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

test('local rename preserves shadowed bindings and rejects collisions',()=>{
 const source='const flag = 1; function f(){ const flag = 2; return flag; } console.log(flag);';
 const files={'/example.ts':source};
 const result=planLocalRename(files,'/example.ts',source.indexOf('flag'),'enabled');
 assert.equal(result.source,'const enabled = 1; function f(){ const flag = 2; return flag; } console.log(enabled);');
 assert.throws(()=>planLocalRename(files,'/example.ts',source.indexOf('flag'),'f'),/RENAME_COLLISION/);
});

test('module rewrite only changes matching static imports',()=>{
 const source="import { x } from 'old'; const label = 'old';";
 assert.equal(rewriteImportModule('a.ts',source,'old','new').source,'import { x } from "new"; const label = \'old\';');
});
test('unused import removal preserves side effects and rejects usage',()=>{
 const options={moduleSpecifier:'pkg',local:'x'};
 assert.equal(planUnusedImportRemoval('a.ts',"import { x } from 'pkg';",options).source,"import 'pkg';");
 assert.throws(()=>planUnusedImportRemoval('a.ts',"import { x } from 'pkg'; console.log(x);",options),/IMPORT_POTENTIALLY_USED/);
});

test('cross-file transforms validate every target before returning a plan',()=>{
 const files={'a.ts':'const a = 1;','b.ts':'const b = 2;'};
 const changes=[{fileName:'a.ts',edits:[{start:10,end:11,expected:'1',text:'3'}]},{fileName:'b.ts',edits:[{start:10,end:11,expected:'2',text:'4'}]}];
 const result=planSourceTransforms(files,changes);
 assert.deepEqual(result.plans.map(p=>p.after),['const a = 3;','const b = 4;']);
 assert.equal(files['a.ts'],'const a = 1;');
 assert.throws(()=>planSourceTransforms(files,[...changes,changes[0]]),/INVALID_TRANSFORM_TARGET/);
 assert.throws(()=>planSourceTransforms(files,[changes[0],{fileName:'b.ts',edits:[{start:10,end:11,expected:'2',text:')'}]}]),/TRANSFORM_PARSE_ERROR/);
});

test('semantic comparison detects introduced type errors',()=>{
 const before={'/a.ts':'const value: number = 1;'};
 const after={'/a.ts':'const value: number = "bad";'};
 const result=compareSemanticDiagnostics(before,after);
 assert.equal(result.passed,false);
 assert.ok(result.introduced.some(d=>d.code===2322));
 assert.equal(compareSemanticDiagnostics(before,before).passed,true);
 assert.equal(result.complete,false);
});
