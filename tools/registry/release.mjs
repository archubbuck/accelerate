import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function releasePlan(root,catalog){
 const entries=new Map(catalog.packages.map(p=>[p.id,p])), active=new Set(),done=new Set(),order=[];
 function visit(id){
  if(active.has(id))throw Error('Dependency cycle: '+id);
  if(done.has(id))return;
  const p=entries.get(id);if(!p?.path)throw Error('Missing implementation: '+id);
  if(p.path!=='packages/'+id||!/^[a-z0-9-]+$/.test(id))throw Error('Invalid package path: '+id);
  const dir=join(root,p.path),pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  if(pkg.private===true)throw Error('Private package required for release: '+id);
  if(pkg.name!==p.name||pkg.version!==p.version)throw Error('Registry identity mismatch: '+id);
  active.add(id);for(const dep of p.dependencies??[])visit(dep);active.delete(id);done.add(id);
  const generated=join(dir,'dist','package.json');
  const publishDir=existsSync(generated)?join(dir,'dist'):dir;
  const manifest=JSON.parse(readFileSync(join(publishDir,'package.json'),'utf8'));
  if(manifest.name!==pkg.name||manifest.version!==pkg.version||manifest.private===true||manifest.publishConfig?.access!=='public'&&pkg.publishConfig?.access!=='public')throw Error('Invalid publish manifest: '+id);
  order.push({id,name:pkg.name,version:pkg.version,dir:publishDir,tag:manifest.publishConfig?.tag ?? pkg.publishConfig?.tag ?? "latest"});
 }
 for(const p of [...entries.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  if(!p.path)continue;
  const pkg=JSON.parse(readFileSync(join(root,p.path,'package.json'),'utf8'));
  if(pkg.private!==true)visit(p.id);
 }
 return order;
}
export function classifyLookup(status,stdout,stderr){
 if(status===0)return 'published';
 let error;try{error=JSON.parse(stdout).error;}catch{}
 if(error?.code==='E404'||/npm (?:error|ERR!) code E404\b/.test(stderr))return 'missing';
 throw Error('npm lookup failed: '+stderr.trim());
}
function npm(args,dir){const r=spawnSync('npm',args,{cwd:dir,encoding:'utf8'});if(r.error)throw r.error;return r;}
function checked(args,dir){const r=npm(args,dir);process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.status!==0)throw Error('npm '+args[0]+' failed');}
export function publicationTargets(plan, mode, families, legacyName) {
 const canonical = entry => Object.hasOwn(families, entry.name);
 if(mode==='publish-legacy') {
  const legacy=plan.find(entry=>entry.name===legacyName && !canonical(entry) && entry.tag==='latest');
  if(!legacy)throw Error('Expected one registered legacy package name');
  return [legacy];
 }
 return plan.filter(entry=>canonical(entry) && entry.tag==='latest');
}
export function main(mode,root=resolve(import.meta.dirname,'../..'),legacyName){
 if(!['plan','pack','publish','publish-legacy'].includes(mode))throw Error('Expected plan, pack, publish or publish-legacy');
 const plan=releasePlan(root,JSON.parse(readFileSync(join(root,'registry/packages.json'),'utf8')));
 const {families}=JSON.parse(readFileSync(join(root,'registry/consolidation.json'),'utf8'));
 if(mode==='plan'){console.log(JSON.stringify(plan,null,2));return;}
 for(const p of mode==='pack'?plan:publicationTargets(plan,mode,families,legacyName)){
  if(mode==='pack'){console.log('Packing '+p.name+'@'+p.version);checked(['pack','--dry-run'],p.dir);continue;}
  const r=npm(['view',p.name+'@'+p.version,'version','--json','--registry=https://registry.npmjs.org'],p.dir);
  if(classifyLookup(r.status,r.stdout??'',r.stderr??'')==='published'){console.log('Already published: '+p.name+'@'+p.version);continue;}
  console.log('Publishing: '+p.name+'@'+p.version);checked(['publish','--access','public','--tag',p.tag,'--registry=https://registry.npmjs.org'],p.dir);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main(process.argv[2],undefined,process.argv[3]);}catch(error){console.error(error.message);process.exitCode=1;}}
