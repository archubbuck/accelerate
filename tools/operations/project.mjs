import {lstat,realpath,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {snapshotFile} from './patches.mjs';
const markers=['pnpm-lock.yaml','package-lock.json','yarn.lock','bun.lock','pnpm-workspace.yaml','nx.json','angular.json','tsconfig.json','next.config.js','next.config.mjs','next.config.ts'];
export async function inspectProject(root){
 const base=await realpath(root);
 const entries=await readdir(base,{withFileTypes:true});
 const names=new Set(entries.filter(e=>e.isFile()).map(e=>e.name));
 const manifest=JSON.parse((await snapshotFile(base,'package.json')).content);
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
