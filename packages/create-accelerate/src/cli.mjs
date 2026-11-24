#!/usr/bin/env node
import {readFileSync,mkdirSync,writeFileSync,existsSync,rmSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {parseArgs} from "node:util";
import {resolvePackages,scaffold} from "./index.js";
try {
 const {values,positionals}=parseArgs({allowPositionals:true,options:{template:{type:"string",default:"node"},packages:{type:"string",default:""},"dry-run":{type:"boolean"},catalog:{type:"string"},list:{type:"boolean"},help:{type:"boolean"}}});
 if(values.help){console.log("create-accelerate <name> --template node|react|angular --packages id,id [--dry-run] [--catalog path] [--list]");process.exit(0);}
 const catalog=JSON.parse(readFileSync(values.catalog??new URL("./catalog.json",import.meta.url),"utf8")).packages;
 if(values.list){console.log(JSON.stringify(catalog.filter(p=>p.lifecycle==="implemented"),null,2));process.exit(0);}
 if(positionals.length!==1)throw new Error("Exactly one project name required");
 const name=positionals[0],files=scaffold(name,values.template,resolvePackages(catalog,values.packages.split(",").map(s=>s.trim()).filter(Boolean)));
 const target=resolve(name);if(existsSync(target))throw new Error("Target already exists");
 if(values["dry-run"]){console.log(JSON.stringify({target,files},null,2));process.exit(0);}
 mkdirSync(target);try{for(const [path,content] of Object.entries(files)){const file=resolve(target,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content,{flag:"wx"});}}catch(error){rmSync(target,{recursive:true,force:true});throw error;}
 console.log("Created "+target+". Run npm install inside the project.");
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
