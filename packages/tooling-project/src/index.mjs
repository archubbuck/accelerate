import {lstat,realpath,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
async function readManifest(base){
 const file=path.join(base,'package.json'),stat=await lstat(file);
 if(!stat.isFile()||stat.size>1024*1024)throw new Error('INVALID_MANIFEST');
 return JSON.parse(await readFile(file,'utf8'));
}
const markers=['pnpm-lock.yaml','package-lock.json','yarn.lock','bun.lock','pnpm-workspace.yaml','nx.json','angular.json','tsconfig.json','next.config.js','next.config.mjs','next.config.ts'];
export async function inspectProject(root){
 const base=await realpath(root);
 const entries=await readdir(base,{withFileTypes:true});
 const names=new Set(entries.filter(e=>e.isFile()).map(e=>e.name));
 const manifest=await readManifest(base);
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)) throw new Error('INVALID_MANIFEST');
 const dependencies=[];
 for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
   for(const [name,range] of Object.entries(manifest[section]??{})){
     if(typeof range==='string') dependencies.push({name,range,section});
   }
 }
 const declared=new Set(dependencies.map(d=>d.name));
 const frameworks=[['angular','@angular/core'],['react','react'],['next','next'],['express','express'],['nestjs','@nestjs/core']].filter(([,pkg])=>declared.has(pkg)).map(([name])=>name);
 const installed=[];
 for(const name of [...declared].filter(n=>/^@accelerate\/[a-z0-9-]+$/.test(n)).sort()){
   try{
     const file=path.join(base,'node_modules',name,'package.json');
     const stat=await lstat(file);
     if(!stat.isFile()||stat.size>1024*1024) continue;
     const pkg=JSON.parse(await readFile(file,'utf8'));
     if(pkg.name===name&&typeof pkg.version==='string') installed.push({name,version:pkg.version});
   }catch{/* absence is not evidence of noninstallation */}
 }
 return {name:typeof manifest.name==='string'?manifest.name:null,packageManager:typeof manifest.packageManager==='string'?manifest.packageManager:null,markers:markers.filter(n=>names.has(n)),frameworks,frameworkEvidence:'declared-dependencies',accelerateDependencies:dependencies.filter(d=>d.name.startsWith('@accelerate/')).sort((a,b)=>a.name.localeCompare(b.name,'en')||a.section.localeCompare(b.section,'en')),installed,limitations:['Root manifest only; workspace members and lockfile resolutions are not inspected','Installed versions are local package metadata, not verified runtime compatibility']};
}

/** Discover candidate package boundaries without following symlinks or scanning dependencies. */
export async function discoverPackages(root,{maxDepth=5,maxDirectories=2000}={}){
 if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>20||!Number.isInteger(maxDirectories)||maxDirectories<1||maxDirectories>100000)throw new Error('INVALID_DISCOVERY_LIMIT');
 const base=await realpath(root),packages=[],diagnostics=[];
 const queue=[{relative:'.',depth:0}];
 let visited=0;
 const excluded=new Set(['node_modules','dist','build','coverage','vendor']);
 while(queue.length&&visited<maxDirectories){
  const {relative,depth}=queue.shift(),dir=path.join(base,relative);
  visited++;
  let entries;
  try{
   if(!(await lstat(dir)).isDirectory())throw new Error('UNSAFE_DIRECTORY');
   entries=await readdir(dir,{withFileTypes:true});
  }catch{diagnostics.push({path:relative,code:'DIRECTORY_UNREADABLE'});continue;}
  if(entries.some(e=>e.name==='package.json'&&e.isFile())){
   try{packages.push({path:relative,...await inspectProject(dir)});}
   catch{diagnostics.push({path:relative,code:'MANIFEST_INVALID'});}
  }
  const children=entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')&&!excluded.has(e.name)).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if(depth===maxDepth){if(children.length)diagnostics.push({path:relative,code:'DEPTH_LIMIT'});continue;}
  for(const child of children)queue.push({relative:relative==='.'?child.name:relative+'/'+child.name,depth:depth+1});
 }
 if(queue.length)diagnostics.push({path:'.',code:'DIRECTORY_LIMIT'});
 return {packages,diagnostics,visited,complete:diagnostics.length===0,workspaceMembershipVerified:false};
}

