import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {classifyLookup} from './release.mjs';
const repo='archubbuck/accelerate', workflow='publish.yml';
export function candidates(root,catalog){return catalog.packages.filter(p=>p.path).map(p=>{if(p.path!=='packages/'+p.id)throw Error('Invalid registry path: '+p.id);const manifest=JSON.parse(readFileSync(join(root,p.path,'package.json'),'utf8'));if(manifest.name!==p.name||manifest.version!==p.version)throw Error('Registry identity mismatch: '+p.id);return {...p,private:manifest.private===true};}).filter(p=>!p.private).sort((a,b)=>a.name.localeCompare(b.name));}
export function trustArgs(name){return ['trust','github',name,'--repo',repo,'--file',workflow,'--allow-publish','--yes'];}
function npm(args,interactive=false){const r=spawnSync('npm',args,interactive?{stdio:'inherit'}:{encoding:'utf8',stdio:['inherit','pipe','pipe']});if(r.error)throw r.error;return r;}
function checkedJson(args){const r=npm(args);if(r.status!==0)throw Error((r.stderr||'npm command failed').trim());return JSON.parse(r.stdout);}
export function classifyTrust(value){
 // Unknown response shapes fail closed. Raw records remain available for manual review.
 const records=Array.isArray(value)?value:Array.isArray(value?.trusts)?value.trusts:Array.isArray(value?.publishers)?value.publishers:null;
 if(!records)return 'unknown';
 if(!records.length)return 'missing';
 return 'review';
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function main(mode,args,root=resolve(import.meta.dirname,'../..')){
 if(!['plan','configure','audit','report','verify'].includes(mode))throw Error('Unknown trust command');
 if(mode==='configure'&&!args.includes('--confirm'))throw Error('Use --confirm to authorize creating missing trusted publishers');
 const names=args.filter(a=>!a.startsWith('--'));
 const entries=candidates(root,JSON.parse(readFileSync(join(root,'registry/packages.json'),'utf8'))).filter(p=>!names.length||names.includes(p.id)||names.includes(p.name));
 if(!entries.length)throw Error('No matching packages');
 const results=[];
 for(const p of entries){
  const row={name:p.name,version:p.version};
  try{
   const lookup=npm(['view',p.name,'version','--json','--registry=https://registry.npmjs.org']);
   if(classifyLookup(lookup.status,lookup.stdout??'',lookup.stderr??'')==='missing'){row.status='bootstrap-required';results.push(row);continue;}
   row.trust=checkedJson(['trust','list',p.name,'--json']);
   row.status=classifyTrust(row.trust);
   if(mode==='configure'&&row.status==='missing'){
    const r=npm(trustArgs(p.name),true);if(r.status!==0)throw Error('Trusted publisher creation failed');
    row.trust=checkedJson(['trust','list',p.name,'--json']);row.status='created-review-required';
   }
   if(mode==='verify'){
    const release=npm(['view',p.name+'@'+p.version,'dist.attestations','--json','--registry=https://registry.npmjs.org']);
    if(classifyLookup(release.status,release.stdout??'',release.stderr??'')==='missing')row.release='version-not-published';
    else{row.attestations=release.stdout.trim()?JSON.parse(release.stdout):null;row.release=row.attestations?'attestations-present-review-required':'no-attestations';}
   }
  }catch(error){row.status='error';row.error=String(error.message);process.exitCode=1;}
  results.push(row);await delay(2100);
 }
 console.log(JSON.stringify({repository:repo,workflow,mode,results},null,2));
 if(results.some(r=>['unknown','error','bootstrap-required'].includes(r.status)))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await main(process.argv[2],process.argv.slice(3));}catch(error){console.error(error.message);process.exitCode=1;}}
