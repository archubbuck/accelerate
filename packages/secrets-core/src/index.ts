export interface SecretProvider {get(key:string):Promise<string|undefined>;}
export class MissingSecretError extends Error {constructor(){super("Required secret is missing");this.name="MissingSecretError";}}
export class Secrets {constructor(private readonly provider:SecretProvider){} async optional(key:string):Promise<string|undefined>{if(!key.trim())throw new TypeError("Secret key required");return this.provider.get(key);}async require(key:string):Promise<string>{const value=await this.optional(key);if(value===undefined||value==="")throw new MissingSecretError();return value;}}
