import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackageOperations} from '../../packages/tooling-registry/src/index.mjs';
test('package operation manifests enforce identity and safe handler declarations',()=>{
 const identity={name:'@accelerate/example',version:'1.0.0'};
 const entry={manifest:{id:'example.inspect',version:'1.0.0',package:identity.name,description:'Inspect',mutatesProject:false,modes:['inspect'],inputSchema:{type:'object'},outputSchema:{type:'object'}},handler:'./operations/inspect.mjs',exportName:'inspect'};
 const doc={schemaVersion:'1.0',package:identity.name,packageVersion:identity.version,operations:[entry]};
 assert.deepEqual(validatePackageOperations(doc,identity),[]);
 assert.ok(validatePackageOperations({...doc,operations:[entry,entry]},identity).length);
 assert.ok(validatePackageOperations({...doc,operations:[{...entry,handler:'./../outside.mjs'}]},identity).length);
 assert.ok(validatePackageOperations(doc,{...identity,version:'2.0.0'}).length);
});
