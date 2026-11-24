import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {discoverPackages,inspectWorkspace,inspectDependencyGraph} from '../../packages/tooling-project/src/index.mjs';
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

test('workspace membership and declared internal dependencies',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-workspace-'));
 try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'root',workspaces:['packages/*']}));
  for(const [dir,manifest] of [['packages/a',{name:'a',dependencies:{b:'workspace:*'}}],['packages/b',{name:'b'}],['other',{name:'other'}]]){
   await mkdir(path.join(root,dir),{recursive:true});
   await writeFile(path.join(root,dir,'package.json'),JSON.stringify(manifest));
  }
  const result=await inspectWorkspace(root);
  assert.equal(result.workspaceMembershipVerified,true);
  assert.deepEqual(result.members.map(p=>p.name),['a','b']);
  const graph=await inspectDependencyGraph(root,result.members.map(p=>p.path));
  assert.deepEqual(graph.edges,[{from:'a',to:'b',section:'dependencies',range:'workspace:*'}]);
  await assert.rejects(inspectDependencyGraph(root,['../outside']),/INVALID_PACKAGE_PATHS/);
 }finally{await rm(root,{recursive:true,force:true});}
});
