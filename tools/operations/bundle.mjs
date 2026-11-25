import {build} from 'esbuild';
import {realpath,lstat,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const safe=s=>typeof s==='string'&&s.split('/').every(x=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(x));
export async function bundleOperation(root,entry,output){
 const base=await realpath(root);
 if(!safe(entry)||!safe(output)||!output.startsWith('dist/operations/')||!output.endsWith('.mjs'))throw Error('INVALID_BUNDLE_PATH');
 const source=path.join(base,entry),target=path.join(base,output);
 if(await realpath(source)!==source||!(await lstat(source)).isFile())throw Error('UNSAFE_ENTRY');
 let parent=base;
 for(const segment of output.split('/').slice(0,-1)){
  parent=path.join(parent,segment);
  await mkdir(parent).catch(e=>{if(e.code!=='EEXIST')throw e;});
  if(await realpath(parent)!==parent||!(await lstat(parent)).isDirectory())throw Error('UNSAFE_OUTPUT_DIRECTORY');
 }
 try{const stat=await lstat(target);if(!stat.isFile()||stat.nlink!==1)throw Error('UNSAFE_OUTPUT');}catch(e){if(e.code!=='ENOENT')throw e;}
 const result=await build({absWorkingDir:base,entryPoints:[source],outfile:target,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,legalComments:'inline',write:false});
 const outputs=Object.values(result.metafile.outputs);
 if(outputs.some(o=>o.imports.some(i=>i.external&&!i.path.startsWith('node:'))))throw Error('EXTERNAL_PACKAGE_IMPORT');
 if(result.outputFiles.length!==1||result.outputFiles[0].contents.length>4194304)throw Error('INVALID_BUNDLE_SIZE');
 const {writeFile}=await import('node:fs/promises');
 await writeFile(target,result.outputFiles[0].contents);
 return {output,bytes:result.outputFiles[0].contents.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await bundleOperation(process.cwd(),process.argv[2],process.argv[3])));}catch(e){console.error(e.message);process.exitCode=1;}
}
