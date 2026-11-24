import { assertTtl, type CacheStore } from "@accelerate/cache-core";
export interface RedisCacheClient {
 get(key:string):Promise<string|null>;
 set(key:string,value:string,ttlMs?:number):Promise<unknown>;
 del(key:string):Promise<number>;
 scan(cursor:string,pattern:string):Promise<{cursor:string;keys:readonly string[]}>;
}
export class RedisCache implements CacheStore {
 constructor(private readonly client:RedisCacheClient,private readonly namespace:string){if(!/^[a-zA-Z0-9_-]+$/.test(namespace))throw new Error("Invalid cache namespace");}
 private key(key:string){return this.namespace+":"+key;}
 async get<T>(key:string):Promise<T|undefined>{const raw=await this.client.get(this.key(key));return raw===null?undefined:JSON.parse(raw) as T;}
 async set<T>(key:string,value:T,ttlMs?:number):Promise<void>{assertTtl(ttlMs);if(ttlMs===0){await this.delete(key);return;}const raw=JSON.stringify(value);if(raw===undefined)throw new TypeError("Cache value must be JSON serializable");await this.client.set(this.key(key),raw,ttlMs===undefined?undefined:Math.ceil(ttlMs));}
 async delete(key:string):Promise<boolean>{return (await this.client.del(this.key(key)))>0;}
 async clear():Promise<void>{let cursor="0";do{const page=await this.client.scan(cursor,this.namespace+":*");for(const key of page.keys){if(key.startsWith(this.namespace+":"))await this.client.del(key);}cursor=page.cursor;}while(cursor!=="0");}
}