/** Resolve a deliberately limited subset of package.json workspace patterns. */
export async function inspectWorkspace(root,options={}){
 const base=await realpath(root),manifest=await readManifest(base),discovery=await discoverPackages(base,options);
 let patterns=Array.isArray(manifest.workspaces)?manifest.workspaces:manifest.workspaces?.packages;
 const diagnostics=[...discovery.diagnostics];
 let pnpm=false;
 try{await lstat(path.join(base,'pnpm-workspace.yaml'));pnpm=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(pnpm){
  try{const file=path.join(base,'pnpm-workspace.yaml'),stat=await lstat(file);if(!stat.isFile()||stat.size>1048576)throw Error('INVALID_WORKSPACE');const yaml=await readFile(file,'utf8');const lines=yaml.split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));if(lines[0]?.trim()!=='packages:')throw Error('UNSUPPORTED_YAML');patterns=lines.slice(1).map(l=>{const match=/^ +-[ \t]+(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_.*\/-]+))\s*$/.exec(l);if(!match)throw Error('UNSUPPORTED_YAML');return match[1]??match[2]??match[3];});if(!patterns.length)throw Error('EMPTY_WORKSPACE');}catch{patterns=null;}
 }
 if(!Array.isArray(patterns)||patterns.some(p=>typeof p!=='string'||!p.split('/').every(s=>s==='*'||/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))){
  diagnostics.push({path:'.',code:pnpm?'PNPM_WORKSPACE_UNSUPPORTED':'WORKSPACE_PATTERNS_UNSUPPORTED'});
  return {...discovery,diagnostics,members:[],workspaceMembershipVerified:false};
 }
 const members=discovery.packages.filter(p=>p.path!=='.'&&patterns.some(pattern=>{
  const a=pattern.split('/'),b=p.path.split('/');
  return a.length===b.length&&a.every((part,i)=>part==='*'||part===b[i]);
 }));
 return {...discovery,members,diagnostics,workspaceMembershipVerified:discovery.complete};
}

/** Build declared internal dependency edges from explicitly selected package boundaries. */
export async function inspectDependencyGraph(root,packagePaths){
 if(!Array.isArray(packagePaths)||packagePaths.some(p=>typeof p!=='string'||(p!=='.'&&!p.split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))))throw new Error('INVALID_PACKAGE_PATHS');
 const base=await realpath(root),nodes=[],edges=[],names=new Map();
 for(const relative of [...new Set(packagePaths)].sort()){
  const dir=path.join(base,relative);
  if(await realpath(dir)!==dir)throw new Error('UNSAFE_PACKAGE_PATH');
  const manifest=await readManifest(dir);
  if(typeof manifest.name!=='string'||!manifest.name||names.has(manifest.name))throw new Error('INVALID_OR_DUPLICATE_PACKAGE_NAME');
  names.set(manifest.name,relative);
  nodes.push({name:manifest.name,path:relative,manifest});
 }
 for(const node of nodes)for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
  for(const [name,range] of Object.entries(node.manifest[section]??{}).sort(([a],[b])=>a.localeCompare(b,'en'))){
   if(names.has(name)&&typeof range==='string')edges.push({from:node.name,to:name,section,range});
  }
 }
 return {nodes:nodes.map(({name,path})=>({name,path})),edges,resolutionVerified:false};
}

/** Dependency-first ordering and cycle-blocked nodes for a declared graph. */
export function orderDependencies(graph,{sections=['dependencies','optionalDependencies']}={}){
 const names=new Set(graph.nodes.map(n=>n.name));
 if(names.size!==graph.nodes.length)throw Error('DUPLICATE_GRAPH_NODE');
 const pending=new Map([...names].map(n=>[n,new Set()]));
 for(const e of graph.edges){
  if(!names.has(e.from)||!names.has(e.to))throw Error('UNKNOWN_GRAPH_NODE');
  if(sections.includes(e.section))pending.get(e.from).add(e.to);
 }
 const order=[];
 while(pending.size){
  const ready=[...pending].filter(([,deps])=>deps.size===0).map(([name])=>name).sort();
  if(!ready.length)break;
  for(const name of ready){order.push(name);pending.delete(name);}
  for(const deps of pending.values())for(const name of ready)deps.delete(name);
 }
 return {order,blocked:[...pending.keys()].sort(),acyclic:pending.size===0};
}

