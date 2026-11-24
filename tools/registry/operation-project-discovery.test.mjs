import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {discoverPackages,inspectWorkspace,inspectDependencyGraph,orderDependencies,inspectDependencyImpact,classifyPackage,inspectSourceLayout,discoverSourceFiles,inspectInstalledCapabilities} from '../../packages/tooling-project/src/index.mjs';
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

test('pnpm simple workspace and dependency ordering',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-pnpm-'));
 try{
  await writeFile(path.join(root,'package.json'),'{"name":"root"}');
  await writeFile(path.join(root,'pnpm-workspace.yaml'),"packages:\n  - 'packages/*'\n");
  for(const name of ['a','b']){
   await mkdir(path.join(root,'packages',name),{recursive:true});
   await writeFile(path.join(root,'packages',name,'package.json'),JSON.stringify({name,dependencies:name==='a'?{b:'workspace:*'}:{}}));
  }
  const workspace=await inspectWorkspace(root);
  assert.equal(workspace.workspaceMembershipVerified,true);
  const graph=await inspectDependencyGraph(root,workspace.members.map(p=>p.path));
  assert.deepEqual(orderDependencies(graph).order,['b','a']);
  graph.edges.push({from:'b',to:'a',section:'dependencies',range:'workspace:*'});
  assert.deepEqual(orderDependencies(graph),{order:[],blocked:['a','b'],acyclic:false});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('dependency impact traverses cycles without repeating nodes',()=>{
 const graph={nodes:['app','feature','core'].map(name=>({name,path:name})),edges:[['app','feature'],['feature','core'],['core','feature']].map(([from,to])=>({from,to,section:'dependencies',range:'workspace:*'})),resolutionVerified:false};
 const impact=inspectDependencyImpact(graph,'core');
 assert.deepEqual(impact.dependents,[{name:'feature',distance:1},{name:'app',distance:2}]);
 assert.deepEqual(impact.dependencies,[{name:'feature',distance:1}]);
 assert.throws(()=>inspectDependencyImpact(graph,'missing'),/INVALID_GRAPH_TARGET/);
});

test('package classification retains evidence and multiple roles',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-role-'));
 try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'app',private:true,exports:'./index.js',scripts:{start:'node index.js'},dependencies:{react:'^19.0.0'}}));
  const result=await classifyPackage(root);
  assert.deepEqual(result.roles,['library','application']);
  assert.equal(result.verified,false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('source layout reports explicit config evidence without resolving extends',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-layout-'));
 try{
  await mkdir(path.join(root,'src'));
  await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({extends:'./base.json',compilerOptions:{rootDir:'src'},include:['src/**/*']}));
  await writeFile(path.join(root,'tsconfig.bad.json'),'{ invalid');
  const result=await inspectSourceLayout(root);
  assert.deepEqual(result.roots,['src']);
  assert.equal(result.configs[0].extends,'./base.json');
  assert.equal(result.configurationResolved,false);
  assert.equal(result.diagnostics[0].code,'CONFIG_UNSUPPORTED_OR_UNREADABLE');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('source discovery bounds scope and excludes generated directories',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-sources-'));
 try{
  await mkdir(path.join(root,'src','dist'),{recursive:true});
  for(const file of ['src/a.ts','src/b.tsx','src/dist/generated.ts','src/notes.txt'])await writeFile(path.join(root,file),'');
  assert.deepEqual((await discoverSourceFiles(root)).files,['src/a.ts','src/b.tsx']);
  assert.equal((await discoverSourceFiles(root,{maxFiles:1})).complete,false);
  await assert.rejects(discoverSourceFiles(root,{roots:['../outside']}),/INVALID_SOURCE_SCOPE/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('installed capability discovery does not execute handlers',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'accelerate-capabilities-'));
 try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{'@accelerate/example':'1.0.0'}}));
  const dir=path.join(root,'node_modules/@accelerate/example');
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'@accelerate/example',version:'1.0.0',accelerate:{operations:'./operations.json'}}));
  await writeFile(path.join(dir,'operations.json'),'{}');
  const result=await inspectInstalledCapabilities(root);
  assert.equal(result.packages[0].status,'declared');
  assert.equal(result.handlersLoaded,false);
  await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'@accelerate/example',version:'1.0.0',accelerate:{operations:'./../outside.json'}}));
  assert.equal((await inspectInstalledCapabilities(root)).packages[0].status,'invalid');
 }finally{await rm(root,{recursive:true,force:true});}
});
