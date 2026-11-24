import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {discoverPackages} from '../../packages/tooling-project/src/index.mjs';
test('discovers candidate packages and excludes dependency directories',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-discovery-'));
 try{
  for(const dir of ['apps/web','packages/core','node_modules/ignored']){
   await mkdir(path.join(root,dir),{recursive:true});
   await writeFile(path.join(root,dir,'package.json'),JSON.stringify({name:dir}));
  }
  const result=await discoverPackages(root);
  assert.deepEqual(result.packages.map(p=>p.path),['apps/web','packages/core']);
  assert.equal(result.workspaceMembershipVerified,false);
  assert.equal((await discoverPackages(root,{maxDepth:0})).complete,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
