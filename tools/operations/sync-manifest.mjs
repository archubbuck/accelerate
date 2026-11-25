import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function syncOperationManifest(root,{check=false}={}){
 const base=await realpath(root);
 const pkg=JSON.parse(await readFile(path.join(base,'package.json'),'utf8'));
 const relative=pkg.accelerate?.operations;
 if(relative===undefined)return {status:'not-declared'};
 if(typeof relative!=='string'||!relative.startsWith('./')||!relative.slice(2).split('/').every(s=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(s)))throw Error('INVALID_MANIFEST_PATH');
 const file=path.join(base,relative),stat=await lstat(file);
 if(!stat.isFile()||stat.nlink!==1||stat.size>1048576||await realpath(file)!==file)throw Error('UNSAFE_MANIFEST');
 const doc=JSON.parse(await readFile(file,'utf8'));
 if(doc.schemaVersion!=='1.0'||doc.package!==pkg.name||!Array.isArray(doc.operations)||!doc.operations.length||doc.operations.some(e=>e?.manifest?.package!==pkg.name))throw Error('INVALID_MANIFEST_IDENTITY');
 if(typeof pkg.version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version))throw Error('INVALID_PACKAGE_VERSION');
 if(doc.packageVersion===pkg.version)return {status:'no-op'};
 if(check)throw Error('STALE_OPERATION_MANIFEST_VERSION');
 doc.packageVersion=pkg.version;
 await writeFile(file,JSON.stringify(doc,null,2)+'\n');
 return {status:'updated',version:pkg.version};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await syncOperationManifest(process.cwd(),{check:process.argv.includes('--check')})));}catch(e){console.error(e.message);process.exitCode=1;}
}