/** Return declared transitive dependencies and affected dependents, including shortest distances. */
export function inspectDependencyImpact(graph,target,{sections=['dependencies','optionalDependencies','peerDependencies','devDependencies']}={}){
 const names=new Set(graph.nodes.map(n=>n.name));
 if(names.size!==graph.nodes.length||!names.has(target))throw Error('INVALID_GRAPH_TARGET');
 const forward=new Map([...names].map(n=>[n,new Set()])),reverse=new Map([...names].map(n=>[n,new Set()]));
 for(const e of graph.edges){
  if(!names.has(e.from)||!names.has(e.to))throw Error('UNKNOWN_GRAPH_NODE');
  if(sections.includes(e.section)){forward.get(e.from).add(e.to);reverse.get(e.to).add(e.from);}
 }
 function walk(adjacency){
  const distances=new Map([[target,0]]),queue=[target];
  for(let i=0;i<queue.length;i++){
   const name=queue[i];
   for(const next of [...adjacency.get(name)].sort())if(!distances.has(next)){distances.set(next,distances.get(name)+1);queue.push(next);}
  }
  return [...distances].filter(([name])=>name!==target).map(([name,distance])=>({name,distance})).sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name,'en'));
 }
 return {target,dependencies:walk(forward),dependents:walk(reverse),resolutionVerified:false};
}

/** Classify package roles using explicit manifest evidence, without executing scripts. */
export async function classifyPackage(root){
 const base=await realpath(root),manifest=await readManifest(base),project=await inspectProject(base);
 const evidence=[];
 if(manifest.private===true)evidence.push('private');
 if(manifest.exports||manifest.main||manifest.module||manifest.types)evidence.push('library-entrypoint');
 if(manifest.bin)evidence.push('cli-entrypoint');
 if(typeof manifest.scripts?.start==='string')evidence.push('start-script');
 if(project.frameworks.length)evidence.push('framework-dependency');
 const roles=[];
 if(evidence.includes('library-entrypoint'))roles.push('library');
 if(evidence.includes('cli-entrypoint'))roles.push('cli');
 if(evidence.includes('start-script')&&evidence.includes('framework-dependency'))roles.push('application');
 return {name:project.name,roles:roles.length?roles:['unknown'],evidence,frameworks:project.frameworks,verified:false};
}

/** Inspect conventional source roots and explicit JSON configuration without executing project code. */
export async function inspectSourceLayout(root){
 const base=await realpath(root),roots=[],configs=[],diagnostics=[];
 for(const name of ['src','app','pages','lib','test','tests']){
  try{if((await lstat(path.join(base,name))).isDirectory())roots.push(name);}
  catch(e){if(e.code!=='ENOENT')diagnostics.push({path:name,code:'SOURCE_ROOT_UNREADABLE'});}
 }
 const entries=await readdir(base,{withFileTypes:true});
 for(const entry of entries.filter(e=>/^tsconfig(?:\.[a-zA-Z0-9_-]+)*\.json$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  try{
   const file=path.join(base,entry.name),stat=await lstat(file);
   if(!stat.isFile()||stat.size>1048576)throw Error('UNSAFE_CONFIG');
   const config=JSON.parse(await readFile(file,'utf8'));
   if(!config||typeof config!=='object'||Array.isArray(config))throw Error('INVALID_CONFIG');
   configs.push({path:entry.name,extends:config.extends??null,rootDir:config.compilerOptions?.rootDir??null,include:config.include??null,exclude:config.exclude??null,files:config.files??null,references:config.references??null});
  }catch{diagnostics.push({path:entry.name,code:'CONFIG_UNSUPPORTED_OR_UNREADABLE'});}
 }
 return {roots,configs,diagnostics,configurationResolved:false,sourceCoverageVerified:false};
}

/** Enumerate candidate source files within explicit project-relative directories. */
export async function discoverSourceFiles(root,{roots=['src'],maxFiles=10000,maxDirectories=2000}={}){
 if(!Array.isArray(roots)||roots.some(p=>typeof p!=='string'||!p.split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))||![maxFiles,maxDirectories].every(n=>Number.isInteger(n)&&n>0&&n<=100000))throw Error('INVALID_SOURCE_SCOPE');
 const base=await realpath(root),queue=[...new Set(roots)].sort(),seen=new Set(),files=[],diagnostics=[];
 const excluded=new Set(['node_modules','dist','build','coverage','vendor']);
 while(queue.length){
  const relative=queue.shift();
  if(seen.has(relative))continue;
  if(seen.size>=maxDirectories){diagnostics.push({path:relative,code:'DIRECTORY_LIMIT'});break;}
  seen.add(relative);
  const dir=path.join(base,relative);
  try{
   if(await realpath(dir)!==dir||!(await lstat(dir)).isDirectory())throw Error('UNSAFE_SOURCE_ROOT');
   const entries=await readdir(dir,{withFileTypes:true});
   for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    if(e.name.startsWith('.')||excluded.has(e.name))continue;
    const child=relative+'/'+e.name;
    if(e.isDirectory())queue.push(child);
    else if(e.isFile()&&/\.(?:[cm]?[jt]s|[jt]sx)$/.test(e.name)){
     if(files.length>=maxFiles)return {files,diagnostics:[...diagnostics,{path:child,code:'FILE_LIMIT'}],complete:false,compilerCoverageVerified:false};
     files.push(child);
    }
   }
  }catch{diagnostics.push({path:relative,code:'SOURCE_DIRECTORY_UNREADABLE'});}
 }
 return {files,diagnostics,complete:diagnostics.length===0,compilerCoverageVerified:false};
}

