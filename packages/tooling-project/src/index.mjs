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
