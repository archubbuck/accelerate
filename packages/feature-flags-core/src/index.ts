export interface FlagContext {readonly subject?:string;readonly attributes?:Readonly<Record<string,string>>;}
export interface FlagRule {readonly attribute:string;readonly equals:string;readonly enabled:boolean;}
export interface FeatureFlag {readonly key:string;readonly enabled:boolean;readonly rules?:readonly FlagRule[];}
export interface FlagStore {get(key:string):Promise<FeatureFlag|undefined>;}
export function evaluateFlag(flag:FeatureFlag,context:FlagContext={}):boolean {for(const rule of flag.rules??[]){if(context.attributes&&Object.hasOwn(context.attributes,rule.attribute)&&context.attributes[rule.attribute]===rule.equals)return rule.enabled;}return flag.enabled;}
export class FeatureFlags {constructor(private readonly store:FlagStore){} async enabled(key:string,context:FlagContext={},fallback=false):Promise<boolean>{const flag=await this.store.get(key);return flag?evaluateFlag(flag,context):fallback;}}