/** Inspect installed package capability declarations without importing executable modules. */
export async function inspectInstalledCapabilities(root){
 const base=await realpath(root),project=await inspectProject(base),packages=[],diagnostics=[];
 for(const pkg of project.installed){
  try{
   const file=path.join(base,'node_modules',pkg.name,'package.json');
   const manifest=await readManifest(path.dirname(file));
   if(manifest.name!==pkg.name||manifest.version!==pkg.version)throw Error('PACKAGE_CHANGED');
   const declaration=manifest.accelerate?.operations;
   if(declaration===undefined){packages.push({...pkg,status:'not-declared'});continue;}
   if(typeof declaration!=='string'||!declaration.startsWith('./')||!declaration.slice(2).split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))throw Error('INVALID_DECLARATION');
   const packageRoot=await realpath(path.dirname(file)),target=path.join(packageRoot,declaration);
   const stat=await lstat(target);
   if(await realpath(target)!==target||!stat.isFile()||stat.size>1048576)throw Error('UNSAFE_DECLARATION');
   packages.push({...pkg,status:'declared',manifestPath:declaration});
  }catch{diagnostics.push({package:pkg.name,code:'CAPABILITY_DECLARATION_UNREADABLE_OR_INVALID'});packages.push({...pkg,status:'invalid'});}
 }
 return {packages,diagnostics,handlersLoaded:false,compatibilityVerified:false};
}

/** Resolve a bounded chain of local JSON configuration files, without executing project code.
 * Compiler glob expansion and package-based extends are intentionally not supported.
 */
export async function inspectConfigInheritance(root,configPath='tsconfig.json'){
 const base=await realpath(root),chain=[],seen=new Set(),diagnostics=[];
 let relative=configPath,options={};
 try{
  while(relative!==null){
   if(typeof relative!=='string'||!relative.split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s))||!relative.endsWith('.json'))throw Error('UNSAFE_CONFIG_PATH');
   if(seen.has(relative))throw Error('CONFIG_CYCLE');
   if(chain.length>=32)throw Error('CONFIG_DEPTH_LIMIT');
   seen.add(relative);
   const file=path.join(base,relative),stat=await lstat(file);
   if(await realpath(file)!==file||!stat.isFile()||stat.size>1048576)throw Error('UNSAFE_CONFIG');
   const config=JSON.parse(await readFile(file,'utf8'));
   if(!config||typeof config!=='object'||Array.isArray(config))throw Error('INVALID_CONFIG');
   const own=config.compilerOptions??{};
   if(typeof own!=='object'||Array.isArray(own))throw Error('INVALID_COMPILER_OPTIONS');
   chain.push(relative);
   options={...own,...options};
   if(config.extends===undefined){relative=null;continue;}
   if(typeof config.extends!=='string'||!config.extends.startsWith('./'))throw Error('UNSUPPORTED_EXTENDS');
   const segments=config.extends.slice(2).split('/');
   if(!segments.every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))throw Error('UNSAFE_EXTENDS');
   relative=path.posix.join(path.posix.dirname(relative),...segments);
   if(!relative.endsWith('.json'))relative+='.json';
  }
 }catch(e){diagnostics.push({path:typeof relative==='string'?relative:configPath,code:'CONFIG_INHERITANCE_UNRESOLVED'});}
 return {chain,declaredCompilerOptions:options,diagnostics,inheritanceResolved:diagnostics.length===0,configurationResolved:false,sourceCoverageVerified:false};
}
