import {mkdir,copyFile,rm} from 'node:fs/promises';
const dist=new URL('./dist/',import.meta.url);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of ['index.mjs','index.d.mts'])await copyFile(new URL('./src/'+name,import.meta.url),new URL(name,dist));
