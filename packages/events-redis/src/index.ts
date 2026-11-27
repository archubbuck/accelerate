import type {DomainEvent,EventBus,EventHandler} from "@accelerate/events-core";
export interface RedisEventBridge {publish(channel:string,message:string):Promise<unknown>;subscribe(channel:string,listener:(message:string)=>void):()=>void;}
export class RedisEventBus implements EventBus {
 constructor(private readonly bridge:RedisEventBridge,private readonly namespace:string,private readonly onError:(error:unknown)=>void){if(!namespace.trim())throw new Error("Namespace required");}
 private channel(type:string){if(!type.trim())throw new Error("Event type required");return this.namespace+":"+type;}
 async publish<T>(event:DomainEvent<T>):Promise<void>{await this.bridge.publish(this.channel(event.type),JSON.stringify(event));}
 subscribe<T>(type:string,handler:EventHandler<T>):()=>void{return this.bridge.subscribe(this.channel(type),message=>{void Promise.resolve().then(()=>{const event=JSON.parse(message) as DomainEvent<T>;if(!event||event.type!==type||typeof event.id!=="string"||typeof event.occurredAt!=="string")throw new Error("Invalid event");return handler(event);}).catch(this.onError);});}
}
export * from "./journal.js";
