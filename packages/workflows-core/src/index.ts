import type {JobQueue} from "@accelerate/jobs-core";
import type {EventBus,DomainEvent} from "@accelerate/events-core";
export interface WorkflowContext {readonly id:string;readonly signal:AbortSignal;enqueue<T>(name:string,payload:T,id:string):Promise<string>;publish<T>(event:DomainEvent<T>):Promise<void>;}
export interface WorkflowStep<T>{readonly id:string;run(value:T,context:WorkflowContext):Promise<T>;}
export class WorkflowRunner {
 constructor(private readonly queue:JobQueue,private readonly events:EventBus){}
 async run<T>(id:string,initial:T,steps:readonly WorkflowStep<T>[],signal:AbortSignal=new AbortController().signal):Promise<T>{if(!id||steps.some(s=>!s.id)||new Set(steps.map(s=>s.id)).size!==steps.length)throw new Error("Invalid workflow or duplicate step");let value=initial;for(const step of steps){signal.throwIfAborted();const context:WorkflowContext={id,signal,enqueue:(name,payload,jobId)=>this.queue.enqueue(name,payload,{id:JSON.stringify([id,step.id,jobId])}),publish:event=>this.events.publish(event)};value=await step.run(value,context);}signal.throwIfAborted();return value;}
}
export * from "./durable.js";
