import {snapshotFile} from '../../../tools/operations/patches.mjs';
export async function generateFlagTests(root,{target,key}){
 const flags=JSON.parse((await snapshotFile(root,target)).content);
 if(!Array.isArray(flags)||flags.filter(f=>f?.key===key).length!==1)return {status:'blocked',data:{key},diagnostics:[{code:'FLAG_DEFINITION_NOT_UNIQUE',severity:'error'}]};
 const flag=flags.find(f=>f.key===key);
 if(typeof flag.enabled!=='boolean'||(flag.rules!==undefined&&(!Array.isArray(flag.rules)||flag.rules.some(r=>!r||typeof r.attribute!=='string'||typeof r.equals!=='string'||typeof r.enabled!=='boolean'))))return {status:'blocked',data:{key},diagnostics:[{code:'INVALID_FLAG_DEFINITION',severity:'error'}]};
 const source=[
 "import test from 'node:test';",
 "import assert from 'node:assert/strict';",
 "import { FeatureFlags } from '@accelerate/feature-flags-core';",
 'const definition = '+JSON.stringify(flag)+';',
 'for (const enabled of [true, false]) {',
 "  test('evaluates default '+enabled, async () => {",
 '    const flags = new FeatureFlags({ get: async () => ({...definition, enabled}) });',
 '    assert.equal(await flags.enabled(definition.key), enabled);',
 '  });',
 '}',
 ''
 ].join('\n');
 return {status:'success',data:{key,framework:'node:test',source,applicationBehaviorVerified:false},diagnostics:[{code:'APPLICATION_TESTS_REQUIRED',severity:'warning',message:'Generated tests exercise flag evaluation, not consumer branch behavior.'}]};
}
