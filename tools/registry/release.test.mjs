import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {releasePlan,classifyLookup,publicationTargets} from './release.mjs';
test('registry release includes new packages in dependency order and detects generated manifests',()=>{const root=mkdtempSync(join(tmpdir(),'release-'));try{const packages=['a','z'].map(id=>({id,name:'@accelerate/'+id,version:'1.0.0',path:'packages/'+id,dependencies:id==='a'?['z']:[]}));for(const p of packages){const dir=join(root,p.path);mkdirSync(dir,{recursive:true});const manifest=JSON.stringify({name:p.name,version:p.version,publishConfig:{access:'public'}});writeFileSync(join(dir,'package.json'),manifest);if(p.id==='z'){mkdirSync(join(dir,'dist'));writeFileSync(join(dir,'dist/package.json'),manifest);}}const plan=releasePlan(root,{packages});assert.deepEqual(plan.map(p=>p.id),['z','a']);assert.equal(plan[0].dir,join(root,'packages/z/dist'));}finally{rmSync(root,{recursive:true,force:true});}});
test('only a confirmed npm 404 permits publication',()=>{assert.equal(classifyLookup(0,'"1.0.0"',''),'published');assert.equal(classifyLookup(1,'{"error":{"code":"E404"}}',''),'missing');assert.throws(()=>classifyLookup(1,'','network error'));});

test('preview publication excludes stable packages and ordinary publication excludes previews', () => {
  const stable = { id: 'stable', tag: 'latest' };
  const pilot = { id: 'pilot', tag: 'next' };
  assert.deepEqual(publicationTargets([stable, pilot], 'publish'), [stable]);
  assert.deepEqual(publicationTargets([stable, pilot], 'publish-preview'), [pilot]);
});
