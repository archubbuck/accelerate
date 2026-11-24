import type {Message} from "@accelerate/ai-core";
export interface PromptTemplate {readonly id:string;readonly version:string;readonly messages:readonly {role:"system"|"user";content:string}[];}
export function renderPrompt(template:PromptTemplate,variables:Readonly<Record<string,string>>):readonly Message[]{return template.messages.map(message=>({...message,content:message.content.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,(_,key:string)=>{if(!Object.hasOwn(variables,key))throw new Error("Missing prompt variable: "+key);return variables[key];})}));}
